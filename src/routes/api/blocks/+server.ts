import { json } from '@sveltejs/kit';
import {
	createBlock,
	deleteBlock,
	indentBlock,
	outdentBlock,
	updateContent
} from '$lib/server/db/blocks.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	try {
		switch (body.op) {
			case 'create':
				return json({
					ok: true,
					block: createBlock(body.id, body.parentId ?? null, body.position, body.content ?? '')
				});
			case 'update':
				return json({ ok: true, block: updateContent(body.id, body.content) });
			case 'delete':
				deleteBlock(body.id);
				return json({ ok: true });
			case 'indent':
				indentBlock(body.id);
				return json({ ok: true });
			case 'outdent':
				outdentBlock(body.id);
				return json({ ok: true });
			default:
				return json({ ok: false, error: `Unknown op: ${body.op}` }, { status: 400 });
		}
	} catch (err) {
		return json(
			{ ok: false, error: err instanceof Error ? err.message : 'Server error' },
			{ status: 500 }
		);
	}
};
