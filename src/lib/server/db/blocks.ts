import { getDb } from './client.js';

export interface Block {
	id: string;
	parent_id: string | null;
	content: string;
	position: number;
	created_at: number;
	updated_at: number;
}

export function listBlocks(): Block[] {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM blocks ORDER BY parent_id, position').all() as Block[];
	return rows;
}

export function getBlock(id: string): Block | null {
	const db = getDb();
	const row = db.prepare('SELECT * FROM blocks WHERE id = ?').get(id) as Block | undefined;
	return row ?? null;
}

export function createBlock(
	id: string,
	parentId: string | null,
	position: number,
	content: string = ''
): Block {
	const db = getDb();
	const now = Date.now();
	const tx = db.transaction(() => {
		// Shift siblings >= position to make room
		makeRoom(db, parentId, position);
		db.prepare(
			'INSERT INTO blocks (id, parent_id, content, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
		).run(id, parentId, content, position, now, now);
	});
	tx();
	return getBlock(id)!;
}

export function updateContent(id: string, content: string): Block {
	const db = getDb();
	const now = Date.now();
	db.prepare('UPDATE blocks SET content = ?, updated_at = ? WHERE id = ?').run(content, now, id);
	return getBlock(id)!;
}

export function deleteBlock(id: string): void {
	const db = getDb();
	db.prepare('DELETE FROM blocks WHERE id = ?').run(id);
	// Cascade handled by ON DELETE CASCADE foreign key
}

export function indentBlock(id: string): void {
	const db = getDb();
	const block = getBlock(id);
	if (!block) return;

	// Find previous sibling (same parent, lower position)
	const prevSibling = db
		.prepare(
			`SELECT id FROM blocks
			 WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?
			 AND position < ?
			 ORDER BY position DESC LIMIT 1`
		)
		.get(block.parent_id, block.parent_id, block.position) as { id: string } | undefined;

	if (!prevSibling) return; // no previous sibling → can't indent

	const newParentId = prevSibling.id;
	const newPosition = siblingCount(newParentId);

	const tx = db.transaction(() => {
		// Close gap in old parent
		closeSiblingGap(db, block.parent_id, block.position, 'up');
		// Move block
		db.prepare('UPDATE blocks SET parent_id = ?, position = ? WHERE id = ?').run(
			newParentId,
			newPosition,
			id
		);
	});
	tx();
}

export function outdentBlock(id: string): void {
	const db = getDb();
	const block = getBlock(id);
	if (!block || block.parent_id === null) return; // root block → can't outdent

	const parent = getBlock(block.parent_id);
	if (!parent) return;

	const grandParentId = parent.parent_id;
	const newPosition = parent.position + 1;

	const tx = db.transaction(() => {
		// Shift later siblings of the parent to make room
		shiftSiblings(db, grandParentId, parent.position, +1);
		// Close gap in current parent
		closeSiblingGap(db, block.parent_id, block.position, 'up');
		// Move block
		db.prepare('UPDATE blocks SET parent_id = ?, position = ? WHERE id = ?').run(
			grandParentId,
			newPosition,
			id
		);
	});
	tx();
}

// --- helpers ---

function siblingCount(parentId: string | null): number {
	const db = getDb();
	const row = db
		.prepare(
			`SELECT COALESCE(MAX(position), -1) + 1 AS cnt FROM blocks
			 WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?`
		)
		.get(parentId, parentId) as { cnt: number };
	return row.cnt;
}

function closeSiblingGap(
	db: ReturnType<typeof getDb>,
	parentId: string | null,
	afterPosition: number,
	direction: 'up' | 'down'
): void {
	const shift = direction === 'up' ? -1 : +1;
	db.prepare(
		`UPDATE blocks SET position = position + ?
		 WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?
		 AND position > ?`
	).run(shift, parentId, parentId, afterPosition);
}

function shiftSiblings(
	db: ReturnType<typeof getDb>,
	parentId: string | null,
	afterPosition: number,
	delta: number
): void {
	db.prepare(
		`UPDATE blocks SET position = position + ?
		 WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?
		 AND position > ?`
	).run(delta, parentId, parentId, afterPosition);
}

function makeRoom(db: ReturnType<typeof getDb>, parentId: string | null, atPosition: number): void {
	db.prepare(
		`UPDATE blocks SET position = position + 1
		 WHERE (parent_id IS NULL AND ? IS NULL) OR parent_id = ?
		 AND position >= ?`
	).run(parentId, parentId, atPosition);
}
