/* eslint-disable svelte/no-navigation-without-resolve */
import { SvelteMap } from 'svelte/reactivity';
import { pushState, replaceState } from '$app/navigation';

/**
 * Zoom helpers — thin wrappers around SvelteKit's shallow pushState.
 * The zoom is reflected in the URL (?zoom=<id>) so the back button dezooms
 * and a refresh restores the current zoom level.
 *
 * ## Why a $state singleton instead of deriving from page.state
 *
 * `pushState` for shallow routing does NOT reliably trigger `$effect` or
 * `$derived` re-runs that depend on `page.state` in SvelteKit 2 + Svelte 5
 * (see sveltejs/kit#13794, sveltejs/kit#14960).
 *
 * The fix: `zoomTarget` is a module-level `$state` singleton updated
 * **synchronously** by every zoom navigation function.  Components read
 * `zoomTarget.id` directly — no `$effect` middleman, no microtask gap.
 * `pushState` still runs for URL/history correctness, but the view swap
 * is driven by the synchronous `$state` mutation.
 *
 * All Editor zoom paths (loupe, breadcrumb, keyboard) call `navigateZoom`
 * which calls `zoomTo`/`zoomToRoot` synchronously — no async delay, no
 * DOM class manipulation.  Palette and sidebar call `zoomTo` directly.
 *
 * On initial page load (SSR + hydration), `+page.svelte` seeds
 * `zoomTarget.id` from the server-provided `data.zoomId`.
 * On popstate (back/forward), Editor.svelte's `$effect` syncs from
 * `page.state` — SvelteKit restores state correctly on history navigation.
 */

// --- Reactive zoom-target singleton ---

/**
 * Reactive zoom target singleton.  Components read `zoomTarget.id` and
 * react — no `$effect`-on-`page.state` needed for the happy path.
 *
 * Initialised to null; the real seed comes from `data.zoomId` in
 * +page.svelte during component init (SSR-safe — runs in rendering
 * context where `page` is accessible if needed, but we use the
 * server-provided `data` instead).
 */
export const zoomTarget = $state<{ id: string | null }>({ id: null });

// --- Current zoom (convenience, used in a few places) ---

/** Convenience accessor; prefer `zoomTarget.id` directly in most cases. */
export function currentZoomId(): string | null {
	return zoomTarget.id;
}

// --- Navigation wrappers ---

const scrollPos = new SvelteMap<string, number>();

/** Navigate to a zoomed view of the given block. */
export function zoomTo(id: string): void {
	if (import.meta.env.DEV) {
		console.info('[zoom:navigate]', { from: zoomTarget.id, to: id });
	}
	zoomTarget.id = id;
	pushState(`?zoom=${encodeURIComponent(id)}`, { zoom: id });
}

/** Navigate back to the root view (no zoom). */
export function zoomToRoot(): void {
	if (import.meta.env.DEV) {
		console.info('[zoom:navigate]', { from: zoomTarget.id, to: null });
	}
	zoomTarget.id = null;
	pushState('/', { zoom: null });
}

/** Replace current URL, dropping the zoom param. Used when zoom target is invalid. */
export function cleanZoomUrl(): void {
	if (import.meta.env.DEV) {
		console.info('[zoom:clean-url]', { from: zoomTarget.id });
	}
	zoomTarget.id = null;
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
