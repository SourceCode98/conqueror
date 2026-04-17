import { WebSocket } from 'ws';
import { collectResources, addResources, totalResources } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';

export function handleRollDice(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ROLL') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not time to roll dice' } });
    return;
  }

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const roll = d1 + d2;

  if (roll === 7) {
    // Check if any player has > 7 cards
    const playersOver7 = state.players.filter(p => totalResources(p.resources) > 7);
    const discardsPending: Record<string, number> = {};

    if (playersOver7.length > 0) {
      for (const p of playersOver7) {
        const total = totalResources(p.resources);
        discardsPending[p.id] = Math.floor(total / 2);
      }
      orch.updateState(s => ({
        ...s,
        diceRoll: [d1, d2],
        phase: 'DISCARD',
        discardsPending,
        discardStartTime: Date.now(),
      }));
    } else {
      orch.updateState(s => ({
        ...s,
        diceRoll: [d1, d2],
        phase: 'ROBBER',
      }));
    }

    orch.addLogEntry('log.rolledSeven', { player: meta.username }, meta.userId);
    ctx.broadcastToRoom({ type: 'DICE_ROLLED', payload: { roll: [d1, d2], resources: {} } });
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  // Collect resources for all players
  const resourceGains = collectResources(state, roll);

  orch.updateState(s => ({
    ...s,
    diceRoll: [d1, d2],
    phase: 'ACTION',
    players: s.players.map(p => ({
      ...p,
      resources: addResources(p.resources, resourceGains[p.id] ?? { timber: 0, clay: 0, iron: 0, grain: 0, wool: 0 }),
    })),
  }));

  orch.addLogEntry('log.rolled', { player: meta.username, roll }, meta.userId);
  ctx.broadcastToRoom({ type: 'DICE_ROLLED', payload: { roll: [d1, d2], resources: resourceGains } });
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
