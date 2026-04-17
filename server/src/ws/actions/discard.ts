import { WebSocket } from 'ws';
import type { ResourceBundle } from '@conqueror/shared';
import { hasResources, subtractResources, totalResources } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleDiscardCards(
  ws: WebSocket,
  payload: { gameId: string; cards: ResourceBundle },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'DISCARD') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not discard phase' } });
    return;
  }

  const requiredDiscard = state.discardsPending[meta.userId];
  if (!requiredDiscard) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NO_DISCARD_REQUIRED', message: 'You do not need to discard' } });
    return;
  }

  const discardTotal = totalResources(payload.cards);
  if (discardTotal !== requiredDiscard) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_DISCARD_AMOUNT', message: `Must discard exactly ${requiredDiscard} cards` } });
    return;
  }

  const player = state.players.find(p => p.id === meta.userId)!;
  if (!hasResources(player.resources, payload.cards)) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INSUFFICIENT_RESOURCES', message: 'You do not have these cards' } });
    return;
  }

  orch.updateState(s => {
    const newDiscardsPending = { ...s.discardsPending };
    delete newDiscardsPending[meta.userId];

    const allDone = Object.keys(newDiscardsPending).length === 0;

    // When discard finishes, extend turnStartTime so the discard phase time doesn't count against the turn
    const discardDuration = allDone && s.discardStartTime ? Date.now() - s.discardStartTime : 0;
    return {
      ...s,
      phase: allDone ? 'ROBBER' : 'DISCARD',
      discardsPending: newDiscardsPending,
      discardStartTime: allDone ? null : s.discardStartTime,
      turnStartTime: allDone && s.turnStartTime ? s.turnStartTime + discardDuration : s.turnStartTime,
      players: s.players.map(p =>
        p.id === meta.userId ? { ...p, resources: subtractResources(p.resources, payload.cards) } : p
      ),
    };
  });

  orch.addLogEntry('log.discarded', { player: meta.username, count: requiredDiscard }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
