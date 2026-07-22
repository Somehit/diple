import type Database from 'better-sqlite3';

export function ensureSchema(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS blocks (
			id         TEXT PRIMARY KEY,
			parent_id  TEXT NULL REFERENCES blocks(id) ON DELETE CASCADE,
			content    TEXT NOT NULL DEFAULT '',
			position   INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
	`);
}
