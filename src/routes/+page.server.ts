import { initDb } from '$lib/server/db/schema';
import { getTree } from '$lib/server/db/queries';
import { SEED_IDS } from '$lib/server/db/seed';

export function load({ url }: { url: URL }) {
	// Ensure schema exists and seed data is present
	initDb();

	const blocks = getTree();
	const zoomId = url.searchParams.get('zoom');

	// Fresh database (empty or seed-only) → first-run hero. As soon as one
	// user-created block exists, the app opens directly on the tree + top bar.
	const showHero = blocks.every((b) => SEED_IDS.has(b.id));

	return { blocks, zoomId, showHero };
}
