import { json, error } from '@sveltejs/kit';
import { updateBlock, moveBlock, deleteBlock, setCollapsed } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	const body = await request.json();

	if (!id) error(400, 'Missing block id');

	if ('content' in body) {
		updateBlock(id, body.content);
		return json({ success: true });
	}

	if ('parent_id' in body) {
		moveBlock(id, { parent_id: body.parent_id ?? null, position: body.position ?? 0 });
		return json({ success: true });
	}

	if ('collapsed' in body) {
		setCollapsed(id, !!body.collapsed);
		return json({ success: true });
	}

	error(400, 'Expected "content", "parent_id", or "collapsed" in body');
};

export const DELETE: RequestHandler = async ({ params }) => {
	const { id } = params;
	if (!id) error(400, 'Missing block id');

	deleteBlock(id);
	return json({ success: true });
};
