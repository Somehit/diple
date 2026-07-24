<script lang="ts">
	import { tick } from 'svelte';
	import type { Block } from '$lib/server/db/queries';
	import BlockComponent from './Block.svelte';

	let props: { blocks: Block[] } = $props();
	let blocks = $state(props.blocks);
	const blockEls = new Map<string, HTMLDivElement>();
	let autoEditRequest = $state<{ id: string; caret: number } | null>(null);

	const childrenMap = $derived.by(() => {
		const map = new Map<string | null, Block[]>();
		for (const b of blocks) {
			const parent = b.parent_id;
			if (!map.has(parent)) map.set(parent, []);
			map.get(parent)!.push(b);
		}
		for (const [, siblings] of map) {
			siblings.sort((a, b) => a.position - b.position);
		}
		return map;
	});

	/** Root blocks, sorted by position via childrenMap (single source of truth). */
	const rootBlocks = $derived(childrenMap.get(null) ?? []);

	/** Depth-first flat list for arrow-key navigation. Skips collapsed subtrees. */
	const flatBlocks = $derived.by(() => {
		const result: Block[] = [];
		function walk(parentId: string | null) {
			const kids = childrenMap.get(parentId) ?? [];
			for (const kid of kids) {
				result.push(kid);
				if (kid.collapsed === 0) walk(kid.id);
			}
		}
		walk(null);
		return result;
	});

	const flatIndex = $derived.by(() => {
		const idx = new Map<string, number>();
		flatBlocks.forEach((b, i) => idx.set(b.id, i));
		return idx;
	});

	function getSiblings(parentId: string | null): Block[] {
		return blocks.filter((b) => b.parent_id === parentId).sort((a, b) => a.position - b.position);
	}

	// --- API helpers ---

	async function apiCreate(
		parent_id: string | null,
		content: string,
		position: number
	): Promise<Block> {
		const res = await fetch('/api/blocks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parent_id, content, position })
		});
		return res.json();
	}

	async function apiMove(id: string, parent_id: string | null, position: number) {
		await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parent_id, position })
		});
	}

	async function apiUpdateContent(id: string, content: string) {
		await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
	}

	async function apiDelete(id: string) {
		await fetch(`/api/blocks/${id}`, { method: 'DELETE' });
	}

	async function apiSetCollapsed(id: string, collapsed: boolean) {
		await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ collapsed: collapsed ? 1 : 0 })
		});
	}

	// --- Callbacks ---

	function handleToggleCollapse(id: string) {
		const block = blocks.find((b) => b.id === id);
		if (!block) return;
		block.collapsed = block.collapsed ? 0 : 1;
		blocks = [...blocks];
		apiSetCollapsed(id, block.collapsed === 1);
	}

	// --- Event delegation (catches ALL keydown events from view & edit mode) ---

	function handleEditorKeydown(e: KeyboardEvent) {
		// Only handle keyboard shortcuts when inside a contenteditable (edit mode)
		const isEditing = (e.target as HTMLElement).closest('[contenteditable="true"]') !== null;
		if (!isEditing) return;

		// Find the closest block element from the event target
		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		if (!blockEl) return;
		const blockId = blockEl.getAttribute('data-block-id');
		if (!blockId) return;
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;

		if (e.key === 'Enter' && !e.shiftKey) {
			handleEnter(e, block);
		} else if (e.key === 'Tab' && !e.shiftKey) {
			handleTab(e, block);
		} else if (e.key === 'Tab' && e.shiftKey) {
			handleShiftTab(e, block);
		} else if (e.key === 'Backspace') {
			handleBackspace(e, block);
		} else if (e.key === 'ArrowUp') {
			handleArrowUp(e, block);
		} else if (e.key === 'ArrowDown') {
			handleArrowDown(e, block);
		}
	}

	async function handleEnter(e: KeyboardEvent, block: Block) {
		e.preventDefault();
		const el = blockEls.get(block.id);
		if (!el) return;

		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;
		const text = el.textContent ?? '';

		// Empty block with a parent: outdent instead of creating a new sibling
		if (text.length === 0 && block.parent_id !== null) {
			await outdent(block, 0);
			return;
		}

		const before = text.slice(0, cursorPos);
		const after = text.slice(cursorPos);

		// If this block has visible children, the new block becomes its first child (position 0).
		// Collapsed parent: create a sibling below instead.
		// Otherwise, create a sibling right after it.
		const childList = childrenMap.get(block.id) ?? [];
		const hasVisibleChildren = childList.length > 0 && block.collapsed === 0;
		const targetParentId = hasVisibleChildren ? block.id : block.parent_id;
		const siblings = getSiblings(targetParentId);
		const newPos = hasVisibleChildren ? 0 : siblings.findIndex((b) => b.id === block.id) + 1;

		// Shift later siblings (or all existing children) to make room
		for (const sib of siblings.slice(newPos)) {
			sib.position += 1;
		}

		block.content = before;
		el.textContent = before;
		apiUpdateContent(block.id, before);

		const newBlock: Block = {
			id: 'pending-' + Math.random().toString(36).slice(2),
			parent_id: targetParentId,
			content: after,
			position: newPos,
			collapsed: 0
		};
		autoEditRequest = { id: newBlock.id, caret: 0 };
		blocks = [...blocks, newBlock];

		await tick();

		const created = await apiCreate(targetParentId, after, newPos);
		// Preserve any text the user typed into the pending block during the round-trip
		const pending = blocks.find((b) => b.id === newBlock.id);
		if (pending) created.content = pending.content;
		// Point autoEdit at the real server ID so the recreated component re-enters edit mode
		autoEditRequest = { id: created.id, caret: 0 };
		blocks = blocks.map((b) => (b.id === newBlock.id ? created : b));
		await tick();
		autoEditRequest = null;
		// Clean up the stale entry that pointed at the pending block's detached element
		blockEls.delete(newBlock.id);
	}

	async function indent(block: Block, caret: number) {
		const siblings = getSiblings(block.parent_id);
		const idx = siblings.findIndex((b) => b.id === block.id);
		if (idx <= 0) return;

		const newParent = siblings[idx - 1];

		for (const sib of siblings.slice(idx + 1)) {
			sib.position -= 1;
		}

		const newSiblings = getSiblings(newParent.id);
		const newPos = newSiblings.length;

		block.parent_id = newParent.id;
		block.position = newPos;

		autoEditRequest = { id: block.id, caret };
		blocks = [...blocks];
		await tick();
		autoEditRequest = null;
		await apiMove(block.id, newParent.id, newPos);
	}

	async function outdent(block: Block, caret: number) {
		if (block.parent_id === null) return;

		const parent = blocks.find((b) => b.id === block.parent_id);
		if (!parent) return;

		const grandParentId = parent.parent_id;
		const parentIdx = getSiblings(grandParentId).findIndex((b) => b.id === parent.id);

		const oldSiblings = getSiblings(block.parent_id);
		const idx = oldSiblings.findIndex((b) => b.id === block.id);
		for (const sib of oldSiblings.slice(idx + 1)) {
			sib.position -= 1;
		}

		const newPos = parentIdx + 1;
		const grandSiblings = getSiblings(grandParentId);
		for (const sib of grandSiblings.slice(newPos)) {
			sib.position += 1;
		}

		block.parent_id = grandParentId;
		block.position = newPos;

		autoEditRequest = { id: block.id, caret };
		blocks = [...blocks];
		await tick();
		autoEditRequest = null;
		await apiMove(block.id, grandParentId, newPos);
	}

	async function handleTab(e: KeyboardEvent, block: Block) {
		e.preventDefault();
		// Capture caret before the move destroys the component
		const caret = window.getSelection()?.focusOffset ?? 0;
		await indent(block, caret);
	}

	async function handleShiftTab(e: KeyboardEvent, block: Block) {
		e.preventDefault();
		const caret = window.getSelection()?.focusOffset ?? 0;
		await outdent(block, caret);
	}

	async function handleBackspace(e: KeyboardEvent, block: Block) {
		const el = blockEls.get(block.id);
		if (!el) return;

		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;
		const text = el.textContent ?? '';

		// Normal character deletion — let browser handle it
		if (cursorPos > 0) return;

		e.preventDefault();

		// If the block has a parent, outdent (move up one level) — regardless of content
		if (block.parent_id !== null) {
			await outdent(block, 0);
			return;
		}

		// At root level: delete only if the block is empty
		if (text.length === 0) {
			const idx = flatIndex.get(block.id);
			if (idx === undefined || idx <= 0) return;
			const prevBlock = flatBlocks[idx - 1];
			if (!prevBlock) return;

			const siblings = getSiblings(block.parent_id);
			const blockIdx = siblings.findIndex((b) => b.id === block.id);
			for (const sib of siblings.slice(blockIdx + 1)) {
				sib.position -= 1;
			}

			blocks = blocks.filter((b) => b.id !== block.id);

			// Focus the previous block via autoEdit instead of broken focusEnd
			autoEditRequest = { id: prevBlock.id, caret: prevBlock.content.length };
			await tick();
			autoEditRequest = null;
			await apiDelete(block.id);
		}
		// Root block with content: nothing to do
	}

	async function handleArrowUp(e: KeyboardEvent, block: Block) {
		const el = blockEls.get(block.id);
		if (!el) return;

		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;
		if (cursorPos > 0) return;

		e.preventDefault();
		const idx = flatIndex.get(block.id);
		if (idx === undefined || idx <= 0) return;

		const prev = flatBlocks[idx - 1];
		autoEditRequest = { id: prev.id, caret: prev.content.length };
		await tick();
		autoEditRequest = null;
	}

	async function handleArrowDown(e: KeyboardEvent, block: Block) {
		const el = blockEls.get(block.id);
		if (!el) return;

		const text = el.textContent ?? '';
		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;
		if (cursorPos < text.length) return;

		e.preventDefault();
		const idx = flatIndex.get(block.id);
		if (idx === undefined || idx >= flatBlocks.length - 1) return;

		const next = flatBlocks[idx + 1];
		autoEditRequest = { id: next.id, caret: 0 };
		await tick();
		autoEditRequest = null;
	}
</script>

<!-- Single delegation container — catches keydown from view spans AND contenteditables -->
<div class="editor" onkeydown={handleEditorKeydown}>
	{#each rootBlocks as block (block.id)}
		<BlockComponent
			{block}
			{childrenMap}
			depth={0}
			{autoEditRequest}
			registerEl={(id: string, el: HTMLDivElement) => blockEls.set(id, el)}
			onSaveContent={apiUpdateContent}
			onToggleCollapse={handleToggleCollapse}
		/>
	{/each}

	{#if rootBlocks.length === 0}
		<p class="empty-state">No blocks yet. Start typing!</p>
	{/if}
</div>

<style>
	.editor {
		max-width: 840px;
		margin: 2rem auto;
		padding: 0 1rem;
	}
	.empty-state {
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
		font-style: italic;
		text-align: center;
		margin-top: 3rem;
	}
</style>
