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
	| 'view.zoomIn'
	| 'view.zoomOut';

/**
 * Default keybinding map. Modifiers ordered: ctrl, shift, alt.
 * `ctrl` covers both Ctrl (Win/Linux) and Cmd (Mac).
 */
export const keybindings: Record<string, CommandId> = {
	enter: 'block.split',
	tab: 'block.indent',
	'shift+tab': 'block.outdent',
	backspace: 'block.backspace',
	arrowup: 'block.moveUp',
	arrowdown: 'block.moveDown',
	'ctrl+z': 'edit.undo',
	'ctrl+shift+z': 'edit.redo',
	'ctrl+y': 'edit.redo',
	'alt+arrowright': 'view.zoomIn',
	'alt+arrowleft': 'view.zoomOut'
};

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
