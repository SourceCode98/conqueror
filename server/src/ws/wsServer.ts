import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type { ClientMessage, ServerMessage } from '@conqueror/shared';
import { applyWarTurnStart, subtractResources, ALL_RESOURCES } from '@conqueror/shared';
import type { ResourceBundle, ResourceType } from '@conqueror/shared';
import db from '../db/index.js';
import { validateWsToken } from '../middleware/auth.js';
import { handleGameAction } from './actionRouter.js';
import { getOrchestrator, registerOrchestrator } from '../game/orchestratorRegistry.js';
import { GameOrchestrator } from '../game/GameOrchestrator.js';
import type { ClientMeta } from './types.js';
import { checkAndHandleWin } from './actions/winCheck.js';

// Room registry: gameId → connected clients
const rooms = new Map<string, Set<WebSocket>>();
// Lobby settings cache: gameId → last settings broadcast by host
interface LobbySettingsCache { turnTimeLimit: number | null; hornCooldownSecs: number; warMode: boolean; warVariants: Record<string, boolean> }
const lobbySettingsCache = new Map<string, LobbySettingsCache>();
// Client metadata
const clientMeta = new WeakMap<WebSocket, ClientMeta>();
// Horn rate limiting: `${gameId}:${userId}` → last horn timestamp
const hornLastUsed = new Map<string, number>();
// Server-side turn timers: gameId → timeout handle
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Server-side discard timers: gameId → timeout handle (separate from turn timer)
const discardTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCARD_TIME_LIMIT_SECS = 30;

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

// ─── Vote-kick sessions ───────────────────────────────────────────────────────

interface KickVoteSession {
  targetId: string;
  targetUsername: string;
  initiatorId: string;
  initiatorUsername: string;
  votes: Map<string, boolean>; // voterId → yes/no
  eligibleIds: string[];       // all players except target
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
}

const kickVoteSessions = new Map<string, KickVoteSession>();
const KICK_VOTE_TIMEOUT_MS = 30_000;

