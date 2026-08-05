import { randomUUID } from 'node:crypto';
import { getDb } from './client';

export interface Block {
	id: string;
	parent_id: string | null;
	content: string;
	position: number;
	collapsed: number;
	created_at: number;
}

/** Return every block, ordered by parent_id then position (flattened tree order). */
export function getTree(): Block[] {
	const db = getDb();
	return db.prepare('SELECT * FROM blocks ORDER BY parent_id, position').all() as Block[];
}

/**
 * Create a new block as a child of `parent_id` at the given `position`.
 * Sibling positions are shifted to make room.
 */
export function createBlock(params: {
	parent_id: string | null;
	content: string;
	position: number;
	id?: string;
}): Block {
	const db = getDb();
	const id = params.id ?? randomUUID();
	const created_at = Date.now();

	db.transaction(() => {
		// Shift siblings after the insert point
		db.prepare(
			'UPDATE blocks SET position = position + 1 WHERE parent_id IS ? AND position >= ?'
		).run(params.parent_id, params.position);

		db.prepare(
			'INSERT INTO blocks (id, parent_id, content, position, created_at) VALUES (?, ?, ?, ?, ?)'
		).run(id, params.parent_id, params.content, params.position, created_at);

		db.prepare('INSERT INTO blocks_fts (id, content) VALUES (?, ?)').run(id, params.content);
	})();

	return {
		id,
		parent_id: params.parent_id,
		content: params.content,
		position: params.position,
		collapsed: 0,
		created_at
	};
}

/**
 * Insert many blocks in one transaction. `blocks` must arrive parents-first
 * (each child's parent already exists — FK constraint) and each sibling group
 * must carry its FINAL positions (the client computes them before pasting).
 *
 * A single per-group shift makes room for all newcomers at once, then the
 * blocks are inserted without re-shifting: a per-insert shift would reorder
 * the pasted siblings (each new row would push the previous one aside).
 * `collapsed` is honoured here, unlike createBlock which resets it to 0.
 */
export function createBlocksBatch(
	blocks: {
		id: string;
		parent_id: string | null;
		content: string;
		position: number;
		collapsed?: number;
	}[]
): void {
	const db = getDb();

	db.transaction(() => {
		// Group sizes and earliest insert position per parent (one shift per group).
		const groups = new Map<string | null, { count: number; minPos: number }>();
		for (const b of blocks) {
			const g = groups.get(b.parent_id);
			if (g) {
				g.count++;
				g.minPos = Math.min(g.minPos, b.position);
			} else {
				groups.set(b.parent_id, { count: 1, minPos: b.position });
			}
		}

		const shift = db.prepare(
			'UPDATE blocks SET position = position + ? WHERE parent_id IS ? AND position >= ?'
		);
		for (const [parentId, g] of groups) {
			shift.run(g.count, parentId, g.minPos);
		}

		const insert = db.prepare(
			'INSERT INTO blocks (id, parent_id, content, position, created_at) VALUES (?, ?, ?, ?, ?)'
		);
		const fts = db.prepare('INSERT INTO blocks_fts (id, content) VALUES (?, ?)');
		const markCollapsed = db.prepare('UPDATE blocks SET collapsed = 1 WHERE id = ?');
		const created_at = Date.now();

		for (const b of blocks) {
			insert.run(b.id, b.parent_id, b.content, b.position, created_at);
			fts.run(b.id, b.content);
			if (b.collapsed === 1) markCollapsed.run(b.id);
		}
	})();
}

/** Update a block's content, keeping the FTS index in sync (same transaction). */
export function updateBlock(id: string, content: string): void {
	const db = getDb();
	db.transaction(() => {
		db.prepare('UPDATE blocks SET content = ? WHERE id = ?').run(content, id);
		db.prepare('UPDATE blocks_fts SET content = ? WHERE id = ?').run(content, id);
	})();
}

/** Update a block's collapsed state (0 = expanded, 1 = collapsed). */
export function setCollapsed(id: string, collapsed: boolean): void {
	const db = getDb();
	db.prepare('UPDATE blocks SET collapsed = ? WHERE id = ?').run(collapsed ? 1 : 0, id);
}

