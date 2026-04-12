import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { ClientMessage, ServerMessage } from '@conqueror/shared';
import { applyWarTurnStart } from '@conqueror/shared';
import db from '../db/index.js';
import { validateWsToken } from '../middleware/auth.js';
import { handleGameAction } from './actionRouter.js';
import { getOrchestrator, registerOrchestrator } from '../game/orchestratorRegistry.js';
import { GameOrchestrator } from '../game/GameOrchestrator.js';
import type { ClientMeta } from './types.js';
import { checkAndHandleWin } from './actions/winCheck.js';

// Room registry: gameId → connected clients
const rooms = new Map<string, Set<WebSocket>>();
// Client metadata
const clientMeta = new WeakMap<WebSocket, ClientMeta>();
// Horn rate limiting: `${gameId}:${userId}` → last horn timestamp
const hornLastUsed = new Map<string, number>();
// Server-side turn timers: gameId → timeout handle
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── Play-again sessions ──────────────────────────────────────────────────────

interface PlayAgainSession {
  playerIds: string[];
  votes: Map<string, boolean>;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
  turnTimeLimit: number | null;
  hornCooldownSecs: number;
}

const playAgainSessions = new Map<string, PlayAgainSession>();
const PLAY_AGAIN_TIMEOUT_MS = 60_000;
const PLAY_AGAIN_MIN_PLAYERS = 2;

function startPlayAgainSession(gameId: string, playerIds: string[], turnTimeLimit: number | null, hornCooldownSecs: number): void {
  const existing = playAgainSessions.get(gameId);
  if (existing) { clearTimeout(existing.timer); playAgainSessions.delete(gameId); }

  const session: PlayAgainSession = {
    playerIds,
    votes: new Map(),
    startedAt: Date.now(),
    turnTimeLimit,
    hornCooldownSecs,
    timer: setTimeout(() => resolvePlayAgain(gameId, false), PLAY_AGAIN_TIMEOUT_MS),
  };
  playAgainSessions.set(gameId, session);
  broadcastPlayAgainPoll(gameId, session);
}

function broadcastPlayAgainPoll(gameId: string, session: PlayAgainSession): void {
  const secondsLeft = Math.max(0, Math.round((PLAY_AGAIN_TIMEOUT_MS - (Date.now() - session.startedAt)) / 1000));
  const votes: Record<string, boolean | null> = {};
  for (const pid of session.playerIds) {
    votes[pid] = session.votes.has(pid) ? (session.votes.get(pid) as boolean) : null;
  }
  broadcastToRoom(gameId, { type: 'PLAY_AGAIN_POLL', payload: { votes, secondsLeft } });
}

function handlePlayAgainVote(gameId: string, playerId: string, accept: boolean): void {
  const session = playAgainSessions.get(gameId);
  if (!session || !session.playerIds.includes(playerId)) return;

  session.votes.set(playerId, accept);
  broadcastPlayAgainPoll(gameId, session);

  // Early resolution checks
  const acceptCount = [...session.votes.values()].filter(v => v === true).length;
  const declineCount = [...session.votes.values()].filter(v => v === false).length;
  const pending = session.playerIds.length - acceptCount - declineCount;

  // Can't possibly reach MIN_PLAYERS → fail now
  if (acceptCount + pending < PLAY_AGAIN_MIN_PLAYERS) {
    resolvePlayAgain(gameId, false);
    return;
  }
  // All voted and enough said yes → succeed
  if (pending === 0 && acceptCount >= PLAY_AGAIN_MIN_PLAYERS) {
    resolvePlayAgain(gameId, true);
  }
}

function resolvePlayAgain(gameId: string, success: boolean): void {
  const session = playAgainSessions.get(gameId);
  if (!session) return;
  clearTimeout(session.timer);
  playAgainSessions.delete(gameId);

  if (success) {
    launchRematch(gameId, session);
  } else {
    broadcastToRoom(gameId, { type: 'GAME_CLOSED', payload: { reason: 'not_enough_players' } });
    // Delete the finished game from the DB
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
  }
}

