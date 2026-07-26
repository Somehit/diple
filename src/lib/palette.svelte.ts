/**
 * Shared state for the command palette (open/close).
 * The palette modal lives in +layout, toggled globally.
 * Navigation is handled by importing zoomTo directly — no bridge needed.
 */

class PaletteStore {
	open = $state(false);

	openPalette(): void {
		this.open = true;
	}

	close(): void {
		this.open = false;
	}
}

export const palette = new PaletteStore();
