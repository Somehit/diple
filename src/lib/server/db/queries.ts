import { randomUUID } from 'node:crypto';
import { getDb } from './client';

export interface Block {
	id: string;
	parent_id: string | null;
	content: string;
	position: number;
	collapsed: number;
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
}): Block {
	const db = getDb();
	const id = randomUUID();

	db.transaction(() => {
		// Shift siblings after the insert point
		db.prepare(
			'UPDATE blocks SET position = position + 1 WHERE parent_id IS ? AND position >= ?'
		).run(params.parent_id, params.position);

		db.prepare('INSERT INTO blocks (id, parent_id, content, position) VALUES (?, ?, ?, ?)').run(
			id,
			params.parent_id,
			params.content,
			params.position
		);
	})();

	return {
		id,
		parent_id: params.parent_id,
		content: params.content,
		position: params.position,
		collapsed: 0
	};
}

/** Update a block's content. */
export function updateBlock(id: string, content: string): void {
	const db = getDb();
	db.prepare('UPDATE blocks SET content = ? WHERE id = ?').run(content, id);
}

/** Update a block's collapsed state (0 = expanded, 1 = collapsed). */
export function setCollapsed(id: string, collapsed: boolean): void {
	const db = getDb();
	db.prepare('UPDATE blocks SET collapsed = ? WHERE id = ?').run(collapsed ? 1 : 0, id);
}

/**
 * Delete a block and all its descendants.
 * `ON DELETE CASCADE` on the FK handles children.
 */
export function deleteBlock(id: string): void {
	const db = getDb();

	db.transaction(() => {
		// Remove from parent's position order first
		const block = db.prepare('SELECT parent_id, position FROM blocks WHERE id = ?').get() as
			Block | undefined;
		if (!block) return;

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
		const block = db.prepare('SELECT parent_id, position FROM blocks WHERE id = ?').get() as
			Block | undefined;
		if (!block) return;

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
