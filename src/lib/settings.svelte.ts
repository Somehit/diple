/**
 * User preferences — appearance & behaviour, persisted per-browser in
 * localStorage (zero server round-trip, same seam as keybindings.svelte.ts:
 * a server-side settings table could plug in later without touching
 * consumers).
 *
 * The store applies each preference to <html> as a `data-*` attribute
 * (data-theme, data-font-size, …). layout.css keys its per-value overrides
 * off those attributes — components never read settings for layout, they
 * just inherit the CSS variables. Block.svelte is the one exception (the
 * block-count modes change what is computed, not just how it looks).
 */

export type ThemePref = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';
export type ContentWidth = 'narrow' | 'medium' | 'wide';
export type BlockCountMode = 'hidden' | 'descendants' | 'children';
export type FontFamily = 'sans' | 'serif' | 'mono';
export type Lang = 'en' | 'fr';

export interface Settings {
	theme: ThemePref;
	fontSize: FontSize;
	contentWidth: ContentWidth;
	blockCount: BlockCountMode;
	font: FontFamily;
	lang: Lang;
}

const STORAGE_KEY = 'diple:settings:v1';
/** Also mirrored in the pre-paint script in app.html (same key). */

const THEMES: readonly ThemePref[] = ['light', 'dark', 'system'];
const FONT_SIZES: readonly FontSize[] = ['small', 'medium', 'large'];
const CONTENT_WIDTHS: readonly ContentWidth[] = ['narrow', 'medium', 'wide'];
const BLOCK_COUNTS: readonly BlockCountMode[] = ['hidden', 'descendants', 'children'];
const FONTS: readonly FontFamily[] = ['sans', 'serif', 'mono'];
const LANGS: readonly Lang[] = ['en', 'fr'];

/** Medium = today's app: 1.125rem body text, 720px column, `› N` badge. */
const DEFAULTS: Settings = {
	theme: 'system',
	fontSize: 'medium',
	contentWidth: 'medium',
	blockCount: 'descendants',
	font: 'sans',
	lang: 'en'
};

/** First run follows the browser — the picker in Preferences can override. */
function detectLang(): Lang {
	if (typeof navigator === 'undefined') return 'en';
	return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** Whitelist a parsed value — unknown/absent entries fall back per field,
 *  so a hand-edited or stale localStorage blob can never corrupt the UI. */
function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

function load(): Settings {
	// SSR has no localStorage — defaults (with browser language detection
	// deferred to the client, where navigator exists).
	if (typeof window === 'undefined') return { ...DEFAULTS, lang: detectLang() };
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULTS, lang: detectLang() };
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		return {
			theme: pick(parsed.theme, THEMES, DEFAULTS.theme),
			fontSize: pick(parsed.fontSize, FONT_SIZES, DEFAULTS.fontSize),
			contentWidth: pick(parsed.contentWidth, CONTENT_WIDTHS, DEFAULTS.contentWidth),
			blockCount: pick(parsed.blockCount, BLOCK_COUNTS, DEFAULTS.blockCount),
			font: pick(parsed.font, FONTS, DEFAULTS.font),
			lang: pick(parsed.lang, LANGS, detectLang())
		};
	} catch {
		return { ...DEFAULTS, lang: detectLang() };
	}
}

/** The single reactive source — components read this, never localStorage. */
export const settings = $state<Settings>(load());

function persist(): void {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Partial update: mutate then persist (Object.assign on $state stays
 *  reactive — each property is individually tracked). */
export function updateSettings(patch: Partial<Settings>): void {
	Object.assign(settings, patch);
	persist();
}

/**
 * Mirror settings onto <html> so CSS can key off attributes (layout.css):
 * data-theme → palette vars, data-font-size → body font-size, etc.
 * `lang` keeps the document language in sync (a11y, spell-check).
 * color-scheme is set inline (not in CSS) so the store is the single
 * source of truth for what the browser-native UI (scrollbars, inputs)
 * renders as — 'system' defers to the OS via the 'light dark' value.
 * Client-only: the pre-paint script in app.html covers the first frame.
 *
 * A bare module-level $effect would throw effect_orphan at runtime —
 * validate_effect requires an active effect context, and module
 * evaluation happens before any component initialises. $effect.root
 * creates that context (ROOT_EFFECT → active_effect set while fn runs),
 * the documented way to use effects outside a component. The returned
 * dispose function is discarded on purpose: this root lives for the
 * module's lifetime. During SSR the module loads inside SvelteKit's
 * component_root, and the document guard below no-ops the body.
 */
$effect.root(() => {
	$effect(() => {
		if (typeof document === 'undefined') return;
		const root = document.documentElement;
		root.dataset.theme = settings.theme;
		root.dataset.fontSize = settings.fontSize;
		root.dataset.contentWidth = settings.contentWidth;
		root.dataset.font = settings.font;
		root.lang = settings.lang;
		root.style.colorScheme = settings.theme === 'system' ? 'light dark' : settings.theme;
	});
});
