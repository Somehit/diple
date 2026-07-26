<script lang="ts">
	import { palette } from '$lib/palette.svelte';

	/**
	 * The display content of the search pill (hero + docked top bar):
	 * a button that opens the palette. Magnifier left, muted hint,
	 * shortcut chip right — fills the bar instead of leaving it half empty.
	 */
</script>

<button class="trigger" onclick={() => palette.openPalette()}>
	<svg
		class="icon"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		aria-hidden="true"
	>
		<circle cx="11" cy="11" r="7" />
		<line x1="16.5" y1="16.5" x2="21" y2="21" />
	</svg>
	<span class="hint">Search or command…</span>
	<span class="chips" aria-hidden="true">
		<kbd>Ctrl+P</kbd>
	</span>
</button>

<style>
	.trigger {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 0.625rem;
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.icon {
		flex-shrink: 0;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	.hint {
		flex: 1;
		min-width: 0;
		color: color-mix(in srgb, var(--color-encre) 38%, transparent);
		font-size: 0.95rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.chips {
		display: flex;
		gap: 0.375rem;
		flex-shrink: 0;
	}
	kbd {
		font-family: inherit;
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-encre) 14%, transparent);
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
		white-space: nowrap;
	}
	/* Narrow screens: the hint alone carries the message */
	@media (max-width: 560px) {
		.chips {
			display: none;
		}
	}
</style>
