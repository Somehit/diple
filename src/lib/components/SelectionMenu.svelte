<script lang="ts">
	import FormatMenuItems, { type FormatAction } from './FormatMenuItems.svelte';

	type Props = {
		/** Viewport-relative x coordinate where the menu should appear (top-left corner). */
		x: number;
		/** Viewport-relative y coordinate. */
		y: number;
		/** Called with the selected action; menu closes after the call. */
		onAction: (action: FormatAction) => void;
		/** Called when the backdrop is clicked (clears selection). */
		onClose: () => void;
	};

	let { x, y, onAction, onClose }: Props = $props();

	// Clamp so the menu never overflows the viewport.
	// Height estimate covers the zoom + clipboard sections + formats + delete (~400px).
	const clampedX = $derived(
		Math.min(x, Math.max(visualViewport?.width ?? window.innerWidth, 0) - 150)
	);
	const clampedY = $derived(
		Math.min(y, Math.max(visualViewport?.height ?? window.innerHeight, 0) - 400)
	);
</script>

<div class="menu-backdrop" role="presentation" onclick={onClose}></div>
<div class="menu-dropdown" style="left: {clampedX}px; top: {clampedY}px;">
	<FormatMenuItems onApply={onAction} showZoom={true} showClipboard={true} showDelete={true} />
</div>

<style>
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.menu-dropdown {
		position: fixed;
		z-index: 50;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		min-width: 140px;
		padding: 4px 0;
		max-height: calc(100vh - 16px);
		overflow-y: auto;
	}
</style>
