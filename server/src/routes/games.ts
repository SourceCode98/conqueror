import { Router } from 'express';
import db from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { IS_VALID_PLAYER_COLOR } from '@conqueror/shared';
import { startGame } from '../ws/gameStarter.js';

export const gamesRouter = Router();
gamesRouter.use(authMiddleware);

gamesRouter.get('/', (_req, res) => {
  const games = db.prepare(`
    SELECT g.id, g.name, g.status, g.max_players, g.created_at,
           u.username as created_by_username,
           COUNT(gp.user_id) as player_count
    FROM games g
    JOIN users u ON u.id = g.created_by
    LEFT JOIN game_players gp ON gp.game_id = g.id
    WHERE g.status IN ('lobby', 'active')
    GROUP BY g.id
    ORDER BY g.created_at DESC
    LIMIT 50
  `).all();
  res.json(games);
});

gamesRouter.post('/', (req, res) => {
  const { name, maxPlayers = 4, color } = req.body as {
    name?: string;
    maxPlayers?: number;
    color?: string;
  };
  const userId = req.user.userId;

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: 'Game name is required' });
    return;
  }
  if (maxPlayers < 2 || maxPlayers > 6) {
    res.status(400).json({ error: 'maxPlayers must be 2-6' });
    return;
  }
  if (!color || !IS_VALID_PLAYER_COLOR(color)) {
    res.status(400).json({ error: 'Invalid color — send a hex color like #ef4444' });
    return;
  }

  const game = db.prepare(
    'INSERT INTO games (name, max_players, created_by) VALUES (?, ?, ?) RETURNING id'
  ).get(name.trim(), maxPlayers, userId) as { id: string };

  db.prepare(
    'INSERT INTO game_players (game_id, user_id, color, seat_order) VALUES (?, ?, ?, 0)'
  ).run(game.id, userId, color);

  res.status(201).json({ gameId: game.id });
});

gamesRouter.get('/:id', (req, res) => {
  const game = db.prepare(`
    SELECT g.id, g.name, g.status, g.max_players, g.created_at, g.state_json,
           u.username as created_by_username
    FROM games g
    JOIN users u ON u.id = g.created_by
    WHERE g.id = ?
  `).get(req.params.id) as any;

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }

  const players = db.prepare(`
    SELECT gp.user_id as id, u.username, u.elo, gp.color, gp.seat_order
    FROM game_players gp
    JOIN users u ON u.id = gp.user_id
    WHERE gp.game_id = ?
    ORDER BY gp.seat_order
  `).all(req.params.id);

  res.json({ ...game, state_json: undefined, players });
});

// Start a game (host only)
gamesRouter.post('/:id/start', (req, res) => {
  const gameId = req.params.id;
  const userId = req.user.userId;
  const {
    turnTimeLimit = null,
    hornCooldownSecs = 30,
    warMode = false,
    warVariants = {},
  } = req.body as {
    turnTimeLimit?: number | null;
    hornCooldownSecs?: number;
    warMode?: boolean;
    warVariants?: { totalWar?: boolean; fortress?: boolean; reconstruction?: boolean; soldierFoodEnabled?: boolean; coliseum?: boolean };
  };

  const game = db.prepare('SELECT id, status, max_players, created_by FROM games WHERE id = ?')
    .get(gameId) as { id: string; status: string; max_players: number; created_by: string } | undefined;

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  if (game.status !== 'lobby') {
    res.status(400).json({ error: 'Game already started' });
    return;
  }
  if (game.created_by !== userId) {
    res.status(403).json({ error: 'Only the host can start the game' });
    return;
  }

  const players = db.prepare(`
    SELECT gp.user_id as id, u.username, gp.color, gp.seat_order
    FROM game_players gp
    JOIN users u ON u.id = gp.user_id
    WHERE gp.game_id = ?
    ORDER BY gp.seat_order
  `).all(gameId) as Array<{ id: string; username: string; color: string; seat_order: number }>;

  if (players.length < 2) {
    res.status(400).json({ error: 'Need at least 2 players to start' });
    return;
  }

  const limitSec = typeof turnTimeLimit === 'number' && turnTimeLimit > 0 ? turnTimeLimit : null;
  const cooldownSecs = typeof hornCooldownSecs === 'number' && hornCooldownSecs > 0 ? Math.min(hornCooldownSecs, 300) : 30;
  startGame(gameId, players, limitSec, cooldownSecs, Boolean(warMode), warVariants ?? {});

  db.prepare('UPDATE games SET status = ? WHERE id = ?').run('active', gameId);
  res.json({ ok: true });
});

// Join a game in the lobby
gamesRouter.post('/:id/join', (req, res) => {
  const gameId = req.params.id;
  const userId = req.user.userId;
  const { color } = req.body as { color?: string };

  if (!color || !IS_VALID_PLAYER_COLOR(color)) {
    res.status(400).json({ error: 'Invalid color — send a hex color like #ef4444' });
    return;
  }

  const game = db.prepare('SELECT id, status, max_players FROM games WHERE id = ?')
    .get(gameId) as { id: string; status: string; max_players: number } | undefined;

  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  if (game.status !== 'lobby') {
    res.status(400).json({ error: 'Game already started' });
    return;
  }

  const playerCount = (db.prepare('SELECT COUNT(*) as count FROM game_players WHERE game_id = ?')
    .get(gameId) as { count: number }).count;

  if (playerCount >= game.max_players) {
    res.status(400).json({ error: 'Game is full' });
    return;
  }

  const existing = db.prepare('SELECT user_id FROM game_players WHERE game_id = ? AND user_id = ?')
    .get(gameId, userId);
  if (existing) {
    res.status(400).json({ error: 'Already in this game' });
    return;
  }

  // Check color not taken
  const colorTaken = db.prepare('SELECT user_id FROM game_players WHERE game_id = ? AND color = ?')
    .get(gameId, color);
  if (colorTaken) {
    res.status(400).json({ error: 'Color already taken' });
    return;
  }

  db.prepare(
    'INSERT INTO game_players (game_id, user_id, color, seat_order) VALUES (?, ?, ?, ?)'
  ).run(gameId, userId, color, playerCount);

  res.json({ ok: true });
});