/**
 * Batch-set collapsed state for multiple blocks in a single transaction.
 * Each item must have `id` and `collapsed` (0 | 1).
 */
export function setCollapsedBatch(items: { id: string; collapsed: number }[]): void {
	const db = getDb();
	const stmt = db.prepare('UPDATE blocks SET collapsed = ? WHERE id = ?');
	db.transaction(() => {
		for (const { id, collapsed } of items) {
			stmt.run(collapsed, id);
		}
	})();
}

/**
 * Delete a block and all its descendants.
 * `ON DELETE CASCADE` on the FK handles children in `blocks`; FTS rows are
 * removed explicitly first (a cascade won't touch the FTS table), in the same
 * transaction so the index can never keep ghosts of deleted blocks.
 */
export function deleteBlock(id: string): void {
	const db = getDb();

	db.transaction(() => {
		// Remove from parent's position order first
		const block = db.prepare('SELECT parent_id, position FROM blocks WHERE id = ?').get(id) as
			Block | undefined;
		if (!block) return;

		db.prepare(
			`WITH RECURSIVE descendants(id) AS (
				SELECT id FROM blocks WHERE id = ?
				UNION ALL
				SELECT b.id FROM blocks b JOIN descendants d ON b.parent_id = d.id
			)
			DELETE FROM blocks_fts WHERE id IN (SELECT id FROM descendants)`
		).run(id);

		db.prepare('DELETE FROM blocks WHERE id = ?').run(id);

		// Close the gap left by the deleted block among its siblings
		db.prepare(
			'UPDATE blocks SET position = position - 1 WHERE parent_id IS ? AND position > ?'
		).run(block.parent_id, block.position);
	})();
}

/**
 * Move a block to a new parent and/or position.
 * Renumbers both old and new sibling groups.
 */
export function moveBlock(
	id: string,
	params: { parent_id: string | null; position: number }
): void {
	const db = getDb();

	db.transaction(() => {
		const block = db.prepare('SELECT parent_id, position FROM blocks WHERE id = ?').get(id) as
			Block | undefined;
		if (!block) return;

		// Cycle guard: a block must never be moved inside its own subtree (its
		// ancestor chain would loop and the tree invariants would break).
		// Keyboard moves (Tab/Shift-Tab) shift one level at a time and can't
		// create a cycle; a drag & drop can aim at a descendant — the client
		// rejects that target, and the server enforces the invariant here as
		// defense in depth. Silent no-op, same convention as the missing-block
		// check above.
		let cursor = params.parent_id;
		const seen = new Set<string>();
		while (cursor && !seen.has(cursor)) {
			if (cursor === id) return;
			seen.add(cursor);
			const parent = db.prepare('SELECT parent_id FROM blocks WHERE id = ?').get(cursor) as
				{ parent_id: string | null } | undefined;
			cursor = parent?.parent_id ?? null;
		}

		// Close gap at old position
		db.prepare(
			'UPDATE blocks SET position = position - 1 WHERE parent_id IS ? AND position > ?'
		).run(block.parent_id, block.position);

		// Make room at new position
		db.prepare(
			'UPDATE blocks SET position = position + 1 WHERE parent_id IS ? AND position >= ?'
		).run(params.parent_id, params.position);

		// Move the block
		db.prepare('UPDATE blocks SET parent_id = ?, position = ? WHERE id = ?').run(
			params.parent_id,
			params.position,
			id
		);
	})();
}

// --- Search ---

export interface SearchResult {
	block: Block;
	/** Ancestors of the match, ordered root → direct parent. Empty for root blocks. */
	path: Block[];
}

type FilterName = 'root' | 'leaves' | 'branches' | 'today';

const FILTER_NAMES = new Set<string>(['root', 'leaves', 'branches', 'today']);

const SEARCH_LIMIT = 50;

