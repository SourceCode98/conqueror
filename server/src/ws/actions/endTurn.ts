import { WebSocket } from 'ws';
import { applyWarTurnStart, liftPlayerSieges, countPlayerSoldiers } from '@conqueror/shared';
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

  // Cannot end turn while a destruction choice is pending
  if (state.warMode && state.pendingDestruction != null) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'PENDING_DESTRUCTION', message: 'Must resolve destruction before ending turn' } });
    return;
  }

  if (checkAndHandleWin(orch, ctx)) {
    ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
    return;
  }

  // Lift this player's sieges at end of their turn (so they had a chance to re-attack)
  liftPlayerSieges(orch, meta.userId);

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
    turnPausedAt: null,
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

  // Snapshot next player state before war start (for toast diff)
  const stateBefore = orch.getState();
  const nextId = nextPlayer.id;
  const pBefore = stateBefore.players.find(p => p.id === nextId);
  const soldiersBefore = stateBefore.warMode ? countPlayerSoldiers(stateBefore.buildings as any, nextId) : 0;

  applyWarTurnStart(orch);

  // Emit toast if maintenance/desertion happened
  if (stateBefore.warMode) {
    const stateAfter = orch.getState();
    const pAfter = stateAfter.players.find(p => p.id === nextId);
    const soldiersAfter = countPlayerSoldiers(stateAfter.buildings as any, nextId);
    if (soldiersAfter < soldiersBefore) {
      const lost = soldiersBefore - soldiersAfter;
      ctx.broadcastToRoom({ type: 'ACTION_TOAST', payload: { playerId: nextId, username: nextPlayer.username, action: 'soldierDesertion', extra: String(lost) } });
    } else if (pBefore && pAfter && pAfter.resources.grain < pBefore.resources.grain) {
      const grain = pBefore.resources.grain - pAfter.resources.grain;
      ctx.broadcastToRoom({ type: 'ACTION_TOAST', payload: { playerId: nextId, username: nextPlayer.username, action: 'soldierMaintenance', extra: String(grain) } });
    }
  }

  orch.addLogEntry('log.endedTurn', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });
}
