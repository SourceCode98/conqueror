import { WebSocket } from 'ws';
import { applyWarTurnStart } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { checkAndHandleWin } from './winCheck.js';

/**
 * Force-advances the turn to the next player regardless of current phase.
 * Triggered server-side when the active player's turn timer expires.
 * Clears any pending trade, bandit move, or roll state.
 */
export function handleForceEndTurn(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  const state = orch.getState();

  // Only the active player can force-end their own turn
  if (state.activePlayerId !== meta.userId) {
    return; // silently ignore — race condition from a late client message
  }

  // Nothing to do if game is already over or in setup phases
  if (
    state.phase === 'GAME_OVER' ||
    state.phase === 'SETUP_FORWARD' ||
    state.phase === 'SETUP_REVERSE'
  ) {
    return;
  }

  // If the active player already has enough VP (e.g. from a road that gave longest road),
  // honour the win before advancing the turn.
  if (checkAndHandleWin(orch, ctx)) {
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  // Advance to the next player
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
    discardsPending: {},
    turnStartTime: Date.now(),
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

  applyWarTurnStart(orch);
  orch.addLogEntry('log.turnTimedOut', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
