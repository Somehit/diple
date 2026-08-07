<script lang="ts">
	import { zoomTo, zoomToRoot } from '$lib/zoom.svelte';
	import { tree } from '$lib/tree.svelte';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n.svelte';

	let {
		zoomId,
		open = false,
		onToggle,
		onNavigate,
		onOpenSettings
	}: {
		zoomId: string | null;
		open?: boolean;
		onToggle?: () => void;
		/** Called after a navigation (zoom into a sibling / go up).
		 *  The parent decides whether the panel should close (narrow screens). */
		onNavigate?: () => void;
		/** Opens the centered settings modal (+page.svelte owns the state). */
		onOpenSettings?: () => void;
	} = $props();

	// --- Content derivation ---

	const zoomedBlock = $derived(zoomId ? tree.blocks.find((b) => b.id === zoomId) : null);

	const parentBlock = $derived(
		zoomedBlock?.parent_id
			? (tree.blocks.find((b) => b.id === zoomedBlock.parent_id) ?? null)
			: null
	);

	/** Siblings of the zoomed block; in root view, all top-level blocks. */
	const rootBlocks = $derived(
		tree.blocks.filter((b) => b.parent_id === null).sort((a, b) => a.position - b.position)
	);

	/** What the sidebar lists, per settings.sidebarMode:
	 *  - 'siblings': the classic outline — the zoomed block's
	 *    siblings, or the top-level blocks when not zoomed.
	 *  - 'page' (default): the first level of the current page — the zoomed block's
	 *    direct children (top-level blocks at Home). No deeper
	 *    descendants: one flat level, like a map of contents.
	 *  - 'home': always the top-level blocks, whatever the zoom — a
	 *    pinned home view (zoom navigation only changes the highlight).
	 */
	const sidebarItems = $derived.by(() => {
		if (settings.sidebarMode === 'page') {
			if (!zoomId) return rootBlocks;
			if (!zoomedBlock) return [];
			return tree.blocks
				.filter((b) => b.parent_id === zoomedBlock.id)
				.sort((a, b) => a.position - b.position);
		}
		if (settings.sidebarMode === 'home') {
			return rootBlocks;
		}
		if (!zoomId) {
			return rootBlocks;
		}
		if (!zoomedBlock) return [];
		return tree.blocks
			.filter((b) => b.parent_id === zoomedBlock.parent_id)
			.sort((a, b) => a.position - b.position);
	});

	/** Home row shown when there is no parent to reference: in the
	 *  'siblings'/'page' modes that is the root view (or a zoomed root
	 *  block); in the 'home' mode the sidebar IS the home view, so the
	 *  row stays as the location indicator + way back to the root. */
	const showHomeRow = $derived(settings.sidebarMode === 'home' || !parentBlock);

	/** Parent breadcrumb — the way up out of the current view. Hidden in
	 *  the 'home' mode: the pinned home view has no parent to reference. */
	const showParentRow = $derived(
		settings.sidebarMode !== 'home' && zoomId !== null && parentBlock !== null
	);

	function handleNavigate(id: string) {
		zoomTo(id);
		onNavigate?.();
	}

	/** Home row: at root it's the current-location indicator (no-op); when
	 *  zoomed it navigates back to the root view. */
	function handleGoHome() {
		if (!zoomId) return;
		zoomToRoot();
		onNavigate?.();
	}

	function handleGoUp() {
		if (parentBlock) handleNavigate(parentBlock.id);
	}
</script>

<!-- Toggle button — hamburger icon, slides with the panel edge on wide
     screens; on narrow screens it stays in the actions row and is hidden
     while the drawer is open (see the media query below). -->
<button
	class="side-toggle"
	class:side-toggle--open={open}
	onclick={onToggle}
	aria-label={open ? t('side.close') : t('side.open')}
	title={open ? t('side.close') : t('side.open')}
>
	<!-- Hamburger: three horizontal bars (Lucide "menu", MIT) -->
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<line x1="4" x2="20" y1="6" y2="6" />
		<line x1="4" x2="20" y1="12" y2="12" />
		<line x1="4" x2="20" y1="18" y2="18" />
	</svg>
</button>