// ─── Voice rooms ──────────────────────────────────────────────────────────────
// gameId → Map<playerId, { ws, username, muted }>
const voiceRooms = new Map<string, Map<string, { ws: WebSocket; username: string }>>();
const voiceTalking = new Map<string, string>(); // gameId → talkingUserId

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

  // Create new game as lobby so host can re-configure settings
  const newGameId = randomUUID();
  db.prepare('INSERT INTO games (id, name, status, max_players, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(newGameId, oldGame.name, 'lobby', oldGame.max_players, newHostId);

  // Insert players with reassigned seat order
  players.forEach((p, i) => {
    db.prepare('INSERT INTO game_players (game_id, user_id, color, seat_order) VALUES (?, ?, ?, ?)')
      .run(newGameId, p.id, p.color, i);
  });

  // Tell all clients in the old room to navigate to the new lobby
  broadcastToRoom(gameId, { type: 'PLAY_AGAIN_START', payload: { newGameId } });

  // Clean up old game
  lobbySettingsCache.delete(gameId);
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
  // Don't schedule during setup, game over, coliseum battle, discard phase, or while turn is paused (mobile landscape)
  if (!state.turnTimeLimit || !state.turnStartTime || state.turnPausedAt !== null || state.phase === 'GAME_OVER' || state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE' || state.phase === 'COLISEUM_BATTLE' || state.phase === 'DISCARD') return;

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
  if (state.phase === 'GAME_OVER' || state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE' || state.phase === 'COLISEUM_BATTLE') return;

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
    turnPausedAt: null,
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

// ─── Discard timer ───────────────────────────────────────────────────────────

function scheduleDiscardTimer(gameId: string): void {
  const orch = getOrchestrator(gameId);
  if (!orch) return;

  const state = orch.getState();

  if (state.phase !== 'DISCARD' || !state.discardStartTime) {
    // Not in discard phase — cancel any pending discard timer
    const existing = discardTimers.get(gameId);
    if (existing) { clearTimeout(existing); discardTimers.delete(gameId); }
    return;
  }

  // If a timer is already running for this discard session, don't replace it
  if (discardTimers.has(gameId)) return;

  const elapsed = Date.now() - state.discardStartTime;
  const remaining = Math.max(0, DISCARD_TIME_LIMIT_SECS * 1000 - elapsed);
  const expectedDiscardStart = state.discardStartTime;

  const timer = setTimeout(() => {
    discardTimers.delete(gameId);
    serverAutoDiscard(gameId, expectedDiscardStart);
  }, remaining);

  discardTimers.set(gameId, timer);
}

function autoDiscardResources(resources: ResourceBundle, count: number): ResourceBundle {
  const pool: ResourceType[] = [];
  for (const type of ALL_RESOURCES) {
    for (let i = 0; i < resources[type]; i++) pool.push(type);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const result: ResourceBundle = { timber: 0, clay: 0, iron: 0, grain: 0, wool: 0 };
  for (const r of pool.slice(0, count)) result[r]++;
  return result;
}

function serverAutoDiscard(gameId: string, expectedDiscardStart: number): void {
  const orch = getOrchestrator(gameId);
  if (!orch) return;

  const state = orch.getState();
  if (state.phase !== 'DISCARD' || state.discardStartTime !== expectedDiscardStart) return;

  orch.updateState(s => {
    const discardDuration = s.discardStartTime ? Date.now() - s.discardStartTime : 0;
    let players = s.players;
    for (const [playerId, count] of Object.entries(s.discardsPending)) {
      const player = players.find(p => p.id === playerId);
      if (!player) continue;
      const toDiscard = autoDiscardResources(player.resources, count);
      players = players.map(p =>
        p.id === playerId ? { ...p, resources: subtractResources(p.resources, toDiscard) } : p
      );
      orch.addLogEntry('log.discardedAuto', { player: player.username, count }, playerId);
    }
    return {
      ...s,
      phase: 'ROBBER',
      discardsPending: {},
      discardStartTime: null,
      turnStartTime: s.turnStartTime ? s.turnStartTime + discardDuration : s.turnStartTime,
      players,
    };
  });

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

  if (msg.type === 'LOBBY_SETTINGS') {
    handleLobbySettings(ws, msg.payload as any);
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

  if (msg.type === 'VOTE_KICK') {
    handleVoteKick(ws, msg.payload as { gameId: string; targetId: string });
    return;
  }

  if (msg.type === 'KICK_VOTE') {
    handleKickVote(ws, msg.payload as { gameId: string; vote: boolean });
    return;
  }

  if (msg.type === 'VOICE_JOIN')      { handleVoiceJoin(ws); return; }
  if (msg.type === 'VOICE_LEAVE')     { handleVoiceLeave(ws); return; }
  if (msg.type === 'VOICE_PTT_START') { handleVoicePTTStart(ws); return; }
  if (msg.type === 'VOICE_PTT_END')   { handleVoicePTTEnd(ws); return; }
  if (msg.type === 'VOICE_AUDIO')     { handleVoiceAudio(ws, (msg.payload as any).data); return; }
  if (msg.type === 'PAUSE_TURN')      { handlePauseTurn(ws); return; }
  if (msg.type === 'RESUME_TURN')     { handleResumeTurn(ws); return; }

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
  // Send cached settings to the joining player if available.
  if (!orch) {
    const cached = lobbySettingsCache.get(payload.gameId);
    if (cached) sendTo(ws, { type: 'LOBBY_SETTINGS', payload: cached });
  }
}

function handleLobbySettings(ws: WebSocket, payload: { gameId: string; turnTimeLimit: number | null; hornCooldownSecs: number; warMode: boolean; warVariants: Record<string, boolean> }): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  // Only allowed in lobby (no orchestrator running)
  const orch = getOrLoadOrchestrator(payload.gameId);
  if (orch) return; // game already started
  // Verify sender is the host
  const game = db.prepare('SELECT created_by FROM games WHERE id = ? AND status = ?').get(payload.gameId, 'lobby') as { created_by: string } | undefined;
  if (!game || game.created_by !== meta.userId) return;
  const settings: LobbySettingsCache = { turnTimeLimit: payload.turnTimeLimit, hornCooldownSecs: payload.hornCooldownSecs, warMode: payload.warMode, warVariants: payload.warVariants };
  lobbySettingsCache.set(payload.gameId, settings);
  broadcastToRoom(payload.gameId, { type: 'LOBBY_SETTINGS', payload: settings });
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

function handleHorn(ws: WebSocket, payload: { gameId: string; hornId?: string }): void {
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
    payload: { fromPlayerId: meta.userId, username: meta.username, hornId: payload.hornId ?? 'horn_default' },
  });
}

function broadcastKickVoteUpdate(gameId: string, session: KickVoteSession): void {
  const votes: Record<string, boolean | null> = {};
  for (const id of session.eligibleIds) {
    votes[id] = session.votes.has(id) ? (session.votes.get(id)!) : null;
  }
  const secondsLeft = Math.max(0, Math.round((KICK_VOTE_TIMEOUT_MS - (Date.now() - session.startedAt)) / 1000));
  broadcastToRoom(gameId, {
    type: 'KICK_VOTE_UPDATE',
    payload: {
      targetId: session.targetId,
      targetUsername: session.targetUsername,
      initiatorUsername: session.initiatorUsername,
      votes,
      secondsLeft,
      eligibleCount: session.eligibleIds.length,
    },
  });
}

function resolveKickVote(gameId: string, passed: boolean): void {
  const session = kickVoteSessions.get(gameId);
  if (!session) return;

  clearTimeout(session.timer);
  kickVoteSessions.delete(gameId);

  if (!passed) {
    broadcastToRoom(gameId, {
      type: 'KICK_VOTE_ENDED',
      payload: { targetUsername: session.targetUsername, result: 'failed' },
    });
    return;
  }

  const orch = getOrLoadOrchestrator(gameId);
  if (!orch) return;

  const prevState = orch.getState();

  // 🔴 encontrar índice del jugador antes de eliminarlo
  const removedIndex = prevState.players.findIndex(p => p.id === session.targetId);

  // 🧹 eliminar jugador + sus piezas
  orch.updateState(s => {
    const newPlayers = s.players.filter(p => p.id !== session.targetId);

    return {
      ...s,
      buildings: Object.fromEntries(
        Object.entries(s.buildings).filter(([, b]) => (b as any).playerId !== session.targetId)
      ),
      roads: Object.fromEntries(
        Object.entries(s.roads).filter(([, r]) => (r as any).playerId !== session.targetId)
      ),
      players: newPlayers,
    };
  });

  const stateAfter = orch.getState();

if (stateAfter.players.length <= 1) {
  const winner = stateAfter.players[0];
  if (!winner) return;

  const ctx = {
    broadcastToRoom: (outMsg: any) => {
      if (outMsg.type === 'GAME_STATE') {
        broadcastPersonalizedGameState(gameId, orch);
      } else {
        broadcastToRoom(gameId, outMsg);
      }
    },
    sendTo,
    sendPrivate: (targetPlayerId: string, outMsg: any) =>
      sendToPlayer(gameId, targetPlayerId, outMsg),
  };

  // usa tu sistema real de victoria
  checkAndHandleWin(orch, ctx);
  return;
}

  // 🔄 arreglar turno si el expulsado estaba jugando
  if (prevState.activePlayerId === session.targetId && prevState.phase !== 'GAME_OVER') {
    const newPlayers = stateAfter.players;

    // siguiente jugador en la misma posición
    const nextIdx = removedIndex % newPlayers.length;
    const nextPlayer = newPlayers[nextIdx];

    orch.updateState(s => ({
      ...s,
      activePlayerId: nextPlayer.id,
      turn: s.turn + 1,
      phase: 'ROLL',
      turnStartTime: Date.now(),
      turnPausedAt: null,
      diceRoll: null,
      tradeOffer: null,
      discardsPending: {},
    }));
  }

  // 🔌 cerrar sockets del jugador expulsado
  const room = rooms.get(gameId);
  if (room) {
    for (const client of room) {
      const m = clientMeta.get(client);
      if (m && m.userId === session.targetId) {
        client.close(4001, 'kicked');
      }
    }
  }

  // 📢 notificar a todos
  broadcastToRoom(gameId, {
    type: 'PLAYER_KICKED',
    payload: {
      playerId: session.targetId,
      username: session.targetUsername,
    },
  });

  // 🔄 actualizar estado final
  broadcastPersonalizedGameState(gameId, orch);
}

function handleVoteKick(ws: WebSocket, payload: { gameId: string; targetId: string }): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const orch = getOrLoadOrchestrator(meta.gameId);
  if (!orch) return;

  const state = orch.getState();
  if (state.phase === 'GAME_OVER') return;
  if (kickVoteSessions.has(meta.gameId)) {
    sendTo(ws, { type: 'ERROR', payload: { code: 'KICK_VOTE_ACTIVE', message: 'A vote is already in progress' } });
    return;
  }
  if (payload.targetId === meta.userId) return;

  const target = state.players.find(p => p.id === payload.targetId);
  const initiator = state.players.find(p => p.id === meta.userId);
  if (!target || !initiator) return;

  const eligibleIds = state.players.map(p => p.id).filter(id => id !== payload.targetId);

  const session: KickVoteSession = {
    targetId: payload.targetId,
    targetUsername: target.username,
    initiatorId: meta.userId,
    initiatorUsername: initiator.username,
    votes: new Map([[meta.userId, true]]), // initiator auto-votes yes
    eligibleIds,
    startedAt: Date.now(),
    timer: setTimeout(() => resolveKickVote(meta.gameId, false), KICK_VOTE_TIMEOUT_MS),
  };
  kickVoteSessions.set(meta.gameId, session);
  broadcastKickVoteUpdate(meta.gameId, session);
}

function handleKickVote(ws: WebSocket, payload: { gameId: string; vote: boolean }): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const session = kickVoteSessions.get(meta.gameId);
  if (!session) return;
  if (meta.userId === session.targetId) return;
  if (!session.eligibleIds.includes(meta.userId)) return;

  session.votes.set(meta.userId, payload.vote);
  broadcastKickVoteUpdate(meta.gameId, session);

  const yesCount = [...session.votes.values()].filter(Boolean).length;
  const noCount  = [...session.votes.values()].filter(v => !v).length;
  const majority = Math.ceil(session.eligibleIds.length / 2) + (session.eligibleIds.length % 2 === 0 ? 0 : 0);
  // Strictly more than half
  const threshold = Math.floor(session.eligibleIds.length / 2) + 1;

  if (yesCount >= threshold) resolveKickVote(meta.gameId, true);
  else if (noCount > session.eligibleIds.length - threshold) resolveKickVote(meta.gameId, false);
}

// ─── Voice handlers ───────────────────────────────────────────────────────────

function handleVoiceJoin(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const { gameId, userId, username } = meta;

  if (!voiceRooms.has(gameId)) voiceRooms.set(gameId, new Map());
  const vRoom = voiceRooms.get(gameId)!;
  if (vRoom.has(userId)) return;

  vRoom.set(userId, { ws, username });

  sendTo(ws, {
    type: 'VOICE_PEERS',
    payload: {
      peers: [...vRoom.entries()]
        .filter(([id]) => id !== userId)
        .map(([id, p]) => ({ playerId: id, username: p.username })),
    },
  });

  for (const [id, peer] of vRoom) {
    if (id !== userId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: 'VOICE_PEER_JOINED', payload: { playerId: userId, username } }));
    }
  }
}

