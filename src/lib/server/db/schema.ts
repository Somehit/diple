import { getDb } from './client';
import { seed } from './seed';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS blocks (
	id        TEXT PRIMARY KEY,
	parent_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
	content   TEXT NOT NULL DEFAULT '',
	position  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_parent
	ON blocks(parent_id);

-- Full-text index over block content. Plain FTS5 table (not external-content):
-- the app maintains it inside the same transactions as block writes, so the two
-- never drift apart — see queries.ts.
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
	id UNINDEXED,
	content
);
`;

/** Apply schema and seed data if the table is empty. */
export function initDb(): void {
	const db = getDb();

	db.exec(SCHEMA_SQL);

	// Migration: add collapsed column if it doesn't exist (added in v0.2)
	const columns = db.prepare('PRAGMA table_info(blocks)').all() as { name: string }[];
	if (!columns.some((c) => c.name === 'collapsed')) {
		db.exec('ALTER TABLE blocks ADD COLUMN collapsed INTEGER NOT NULL DEFAULT 0');
	}

	// Migration: add created_at (epoch ms) if missing. Existing rows keep 0 =
	// "unknown creation time" — they intentionally don't match the :today filter.
	if (!columns.some((c) => c.name === 'created_at')) {
		db.exec('ALTER TABLE blocks ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
	}

	// Seed a power-user tree on first launch (empty DB) or legacy single-block DB.
	const row = db.prepare('SELECT COUNT(*) AS cnt FROM blocks').get() as {
		cnt: number;
	};
	if (row.cnt === 0) {
		seed();
	} else if (row.cnt === 1) {
		// Old seed (v0.1-alpha) with single root block → replace with full tree
		seed();
	}
}
