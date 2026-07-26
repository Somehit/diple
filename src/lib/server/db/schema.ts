import { getDb } from './client';

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

const SEED_BLOCKS = [
	{ id: 'root', parent_id: null, content: 'Welcome to Diple', position: 0 },
	{ id: 'seed-child-1', parent_id: 'root', content: 'Everything is a bullet point', position: 0 },
	{ id: 'seed-child-2', parent_id: 'root', content: 'Nest items with **Tab**', position: 1 },
	{
		id: 'seed-grandchild',
		parent_id: 'seed-child-2',
		content: 'Indent / outdent with Tab / Shift+Tab',
		position: 0
	},
	{ id: 'seed-child-3', parent_id: 'root', content: 'Split a block with `Enter`', position: 2 }
];

/** Apply schema and seed blocks if the table is empty. */
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

	// Backfill the FTS index for databases that predate it (fresh DBs seed both
	// tables below, so this is a no-op for them).
	const ftsCount = db.prepare('SELECT COUNT(*) AS cnt FROM blocks_fts').get() as {
		cnt: number;
	};
	if (ftsCount.cnt === 0) {
		db.exec('INSERT INTO blocks_fts (id, content) SELECT id, content FROM blocks');
	}

	const row = db.prepare('SELECT COUNT(*) AS cnt FROM blocks').get() as {
		cnt: number;
	};
	if (row.cnt === 0) {
		const stmt = db.prepare(
			'INSERT INTO blocks (id, parent_id, content, position) VALUES (?, ?, ?, ?)'
		);
		for (const b of SEED_BLOCKS) {
			stmt.run(b.id, b.parent_id, b.content, b.position);
		}
	} else if (row.cnt === 1) {
		// Old seed (v0.1-alpha) with single root block → replace with hierarchy
		const stmt = db.prepare(
			'INSERT OR REPLACE INTO blocks (id, parent_id, content, position) VALUES (?, ?, ?, ?)'
		);
		for (const b of SEED_BLOCKS) {
			stmt.run(b.id, b.parent_id, b.content, b.position);
		}
	}
}