function handleVoiceLeave(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const vRoom = voiceRooms.get(meta.gameId);
  if (!vRoom) return;
  vRoom.delete(meta.userId);
  if (vRoom.size === 0) { voiceRooms.delete(meta.gameId); voiceTalking.delete(meta.gameId); }
  // Release PTT lock if this player held it
  if (voiceTalking.get(meta.gameId) === meta.userId) voiceTalking.delete(meta.gameId);
  for (const peer of vRoom.values()) {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: 'VOICE_PEER_LEFT', payload: { playerId: meta.userId } }));
    }
  }
}

function handleVoicePTTStart(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const vRoom = voiceRooms.get(meta.gameId);
  if (!vRoom) return;
  // Only one talker at a time
  if (voiceTalking.has(meta.gameId)) return;
  voiceTalking.set(meta.gameId, meta.userId);
  const username = vRoom.get(meta.userId)?.username ?? '';
  for (const [id, peer] of vRoom) {
    if (id !== meta.userId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: 'VOICE_PEER_TALKING', payload: { playerId: meta.userId, username } }));
    }
  }
}

function handleVoicePTTEnd(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  if (voiceTalking.get(meta.gameId) !== meta.userId) return;
  voiceTalking.delete(meta.gameId);
  const vRoom = voiceRooms.get(meta.gameId);
  if (!vRoom) return;
  for (const [id, peer] of vRoom) {
    if (id !== meta.userId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: 'VOICE_PEER_STOPPED', payload: { playerId: meta.userId } }));
    }
  }
}