<!-- Sidebar panel — slides from left, fully hidden when closed (no hover strip) -->
<div class="side-panel" class:side-panel--open={open}>
	<div class="side-scroll">
		<!-- Scrollable area only: the settings footer below stays pinned,
		     so it is always visible however long the outline grows. -->
		<div class="side-scroll-area">
			<div class="side-items">
				<!-- Home — the current-location indicator, shown only where the
			     current block's parent IS Home (root view, or a root block
			     zoomed in): those blocks have no other parent to reference.
			     Deeper views rely on the parent breadcrumb below instead.
			     In the 'home' sidebar mode it is always shown — the sidebar
			     is the home view itself. -->
				{#if showHomeRow}
					<button
						class="side-item side-item--home"
						class:side-item--active={!zoomId}
						onclick={handleGoHome}
						title={t('zoom.home')}
					>
						<!-- House (Lucide "home", MIT) -->
						<svg
							class="side-home-icon"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
							<polyline points="9 22 9 12 15 12 15 22" />
						</svg>
						<span class="side-item-text">{t('zoom.home')}</span>
					</button>
				{/if}

				{#if showParentRow && parentBlock}
					<button class="side-parent" onclick={handleGoUp}>
						<span class="side-parent-text">{parentBlock.content || t('common.empty')}</span>
					</button>
				{/if}

				<div class="side-sep" role="separator"></div>

				{#each sidebarItems as item (item.id)}
					<button
						class="side-item"
						class:side-item--active={item.id === zoomId}
						onclick={() => handleNavigate(item.id)}
					>
						<span class="side-item-text">{item.content || t('common.empty')}</span>
					</button>
				{/each}
			</div>

			{#if sidebarItems.length === 0}
				<div class="side-empty">
					{#if settings.sidebarMode === 'page' && zoomId}
						{t('side.noChildren')}
					{:else if !zoomId || settings.sidebarMode === 'home'}
						{t('side.noRoots')}
					{:else}
						{t('side.noSiblings')}
					{/if}
				</div>
			{/if}
		</div>

		<div class="side-sep" role="separator"></div>

		<!-- Settings — pinned footer, outside the scroll area. -->
		<button
			class="side-settings"
			aria-label={t('side.settings')}
			title={t('side.settings')}
			onclick={onOpenSettings}
		>
			<!-- Gear (Lucide "settings", MIT) -->
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
				/>
				<circle cx="12" cy="12" r="3" />
			</svg>
			<span>{t('side.settings')}</span>
		</button>
	</div>
</div>

<style>
	/* --- Toggle button — slides with sidebar edge, always visible ---
	   top: 1rem / left: 1rem: same inset as the navbar corner buttons, so all
	   three buttons share the same padding from the screen edges. */
	.side-toggle {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 56;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
		transition:
			left 0.2s ease,
			color 0.15s ease,
			background 0.15s ease;
		padding: 0;
	}
	.side-toggle--open {
		left: calc(var(--sidebar-w) + 1rem);
	}
	.side-toggle:hover {
		color: var(--color-encre);
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
	}

	/* --- Sidebar panel — slides from left, fully hidden when closed --- */
	.side-panel {
		position: fixed;
		top: 0;
		left: 0;
		/* 100vh fallback, then 100dvh so the drawer clears the mobile URL
		   bar instead of running under it. */
		height: 100vh;
		height: 100dvh;
		z-index: 55;
		width: var(--sidebar-w);
		/* Chrome, not content: base font slightly smaller than the body
		   (which the editor uses). em so it scales with the user's text-size
		   setting like everything else. Narrow screens keep this size; the
		   wide layout tightens it further below (min-width 1024px). */
		font-size: 0.95em;
		/* Evernote-gray panel (--color-sidebar) — deliberately one tone
		   apart from the white note area, like Evernote's own sidebar. */
		background: var(--color-sidebar);
		border-right: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
		overflow: hidden;
		transform: translateX(-100%);
		transition: transform 0.2s ease;
	}
	.side-panel--open {
		transform: translateX(0);
	}

	.side-scroll {
		/* Generous gutters so text never hugs the panel edges. No scrolling
		   here: the .side-scroll-area below scrolls, keeping the settings
		   footer pinned under it. */
		padding: 0.875rem;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		overflow: hidden;
	}

	/* The only scrollable region of the panel. min-height: 0 lets the flex
	   item shrink below its content height — without it the browser
	   refuses to scroll (flexbox default min-height: auto). */
	.side-scroll-area {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	/* --- Parent breadcrumb --- */
	.side-parent {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
		width: 100%;
		border: none;
		background: none;
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
	}
	.side-parent:hover {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
	}
	.side-parent-text {
		display: block;
		width: 100%;
		font-weight: 600;
		color: color-mix(in srgb, var(--color-encre) 70%, transparent);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.side-sep {
		height: 1px;
		margin: 0.25rem 0.5rem;
		background: color-mix(in srgb, var(--color-encre) 10%, transparent);
	}

	/* --- Item list --- */
	.side-items {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		flex: 1;
	}

	.side-item {
		display: block;
		width: 100%;
		border: none;
		background: none;
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
		transition:
			color 0.1s ease,
			background 0.1s ease;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* Let the label shrink inside the flex Home row so the ellipsis can
	   kick in there too (flex items refuse to shrink below content size
	   by default). */
	.side-item-text {
		min-width: 0;
	}
	.side-item:hover {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
		color: var(--color-encre);
	}
	.side-item--active {
		color: var(--color-encre);
		font-weight: 600;
	}

	/* Home row — icon + label on one line (plain .side-item is block-only). */
	.side-item--home {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.side-home-icon {
		flex-shrink: 0;
		/* Monochrome — the icon always follows the row's text color
		   (muted normally, full ink on hover/active), no accent variant. */
		color: inherit;
	}

	.side-empty {
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
		padding: 0.5rem;
		text-align: center;
	}

	/* --- Footer: settings (reserved) --- */
	.side-settings {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		border: none;
		background: none;
		padding: 0.375rem 0.5rem;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
		font: inherit;
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
		transition:
			color 0.1s ease,
			background 0.1s ease;
	}
	.side-settings:hover {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
		color: var(--color-encre);
	}

	/* Full-screen layout (≥ 1024px): tighten the text a notch — the wide
	   sidebar has room, the small font keeps it chrome-like. Tablet/mobile
	   keep the base 0.95em from .side-panel. */
	@media (min-width: 1024px) {
		.side-panel {
			font-size: 0.9em;
		}
	}

	/* Narrow (< 1024px): the panel becomes a drawer — width from --drawer-w
	   (layout.css), toggle parked in the actions row and hidden while open
	   (closing = scrim tap, Escape, or navigating). No toggle slide here:
	   the drawer itself still slides via its transform transition. */
	@media (max-width: 1023px) {
		.side-panel {
			width: var(--drawer-w);
		}
		.side-toggle {
			top: var(--actions-row-top);
		}
		.side-toggle--open {
			display: none;
		}
	}
</style>
