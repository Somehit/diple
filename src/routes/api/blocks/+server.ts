import { json } from '@sveltejs/kit';
import { createBlock } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { parent_id, content, position } = await request.json();

	const block = createBlock({
		parent_id: parent_id ?? null,
		content: content ?? '',
		position: position ?? 0
	});

	return json(block, { status: 201 });
};
