import { WebSocket } from 'ws';
import type { VertexId, EdgeId } from '@conqueror/shared';
import {
  canPlaceSettlement,
  canPlaceRoad,
  addResources,
  vertexTiles,
} from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

interface SetupPayload {
  gameId: string;
  vertexId: VertexId;
  type: 'settlement';
}

// Track which vertex each player placed their settlement on (for road connection during setup)
const setupVertices = new Map<string, VertexId>(); // `${gameId}:${playerId}` → vertexId

export function handleSetupPlacement(
  ws: WebSocket,
  payload: SetupPayload,
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  const { vertexId } = payload;

  // Validate settlement placement
  const validation = canPlaceSettlement(state, meta.userId, vertexId);
  if (!validation.valid) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PLACEMENT', message: validation.reason! } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;

  // Place the settlement
  setupVertices.set(`${meta.gameId}:${meta.userId}`, vertexId);

  // Collect starting resources for 2nd placement (SETUP_REVERSE only)
  let bonusResources = { timber: 0, clay: 0, iron: 0, grain: 0, wool: 0 };
  if (state.phase === 'SETUP_REVERSE') {
    const adjacentTiles = vertexTiles(vertexId, state.board);
    for (const tile of adjacentTiles) {
      if (tile.terrain !== 'desert') {
        (bonusResources as any)[tile.terrain] += 1;
      }
    }
  }

  orch.updateState(s => ({
    ...s,
    buildings: {
      ...s.buildings,
      [vertexId]: { type: 'settlement', playerId: meta.userId },
    },
    players: s.players.map(p =>
      p.id === meta.userId
        ? {
            ...p,
            settlementsLeft: p.settlementsLeft - 1,
            victoryPoints: p.victoryPoints + 1,
            resources: addResources(p.resources, bonusResources),
          }
        : p
    ),
    // Phase stays the same — player must now place a road
    // We'll track this server-side by knowing they placed settlement but no road yet
  }));

  orch.addLogEntry('log.placedSettlement', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

export function handleSetupRoad(
  ws: WebSocket,
  payload: { gameId: string; edgeId: EdgeId },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();
  const { edgeId } = payload;
  const setupVertex = setupVertices.get(`${meta.gameId}:${meta.userId}`);

  if (!setupVertex) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PLACE_SETTLEMENT_FIRST', message: 'Place your settlement first' } });
    return;
  }

  const validation = canPlaceRoad(state, meta.userId, edgeId, setupVertex);
  if (!validation.valid) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PLACEMENT', message: validation.reason! } });
    return;
  }

  setupVertices.delete(`${meta.gameId}:${meta.userId}`);

  // Advance turn
  const newState = advanceSetupTurn(orch, meta.userId, edgeId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}

function advanceSetupTurn(orch: GameOrchestrator, currentPlayerId: string, edgeId: EdgeId): void {
  orch.updateState(s => {
    const currentIdx = s.players.findIndex(p => p.id === currentPlayerId);
    const newRoads = { ...s.roads, [edgeId]: { playerId: currentPlayerId } };
    const newPlayers = s.players.map(p =>
      p.id === currentPlayerId ? { ...p, roadsLeft: p.roadsLeft - 1 } : p
    );

    const numPlayers = s.players.length;

    if (s.phase === 'SETUP_FORWARD') {
      if (currentIdx < numPlayers - 1) {
        // Next player in forward order
        return { ...s, roads: newRoads, players: newPlayers, activePlayerId: s.players[currentIdx + 1].id };
      } else {
        // Last player — start reverse
        return { ...s, roads: newRoads, players: newPlayers, phase: 'SETUP_REVERSE', setupRound: 2 };
      }
    } else {
      // SETUP_REVERSE
      if (currentIdx > 0) {
        return { ...s, roads: newRoads, players: newPlayers, activePlayerId: s.players[currentIdx - 1].id };
      } else {
        // Setup done — start main game
        return {
          ...s,
          roads: newRoads,
          players: newPlayers,
          phase: 'ROLL',
          activePlayerId: s.players[0].id,
          turn: 1,
        };
      }
    }
  });
}
