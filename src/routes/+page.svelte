<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Editor from '$lib/components/Editor.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import InlinePalette from '$lib/components/InlinePalette.svelte';
	import SearchPill from '$lib/components/SearchPill.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import HelpPanel from '$lib/components/HelpPanel.svelte';
	import { zoomTarget } from '$lib/zoom.svelte';
	import { send } from '$lib/hero-transition';
	import { tree } from '$lib/tree.svelte';
	import type { Block } from '$lib/server/db/queries';

	let { data }: { data: { blocks: Block[]; showHero: boolean; zoomId: string | null } } = $props();

	let collapseAll = $state<() => void>(() => {});
	let revealAll = $state<() => void>(() => {});
	let allCollapsed = $state(false);
	let helpOpen = $state(false);
	let paletteRef = $state<InlinePalette | null>(null);

	function handleCollapseToggle() {
		if (allCollapsed) {
			revealAll();
		} else {
			collapseAll();
		}
	}

	function handleHelpToggle() {
		helpOpen = !helpOpen;
	}

	// Seed the zoom target from the server-provided URL param.  Runs during
	// SSR and client hydration — the canonical source of truth on page load.
	// Subsequent zoom navigations update zoomTarget.id synchronously via
	// zoomTo/zoomToRoot/cleanZoomUrl (see zoom.svelte.ts).
	zoomTarget.id = data.zoomId ?? null;

	// zoomTarget is a module-level $state singleton (see zoom.svelte.ts).
	// Updated synchronously by zoomTo/zoomToRoot — no $effect middleman required.
	const zoomed = $derived(zoomTarget.id !== null);
	/** Seed the shared blocks tree with SSR data before Editor mounts. */
	tree.blocks = data.blocks;

	/**
	 * One-way flag — hero dismisses on the first real interaction (capture
	 * zone, block click, scroll past the pill, zoom navigation) and never
	 * returns until the next full page refresh.
	 *
	 * Starts dismissed when the server says the database isn't fresh
	 * (showHero=false): returning users land directly on the tree + top bar.
	 */
	let heroDismissed = $state(!data.showHero);

	/** Drives the staggered block entrance (editor--intro class). */
	let intro = $state(false);
	let introPlayed = false;

	// El refs — pillEl for the IntersectionObserver, heroEl to measure height
	// at dismiss time for scroll compensation.
	let pillEl: HTMLElement | undefined = $state();
	let heroEl: HTMLElement | undefined = $state();

	/** Captured once at dismiss — used by the outroend handler to compensate
	 *  the scroll shift when the hero section is removed from the document.
	 *  Plain let (not $state); read by an event handler, not a reactive graph. */
	let heroHeightAtDismiss = 0;

	// Navigating to a zoomed block (palette result, deep link, block click)
	// is a clear work intent — dismiss the hero permanently.
	$effect(() => {
		if (zoomed) handleDismiss();
	});

	/**
	 * Scroll-triggered dismiss.  Same logic as the old dock observer: when the
	 * hero pill scrolls up and its top edge crosses the -72px margin (navbar
	 * padding-top + anticipation), the user is scrolling into content and the
	 * hero should transition to the top bar.  One-way — once fired, disconnect.
	 */
	$effect(() => {
		if (heroDismissed || zoomed || !pillEl) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) handleDismiss();
			},
			{ rootMargin: '-72px 0px 0px 0px' }
		);
		observer.observe(pillEl);
		return () => observer.disconnect();
	});

	function handleDismiss(focusSearch = false) {
		if (heroDismissed) return;
		heroHeightAtDismiss = heroEl?.offsetHeight ?? 0;
		heroDismissed = true;
		if (!introPlayed && window.scrollY < 10) {
			introPlayed = true;
			intro = true;
			const timer = setTimeout(() => (intro = false), 1500);
			return () => {
				clearTimeout(timer);
				intro = false;
			};
		}
		// Focus the inline search after the navbar mounts and the transition completes
		if (focusSearch) {
			tick().then(() => paletteRef?.focusInput());
		}
	}

	/**
	 * When the hero pill's outro (out:send) completes and the hero section is
	 * about to be removed, compensate the document-height loss so the user's
	 * reading position doesn't jump.  The `scrollY < 10` version (click dismiss
	 * at top of page) clamps harmlessly to zero — one path for all dismissals.
	 *
	 * Guard with `!zoomed` so the Editor's own scroll management takes over
	 * during zoom navigation.
	 */
	function onPillOutroEnd() {
		requestAnimationFrame(() => {
			if (!zoomed && heroHeightAtDismiss > 0) {
				window.scrollBy(0, -heroHeightAtDismiss);
			}
		});
	}
