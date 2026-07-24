import { initDb } from '$lib/server/db/schema';
import { getTree } from '$lib/server/db/queries';

export function load() {
	// Ensure schema exists and seed data is present
	initDb();

	const blocks = getTree();

	return { blocks };
}
