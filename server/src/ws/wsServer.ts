import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import type { ClientMessage, ServerMessage } from '@conqueror/shared';
import db from '../db/index.js';
import { validateWsToken } from '../middleware/auth.js';
import { handleGameAction } from './actionRouter.js';
import { getOrchestrator } from '../game/orchestratorRegistry.js';
import type { ClientMeta } from './types.js';

// Room registry: gameId → connected clients
const rooms = new Map<string, Set<WebSocket>>();
// Client metadata
const clientMeta = new WeakMap<WebSocket, ClientMeta>();
// Horn rate limiting: `${gameId}:${userId}` → last horn timestamp
const hornLastUsed = new Map<string, number>();
const HORN_COOLDOWN_MS = 30_000; // 30 seconds

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
  if (now - last < HORN_COOLDOWN_MS) {
    sendTo(ws, {
      type: 'ERROR',
      payload: { code: 'HORN_COOLDOWN', message: `Wait ${Math.ceil((HORN_COOLDOWN_MS - (now - last)) / 1000)}s before honking again` },
    });
    return;
  }
  hornLastUsed.set(key, now);

  // Deduct 2 seconds from the active turn (if a time limit is set)
  const orch = getOrLoadOrchestrator(meta.gameId);
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
