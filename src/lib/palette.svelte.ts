import type { PaletteCommand } from '$lib/commands';

/**
 * Palette state — kept minimal after the modal was removed (v0.3 refactor).
 * The inline palette (InlinePalette.svelte) manages its own focus/blur state.
 * Results are rendered at body level (PaletteResults.svelte) to escape the
 * navbar's mask and backdrop-filter.
 */

// --- Shared types for results portal ---

export type ResultRow = {
	id: string;
	content: string;
	path: { id: string; content: string }[];
};

export type Item =
	| { kind: 'command'; command: PaletteCommand }
	| { kind: 'result'; row: ResultRow; recent: boolean };

export interface ResultsState {
	visible: boolean;
	items: Item[];
	selected: number;
	sectionOf: (item: Item) => string;
	choose: (item: Item) => void;
	chooseCrumb: (e: MouseEvent, row: ResultRow, crumbId: string) => void;
	onMousemove: (i: number) => void;
	listEl: HTMLElement | null;
	/** Pill position — used to anchor the dropdown below the search bar. */
	pillTop: number;
	pillLeft: number;
	pillWidth: number;
}

export const resultsState: ResultsState = $state({
	visible: false,
	items: [],
	selected: 0,
	sectionOf: () => '',
	choose: () => {},
	chooseCrumb: () => {},
	onMousemove: () => {},
	listEl: null,
	pillTop: 0,
	pillLeft: 0,
	pillWidth: 720
});
