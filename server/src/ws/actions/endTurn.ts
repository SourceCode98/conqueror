import { WebSocket } from 'ws';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { checkAndHandleWin } from './winCheck.js';

export function handleEndTurn(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  if (state.phase !== 'ACTION') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'WRONG_PHASE', message: 'Not action phase' } });
    return;
  }

  if (checkAndHandleWin(orch, ctx)) {
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  // Advance to next player
  const currentIdx = state.players.findIndex(p => p.id === meta.userId);
  const nextIdx = (currentIdx + 1) % state.players.length;
  const nextPlayer = state.players[nextIdx];

  orch.updateState(s => ({
    ...s,
    phase: 'ROLL',
    turn: s.turn + 1,
    activePlayerId: nextPlayer.id,
    diceRoll: null,
    tradeOffer: null,
    turnStartTime: Date.now(),
    // Reset dev card played flags
    players: s.players.map(p => ({
      ...p,
      devCardPlayedThisTurn: false,
      devCards: p.devCards.map(c => ({
        ...c,
        playedThisTurn: false,
        boughtThisTurn: false,
      })),
    })),
  }));

  orch.addLogEntry('log.endedTurn', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
