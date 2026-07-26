/* eslint-disable svelte/no-navigation-without-resolve */
import { pushState, replaceState } from '$app/navigation';
import { page } from '$app/state';

/**
 * Zoom helpers — thin wrappers around SvelteKit's shallow pushState.
 * The zoom is reflected in the URL (?zoom=<id>) so the back button dezooms
 * and a refresh restores the current zoom level.
 *
 * **Critical subtlety**: pushState updates `page.state` reactively but NOT
 * `page.url`. This module therefore stores the zoom target in the state object
 * (`{ zoom: id | null }`) and `currentZoomId()` reads state first, falling
 * back to `page.url.searchParams` only for SSR / first load (when state is {}).
 *
 * On popstate (back/forward), SvelteKit restores BOTH — so `currentZoomId()`
 * returns the correct value regardless of the path taken.
 */

// --- Reactive zoom-id derivation (used by Editor and +page) ---

/**
 * Returns the current zoom block id, or null for root.
 * Reactive when read inside a $derived: reads `page.state` (updated by pushState
 * and popstate) first, then falls back to `page.url.searchParams` for SSR/refresh.
 */
export function currentZoomId(): string | null {
	// `page.state.zoom` can be explicitly null (dezoomed), a string (zoomed in),
	// or undefined (initial load / SSR — no state yet).
	if (page.state.zoom !== undefined) return page.state.zoom;
	return page.url.searchParams.get('zoom');
}

// --- Navigation wrappers ---

const scrollPos = new Map<string, number>();

/** Navigate to a zoomed view of the given block. */
export function zoomTo(id: string): void {
	pushState(`?zoom=${encodeURIComponent(id)}`, { zoom: id });
}

/** Navigate back to the root view (no zoom). */
export function zoomToRoot(): void {
	pushState('/', { zoom: null });
}

/** Replace current URL, dropping the zoom param. Used when zoom target is invalid. */
export function cleanZoomUrl(): void {
	replaceState('/', { zoom: null });
}

/** Save scroll position for a zoom level (key is zoom id or '__root__' for root). */
export function saveScroll(key: string, y: number): void {
	scrollPos.set(key, y);
}

/** Restore a previously saved scroll position, or null if none stored. */
export function restoreScroll(key: string): number | null {
	const y = scrollPos.get(key);
	return y !== undefined ? y : null;
}
