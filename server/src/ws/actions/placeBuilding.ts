import { WebSocket } from 'ws';
import type { VertexId, BuildingType } from '@conqueror/shared';
import {
  canPlaceSettlement,
  canPlaceCity,
  subtractResources,
  recalculateSpecialCards,
  checkWinCondition,
  BUILD_COSTS,
  EMPTY_RESOURCES,
} from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handlePlaceBuilding(
  ws: WebSocket,
  payload: { gameId: string; vertexId: VertexId; type: BuildingType },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }

  const { vertexId, type } = payload;

  if (type === 'settlement') {
    const v = canPlaceSettlement(state, meta.userId, vertexId);
    if (!v.valid) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PLACEMENT', message: v.reason! } });
      return;
    }

    orch.updateState(s => {
      const intermediate = {
        ...s,
        buildings: { ...s.buildings, [vertexId]: { type: 'settlement' as const, playerId: meta.userId } },
        players: s.players.map(p =>
          p.id === meta.userId
            ? {
                ...p,
                resources: subtractResources(p.resources, BUILD_COSTS.settlement),
                settlementsLeft: p.settlementsLeft - 1,
                victoryPoints: p.victoryPoints + 1,
              }
            : p
        ),
      };
      // Recalculate special cards — building can break opponent road networks
      const updatedPlayers = recalculateSpecialCards(intermediate);
      return { ...intermediate, players: updatedPlayers };
    });
  } else {
    const v = canPlaceCity(state, meta.userId, vertexId);
    if (!v.valid) {
      ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PLACEMENT', message: v.reason! } });
      return;
    }

    orch.updateState(s => {
      const intermediate = {
        ...s,
        buildings: { ...s.buildings, [vertexId]: { type: 'city' as const, playerId: meta.userId } },
        players: s.players.map(p =>
          p.id === meta.userId
            ? {
                ...p,
                resources: subtractResources(p.resources, BUILD_COSTS.city),
                citiesLeft: p.citiesLeft - 1,
                settlementsLeft: p.settlementsLeft + 1, // settlement piece returned
                victoryPoints: p.victoryPoints + 1,     // city is +2 total, was +1 for settlement
              }
            : p
        ),
      };
      const updatedPlayers = recalculateSpecialCards(intermediate);
      return { ...intermediate, players: updatedPlayers };
    });
  }

  // Check win condition
  const winner = checkWinCondition(orch.getState());
  if (winner) {
    orch.updateState(s => ({ ...s, phase: 'GAME_OVER', winner }));
    const finalScores: Record<string, number> = {};
    for (const p of orch.getState().players) {
      finalScores[p.id] = p.victoryPoints + p.victoryPointCards;
    }
    ctx.broadcastToRoom({ type: 'GAME_OVER', payload: { winnerId: winner, finalScores } });
  }

  const actionLabel = type === 'settlement' ? 'builtSettlement' : 'builtCity';
  orch.addLogEntry(`log.built${type === 'settlement' ? 'Settlement' : 'City'}`, { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'ACTION_TOAST', payload: { playerId: meta.userId, username: meta.username, action: actionLabel, extra: vertexId } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