/** SQL fragment per filter. `:today` compares against local midnight. */
function filterCondition(name: FilterName): { sql: string; params: number[] } {
	switch (name) {
		case 'root':
			return { sql: 'b.parent_id IS NULL', params: [] };
		case 'leaves':
			return { sql: 'NOT EXISTS (SELECT 1 FROM blocks c WHERE c.parent_id = b.id)', params: [] };
		case 'branches':
			return { sql: 'EXISTS (SELECT 1 FROM blocks c WHERE c.parent_id = b.id)', params: [] };
		case 'today': {
			const midnight = new Date();
			midnight.setHours(0, 0, 0, 0);
			return { sql: 'b.created_at >= ?', params: [midnight.getTime()] };
		}
	}
}

/**
 * Turn plain search terms into a safe FTS5 query. Each term becomes a quoted
 * prefix phrase (appended with * when the term has >= 3 characters), which
 * neutralises FTS operators (colons, AND/OR/NEAR) and enables partial matching
 * ("janvi" matches "janvier"). Space-joined phrases are an implicit AND.
 */
function toFtsQuery(terms: string[]): string {
	return terms
		.map((t) => {
			const safe = t.replace(/"/g, '""');
			return t.length >= 3 ? `"${safe}"*` : `"${safe}"`;
		})
		.join(' ');
}

/**
 * Search all blocks by content, with optional `:filter` tokens.
 * Examples: "meeting notes", ":leaves idea", ":today", ":root".
 * Unknown ":tokens" are treated as plain search terms.
 * Returns at most 50 results, each with its breadcrumb path.
 */
export function searchBlocks(rawQuery: string): SearchResult[] {
	const db = getDb();

	const filters: FilterName[] = [];
	const terms: string[] = [];
	for (const token of rawQuery.trim().split(/\s+/).filter(Boolean)) {
		const name = token.startsWith(':') ? token.slice(1).toLowerCase() : '';
		if (FILTER_NAMES.has(name)) filters.push(name as FilterName);
		else terms.push(token);
	}

	// Empty query: the palette shows recents instead — never dump the whole tree.
	if (terms.length === 0 && filters.length === 0) return [];

	const conditions: string[] = [];
	const params: (string | number)[] = [];
	for (const f of filters) {
		const cond = filterCondition(f);
		conditions.push(cond.sql);
		params.push(...cond.params);
	}

	let rows: Block[];
	if (terms.length > 0) {
		const where = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
		rows = db
			.prepare(
				`WITH RECURSIVE depths(id, depth) AS (
					SELECT id, 0 FROM blocks WHERE parent_id IS NULL
					UNION ALL
					SELECT b.id, d.depth + 1
					FROM blocks b JOIN depths d ON b.parent_id = d.id
				)
				SELECT b.* FROM blocks_fts f
				 JOIN blocks b ON b.id = f.id
				 JOIN depths d ON d.id = b.id
				 WHERE blocks_fts MATCH ? ${where}
				 ORDER BY d.depth ASC, rank ASC
				 LIMIT ${SEARCH_LIMIT}`
			)
			.all(toFtsQuery(terms), ...params) as Block[];
	} else {
		// Filter-only query: nothing to match, list the shallowest matching blocks first.
		rows = db
			.prepare(
				`WITH RECURSIVE depths(id, depth) AS (
					SELECT id, 0 FROM blocks WHERE parent_id IS NULL
					UNION ALL
					SELECT b.id, d.depth + 1
					FROM blocks b JOIN depths d ON b.parent_id = d.id
				)
				SELECT b.* FROM blocks b
				 JOIN depths d ON d.id = b.id
				 WHERE ${conditions.join(' AND ')}
				 ORDER BY d.depth ASC, b.created_at DESC
				 LIMIT ${SEARCH_LIMIT}`
			)
			.all(...params) as Block[];
	}

	const byId = db.prepare('SELECT * FROM blocks WHERE id = ?');

	/** Breadcrumb path (root → direct parent). Cycle-guarded against corrupt data. */
	function pathOf(block: Block): Block[] {
		const path: Block[] = [];
		const seen = new Set<string>([block.id]);
		let cursor = block.parent_id;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			const parent = byId.get(cursor) as Block | undefined;
			if (!parent) break;
			path.unshift(parent);
			cursor = parent.parent_id;
		}
		return path;
	}

	return rows.map((block) => ({ block, path: pathOf(block) }));
}
