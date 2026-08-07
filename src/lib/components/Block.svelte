<script module>
	/**
	 * Double-tap state shared across ALL Block instances (module scope).
	 * A tap on any block must cancel the pending edit of a previous tap on
	 * another block — otherwise tapping through blocks quickly would start
	 * several edits at once.
	 */
	let lastTapAt = 0;
	let lastTapX = 0;
	let lastTapY = 0;
	let pendingEdit: ReturnType<typeof setTimeout> | null = null;
	let touchDevice: boolean | null = null;

	/** Client-only (called from event handlers, never during SSR). */
	function isTouchScreen(): boolean {
		if (touchDevice === null) touchDevice = window.matchMedia('(hover: none)').matches;
		return touchDevice;
	}
</script>

<script lang="ts">
	import type { Block } from '$lib/server/db/queries';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { caretFromClick, caretFromNativeSelection } from '$lib/utils/caret';
	import { settings } from '$lib/settings.svelte';
	import BlockRecursive from './Block.svelte';
	import BlockMenu from './BlockMenu.svelte';
	import type { FormatAction } from './FormatMenuItems.svelte';
	import { formatBar } from '$lib/formatbar.svelte';

	let {
		block,
		childrenMap,
		depth,
		registerEl,
		onSaveContent,
		autoEditRequest = null,
		onToggleCollapse,
		onZoom,
		onClipboardAction,
		onExport,
		onDragStart,
		isDragging = false
	}: {
		block: Block;
		childrenMap: Map<string | null, Block[]>;
		depth: number;
		registerEl: (id: string, el: HTMLDivElement) => void;
		onSaveContent: (id: string, before: string, after: string, caret?: number) => void;
		autoEditRequest?: { id: string; caret: number } | null;
		onToggleCollapse?: (id: string) => void;
		onZoom?: (id: string) => void;
		onClipboardAction?: (id: string, action: FormatAction) => void;
		onExport?: () => void;
		onDragStart?: (id: string, e: DragEvent) => void;
		isDragging?: boolean;
	} = $props();

	const children = $derived(childrenMap.get(block.id) ?? []);

	/**
	 * Badge count shown next to collapsed blocks. Mode comes from settings:
	 * 'descendants' = whole subtree (today's behavior), 'children' = direct
	 * children only, 'hidden' = no badge and no walk at all. Only one branch
	 * of the walk is ever paid for — the setting is read inside the derived
	 * so a change re-renders every block instantly.
	 */
	const badgeCount = $derived.by(() => {
		if (settings.blockCount === 'hidden') return 0;
		if (settings.blockCount === 'children') return children.length;
		let count = 0;
		function walk(parentId: string) {
			const kids = childrenMap.get(parentId) ?? [];
			for (const kid of kids) {
				count++;
				walk(kid.id);
			}
		}
		walk(block.id);
		return count;
	});

	/** Derived from the parent's autoEditRequest — true when this block is the one that should enter edit mode. */
	const autoEdit = $derived(autoEditRequest?.id === block.id);

	/**
	 * Heading level (0–3) detected from leading '#' markers.
	 * Mirrors renderMarkdown's regex exactly — guaranteed to agree with the rendered HTML.
	 * Used to size the gutter so the diple centres on the first line of headings.
	 */
	const headingLevel = $derived(block.content.match(/^(#{1,3})\s+(.+)$/)?.[1].length ?? 0);

	let editing = $state(false);
	let editEl: HTMLDivElement | undefined = $state();
	let viewEl: HTMLSpanElement | undefined = $state();
	// Content captured once when entering edit mode — NOT reactive to block.content
	let capturedContent = '';
	let pendingCaret: number | null = null;

	/**
	 * Focus the element and collapse the caret to the given offset.
	 * If `caret` is null, place at the end. If the element has no text node (empty block),
	 * collapse to `(el, 0)`.
	 */
	function placeCaret(el: HTMLElement, caret: number | null) {
		el.focus();
		const sel = window.getSelection();
		if (!sel) return;
		if (el.firstChild) {
			const len = el.firstChild.textContent?.length ?? 0;
			const offset = caret !== null ? Math.min(caret, len) : len;
			sel.collapse(el.firstChild, offset);
		} else {
			sel.collapse(el, 0);
		}
	}

	$effect(() => {
		if (editEl) {
			registerEl(block.id, editEl);
			// Unmount safety: a deleted/removed block never fires blur, so
			// clear the bar's session if we are the active one (guard below).
			return () => {
				if (formatBar.el === editEl) formatBar.el = null;
			};
		}
	});

	// Set textContent and place caret when transitioning INTO edit mode.
	// pendingCaret is consumed once here: null = end, number = specific offset.
	// block.content is deliberately NOT read here to avoid re-firing on every keystroke.
	// formatBar.el announces this block's element to the mobile formatting bar.
	$effect(() => {
		if (editing && editEl) {
			editEl.textContent = capturedContent;
			const caret = pendingCaret;
			pendingCaret = null;
			requestAnimationFrame(() => placeCaret(editEl!, caret));
			formatBar.el = editEl;
		}
	});

	// When the parent asks this block to auto-edit, transition into edit mode.
	// pendingCaret carries the requested caret offset to the editing effect above.
	// Guard with !editing so this fires only on the transition from view → edit,
	// never on subsequent reactive re-runs (e.g. block.content changes on keystrokes).
	$effect(() => {
		if (autoEdit && editEl && !editing) {
			capturedContent = block.content;
			pendingCaret = autoEditRequest?.caret ?? null;
			editing = true;
		}
	});

	function startEditing(e?: MouseEvent) {
		capturedContent = block.content;
		// The mousedown pre-computed the caret while the text was still
		// selectable (before .editor applies user-select:none for the drag
		// potential). Fall back to the click position for non-mouse entries.
		if (pendingCaret === null) {
			pendingCaret = caretFromClick(e, viewEl, block.content);
		}
		editing = true;
	}

	/**
	 * View-mode tap/click. Desktop: edit immediately (the loupe button and the
	 * context menu own zoom). Touch: a tap may be the first half of a
	 * double-tap → delay the edit by 260ms; a second tap within 300ms / 40px
	 * cancels it and zooms into the block instead.
	 */
	function handleViewClick(e: MouseEvent) {
		if ((e.target as HTMLElement).tagName === 'A') return;
		if (!isTouchScreen()) {
			startEditing(e);
			return;
		}
		const now = Date.now();
		if (
			now - lastTapAt < 300 &&
			Math.abs(e.clientX - lastTapX) < 40 &&
			Math.abs(e.clientY - lastTapY) < 40
		) {
			lastTapAt = 0;
			if (pendingEdit) {
				clearTimeout(pendingEdit);
				pendingEdit = null;
			}
			onZoom?.(block.id);
			return;
		}
		lastTapAt = now;
		lastTapX = e.clientX;
		lastTapY = e.clientY;
		if (pendingEdit) clearTimeout(pendingEdit);
		pendingEdit = setTimeout(() => {
			pendingEdit = null;
			startEditing(e);
		}, 260);
	}

	function stopEditing() {
		if (editEl) {
			const newContent = editEl.textContent ?? '';
			block.content = newContent;
			// Only report if content actually changed (avoids no-op undo entries)
			if (newContent !== capturedContent) {
				const sel = window.getSelection();
				const caretOffset = sel?.focusOffset ?? newContent.length;
				onSaveContent(block.id, capturedContent, newContent, caretOffset);
			}
		}
		editing = false;
		// The edit session is over — hide the bar. Guarded: a blur fired for
		// THIS block only; a newer session must survive (see formatbar.svelte.ts).
		if (formatBar.el === editEl) formatBar.el = null;
	}

	function handleInput() {
		if (editEl) {
			block.content = editEl.textContent ?? '';
		}
	}

	/**
	 * The diple is the drag handle (Workflowy-style): click still toggles
	 * collapse, drag moves the block. A block being edited must not move
	 * mid-edit (its content isn't committed), so the drag is cancelled.
	 * setData is required — Firefox refuses to start a drag without it. The
	 * editor builds the drag image and snapshots the dragged roots.
	 */
	function handleDragStart(e: DragEvent) {
		if (editing) {
			e.preventDefault();
			return;
		}
		// dataTransfer is technically nullable; a dragstart without it is a no-op.
		if (!e.dataTransfer) return;
		e.dataTransfer.setData('text/plain', block.id);
		e.dataTransfer.effectAllowed = 'move';
		onDragStart?.(block.id, e);
	}
</script>

<div
	class="block"
	class:collapsed={block.collapsed === 1}
	style="padding-left: {depth > 0 ? 1 : 0}rem"
	data-block-id={block.id}
	data-depth={depth}
>
	<div class="block-row" class:drag-source={isDragging} data-h={editing ? 0 : headingLevel}>
		<div class="block-gutter">
			{#if onZoom}
				{#if editing || block.content.trim() === ''}
					<!-- No zoom into empty blocks (or while editing) — spacer keeps bullet alignment -->
					<span class="zoom-spacer" aria-hidden="true"></span>
				{:else}
					<button class="zoom-btn" aria-label="Zoom into block" onclick={() => onZoom(block.id)}>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						>
							<circle cx="10.5" cy="10.5" r="7" />
							<line x1="15" y1="15" x2="21" y2="21" />
						</svg>
					</button>
				{/if}
			{/if}
			{#if editing}
				<!-- Formatting mid-edit would fight the capturedContent flow — spacer keeps alignment -->
				<span class="menu-spacer" aria-hidden="true"></span>
			{:else}
				<BlockMenu {block} {onSaveContent} {onClipboardAction} {onExport} {onZoom} />
			{/if}
			{#if children.length > 0}
				<button
					class="bullet bullet--toggle"
					class:editing
					aria-label={block.collapsed ? 'Expand' : 'Collapse'}
					draggable="true"
					onclick={() => onToggleCollapse?.(block.id)}
					ondragstart={handleDragStart}
				>
					<span class="diple" class:expanded={block.collapsed === 0}></span>
				</button>
			{:else}
				<span
					class="bullet"
					class:editing
					draggable="true"
					ondragstart={handleDragStart}
					aria-hidden="true"
				>
					<span class="diple"></span>
				</span>
			{/if}
		</div>

		<div class="block-content-wrap">
			<!-- View mode: rendered markdown -->
			<span
				bind:this={viewEl}
				class="block-content block-content--view"
				class:hidden={editing}
				role="button"
				tabindex="0"
				onmousedown={(e) => {
					pendingCaret =
						caretFromNativeSelection(viewEl, block.content) ??
						caretFromClick(e, viewEl, block.content);
				}}
				onclick={handleViewClick}
			>
				{@html renderMarkdown(block.content)}
			</span>

			<!-- Edit mode: contenteditable with raw text (NO reactive interpolation) -->
			<div
				bind:this={editEl}
				class="block-content block-content--edit"
				class:hidden={!editing}
				contenteditable="true"
				role="textbox"
				tabindex="-1"
				oninput={handleInput}
				onblur={stopEditing}
			></div>
		</div>

		{#if block.collapsed === 1 && badgeCount > 0}
			<span class="child-count" aria-hidden="true">› {badgeCount}</span>
		{/if}
	</div>

	{#if children.length > 0 && block.collapsed === 0}
		<div class="block-children">
			{#each children as child (child.id)}
				<BlockRecursive
					block={child}
					{childrenMap}
					depth={depth + 1}
					{registerEl}
					{onSaveContent}
					{onToggleCollapse}
					{onZoom}
					{onClipboardAction}
					{onDragStart}
					{isDragging}
					{autoEditRequest}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.block {
		padding-top: 6px;
		padding-bottom: 6px;
		--zoom-w: 1.35rem;
		--menu-w: 1.35rem;
		--bullet-w: 1.5rem;
	}
	/* Hang the diple at the content column's left edge (= the search bar).
	   The gutter bullets (zoom + menu) overflow into the left margin.
	   Scoped to depth 0 — children indent normally (padding-left compounds).
	   Below 850px the page margin can't hold it — revert to inline gutter. */
	.block[data-depth='0'] {
		margin-left: calc(-1 * (var(--zoom-w) + var(--menu-w) + var(--bullet-w) / 2));
	}
	@media (max-width: 850px) {
		.block[data-depth='0'] {
			margin-left: 0;
		}
	}
	.block-row {
		--row-h: 1.5em; /* body text line-height (default) */
		display: flex;
		align-items: flex-start;
	}
	.bullet {
		flex-shrink: 0;
		width: var(--bullet-w);
		display: flex;
		align-items: center;
		justify-content: center;
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
		user-select: none;
		/* The diple is the drag handle — grab signals the affordance. */
		cursor: grab;
	}
	.bullet--toggle {
		border: none;
		background: none;
		font: inherit;
		padding: 0;
		/* width, flex centering, color, grab cursor from .bullet */
	}
	.bullet:hover {
		color: color-mix(in srgb, var(--color-encre) 60%, transparent);
	}
	.bullet.editing,
	.bullet--toggle.editing {
		color: var(--color-accent);
	}
	/* The dragged row dims while the drag is active — the native ghost
	   carries the actual look. */
	.drag-source {
		opacity: 0.4;
	}
	.diple {
		display: block;
		width: 0.4em;
		height: 0.4em;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(-45deg);
		transition: transform 0.15s ease;
	}
	.diple.expanded {
		transform: rotate(45deg);
	}
	/* Collapsed indicator: › N after the content, zero alignment impact */
	.child-count {
		flex-shrink: 0;
		align-self: center;
		margin-left: 0.35rem;
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
		font-size: 0.8em;
		user-select: none;
	}
	/* Gutter height per heading level so the diple centres on the first text line.
	   Values = .md-hN font-size × line-height 1.5 — keep in sync with .md-h1/2/3 below. */
	.block-row[data-h='1'] {
		--row-h: 2.1em; /* 1.4 × 1.5 */
	}
	.block-row[data-h='2'] {
		--row-h: 1.8em; /* 1.2 × 1.5 */
	}
	.block-row[data-h='3'] {
		--row-h: 1.575em; /* 1.05 × 1.5 */
	}
	.block-gutter {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		/* First text line height + .block-content vertical padding (2×2px).
		   If .block-content padding changes, update the + 4px here. */
		height: calc(var(--row-h) + 4px);
	}
	.block-content-wrap {
		flex: 1;
		min-width: 0;
		position: relative;
	}
	.block-children {
		position: relative;
	}
	.block-children::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		/* Center of the diple, accounting for the zoom and menu buttons to its left. */
		left: calc(var(--zoom-w) + var(--menu-w) + var(--bullet-w) / 2);
		width: 1px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		pointer-events: none;
	}
	.zoom-btn,
	.zoom-spacer {
		flex-shrink: 0;
		width: var(--zoom-w);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.menu-spacer {
		flex-shrink: 0;
		width: var(--menu-w);
	}
	.zoom-btn {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 30%, transparent);
		/* Hidden until row hover — no layout shift because .zoom-spacer keeps the width. */
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.zoom-btn:hover {
		color: var(--color-accent);
	}
	.block-row:hover .zoom-btn {
		opacity: 1;
	}
	/* Prevent the hover reveal from triggering while drag-selecting (cursor over blocks). */
	:global(.editor--selecting) .zoom-btn {
		opacity: 0;
	}

	/*
	 * Touch screens (no hover) OR narrow layout (< 1024px): the loupe and
	 * ••• buttons are unusable — no hover on touch; on narrow screens they
	 * just eat left space and shift the text (they can't be hovered
	 * reliably anyway). Hide them and collapse the gutter so content
	 * starts right after the bullet. The bullets/spacers read
	 * --zoom-w/--menu-w, so zeroing them keeps every alignment (depth-0
	 * hang, guide line, menu). Desktop ≥1024px keeps the gutter (hover
	 * works). Long-press / right-click (with Zoom) and double-tap cover
	 * the actions.
	 */
	@media (hover: none), (max-width: 1023px) {
		.block {
			--zoom-w: 0;
			--menu-w: 0;
		}
		.zoom-btn {
			display: none;
		}
		:global(.menu-btn) {
			display: none;
		}
		.block-content--edit {
			/* When the browser scrolls the edited block into view (keyboard
			   open), keep it above the formatting bar — the keyboard offset
			   alone leaves it peeking behind the bar. */
			scroll-margin-bottom: var(--formatbar-h);
		}
	}
	/* Touch only: stop native text selection / the iOS callout during
	   long-press; edit mode (contenteditable) is unaffected. A narrow
	   desktop window (mouse) keeps native text selection. */
	@media (hover: none) {
		.block-content--view {
			user-select: none;
			-webkit-user-select: none;
			-webkit-touch-callout: none;
		}
	}
	.block-content {
		outline: none;
		min-height: 1.5em;
		padding: 2px 4px;
		border-radius: 3px;
		/* Wrap unbroken strings (long URLs, mash-typing) inside the margins —
		   only breaks when a word can't fit on its own line. */
		overflow-wrap: anywhere;
	}
	.block-content--view {
		cursor: text;
		display: block;
	}
	.block-content--view :global(code) {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 0.9em;
	}
	.block-content--view :global(a) {
		color: var(--color-encre);
		text-decoration: underline;
	}
	.block-content--view :global(mark) {
		background: color-mix(in srgb, var(--color-accent) 30%, transparent);
		padding: 0 2px;
		border-radius: 2px;
	}
	.block-content--view :global(del) {
		opacity: 0.6;
	}
	.block-content--view :global(.md-h1) {
		font-size: 1.4em;
		font-weight: 700;
	}
	.block-content--view :global(.md-h2) {
		font-size: 1.2em;
		font-weight: 600;
	}
	.block-content--view :global(.md-h3) {
		font-size: 1.05em;
		font-weight: 600;
	}
	.hidden {
		display: none !important;
	}
</style>
