export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username     TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS games (
    id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name         TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'lobby',
    max_players  INTEGER NOT NULL DEFAULT 4,
    state_json   TEXT,
    created_by   TEXT NOT NULL REFERENCES users(id),
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id),
    color        TEXT NOT NULL,
    seat_order   INTEGER NOT NULL,
    joined_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (game_id, user_id)
  );
`;
