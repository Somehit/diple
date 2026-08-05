import {
	defaultKeybindings,
	mergeBindings,
	type BindingOverrides,
	type CommandId
} from './keybindings';

/**
 * Reactive layer over the default keybinding table (keybindings.ts).
 *
 * `overrides` is the user's persisted config; the effective `keybindings`
 * map derives from it. Consumers (Editor keydown handlers, HelpPanel,
 * Settings, palette) read `keybindings` — a rebind applies instantly,
 * no handler rewiring.
 *
 * Backend is localStorage for now (per-browser, zero server round-trip).
 * The API below is the seam where a server-side settings table could plug
 * in later without touching consumers.
 */
const STORAGE_KEY = 'diple:keybindings:v1';

function loadOverrides(): BindingOverrides {
	// SSR evaluates this module too — localStorage doesn't exist there.
	if (typeof window === 'undefined') return {};
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as { version: number; overrides: BindingOverrides };
		if (parsed.version !== 1 || typeof parsed.overrides !== 'object' || parsed.overrides === null) {
			return {};
		}
		// Drop stale entries: unknown commands would dispatch nothing, and
		// unbinding (null) only makes sense for combos a default exists for.
		const valid = new Set<string>(Object.values(defaultKeybindings));
		const clean: BindingOverrides = {};
		for (const [combo, cmd] of Object.entries(parsed.overrides)) {
			if (cmd === null) {
				if (combo in defaultKeybindings) clean[combo] = null;
			} else if (valid.has(cmd)) {
				clean[combo] = cmd;
			}
		}
		return clean;
	} catch {
		return {};
	}
}

function persist(): void {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, overrides }));
}

/** The user's deviations from the defaults. Prefer the API below over
 *  mutating this directly — direct writes are not persisted. */
export const overrides = $state<BindingOverrides>(loadOverrides());

/**
 * Effective table — defaults + overrides. A plain function on purpose:
 * runes mode forbids exporting a module-level $derived, and the merge is
 * tiny (15 entries), so recomputing per call is free. Reactivity comes
 * from `overrides` — consumers re-render on their own state changes
 * (settings tab clicks, panel open/close).
 */
export function effectiveKeybindings(): Record<string, CommandId> {
	return mergeBindings(overrides);
}

/** combo → command (undefined if unbound). */
export function commandFor(combo: string): CommandId | undefined {
	return effectiveKeybindings()[combo];
}

/** command → its effective combos (redo has two by default). */
export function combosFor(cmd: CommandId): string[] {
	return Object.entries(effectiveKeybindings())
		.filter(([, c]) => c === cmd)
		.map(([combo]) => combo);
}

/**
 * Bind combo → cmd. Last write wins: whatever command owned the combo
 * loses it — the UI surfaces the conflict (conflictOf) before calling.
 */
export function setBinding(combo: string, cmd: CommandId): void {
	overrides[combo] = cmd;
	persist();
}

/** Remove a binding: null-unbind defaults, delete user-added combos. */
export function unbind(combo: string): void {
	if (combo in defaultKeybindings) overrides[combo] = null;
	else delete overrides[combo];
	persist();
}

/** Restore default(s) for one command: drop every override that touches it. */
export function resetCommand(cmd: CommandId): void {
	for (const [combo, bound] of Object.entries(overrides)) {
		if (bound === cmd || (bound === null && defaultKeybindings[combo] === cmd)) {
			delete overrides[combo];
		}
	}
	persist();
}

export function resetAll(): void {
	for (const combo of Object.keys(overrides)) delete overrides[combo];
	persist();
}
