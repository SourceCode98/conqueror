import { WebSocket } from 'ws';
import db from '../../db/index.js';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ClientMeta } from '../types.js';
import type { ActionContext } from '../actionRouter.js';
import { applyEloForGame } from '../../game/applyElo.js';

export function handleEndGame(
  ws: WebSocket,
  payload: { gameId: string },
  meta: ClientMeta,
  orch: GameOrchestrator,
  ctx: ActionContext,
): void {
  // Only the host (game creator) can end the game early
  const game = db.prepare('SELECT created_by FROM games WHERE id = ?').get(payload.gameId) as
    | { created_by: string }
    | undefined;

  if (!game) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' } });
    return;
  }
  if (game.created_by !== meta.userId) {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'NOT_HOST', message: 'Only the host can end the game' } });
    return;
  }

  const state = orch.getState();
  if (state.phase === 'GAME_OVER') {
    ctx.sendTo(ws, { type: 'ERROR', payload: { code: 'ALREADY_OVER', message: 'Game is already over' } });
    return;
  }

  // Find the player with the most VP as the "winner" (or null if tied/early)
  const sorted = [...state.players].sort((a, b) => b.victoryPoints - a.victoryPoints);
  const topVP = sorted[0]?.victoryPoints ?? 0;
  const topPlayers = sorted.filter(p => p.victoryPoints === topVP);
  const winner = topPlayers.length === 1 ? topPlayers[0].id : null;

  orch.updateState(s => ({ ...s, phase: 'GAME_OVER', winner }));
  db.prepare('UPDATE games SET status = ? WHERE id = ?').run('finished', payload.gameId);

  orch.addLogEntry('log.hostEndedGame', { player: meta.username }, meta.userId);
  ctx.broadcastToRoom({ type: 'GAME_STATE', payload: { state: orch.getPublicState() } });

  const eloChanges = winner ? Object.fromEntries(applyEloForGame(orch, winner).map(r => [r.userId, r.delta])) : {};
  const finalScores = Object.fromEntries(state.players.map(p => [p.id, p.victoryPoints]));

  ctx.broadcastToRoom({
    type: 'GAME_OVER',
    payload: { winnerId: winner ?? '', finalScores, eloChanges },
  });
}