function handleVoiceAudio(ws: WebSocket, data: string): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const vRoom = voiceRooms.get(meta.gameId);
  if (!vRoom) return;
  const msg = JSON.stringify({ type: 'VOICE_AUDIO', payload: { fromId: meta.userId, data } });
  for (const [id, peer] of vRoom) {
    if (id !== meta.userId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(msg);
    }
  }
}

function handlePauseTurn(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const orch = getOrLoadOrchestrator(meta.gameId);
  if (!orch) return;
  const state = orch.getState();
  // Only the active player can pause; ignore if already paused
  if (state.activePlayerId !== meta.userId) return;
  if (state.turnPausedAt !== null) return;
  if (!state.turnTimeLimit || !state.turnStartTime) return;

  // Cancel the running timeout
  const existing = turnTimers.get(meta.gameId);
  if (existing) clearTimeout(existing);
  turnTimers.delete(meta.gameId);

  orch.updateState(s => ({ ...s, turnPausedAt: Date.now() }));
  broadcastPersonalizedGameState(meta.gameId, orch);
}

function handleResumeTurn(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;
  const orch = getOrLoadOrchestrator(meta.gameId);
  if (!orch) return;
  const state = orch.getState();
  if (state.activePlayerId !== meta.userId) return;
  if (state.turnPausedAt === null) return;

  // Extend turnStartTime by the paused duration so remaining time is preserved
  const pausedDuration = Date.now() - state.turnPausedAt;
  orch.updateState(s => ({
    ...s,
    turnPausedAt: null,
    turnStartTime: s.turnStartTime !== null ? s.turnStartTime + pausedDuration : s.turnStartTime,
  }));
  broadcastPersonalizedGameState(meta.gameId, orch);
  scheduleTurnTimer(meta.gameId);
}

