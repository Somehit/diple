<script lang="ts">
	import type { Block } from '$lib/server/db/queries';
	import { renderMarkdown } from '$lib/utils/markdown';
	import BlockRecursive from './Block.svelte';
	import BlockMenu from './BlockMenu.svelte';

	let {
		block,
		childrenMap,
		depth,
		registerEl,
		onSaveContent,
		autoEditRequest = null,
		onToggleCollapse
	}: {
		block: Block;
		childrenMap: Map<string | null, Block[]>;
		depth: number;
		registerEl: (id: string, el: HTMLDivElement) => void;
		onSaveContent: (id: string, content: string) => void;
		autoEditRequest?: { id: string; caret: number } | null;
		onToggleCollapse?: (id: string) => void;
	} = $props();

	const children = $derived(childrenMap.get(block.id) ?? []);

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
		}
	});

	// Set textContent and place caret when transitioning INTO edit mode.
	// pendingCaret is consumed once here: null = end, number = specific offset.
	// block.content is deliberately NOT read here to avoid re-firing on every keystroke.
	$effect(() => {
		if (editing && editEl) {
			editEl.textContent = capturedContent;
			const caret = pendingCaret;
			pendingCaret = null;
			requestAnimationFrame(() => placeCaret(editEl!, caret));
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

	function startEditing() {
		capturedContent = block.content;
		editing = true;
	}

	function stopEditing() {
		if (editEl) {
			const content = editEl.textContent ?? '';
			block.content = content;
			onSaveContent(block.id, content);
		}
		editing = false;
	}

	function handleInput() {
		if (editEl) {
			block.content = editEl.textContent ?? '';
		}
	}
</script>

<div
	class="block"
	class:collapsed={block.collapsed === 1}
	style="padding-left: {depth > 0 ? 1 : 0}rem"
	data-block-id={block.id}
	data-depth={depth}
>
	<div class="block-row" data-h={editing ? 0 : headingLevel}>
		<div class="block-gutter">
			<span class="gutter-controls">
				<BlockMenu {block} {onSaveContent} />
			</span>
			{#if children.length > 0}
				<button
					class="bullet bullet--toggle"
					class:editing
					aria-label={block.collapsed ? 'Expand' : 'Collapse'}
					onclick={() => onToggleCollapse?.(block.id)}
					onmousedown={(e) => e.preventDefault()}
				>
					<span class="diple" class:expanded={block.collapsed === 0}></span>
				</button>
			{:else}
				<span class="bullet" class:editing aria-hidden="true">
					<span class="diple"></span>
				</span>
			{/if}
		</div>

		<div class="block-content-wrap">
			<!-- View mode: rendered markdown -->
			<span
				class="block-content block-content--view"
				class:hidden={editing}
				role="button"
				tabindex="0"
				onclick={(e) => {
					if ((e.target as HTMLElement).tagName !== 'A') startEditing();
				}}
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
		--gutter-w: 1.5rem;
		--bullet-w: 1.5rem;
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
	}
	.bullet--toggle {
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		padding: 0;
		/* width, flex centering, color from .bullet */
	}
	.bullet.editing,
	.bullet--toggle.editing {
		color: var(--color-accent);
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
	.gutter-controls {
		opacity: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		width: var(--gutter-w);
		flex-shrink: 0;
		overflow: visible;
	}
	.block-row:hover .gutter-controls {
		opacity: 1;
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
		left: calc(var(--gutter-w) + var(--bullet-w) / 2);
		width: 1px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		pointer-events: none;
	}
	.block-content {
		outline: none;
		min-height: 1.5em;
		padding: 2px 4px;
		border-radius: 3px;
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
		color: color-mix(in srgb, var(--color-accent) 70%, var(--color-encre));
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
