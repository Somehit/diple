<script lang="ts">
	import { fade } from 'svelte/transition';
	import { receive } from '$lib/hero-transition';
	import InlinePalette from './InlinePalette.svelte';
	import SyncStatus from './SyncStatus.svelte';

	let {
		allCollapsed = false,
		onToggle,
		helpOpen = false,
		onToggleHelp,
		paletteRef = $bindable(null as InlinePalette | null)
	}: {
		allCollapsed?: boolean;
		onToggle?: () => void;
		helpOpen?: boolean;
		onToggleHelp?: () => void;
		paletteRef?: InlinePalette | null;
	} = $props();

	/**
	 * Fixed top bar. Rendered when the hero is dismissed or a block is zoomed.
	 * The pill inside uses crossfade (via hero-transition) to animate from the
	 * hero pill's position.
	 */
</script>

<header class="topbar" transition:fade={{ duration: 150 }}>
	<div class="topbar-pill" in:receive={{ key: 'pill' }}>
		<InlinePalette bind:this={paletteRef} />
	</div>
</header>

<!--
	Corner buttons live OUTSIDE the topbar: the topbar's z-50 stacking context
	would cap them below the help panel (z-55). Fixed at z-56, they float above
	an open panel and never move — their 1rem inset stays the same whether a
	panel is open or not.
-->
<div class="corner-btns" transition:fade={{ duration: 150 }}>
	<SyncStatus />
	<button
		class="corner-btn"
		onclick={onToggle}
		aria-label={allCollapsed ? 'Reveal all' : 'Collapse all'}
		title={allCollapsed
			? "Reveal all blocks — show every block's children again"
			: 'Collapse all blocks — hide the children of every block in this view'}
	>
		{#if allCollapsed}
			<!-- Reveal all: chevrons diverging, "unfold" (matches Lucide
			     "chevrons-up-down", MIT) -->
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="7 9 12 4 17 9" />
				<polyline points="7 15 12 20 17 15" />
			</svg>
		{:else}
			<!-- Collapse all: chevrons converging, "fold" (matches Lucide
			     "chevrons-down-up", MIT) -->
			<svg
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="7 4 12 9 17 4" />
				<polyline points="7 20 12 15 17 20" />
			</svg>
		{/if}
	</button>

	<button
		class="corner-btn"
		onclick={onToggleHelp}
		aria-label={helpOpen ? 'Close help panel' : 'Help — shortcuts and filters'}
		title={helpOpen ? 'Close help panel' : 'Help — shortcuts and filters'}
	>
		<!-- Question mark in a circle (Lucide "circle-help", MIT) -->
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
			<path d="M12 17h.01" />
		</svg>
	</button>
</div>

<style>
	.topbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		/* Don't block clicks on elements below (breadcrumb) — only the pill
		   inside is interactive, the decorative padding/mask area is passive. */
		pointer-events: none;
		padding: 0.875rem 1rem 4.5rem;
		/*
		 * Soft blur band, long fade. The mask's opaque zone (55% of ~146px ≈
		 * 80px) ends just below the pill (74px), then ~66px of gradual fade —
		 * no visible edge. The tint is itself a gradient so the milkiness
		 * dies out independently of the blur.
		 */
		background: linear-gradient(
			to bottom,
			color-mix(in srgb, var(--color-fond) 55%, transparent),
			transparent
		);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		mask-image: linear-gradient(to bottom, black 55%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, black 55%, transparent);
	}
	/*
	 * Fixed corner cluster (top-right): the two buttons keep a constant 1rem
	 * inset from top and right — the same padding whether a panel is open or
	 * not. z-56 floats them above the help panel (z-55).
	 */
	.corner-btns {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 56;
		display: flex;
		gap: 0.25rem;
		pointer-events: none;
	}
	/* Shared look, same as the sidebar hamburger (36×36, hover 8% ink). */
	.corner-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: none;
		border-radius: 6px;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
		pointer-events: auto;
		padding: 0;
		transition:
			background 0.1s ease,
			color 0.1s ease;
	}
	.corner-btn:hover {
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		color: var(--color-encre);
	}
</style>
