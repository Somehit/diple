import { json, error } from '@sveltejs/kit';
import { updateBlock, moveBlock, deleteBlock, setCollapsed } from '$lib/server/db/queries';
import { getDb } from '$lib/server/db/client';
import { touchLastChange } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/** Lightweight existence check — used by the palette to validate recents. */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) error(400, 'Missing block id');
	const db = getDb();
	const row = db.prepare('SELECT id FROM blocks WHERE id = ?').get(id);
	if (!row) error(404, 'Not found');
	return json({ exists: true });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const body = await request.json();

	if (!id) error(400, 'Missing block id');

	if ('content' in body) {
		updateBlock(id, body.content);
		touchLastChange();
		return json({ success: true });
	}

	if ('parent_id' in body) {
		moveBlock(id, { parent_id: body.parent_id ?? null, position: body.position ?? 0 });
		touchLastChange();
		return json({ success: true });
	}

	if ('collapsed' in body) {
		setCollapsed(id, !!body.collapsed);
		touchLastChange();
		return json({ success: true });
	}

	error(400, 'Expected "content", "parent_id", or "collapsed" in body');
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) error(400, 'Missing block id');

	deleteBlock(id);
	touchLastChange();
	return json({ success: true });
};
