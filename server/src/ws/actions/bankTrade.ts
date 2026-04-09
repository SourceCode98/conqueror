import { WebSocket } from 'ws';
import type { ResourceBundle } from '@conqueror/shared';
import { canBankTrade, addResources, subtractResources } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleBankTrade(
  ws: WebSocket,
  payload: { gameId: string; give: ResourceBundle; want: ResourceBundle },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }

  const v = canBankTrade(state, meta.userId, payload.give, payload.want);
  if (!v.valid) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'INVALID_TRADE', message: v.reason! } });
    return;
  }

  orch.updateState(s => ({
    ...s,
    players: s.players.map(p =>
      p.id === meta.userId
        ? { ...p, resources: addResources(subtractResources(p.resources, payload.give), payload.want) }
        : p
    ),
  }));

  orch.addLogEntry('log.bankTrade', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
