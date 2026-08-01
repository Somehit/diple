import { keybindings, type CommandId } from './keybindings';

/**
 * One command shown in the command palette (Ctrl+P).
 *
 * Adding a command = appending one object to `paletteCommands` below.
 * No other wiring needed: the palette matches, renders and runs from this list.
 */
export interface PaletteCommand {
	/** Stable identifier, namespaced like the editor's CommandIds. */
	id: string;
	/** Human-readable label, e.g. "Create a new root block". */
	label: string;
	/** Extra words that should match this command when typing. */
	keywords: string[];
	/**
	 * Shortcut chip shown shaded next to the label. Either a CommandId (the
	 * combo is looked up in the keybindings map — rebinds follow automatically)
	 * or a literal combo string like 'ctrl+shift+p'.
	 */
	shortcut?: CommandId | string;
	/** Execute the command. Runs with the palette already closed. */
	run: () => void;
}

/**
 * The registry. Empty for now — the palette UI and matching logic are live,
 * so appending an object here is all it takes to ship a command. Example:
 *
 * {
 * 	id: 'block.newRoot',
 * 	label: 'Create a new root block',
 * 	keywords: ['new', 'page'],
 * 	run: () => createRootBlock()
 * }
 */
export const paletteCommands: PaletteCommand[] = [];

/** Case-insensitive substring match over label and keywords. Empty query = all. */
export function matchCommands(query: string): PaletteCommand[] {
	const q = query.trim().toLowerCase();
	if (!q) return paletteCommands;
	return paletteCommands.filter(
		(c) => c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.toLowerCase().includes(q))
	);
}

/** Nicer display for single keys (arrows, Enter, …). */
const KEY_LABELS: Record<string, string> = {
	enter: 'Enter',
	tab: 'Tab',
	backspace: 'Backspace',
	arrowup: '↑',
	arrowdown: '↓',
	arrowright: '→',
	arrowleft: '←'
};

/** 'ctrl+shift+z' → 'Ctrl+Shift+Z', 'alt+arrowright' → 'Alt+→' */
export function comboLabel(combo: string): string {
	return combo
		.split('+')
		.map((part) => KEY_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
		.join('+');
}

/**
 * Resolve a command's shortcut to a displayable combo.
 * CommandIds are reverse-looked-up in the keybindings map (first binding wins);
 * anything else is treated as a literal combo string.
 */
export function shortcutOf(cmd: PaletteCommand): string | null {
	if (!cmd.shortcut) return null;
	const combo =
		Object.entries(keybindings).find(([, id]) => id === cmd.shortcut)?.[0] ?? cmd.shortcut;
	return comboLabel(combo);
}