function launchRematch(gameId: string, session: PlayAgainSession): void {
  const acceptedIds = session.playerIds.filter(pid => session.votes.get(pid) === true);

  if (acceptedIds.length < PLAY_AGAIN_MIN_PLAYERS) {
    broadcastToRoom(gameId, { type: 'GAME_CLOSED', payload: { reason: 'not_enough_players' } });
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    return;
  }

  // Fetch player details for accepted players
  const placeholders = acceptedIds.map(() => '?').join(',');
  type PlayerRow = { id: string; username: string; color: string; seat_order: number };
  const players = db.prepare(`
    SELECT gp.user_id as id, u.username, gp.color, gp.seat_order
    FROM game_players gp
    JOIN users u ON u.id = gp.user_id
    WHERE gp.game_id = ? AND gp.user_id IN (${placeholders})
    ORDER BY gp.seat_order
  `).all(gameId, ...acceptedIds) as PlayerRow[];

  // Get old game metadata
  const oldGame = db.prepare('SELECT name, max_players, created_by FROM games WHERE id = ?')
    .get(gameId) as { name: string; max_players: number; created_by: string } | undefined;

  if (!oldGame || players.length < PLAY_AGAIN_MIN_PLAYERS) {
    broadcastToRoom(gameId, { type: 'GAME_CLOSED', payload: { reason: 'not_enough_players' } });
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
    return;
  }

  // Determine host: first accepting player, or keep original if they accepted
  const newHostId = acceptedIds.includes(oldGame.created_by)
    ? oldGame.created_by
    : acceptedIds[0];

  // Create new game
  const newGameId = randomUUID();
  db.prepare('INSERT INTO games (id, name, status, max_players, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(newGameId, oldGame.name, 'active', oldGame.max_players, newHostId);

  // Insert players with reassigned seat order
  players.forEach((p, i) => {
    db.prepare('INSERT INTO game_players (game_id, user_id, color, seat_order) VALUES (?, ?, ?, ?)')
      .run(newGameId, p.id, p.color, i);
  });

  // Create and register the new orchestrator
  const orch = new GameOrchestrator(
    newGameId,
    db,
    players.map((p, i) => ({ id: p.id, username: p.username, color: p.color as any, seat_order: i })),
    undefined,
    session.turnTimeLimit,
    session.hornCooldownSecs,
  );
  registerOrchestrator(newGameId, orch);

  // Tell all clients in the old room to navigate to the new game
  broadcastToRoom(gameId, { type: 'PLAY_AGAIN_START', payload: { newGameId } });

  // Clean up old game
  db.prepare('DELETE FROM games WHERE id = ?').run(gameId);
}

// ─── Server-side turn timer ───────────────────────────────────────────────────

function scheduleTurnTimer(gameId: string): void {
  const existing = turnTimers.get(gameId);
  if (existing) clearTimeout(existing);
  turnTimers.delete(gameId);

  const orch = getOrchestrator(gameId);
  if (!orch) return;

  const state = orch.getState();
  // Don't schedule during setup or game over — setup turns have no server-side auto-advance
  if (!state.turnTimeLimit || !state.turnStartTime || state.phase === 'GAME_OVER' || state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE') return;

  const elapsed = Date.now() - state.turnStartTime;
  const remaining = Math.max(0, state.turnTimeLimit * 1000 - elapsed);
  const expectedTurnStart = state.turnStartTime;

  const timer = setTimeout(() => {
    turnTimers.delete(gameId);
    serverAutoEndTurn(gameId, expectedTurnStart);
  }, remaining);

  turnTimers.set(gameId, timer);
}

function serverAutoEndTurn(gameId: string, expectedTurnStart: number): void {
  const orch = getOrchestrator(gameId);
  if (!orch) return;

  const state = orch.getState();
  // If the turn already advanced (player acted in time), do nothing
  if (state.turnStartTime !== expectedTurnStart) return;
  if (state.phase === 'GAME_OVER' || state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE') return;

  const activePlayer = state.players.find(p => p.id === state.activePlayerId);
  if (!activePlayer) return;

  // Build a minimal ActionContext for checkAndHandleWin
  const ctx: import('./actionRouter.js').ActionContext = {
    broadcastToRoom: (outMsg) => {
      if (outMsg.type === 'GAME_STATE') {
        broadcastPersonalizedGameState(gameId, orch);
      } else {
        broadcastToRoom(gameId, outMsg);
        if (outMsg.type === 'GAME_OVER') {
          const s = orch.getState();
          startPlayAgainSession(gameId, s.players.map(p => p.id), s.turnTimeLimit, s.hornCooldownSecs ?? 30);
        }
      }
    },
    sendTo: (_ws, _msg) => { /* no target client for server-initiated action */ },
    sendPrivate: (targetPlayerId, outMsg) => sendToPlayer(gameId, targetPlayerId, outMsg),
  };

  // Edge case: player somehow reached win threshold
  if (checkAndHandleWin(orch, ctx)) return;

  const currentIdx = state.players.findIndex(p => p.id === state.activePlayerId);
  const nextIdx = (currentIdx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  orch.updateState(s => ({
    ...s,
    phase: 'ROLL',
    turn: s.turn + 1,
    activePlayerId: nextPlayer.id,
    diceRoll: null,
    tradeOffer: null,
    discardsPending: {},
    turnStartTime: Date.now(),
    players: s.players.map(p => ({
      ...p,
      devCardPlayedThisTurn: false,
      devCards: p.devCards.map(c => ({ ...c, playedThisTurn: false, boughtThisTurn: false })),
    })),
  }));

  applyWarTurnStart(orch);
  orch.addLogEntry('log.turnTimedOut', { player: activePlayer.username }, activePlayer.id);
  // broadcastPersonalizedGameState already calls scheduleTurnTimer internally
  broadcastPersonalizedGameState(gameId, orch);
}

// ─── Core handlers ────────────────────────────────────────────────────────────

function getOrLoadOrchestrator(gameId: string) {
  return getOrchestrator(gameId);
}

export function setupWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    ws.on('message', (data: RawData) => handleMessage(ws, data));
    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', err => console.error('WS error:', err));
  });
}

function handleMessage(ws: WebSocket, data: RawData): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(data.toString()) as ClientMessage;
  } catch {
    sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_JSON', message: 'Message must be valid JSON' } });
    return;
  }

  if (msg.type === 'JOIN_GAME') {
    handleJoinGame(ws, msg.payload as { gameId: string; token: string }, msg.requestId);
    return;
  }

  if (msg.type === 'CHAT') {
    handleChat(ws, msg.payload as { gameId: string; text: string });
    return;
  }

  if (msg.type === 'HORN') {
    handleHorn(ws, msg.payload as { gameId: string });
    return;
  }

  // All other messages require an authenticated game context
  const meta = clientMeta.get(ws);
  if (!meta) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_IN_GAME', message: 'Join a game first' } });
    return;
  }

  if (msg.type === 'PLAY_AGAIN_VOTE') {
    const { accept } = msg.payload as { gameId: string; accept: boolean };
    handlePlayAgainVote(meta.gameId, meta.userId, accept);
    return;
  }

  const orch = getOrLoadOrchestrator(meta.gameId);
  if (!orch) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' } });
    return;
  }

  handleGameAction(ws, msg, meta, orch, {
    broadcastToRoom: (outMsg) => {
      // Intercept GAME_STATE broadcasts and send each client their own personalised view
      // so that dev cards (and VP cards) are visible to the owning player only.
      if (outMsg.type === 'GAME_STATE') {
        broadcastPersonalizedGameState(meta.gameId, orch);
      } else {
        broadcastToRoom(meta.gameId, outMsg);
        // Start play-again voting whenever a game ends
        if (outMsg.type === 'GAME_OVER') {
          const state = orch.getState();
          startPlayAgainSession(meta.gameId, state.players.map(p => p.id), state.turnTimeLimit, state.hornCooldownSecs ?? 30);
        }
      }
    },
    sendTo,
    sendPrivate: (targetPlayerId, outMsg) => sendToPlayer(meta.gameId, targetPlayerId, outMsg),
  });
}

