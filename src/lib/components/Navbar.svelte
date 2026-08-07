<script lang="ts">
	import { fade } from 'svelte/transition';
	import { receive } from '$lib/hero-transition';
	import { t } from '$lib/i18n.svelte';
	import InlinePalette from './InlinePalette.svelte';
	import SyncStatus from './SyncStatus.svelte';

	let {
		allCollapsed = false,
		onToggle,
		helpOpen = false,
		onToggleHelp,
		sidebarOpen = false,
		paletteRef = $bindable(null as InlinePalette | null)
	}: {
		allCollapsed?: boolean;
		onToggle?: () => void;
		helpOpen?: boolean;
		onToggleHelp?: () => void;
		/** True when the left sidebar is open — the corner cluster drops below
		 *  the drawer on narrow screens (it would float over it otherwise). */
		sidebarOpen?: boolean;
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
<div
	class="corner-btns"
	class:corner-btns--sidebar-open={sidebarOpen}
	transition:fade={{ duration: 150 }}
>
	<SyncStatus />
	<button
		class="corner-btn"
		onclick={onToggle}
		aria-label={allCollapsed ? t('nav.revealAll') : t('nav.collapseAll')}
		title={allCollapsed ? t('nav.revealAll.title') : t('nav.collapseAll.title')}
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
		aria-label={helpOpen ? t('nav.closeHelp') : t('nav.help')}
		title={helpOpen ? t('nav.closeHelp') : t('nav.help')}
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
		/* Panel push (wide screens): the offsets recenter the pill with the
		   editor column between the open panels (0 on narrow). Longhands,
		   NOT the padding shorthand: a shorthand mixing calc() + var() is
		   silently dropped by WebKit/Safari at computed-value time (all
		   padding → 0), while each longhand resolves independently.
		   Transitions with the panels' slide. */
		padding-top: 0.875rem;
		padding-right: calc(1rem + var(--panel-right, 0px));
		padding-bottom: 4.5rem;
		padding-left: calc(1rem + var(--panel-left, 0px));
		transition: padding 0.2s ease;
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

	/*
	 * Narrow (< 1024px): two rows. The pill stays on row 1 (full width, the
	 * topbar already centers it); the corner cluster drops to row 2 via
	 * --actions-row-top. The blur band extends so the mask's opaque zone
	 * (~55% of the total height) still ends just below the buttons — same
	 * look as wide, just taller.
	 */
	@media (max-width: 1023px) {
		.topbar {
			/* 0.875rem + pill + 0.5rem gap + 36px buttons + 2.5rem fade. */
			padding-bottom: calc(var(--actions-row-top) + 36px + 2.5rem);
		}
		.corner-btns {
			top: var(--actions-row-top);
		}
		/* Sidebar drawer open → the cluster drops behind it (same z as the
		   scrim, which renders later in the DOM and paints on top). The drawer
		   covers it on phones; on wider narrow screens it stays visible but
		   non-overlapping. The help drawer keeps the cluster above (its
		   content clears the buttons by design). */
		.corner-btns--sidebar-open {
			z-index: 54;
		}
	}
</style>
