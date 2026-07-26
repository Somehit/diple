import { json } from '@sveltejs/kit';
import { searchBlocks } from '$lib/server/db/queries';
import type { RequestHandler } from './$types';

/**
 * GET /api/search?q=<raw query>
 * The raw query may mix plain terms and `:filter` tokens (`:root`, `:leaves`,
 * `:branches`, `:today`) — parsing happens in the data layer.
 * Returns `{ results: [{ block, path }] }`, path ordered root → direct parent.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return json({ results: searchBlocks(q) });
};
