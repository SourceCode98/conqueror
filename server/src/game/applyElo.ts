import db from '../db/index.js';
import { calculateEloChanges, type EloResult } from './elo.js';
import { getUnlockedIds } from '@conqueror/shared';
import type { GameOrchestrator } from './GameOrchestrator.js';

/**
 * Calculates ELO changes for all players, persists them to DB,
 * grants newly earned unlocks, and returns the results.
 */
export function applyEloForGame(orch: GameOrchestrator, winnerId: string): EloResult[] {
  const state = orch.getState();

  // Fetch current ELOs from DB
  type UserEloRow = { id: string; elo: number };
  const playerIds = state.players.map(p => p.id);
  const placeholders = playerIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, elo FROM users WHERE id IN (${placeholders})`
  ).all(...playerIds) as UserEloRow[];
  const eloMap = new Map(rows.map(r => [r.id, r.elo]));

  const playersForElo = state.players.map(p => ({
    userId: p.id,
    elo: eloMap.get(p.id) ?? 1000,
    won: p.id === winnerId,
    victoryPoints: p.victoryPoints + p.victoryPointCards,
  }));

  const results = calculateEloChanges(playersForElo);

  // Persist ELO changes and stats
  const updateElo = db.prepare(
    'UPDATE users SET elo = ?, games_played = games_played + 1, games_won = games_won + ? WHERE id = ?'
  );
  const grantUnlock = db.prepare(
    'INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id) VALUES (?, ?)'
  );

  const updateAll = db.transaction(() => {
    for (const r of results) {
      const isWinner = r.userId === winnerId ? 1 : 0;
      updateElo.run(r.newElo, isWinner, r.userId);

      // Grant any newly unlocked items
      const unlocked = getUnlockedIds(r.newElo);
      for (const uid of unlocked) {
        grantUnlock.run(r.userId, uid);
      }
    }
  });

  updateAll();
  return results;
}
