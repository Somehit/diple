import { json } from '@sveltejs/kit';
import { createBlock } from '$lib/server/db/queries';
import { touchLastChange } from '$lib/server/sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { parent_id, content, position, id } = await request.json();

	const block = createBlock({
		parent_id: parent_id ?? null,
		content: content ?? '',
		position: position ?? 0,
		id
	});
	touchLastChange();

	return json(block, { status: 201 });
};