function handleDisconnect(ws: WebSocket): void {
  const meta = clientMeta.get(ws);
  if (!meta) return;

  const room = rooms.get(meta.gameId);
  if (room) {
    room.delete(ws);
    if (room.size === 0) rooms.delete(meta.gameId);
  }

  // Auto-leave voice chat on disconnect (also releases PTT lock)
  handleVoiceLeave(ws);

  const orch = getOrLoadOrchestrator(meta.gameId);
  if (orch) {
    orch.setConnected(meta.userId, false);
  }

  broadcastToRoom(meta.gameId, {
    type: 'PLAYER_DISCONNECTED',
    payload: { playerId: meta.userId },
  });

  // Handle host leaving the lobby
  if (!orch) {
    const game = db.prepare('SELECT status, created_by FROM games WHERE id = ?')
      .get(meta.gameId) as { status: string; created_by: string } | undefined;

    if (game && game.status === 'lobby' && game.created_by === meta.userId) {
      const currentRoom = rooms.get(meta.gameId);
      const connectedIds: string[] = [];
      if (currentRoom) {
        for (const client of currentRoom) {
          if (client.readyState === WebSocket.OPEN) {
            const m = clientMeta.get(client);
            if (m) connectedIds.push(m.userId);
          }
        }
      }

      if (connectedIds.length === 0) {
        db.prepare('DELETE FROM games WHERE id = ?').run(meta.gameId);
      } else {
        const newHostId = connectedIds[0];
        db.prepare('UPDATE games SET created_by = ? WHERE id = ?').run(newHostId, meta.gameId);
        const newHostUser = db.prepare('SELECT username FROM users WHERE id = ?')
          .get(newHostId) as { username: string } | undefined;
        if (newHostUser) {
          broadcastToRoom(meta.gameId, {
            type: 'HOST_CHANGED',
            payload: { newHostId, newHostUsername: newHostUser.username },
          });
        }
      }
    }
  }
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
  // Serialize base state once (dev cards hidden); reuse for players without private cards
  const baseState = orch.getPublicState();
  const baseMsg = JSON.stringify({ type: 'GAME_STATE', payload: { state: baseState } });
  for (const client of room) {
    if (client.readyState !== WebSocket.OPEN) continue;
    const meta = clientMeta.get(client);
    if (meta?.userId && orch.playerHasPrivateCards(meta.userId)) {
      const state = orch.getPublicState(meta.userId);
      client.send(JSON.stringify({ type: 'GAME_STATE', payload: { state } }));
    } else {
      client.send(baseMsg);
    }
  }
  // Keep server-side turn timer in sync with game state
  scheduleTurnTimer(gameId);
  scheduleDiscardTimer(gameId);
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
