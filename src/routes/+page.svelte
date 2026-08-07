<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import Editor from '$lib/components/Editor.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import InlinePalette from '$lib/components/InlinePalette.svelte';
	import SearchPill from '$lib/components/SearchPill.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import HelpPanel from '$lib/components/HelpPanel.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import FormatBar from '$lib/components/FormatBar.svelte';
	import { zoomTarget } from '$lib/zoom.svelte';
	import { send } from '$lib/hero-transition';
	import { t } from '$lib/i18n.svelte';
	import { tree } from '$lib/tree.svelte';
	import type { Block } from '$lib/server/db/queries';
	import type { PasteBlock } from '$lib/clipboard';
	import type { ImportDestination } from '$lib/import';

	let { data }: { data: { blocks: Block[]; showHero: boolean; zoomId: string | null } } = $props();

	let collapseAll = $state<() => void>(() => {});
	let revealAll = $state<() => void>(() => {});
	let allCollapsed = $state(false);
	/**
	 * Which side panels are open. Independent on wide screens — the sidebar
	 * outline and the help panel can stay open together; below 1024px they
	 * become drawers, so they stay exclusive (two drawers over one scrim
	 * cannot coexist). togglePanel applies the rule per screen size.
	 */
	let panel = $state({ sidebar: false, help: false });
	/** Centered settings modal — independent from the side panels, sits above them. */
	let settingsOpen = $state(false);
	/** Tab shown when the modal opens — the ••• menu's "Export" item
	 *  jumps straight to the import/export tab. Duplicated union, on
	 *  purpose: SettingsModal's TabId isn't exported. */
	let settingsTab = $state<'preferences' | 'shortcuts' | 'import-export' | 'account'>(
		'preferences'
	);
	let paletteRef = $state<InlinePalette | null>(null);
	/** Editor's file-import entry point (settings modal → page → editor). */
	let importRoots = $state<(roots: PasteBlock[], destination: ImportDestination) => void>(() => {});

	function handleCollapseToggle() {
		if (allCollapsed) {
			revealAll();
		} else {
			collapseAll();
		}
	}

	function togglePanel(p: 'sidebar' | 'help') {
		if (isNarrow) {
			// Exclusive on narrow: opening one closes the other, toggling
			// the open one closes it.
			const next = !panel[p];
			panel.sidebar = p === 'sidebar' ? next : false;
			panel.help = p === 'help' ? next : false;
		} else {
			panel[p] = !panel[p];
		}
	}

	/** Settings modal is exclusive with the side panels: opening it closes
	 *  any open panel, so the scrim never covers half-open UI. */
	function toggleSettings() {
		if (!settingsOpen) {
			panel.sidebar = false;
			panel.help = false;
			// Sidebar button opens the preferences tab, whatever the last tab was.
			settingsTab = 'preferences';
		}
		settingsOpen = !settingsOpen;
	}

	/** The ••• menu's "Export" item lands on the import/export tab. */
	function handleMenuExport() {
		settingsTab = 'import-export';
		settingsOpen = true;
	}

	/** Escape closes the top-most thing first: the settings modal, then the
	 *  help panel, then the sidebar — at any screen size. */
	function onGlobalKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (settingsOpen) settingsOpen = false;
		else if (panel.help) panel.help = false;
		else if (panel.sidebar) panel.sidebar = false;
	}

	/** True below 1024px (the "narrow" layout: stacked navbar, drawers). */
	let isNarrow = $state(false);
	$effect(() => {
		const mql = window.matchMedia('(max-width: 1023px)');
		isNarrow = mql.matches;
		const onChange = (e: MediaQueryListEvent) => (isNarrow = e.matches);
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	/** Crossing down to narrow with both panels open: the help panel (the
	 *  lighter, reference-only one) gives way — drawers are exclusive. */
	$effect(() => {
		if (isNarrow && panel.sidebar && panel.help) panel.help = false;
	});

	/** Wide-screen content push: mirrors the open panels onto <html> as
	 *  data-panels ("sidebar help"), which layout.css turns into
	 *  --panel-left/--panel-right — the navbar pill and main recenter in
	 *  the remaining space instead of sitting under the panels. Narrow
	 *  keeps the attribute off: drawers overlay by design. */
	$effect(() => {
		if (typeof document === 'undefined') return;
		const value = [panel.sidebar ? 'sidebar' : '', panel.help ? 'help' : '']
			.filter(Boolean)
			.join(' ');
		if (value) document.documentElement.dataset.panels = value;
		else delete document.documentElement.dataset.panels;
	});

	/**
	 * Sidebar navigation: zoom into the clicked block. On narrow screens the
	 * drawer closes too — the user navigated, they want to see the content.
	 * On wide screens the outline stays open (like Notion's sidebar).
	 */
	function handleSidebarNavigate() {
		if (isNarrow) panel.sidebar = false;
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

<svelte:window onkeydown={onGlobalKeydown} />

{#if heroDismissed || zoomed}
	<Navbar
		bind:paletteRef
		{allCollapsed}
		helpOpen={panel.help}
		sidebarOpen={panel.sidebar}
		onToggle={handleCollapseToggle}
		onToggleHelp={() => togglePanel('help')}
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
					<span class="hero-hint">{t('hero.hint')}</span>
					<span class="hero-chips" aria-hidden="true">
						<kbd>Ctrl+K</kbd>
					</span>
				</button>
			</SearchPill>
		</div>
	</section>
{/if}

{#if (panel.sidebar || panel.help) && isNarrow}
	<!-- Drawer scrim (narrow only): dims the app behind the open drawer.
	     Tap closes. z-54: below the panels (55) and floating toggles (56),
	     above the navbar (50) and content. -->
	<button
		class="scrim"
		onclick={() => {
			panel.sidebar = false;
			panel.help = false;
		}}
		aria-label={t('hero.closePanel')}
	></button>
{/if}

<Sidebar
	zoomId={zoomTarget.id}
	open={panel.sidebar}
	onToggle={() => togglePanel('sidebar')}
	onNavigate={handleSidebarNavigate}
	onOpenSettings={toggleSettings}
/>

<!-- Right-hand help panel — toggled by the "?" button in the navbar -->
<HelpPanel open={panel.help} />

<!-- Centered settings modal — opened from the sidebar footer button -->
<SettingsModal
	open={settingsOpen}
	initialTab={settingsTab}
	onClose={() => (settingsOpen = false)}
	onImport={(roots, destination) => {
		// The editor inserts optimistically; close so the result is visible.
		importRoots(roots, destination);
		settingsOpen = false;
	}}
/>

<main class:main--with-navbar={heroDismissed || zoomed}>
	<Editor
		bind:collapseAll
		bind:revealAll
		bind:allCollapsed
		blocks={data.blocks}
		{intro}
		onWorkIntent={handleDismiss}
		onExport={handleMenuExport}
		bind:importRoots
	/>
</main>

<!-- Mobile formatting bar — global chrome, shows itself via the store while
     a block is being edited (and the CSS gate hides it on desktop). -->
<FormatBar />

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
	   content doesn't hide behind it. --navbar-h is taller in the narrow
	   two-row layout (layout.css). Open panels push the content on wide
	   screens (--panel-* vars, 0 on narrow — drawers overlay); the
	   padding transitions with the panels' 0.2s slide. */
	.main--with-navbar {
		padding-top: var(--navbar-h);
		padding-right: var(--panel-right, 0px);
		padding-left: var(--panel-left, 0px);
		transition: padding 0.2s ease;
	}
	/* Drawer scrim — narrow only. Fades in with the drawer's slide. */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 54;
		border: none;
		background: color-mix(in srgb, var(--color-encre) 35%, transparent);
		cursor: pointer;
		animation: scrim-in 0.15s ease;
	}
	@keyframes scrim-in {
		from {
			opacity: 0;
		}
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