</script>

{#if heroDismissed || zoomed}
	<Navbar
		bind:paletteRef
		{allCollapsed}
		{helpOpen}
		onToggle={handleCollapseToggle}
		onToggleHelp={handleHelpToggle}
	/>
{/if}

{#if !heroDismissed && !zoomed}
	<section class="hero" bind:this={heroEl}>
		<h1 class="wordmark" out:fade={{ duration: 150 }}>Diple</h1>
		<div
			class="hero-pill"
			bind:this={pillEl}
			out:send={{ key: 'pill' }}
			onoutroend={onPillOutroEnd}
		>
			<SearchPill>
				<button class="hero-trigger" onclick={() => handleDismiss(true)}>
					<svg
						class="hero-icon"
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
					<span class="hero-hint">Search or command…</span>
					<span class="hero-chips" aria-hidden="true">
						<kbd>Ctrl+K</kbd>
					</span>
				</button>
			</SearchPill>
		</div>
	</section>
{/if}

<Sidebar zoomId={zoomTarget.id} />

<!-- Right-hand help panel — toggled by the "?" button in the navbar -->
<HelpPanel open={helpOpen} />

<main class:main--with-navbar={heroDismissed || zoomed}>
	<Editor
		bind:collapseAll
		bind:revealAll
		bind:allCollapsed
		blocks={data.blocks}
		{intro}
		onWorkIntent={handleDismiss}
	/>
</main>

<style>
	/*
	 * Hero occupies the top half of the viewport.  The pill sits at the exact
	 * centre (50svh line) — not approximately, not "upper-mid".  The wordmark
	 * is anchored above the pill with the same formula the old 100svh hero used.
	 *
	 * Because the hero is only 50svh, <main> starts at the viewport middle:
	 * "What's on your mind?" and the tree are immediately visible below the pill.
	 */
	.hero {
		position: relative;
		height: 50svh;
	}
	/*
	 * Pill straddles the bottom edge of the hero (the 50% horizontal line).
	 * translate(-50%, -50%) centres it perfectly at viewport Y = 50svh.
	 */
	.hero-pill {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
	/*
	 * Wordmark anchored above the pill: same math as the original 100svh hero
	 * (30px = half pill height, 2rem = visual gap).  No flex, no flow — the
	 * pill is the anchor and the wordmark orbits it.
	 */
	.wordmark {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translate(-50%, calc(-100% - 30px - 2rem));
		margin: 0;
		font-family: var(--font-serif, Georgia, serif);
		font-weight: 600;
		font-size: clamp(3rem, 8vw, 4.75rem);
		letter-spacing: -0.02em;
		white-space: nowrap;
	}
	/* When the navbar is visible (fixed at top), main needs clearance so
	   content doesn't hide behind it */
	.main--with-navbar {
		padding-top: 4.5rem;
	}
	/* Hero pill click target — same look as the navbar search trigger */
	.hero-trigger {
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
	.hero-icon {
		flex-shrink: 0;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	.hero-hint {
		flex: 1;
		min-width: 0;
		color: color-mix(in srgb, var(--color-encre) 38%, transparent);
		font-size: 0.95rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.hero-chips {
		display: flex;
		gap: 0.375rem;
		flex-shrink: 0;
	}
	@media (max-width: 560px) {
		.hero-chips {
			display: none;
		}
	}
</style>
