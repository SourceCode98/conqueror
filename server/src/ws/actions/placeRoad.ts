import { WebSocket } from 'ws';
import type { EdgeId } from '@conqueror/shared';
import {
  canPlaceRoad,
  subtractResources,
  recalculateSpecialCards,
  BUILD_COSTS,
} from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { handleSetupRoad } from './setupActions.js';

export function handlePlaceRoad(
  ws: WebSocket,
  payload: { gameId: string; edgeId: EdgeId },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  // During setup, delegate to setup handler
  if (state.phase === 'SETUP_FORWARD' || state.phase === 'SETUP_REVERSE') {
    handleSetupRoad(ws, payload, meta, orch, ctx);
    return;
  }

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }

  const v = canPlaceRoad(state, meta.userId, payload.edgeId);
  if (!v.valid) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_PLACEMENT', message: v.reason! } });
    return;
  }

  orch.updateState(s => {
    const newPlayers = recalculateSpecialCards({
      ...s,
      roads: { ...s.roads, [payload.edgeId]: { playerId: meta.userId } },
      players: s.players.map(p =>
        p.id === meta.userId
          ? {
              ...p,
              resources: subtractResources(p.resources, BUILD_COSTS.road),
              roadsLeft: p.roadsLeft - 1,
            }
          : p
      ),
    });
    return {
      ...s,
      roads: { ...s.roads, [payload.edgeId]: { playerId: meta.userId } },
      players: newPlayers,
    };
  });

  orch.addLogEntry('log.builtRoad', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
