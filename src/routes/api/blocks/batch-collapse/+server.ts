import { json, error } from '@sveltejs/kit';
import { setCollapsedBatch } from '$lib/server/db/queries';
import { touchLastChange } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	if (!Array.isArray(body.items) || body.items.length === 0) {
		error(400, 'Expected non-empty "items" array');
	}

	for (const item of body.items) {
		if (typeof item.id !== 'string' || ![0, 1].includes(item.collapsed)) {
			error(400, 'Each item must have a string "id" and numeric "collapsed" (0 or 1)');
		}
	}

	setCollapsedBatch(body.items);
	touchLastChange();
	return json({ success: true });
};