function handleJoinGame(
  ws: WebSocket,
  payload: { gameId: string; token: string },
  requestId?: string
): void {
  const authPayload = validateWsToken(payload.token);
  if (!authPayload) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_TOKEN', message: 'Invalid or expired token', requestId } });
    return;
  }

  const game = db.prepare('SELECT id, status FROM games WHERE id = ?').get(payload.gameId) as
    | { id: string; status: string }
    | undefined;

  if (!game) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'GAME_NOT_FOUND', message: 'Game not found', requestId } });
    return;
  }

  const playerRow = db.prepare('SELECT user_id FROM game_players WHERE game_id = ? AND user_id = ?')
    .get(payload.gameId, authPayload.userId);

  if (!playerRow) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_A_PLAYER', message: 'You are not in this game', requestId } });
    return;
  }

  // Register in room
  if (!rooms.has(payload.gameId)) rooms.set(payload.gameId, new Set());
  rooms.get(payload.gameId)!.add(ws);

  clientMeta.set(ws, {
    userId: authPayload.userId,
    username: authPayload.username,
    gameId: payload.gameId,
  });

  const orch = getOrLoadOrchestrator(payload.gameId);
  if (orch) {
    orch.setConnected(authPayload.userId, true);
    // Send full state to the joining player
    sendTo(ws, { type: 'GAME_STATE', payload: { state: orch.getPublicState(authPayload.userId) } });
    // Notify others
    broadcastToRoom(payload.gameId, {
      type: 'PLAYER_CONNECTED',
      payload: { playerId: authPayload.userId },
    }, ws);

    // If there's an active play-again poll, resend it to this player
    const session = playAgainSessions.get(payload.gameId);
    if (session) {
      const secondsLeft = Math.max(0, Math.round((PLAY_AGAIN_TIMEOUT_MS - (Date.now() - session.startedAt)) / 1000));
      const votes: Record<string, boolean | null> = {};
      for (const pid of session.playerIds) {
        votes[pid] = session.votes.has(pid) ? (session.votes.get(pid) as boolean) : null;
      }
      sendTo(ws, { type: 'PLAY_AGAIN_POLL', payload: { votes, secondsLeft } });
    }
  }
  // If lobby: client is registered in the room. When host calls POST /start,
  // the server will broadcast GAME_STATE to everyone in the room.
}

