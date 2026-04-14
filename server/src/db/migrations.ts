import type { Database } from 'better-sqlite3';

interface Migration {
  version: number;
  up: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      // ELO, stats, and cosmetics columns
      const cols = [
        'ALTER TABLE users ADD COLUMN elo INTEGER NOT NULL DEFAULT 1000',
        'ALTER TABLE users ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0',
        'ALTER TABLE users ADD COLUMN games_won INTEGER NOT NULL DEFAULT 0',
        "ALTER TABLE users ADD COLUMN selected_horn TEXT NOT NULL DEFAULT 'horn_default'",
        "ALTER TABLE users ADD COLUMN selected_road_skin TEXT NOT NULL DEFAULT 'road_default'",
        "ALTER TABLE users ADD COLUMN selected_building_skin TEXT NOT NULL DEFAULT 'building_default'",
      ];
      for (const sql of cols) {
        try { db.exec(sql); } catch { /* column already exists */ }
      }

      // Unlock tracking table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_unlocks (
          user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          unlock_id   TEXT NOT NULL,
          unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
          PRIMARY KEY (user_id, unlock_id)
        )
      `);

      // Grant default unlocks to all existing users
      db.exec(`
        INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id)
        SELECT id, 'horn_default'     FROM users;
        INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id)
        SELECT id, 'road_default'     FROM users;
        INSERT OR IGNORE INTO user_unlocks (user_id, unlock_id)
        SELECT id, 'building_default' FROM users;
      `);
    },
  },
];

export function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
    INSERT INTO schema_version (version) SELECT 0 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
  `);

  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number };
  let current = row.version;

  for (const m of migrations) {
    if (m.version > current) {
      m.up(db);
      db.prepare('UPDATE schema_version SET version = ?').run(m.version);
      current = m.version;
      console.log(`[DB] Migration ${m.version} applied`);
    }
  }
}
