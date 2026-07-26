<script lang="ts">
	import type { Block } from '$lib/server/db/queries';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { caretFromClick } from '$lib/utils/caret';

	let {
		block,
		path,
		onNavigate,
		onSaveContent,
		onCreateFirstChild
	}: {
		block: Block;
		/** Ancestor chain from root to direct parent ([] if zoomed block is itself a root). */
		path: Block[];
		/** id = ancestor to zoom into, null = Home (root view). */
		onNavigate: (id: string | null) => void;
		/** Title content was edited — same contract as Block.svelte's onSaveContent. */
		onSaveContent: (id: string, before: string, after: string) => void;
		/** Enter in the edit mode: user wants the first child created. */
		onCreateFirstChild: () => void;
	} = $props();

	// --- Title edit mode (mirrors Block.svelte's pattern) ---

	let editing = $state(false);
	let editEl: HTMLDivElement | undefined = $state();
	let viewEl: HTMLSpanElement | undefined = $state();
	let capturedContent = '';
	let pendingCaret: number | null = null;

	function startEditing(e?: MouseEvent) {
		capturedContent = block.content;
		pendingCaret = caretFromClick(e, viewEl, block.content.length);
		editing = true;
	}

	function stopEditing() {
		if (!editEl) return;
		const newContent = editEl.textContent ?? '';
		block.content = newContent;
		if (newContent !== capturedContent) {
			onSaveContent(block.id, capturedContent, newContent);
		}
		editing = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			stopEditing();
			onCreateFirstChild();
		}
	}

	// Seed the contenteditable and place caret when entering edit mode.
	// pendingCaret (from the click position, null = end) is consumed once here.
	$effect(() => {
		if (editing && editEl) {
			editEl.textContent = capturedContent;
			const caret = pendingCaret;
			pendingCaret = null;
			editEl.focus();
			const sel = window.getSelection();
			if (sel && editEl.firstChild) {
				const len = editEl.firstChild.textContent?.length ?? 0;
				sel.collapse(editEl.firstChild, caret !== null ? Math.min(caret, len) : len);
			} else {
				sel?.collapse(editEl, 0);
			}
		}
	});

	// --- Breadcrumb ---

	const crumbs = $derived.by(() => {
		type Crumb = { id: string | null; label: string; kind: 'home' | 'ellipsis' | 'ancestor' };
		const list: Crumb[] = [{ id: null, label: 'Home', kind: 'home' }];

		if (path.length <= 3) {
			for (const p of path) {
				list.push({
					id: p.id,
					label: p.content || '(empty)',
					kind: 'ancestor'
				});
			}
		} else {
			list.push({ id: null, label: '…', kind: 'ellipsis' });
			for (const p of path.slice(-3)) {
				list.push({
					id: p.id,
					label: p.content || '(empty)',
					kind: 'ancestor'
				});
			}
		}

		return list;
	});
</script>

<nav class="crumbs" aria-label="Breadcrumb">
	{#each crumbs as crumb, i (crumb.id ?? crumb.kind)}
		{#if i > 0}
			<span class="sep" aria-hidden="true">›</span>
		{/if}
		{#if crumb.kind === 'ellipsis'}
			<span class="crumb crumb--ellipsis" aria-hidden="true">{crumb.label}</span>
		{:else}
			<button
				class="crumb"
				class:crumb--home={crumb.kind === 'home'}
				onclick={() => onNavigate(crumb.id)}
			>
				{crumb.label}
			</button>
		{/if}
	{/each}
</nav>

<header class="zoom-header">
	<!-- View mode: rendered markdown, click to edit -->
	<span
		bind:this={viewEl}
		class="zoom-title zoom-title--view"
		class:hidden={editing}
		role="button"
		tabindex="0"
		onclick={startEditing}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') startEditing();
		}}
	>
		{#if block.content}
			{@html renderMarkdown(block.content)}
		{:else}
			<span class="empty">(empty)</span>
		{/if}
	</span>

	<!-- Edit mode: contenteditable -->
	<div
		bind:this={editEl}
		class="zoom-title zoom-title--edit"
		class:hidden={!editing}
		contenteditable="true"
		role="textbox"
		tabindex="-1"
		onblur={stopEditing}
		onkeydown={handleEditKeydown}
	></div>
</header>

<style>
	.zoom-header {
		margin-bottom: 1.25rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-encre) 10%, transparent);
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-wrap: wrap;
		/* Sticky context bar: parent is .zoom-view (full content height), so it
		   sticks under the navbar while children scroll. Blur band matches the
		   navbar aesthetic; horizontal bleed keeps text off the blur edges. */
		position: sticky;
		top: 4.5rem;
		z-index: 40;
		padding: 0.375rem 0.25rem;
		margin: 0 -0.25rem 0.5rem;
		font-size: 0.85rem;
		background: color-mix(in srgb, var(--color-fond) 82%, transparent);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		border-radius: 6px;
	}
	.sep {
		color: color-mix(in srgb, var(--color-encre) 30%, transparent);
		user-select: none;
	}
	.crumb {
		border: none;
		background: none;
		padding: 0.125rem 0.3rem;
		border-radius: 4px;
		font: inherit;
		font-size: inherit;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 60%, transparent);
		transition: background 0.1s ease;
	}
	.crumb:hover {
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		color: var(--color-encre);
	}
	.crumb--home {
		font-weight: 600;
		color: color-mix(in srgb, var(--color-encre) 80%, transparent);
	}
	.crumb--ellipsis {
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
		cursor: default;
		user-select: none;
	}
	.zoom-title {
		margin: 0;
		font-size: 1.25em;
		font-weight: 600;
		line-height: 1.4;
		padding: 2px 4px;
		border-radius: 3px;
		outline: none;
		display: block;
		/* Same rule as block content: unbroken strings wrap inside the margins */
		overflow-wrap: anywhere;
	}
	.zoom-title--view {
		cursor: text;
	}
	.zoom-title--edit {
		min-height: 1.5em;
	}
	.zoom-title :global(.md-h1) {
		font-size: 1.3em;
	}
	.zoom-title :global(.md-h2) {
		font-size: 1.15em;
	}
	.zoom-title :global(.md-h3) {
		font-size: 1em;
	}
	.zoom-title :global(code) {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 0.9em;
	}
	.zoom-title :global(a) {
		color: color-mix(in srgb, var(--color-accent) 70%, var(--color-encre));
		text-decoration: underline;
	}
	.hidden {
		display: none !important;
	}
	.empty {
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
		font-style: italic;
	}
</style>
