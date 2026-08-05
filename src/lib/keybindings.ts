/**
 * Command identifiers. Each gesture in the outliner maps to one of these IDs.
 * The keybindings table maps key combos → command IDs.
 * Editor.svelte maps command IDs → handlers (which close over editor state).
 *
 * This split exists so that:
 * 1. Keybindings are declarative data, not scattered across if/else chains.
 * 2. The command palette (v0.2) can iterate this list to display shortcuts.
 * 3. User-configurable bindings can override the defaults without touching handlers.
 */
export type CommandId =
	| 'block.split'
	| 'block.indent'
	| 'block.outdent'
	| 'block.backspace'
	| 'block.moveUp'
	| 'block.moveDown'
	| 'edit.undo'
	| 'edit.redo'
	| 'edit.copy'
	| 'edit.cut'
	| 'edit.paste'
	| 'view.zoomIn'
	| 'view.zoomOut'
	| 'app.focusSearch';

/**
 * Default keybinding map. Modifiers ordered: ctrl, shift, alt.
 * `ctrl` covers both Ctrl (Win/Linux) and Cmd (Mac).
 *
 * Nothing reads this map directly at runtime except mergeBindings: the
 * effective table is defaults + the user's overrides (keybindings.svelte.ts).
 */
export const defaultKeybindings: Record<string, CommandId> = {
	enter: 'block.split',
	tab: 'block.indent',
	'shift+tab': 'block.outdent',
	backspace: 'block.backspace',
	arrowup: 'block.moveUp',
	arrowdown: 'block.moveDown',
	'ctrl+z': 'edit.undo',
	'ctrl+shift+z': 'edit.redo',
	'ctrl+y': 'edit.redo',
	'ctrl+c': 'edit.copy',
	'ctrl+x': 'edit.cut',
	'ctrl+v': 'edit.paste',
	'alt+arrowright': 'view.zoomIn',
	'alt+arrowleft': 'view.zoomOut',
	// Global command: the window-level handler in +layout.svelte intercepts it,
	// the editor's own delegation no-ops on app.* commands. Listed here so it
	// is rebindable like any other shortcut.
	'ctrl+k': 'app.focusSearch'
};

/** combo → command, or null to unbind a default combo. */
export type BindingOverrides = Record<string, CommandId | null>;

/**
 * Effective table = defaults + overrides:
 * - an override with a CommandId replaces or adds a combo → command entry
 * - an override with null removes a default combo (explicitly unbound)
 */
export function mergeBindings(overrides: BindingOverrides = {}): Record<string, CommandId> {
	const merged: Record<string, CommandId> = { ...defaultKeybindings };
	for (const [combo, cmd] of Object.entries(overrides)) {
		if (cmd === null) delete merged[combo];
		else merged[combo] = cmd;
	}
	return merged;
}

/** Which command owns `combo` after applying `overrides` — undefined if free. */
export function conflictOf(combo: string, overrides: BindingOverrides = {}): CommandId | undefined {
	return mergeBindings(overrides)[combo];
}

/**
 * Normalize a KeyboardEvent into a stable combo string.
 * Result format: `"ctrl+shift+z"`, `"tab"`, `"enter"`, etc.
 * Key is lowercased so Shift+A produces `"shift+a"`, not `"shift+A"`.
 */
export function comboFromEvent(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.ctrlKey || e.metaKey) parts.push('ctrl');
	if (e.shiftKey) parts.push('shift');
	if (e.altKey) parts.push('alt');
	parts.push(e.key.toLowerCase());
	return parts.join('+');
}

export interface CaptureResult {
	ok: boolean;
	reason?: string;
}

/**
 * Is this keydown a legal binding? Three rules:
 * - Escape is reserved as the universal cancel key (panels, palette, selection).
 * - A lone modifier (Ctrl, Shift, Alt, Meta) is not a shortcut.
 * - A plain key without a modifier would steal typing in edit mode — rejected
 *   by design: this is an outliner, you type all day (VSCode/Obsidian only
 *   warn; we refuse up front, it's cheap to loosen later).
 */
export function validateCapture(e: KeyboardEvent): CaptureResult {
	const key = e.key.toLowerCase();
	if (key === 'escape') return { ok: false, reason: 'Escape is reserved — it cancels.' };
	if (['control', 'shift', 'alt', 'meta'].includes(key)) {
		return { ok: false, reason: 'A modifier alone is not a shortcut.' };
	}
	const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey;
	if (!hasModifier && key.length === 1) {
		return { ok: false, reason: 'Plain keys are reserved for typing — hold Ctrl, Alt or Shift.' };
	}
	return { ok: true };
}
