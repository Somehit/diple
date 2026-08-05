import { type CommandId } from './keybindings';
import { effectiveKeybindings } from './keybindings.svelte';
import { t } from './i18n.svelte';

/**
 * Canonical English command labels. Kept as the enforced-complete table
 * (Record<CommandId, string> makes `npm run check` fail if a command is
 * added without a label); the i18n EN dict mirrors these values under
 * cmd.* keys and FR overrides them — keep the two in sync when a
 * command is added.
 */
export const COMMAND_LABELS: Record<CommandId, string> = {
	'block.split': 'Split block',
	'block.indent': 'Indent',
	'block.outdent': 'Outdent',
	'block.backspace': 'Delete block',
	'block.moveUp': 'Move block up',
	'block.moveDown': 'Move block down',
	'edit.undo': 'Undo',
	'edit.redo': 'Redo',
	'edit.copy': 'Copy',
	'edit.cut': 'Cut',
	'edit.paste': 'Paste',
	'view.zoomIn': 'Zoom into block',
	'view.zoomOut': 'Zoom out',
	'app.focusSearch': 'Focus search'
};

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
 * Every shortcut the app has, in the effective table's order, pretty-
 * printed via comboLabel. Reads the store on each call, so rebinds show
 * up immediately. Ctrl+K is a real binding now (app.focusSearch).
 * Labels resolve through the i18n dict (cmd.* keys) — COMMAND_LABELS
 * above stays the canonical English table.
 */
export function commandShortcuts(): { combo: string; label: string }[] {
	return Object.entries(effectiveKeybindings()).map(([combo, cmd]) => ({
		combo: comboLabel(combo),
		label: commandLabel(cmd)
	}));
}

/** Human label for a command id — translated, English fallback. */
export function commandLabel(cmd: CommandId): string {
	return t('cmd.' + cmd);
}

/**
 * Resolve a command's shortcut to a displayable combo.
 * CommandIds are reverse-looked-up in the keybindings map (first binding wins);
 * anything else is treated as a literal combo string.
 */
export function shortcutOf(cmd: PaletteCommand): string | null {
	if (!cmd.shortcut) return null;
	const combo =
		Object.entries(effectiveKeybindings()).find(([, id]) => id === cmd.shortcut)?.[0] ??
		cmd.shortcut;
	return comboLabel(combo);
}
