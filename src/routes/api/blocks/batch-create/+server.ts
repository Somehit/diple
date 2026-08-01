import { json, error } from '@sveltejs/kit';
import { createBlocksBatch } from '$lib/server/db/queries';
import { touchLastChange } from '$lib/server/sync';
import type { RequestHandler } from './$types';

/**
 * Batch create for pasted subtrees. The client sends the full subtree
 * parents-first with final positions (see createBlocksBatch); the whole
 * insert is one transaction, so a failed paste can never leave a half-inserted
 * tree behind.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	if (!Array.isArray(body.blocks) || body.blocks.length === 0) {
		error(400, 'Expected non-empty "blocks" array');
	}

	for (const b of body.blocks) {
		if (
			typeof b.id !== 'string' ||
			(b.parent_id !== null && typeof b.parent_id !== 'string') ||
			typeof b.content !== 'string' ||
			typeof b.position !== 'number' ||
			(b.collapsed !== undefined && ![0, 1].includes(b.collapsed))
		) {
			error(400, 'Each block needs id, parent_id, content and a numeric position');
		}
	}

	createBlocksBatch(body.blocks);
	touchLastChange();
	return json({ success: true });
};
