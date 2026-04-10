import db from '../../db/index.js';
import { checkWinCondition } from '@conqueror/shared';
import type { GameOrchestrator } from '../../game/GameOrchestrator.js';
import type { ActionContext } from '../actionRouter.js';

/**
 * Checks if any player has won. If so, sets phase to GAME_OVER, marks
 * the DB row as finished, and broadcasts GAME_OVER.
 * Returns true if the game is now over.
 */
export function checkAndHandleWin(orch: GameOrchestrator, ctx: ActionContext): boolean {
  const winner = checkWinCondition(orch.getState());
  if (!winner) return false;

  orch.updateState(s => ({ ...s, phase: 'GAME_OVER', winner }));

  const gameId = orch.getState().gameId;
  db.prepare('UPDATE games SET status = ? WHERE id = ?').run('finished', gameId);

  const finalScores = Object.fromEntries(
    orch.getState().players.map(p => [p.id, p.victoryPoints + p.victoryPointCards])
  );
  ctx.broadcastToRoom({ type: 'GAME_OVER', payload: { winnerId: winner, finalScores } });
  return true;
}
