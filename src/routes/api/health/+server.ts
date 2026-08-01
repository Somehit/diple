import { json } from '@sveltejs/kit';
import { lastChangeMs } from '$lib/server/sync';

/**
 * Liveness probe for the sync dot — also reports the last server write so a
 * freshly loaded client can show "Last change in server" without waiting for
 * its own first mutation.
 */
export function GET() {
	return json({ ok: true, lastChange: lastChangeMs() });
}