function handleChat(ws: WebSocket, payload: { gameId: string; text: string }): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const text = payload.text?.trim().slice(0, 200);
  if (!text) return;
  broadcastToRoom(meta.gameId, {
    type: 'CHAT',
    payload: { fromPlayerId: meta.userId, username: meta.username, text, timestamp: Date.now() },
  });
}

function handleHorn(ws: WebSocket, payload: { gameId: string }): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const key = `${meta.gameId}:${meta.userId}`;
  const last = hornLastUsed.get(key) ?? 0;
  const now = Date.now();

  // Deduct 2 seconds from the active turn (if a time limit is set)
  const orch = getOrLoadOrchestrator(meta.gameId);
  const hornCooldownMs = ((orch?.getState().hornCooldownSecs) ?? 30) * 1000;

  if (now - last < hornCooldownMs) {
    sendTo(ws, {
      type: 'ERROR',
      payload: { code: 'HORN_COOLDOWN', message: `Wait ${Math.ceil((hornCooldownMs - (now - last)) / 1000)}s before honking again` },
    });
    return;
  }
  hornLastUsed.set(key, now);
  if (orch) {
    const state = orch.getState();
    if (state.turnTimeLimit && state.turnStartTime && state.phase !== 'GAME_OVER') {
      orch.updateState(s => ({
        ...s,
        turnStartTime: s.turnStartTime! - 2_000,
      }));
      broadcastPersonalizedGameState(meta.gameId, orch);
      // Notify the active player that their time was cut
      sendToPlayer(meta.gameId, state.activePlayerId, {
        type: 'ACTION_TOAST',
        payload: { playerId: meta.userId, username: meta.username, action: 'hurry_up', extra: '-2s' },
      });
    }
  }

  broadcastToRoom(meta.gameId, {
    type: 'HORN_PLAYED',
    payload: { fromPlayerId: meta.userId, username: meta.username },
  });
}

function handleDisconnect(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const room = rooms.get(meta.gameId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(meta.gameId);
  }

  const orch = getOrLoadOrchestrator(meta.gameId);
  if (orch) {
    orch.setConnected(meta.userId, false);
  }

  broadcastToRoom(meta.gameId, {
    type: 'PLAYER_DISCONNECTED',
    payload: { playerId: meta.userId },
  });
}

// ─── Broadcast Helpers ────────────────────────────────────────────────────────

export function broadcastToRoom(gameId: string, message: ServerMessage, exclude?: WebSocket): void {
  const room = rooms.get(gameId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const client of room) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Send each connected player their own personalised GAME_STATE so that
 * dev cards and VP cards are only visible to the owning player.
 * Also reschedules the server-side turn timer whenever state is broadcast.
 */
export function broadcastPersonalizedGameState(gameId: string, orch: import('../game/GameOrchestrator.js').GameOrchestrator): void {
  const room = rooms.get(gameId);
  if (!room) return;
  for (const client of room) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(client);
    const state = orch.getPublicState(meta?.userId);
    client.send(JSON.stringify({ type: 'GAME_STATE', payload: { state } }));
  }
  // Keep server-side turn timer in sync with game state
  scheduleTurnTimer(gameId);
}

export function sendToPlayer(gameId: string, playerId: string, message: ServerMessage): void {
  const room = rooms.get(gameId);
  if (!room) return;
  for (const client of room) {
    const meta = clientMeta.get(client);
    if (meta?.userId === playerId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
      return;
    }
  }
}

export function sendTo(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function getOrchestratorForGame(gameId: string) {
  return getOrLoadOrchestrator(gameId);
}

/** Returns the set of user IDs currently connected via WebSocket for a given game. */
export function getConnectedUserIds(gameId: string): Set<string> {
  const room = rooms.get(gameId);
  if (!room) return new Set();
  const ids = new Set<string>();
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      const meta = clientMeta.get(client);
      if (meta) ids.add(meta.userId);
    }
  }
  return ids;
}
