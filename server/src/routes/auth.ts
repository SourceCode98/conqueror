import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { signToken } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }
  if (username.length < 2 || username.length > 20) {
    res.status(400).json({ error: 'Username must be 2-20 characters' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id'
  ).get(username, passwordHash) as { id: string };

  // Grant default unlocks
  db.prepare("INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id) VALUES (?, 'horn_default')").run(result.id);
  db.prepare("INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id) VALUES (?, 'road_default')").run(result.id);
  db.prepare("INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id) VALUES (?, 'building_default')").run(result.id);

  const token = signToken({ userId: result.id, username });
  res.status(201).json({ token, user: { id: result.id, username, elo: 1000 } });
});

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const user = db.prepare('SELECT id, username, password_hash, elo FROM users WHERE username = ?')
    .get(username) as { id: string; username: string; password_hash: string; elo: number } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, elo: user.elo ?? 1000 } });
});
