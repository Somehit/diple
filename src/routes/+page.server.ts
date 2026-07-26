import { initDb } from '$lib/server/db/schema';
import { getTree } from '$lib/server/db/queries';

export function load({ url }: { url: URL }) {
	// Ensure schema exists and seed data is present
	initDb();

	const blocks = getTree();
	const zoomId = url.searchParams.get('zoom');

	return { blocks, zoomId };
}
