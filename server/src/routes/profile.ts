import { Router } from 'express';
import db from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';


export const profileRouter = Router();
profileRouter.use(authMiddleware);

type UserRow = {
  id: string; username: string; elo: number;
  games_played: number; games_won: number;
  selected_horn: string; selected_road_skin: string; selected_building_skin: string;
};

// GET /api/profile — my profile
profileRouter.get('/', (req, res) => {
  const userId = (req as any).user.userId;
  const user = db.prepare(
    'SELECT id, username, elo, games_played, games_won, selected_horn, selected_road_skin, selected_building_skin FROM users WHERE id = ?'
  ).get(userId) as UserRow | undefined;

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const unlockRows = db.prepare('SELECT unlock_id FROM user_unlocks WHERE user_id = ?').all(userId) as { unlock_id: string }[];
  const unlocks = unlockRows.map(r => r.unlock_id);

  res.json({
    id: user.id,
    username: user.username,
    elo: user.elo,
    gamesPlayed: user.games_played,
    gamesWon: user.games_won,
    selectedHorn: user.selected_horn,
    selectedRoadSkin: user.selected_road_skin,
    selectedBuildingSkin: user.selected_building_skin,
    unlocks,
  });
});

// GET /api/profile/leaderboard — top 20 by ELO (must come before /:userId)
profileRouter.get('/leaderboard', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, username, elo, games_played, games_won FROM users ORDER BY elo DESC LIMIT 20'
  ).all() as { id: string; username: string; elo: number; games_played: number; games_won: number }[];
  res.json(rows.map(r => ({
    id: r.id, username: r.username, elo: r.elo,
    gamesPlayed: r.games_played, gamesWon: r.games_won,
  })));
});

// GET /api/profile/:userId — public profile (for in-game cosmetics)
profileRouter.get('/:userId', (req, res) => {
  const user = db.prepare(
    'SELECT id, username, elo, games_played, games_won, selected_horn, selected_road_skin, selected_building_skin FROM users WHERE id = ?'
  ).get(req.params.userId) as UserRow | undefined;

  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  res.json({
    id: user.id,
    username: user.username,
    elo: user.elo,
    gamesPlayed: user.games_played,
    gamesWon: user.games_won,
    selectedHorn: user.selected_horn,
    selectedRoadSkin: user.selected_road_skin,
    selectedBuildingSkin: user.selected_building_skin,
  });
});

// PATCH /api/profile/cosmetics — update selected cosmetics
profileRouter.patch('/cosmetics', (req, res) => {
  const userId = (req as any).user.userId;
  const { selectedHorn, selectedRoadSkin, selectedBuildingSkin } = req.body as {
    selectedHorn?: string; selectedRoadSkin?: string; selectedBuildingSkin?: string;
  };

  // Validate each selection is unlocked
  const unlockRows = db.prepare('SELECT unlock_id FROM user_unlocks WHERE user_id = ?').all(userId) as { unlock_id: string }[];
  const unlocked = new Set(unlockRows.map(r => r.unlock_id));

  if (selectedHorn && !unlocked.has(selectedHorn)) {
    res.status(403).json({ error: 'Horn not unlocked' }); return;
  }
  if (selectedRoadSkin && !unlocked.has(selectedRoadSkin)) {
    res.status(403).json({ error: 'Road skin not unlocked' }); return;
  }
  if (selectedBuildingSkin && !unlocked.has(selectedBuildingSkin)) {
    res.status(403).json({ error: 'Building skin not unlocked' }); return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (selectedHorn)        { fields.push('selected_horn = ?');          values.push(selectedHorn); }
  if (selectedRoadSkin)    { fields.push('selected_road_skin = ?');     values.push(selectedRoadSkin); }
  if (selectedBuildingSkin){ fields.push('selected_building_skin = ?'); values.push(selectedBuildingSkin); }

  if (fields.length === 0) { res.json({ ok: true }); return; }
  values.push(userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});


