/**
 * Shared recents helper — used by both the inline palette (nav search)
 * and the Editor (push on zoom / content save).
 *
 * Format: { id, content, path } snapshots stored in localStorage.
 * Validation against the DB happens on load (stale entries are dropped
 * silently).
 */

export interface RecentEntry {
	id: string;
	content: string;
	path: { id: string; content: string }[];
}

const RECENTS_KEY = 'diple:recents';
const MAX_RECENTS = 8;

export function loadRecents(): RecentEntry[] {
	try {
		return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
	} catch {
		return [];
	}
}

function saveRecents(list: RecentEntry[]): void {
	localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
}

/** Push a row to the top of recents, deduplicate by id, trim to MAX_RECENTS. */
export function pushRecent(row: RecentEntry): void {
	const list = [row, ...loadRecents().filter((r) => r.id !== row.id)].slice(0, MAX_RECENTS);
	saveRecents(list);
}

/** Remove a specific recent by id. */
export function removeRecent(id: string): void {
	saveRecents(loadRecents().filter((r) => r.id !== id));
}
