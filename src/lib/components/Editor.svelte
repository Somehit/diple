<script lang="ts">
	import { tick } from 'svelte';
	import { onMount } from 'svelte';
	import type { Block } from '$lib/server/db/queries';
	import BlockComponent from './Block.svelte';
	import ZoomHeader from './ZoomHeader.svelte';
	import SelectionMenu from './SelectionMenu.svelte';
	import type { FormatAction } from './FormatMenuItems.svelte';
	import {
		applyMultiHeading,
		applyMultiBold,
		applyMultiItalic,
		applyMultiHighlight,
		applyMultiStrikethrough,
		applyMultiCode
	} from '$lib/utils/format';
	import { keybindings, comboFromEvent, type CommandId } from '$lib/keybindings';
	import { UndoStack } from '$lib/undo';
	import type { Mutation, UndoEntry } from '$lib/undo';
	import {
		currentZoomId,
		cleanZoomUrl,
		zoomTo,
		zoomToRoot,
		saveScroll,
		restoreScroll
	} from '$lib/zoom';

	let props: { blocks: Block[]; intro?: boolean } = $props();
	let blocks = $state(props.blocks);

	// --- Zoom state (page.state.zoom is reactive on pushState; page.url.searchParams is the fallback for SSR/refresh) ---
	const zoomId = $derived(currentZoomId());
	const zoomedBlock = $derived(zoomId ? (blocks.find((b) => b.id === zoomId) ?? null) : null);
	/** Falls back to null when zoomId is invalid (block deleted / stale URL). */
	const effectiveZoomId = $derived(zoomId && zoomedBlock ? zoomId : null);

	// Clean up the URL when the zoom target no longer exists (e.g. undone/deleted).
	$effect(() => {
		if (zoomId && !zoomedBlock) cleanZoomUrl();
	});

	// --- Scroll management ---
	// Saves: animateZoom() saves the OLD view's scroll before navigating out.
	// Restores: this effect fires after a zoom change. Dezoom → restored position.
	// Fresh zoom-in → scroll to the editor top (so the zoomed title is visible,
	// not the hero above). First mount on root → no scroll.

	let scrollFirstRun = true;

	function scrollToEditorTop() {
		if (!editorEl) return;
		const rect = editorEl.getBoundingClientRect();
		const y = rect.top + window.scrollY - 72; // navbar clearance (pill height + gap)
		window.scrollTo({ top: Math.max(0, y) });
	}

	$effect(() => {
		const key = effectiveZoomId ?? '__root__';
		if (scrollFirstRun) {
			scrollFirstRun = false;
			// Only auto-scroll on first mount if landing directly on a zoom URL
			if (effectiveZoomId) tick().then(scrollToEditorTop);
			return;
		}
		tick().then(() => {
			const saved = restoreScroll(key);
			if (saved !== null) {
				window.scrollTo({ top: saved });
			} else {
				scrollToEditorTop();
			}
		});
	});

	// Prevent the browser's built-in scroll restoration from fighting our
	// manual scroll management on back/forward navigations.
	onMount(() => {
		if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
	});

	/**
	 * Breadcrumb trail (root → direct parent) for the zoomed block.
	 * Derived live from the same blocks state — any rename propagates instantly.
	 * Cycle-guarded against corrupt data (mirrors pathOf in queries.ts).
	 */
	const breadcrumb = $derived.by(() => {
		if (!zoomedBlock) return [];
		const path: Block[] = [];
		const seen = new Set<string>([zoomedBlock.id]);
		let cursor = zoomedBlock.parent_id;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			const parent = blocks.find((b) => b.id === cursor);
			if (!parent) break;
			path.unshift(parent);
			cursor = parent.parent_id;
		}
		return path;
	});

	/** True once the user has clicked the top capture zone this session. Resets on reload. */
	let captureZoneUsed = $state(false);

	const blockEls = new Map<string, HTMLDivElement>();
	let autoEditRequest = $state<{ id: string; caret: number } | null>(null);

	// Multi-block selection (drag-based range in flatBlocks order)
	let selectedIds = $state(new Set<string>());
	let dragPotential = false;
	let dragActive = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragAnchorId: string | null = null;
	let editorEl: HTMLDivElement | undefined = $state();

	// Position of the auto-open format menu (null = closed). Set on mouseup after a drag.
	let selectionMenu = $state<{ x: number; y: number } | null>(null);

	// Selection highlight overlay: one rectangle measured from the rendered DOM.
	// Decoupled from block geometry — ancestor paddings inside the range are covered by construction.
	let selRect = $state<{ top: number; height: number } | null>(null);

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

	/**
	 * Root blocks of the current view. Null parent = top-level tree; zoomed block's
	 * children = roots of the zoomed view. The zoomed block's own collapsed flag is
	 * ignored — if you zoom into a collapsed block, its children must still render.
	 */
	const rootBlocks = $derived(
		effectiveZoomId ? (childrenMap.get(effectiveZoomId) ?? []) : (childrenMap.get(null) ?? [])
	);

	/** Depth-first flat list for arrow-key navigation. Starts from the zoom root. Skips collapsed subtrees. */
	const flatBlocks = $derived.by(() => {
		const result: Block[] = [];
		function walk(parentId: string | null) {
			const kids = childrenMap.get(parentId) ?? [];
			for (const kid of kids) {
				result.push(kid);
				if (kid.collapsed === 0) walk(kid.id);
			}
		}
		walk(effectiveZoomId);
		return result;
	});

	const flatIndex = $derived.by(() => {
		const idx = new Map<string, number>();
		flatBlocks.forEach((b, i) => idx.set(b.id, i));
		return idx;
	});

	/**
	 * Measure the selection overlay rectangle from the rendered DOM.
	 * Top = first selected .block's top (includes its padding-top, so the band
	 * merges with the gap above). Bottom = last selected .block-row's bottom + 6px
	 * (its own padding-bottom) — the ROW is used, not .block, so a drag ending on
	 * a parent doesn't bleed over its unselected children.
	 * Called by the $effect below (selection/tree changes) and on window resize.
	 */
	function measureSelection() {
		const visible = flatBlocks.filter((b) => selectedIds.has(b.id));
		if (visible.length === 0 || !editorEl) {
			selRect = null;
			return;
		}
		const firstBlock = editorEl.querySelector(`[data-block-id="${visible[0].id}"]`);
		const lastBlock = editorEl.querySelector(`[data-block-id="${visible[visible.length - 1].id}"]`);
		if (!firstBlock || !lastBlock) {
			selRect = null;
			return;
		}
		const editorTop = editorEl.getBoundingClientRect().top;
		const top = firstBlock.getBoundingClientRect().top - editorTop;
		const lastRow = lastBlock.querySelector(':scope > .block-row') ?? lastBlock;
		const bottom = lastRow.getBoundingClientRect().bottom - editorTop + 6;
		selRect = { top, height: bottom - top };
	}

	// Re-measure whenever the selection or the visible tree changes.
	// State reads happen inside measureSelection — tracked through the call.
	$effect(() => {
		measureSelection();
	});

	function getSiblings(parentId: string | null): Block[] {
		return blocks.filter((b) => b.parent_id === parentId).sort((a, b) => a.position - b.position);
	}

	// --- API helpers ---

	/** Surface server failures in devtools — optimistic flows stay silent-by-design, never throw. */
	function checkRes(res: Response, label: string) {
		if (!res.ok) console.error(`[api] ${label} failed: ${res.status} ${res.statusText}`);
	}

	async function apiCreate(
		parent_id: string | null,
		content: string,
		position: number,
		id?: string
	): Promise<Block> {
		const res = await fetch('/api/blocks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parent_id, content, position, id })
		});
		checkRes(res, `POST /api/blocks (${id ?? 'new'})`);
		return res.json();
	}

	async function apiMove(id: string, parent_id: string | null, position: number) {
		const res = await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parent_id, position })
		});
		checkRes(res, `PATCH move ${id}`);
	}

	async function apiUpdateContent(id: string, content: string) {
		const res = await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		});
		checkRes(res, `PATCH content ${id}`);
	}

	async function apiDelete(id: string) {
		const res = await fetch(`/api/blocks/${id}`, { method: 'DELETE' });
		checkRes(res, `DELETE ${id}`);
	}

	async function apiSetCollapsed(id: string, collapsed: boolean) {
		const res = await fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ collapsed: collapsed ? 1 : 0 })
		});
		checkRes(res, `PATCH collapsed ${id}`);
	}

	// --- Callbacks ---

	function handleToggleCollapse(id: string) {
		const block = blocks.find((b) => b.id === id);
		if (!block) return;
		block.collapsed = block.collapsed ? 0 : 1;
		blocks = [...blocks];
		apiSetCollapsed(id, block.collapsed === 1);
	}

	/** Zoom navigation (breadcrumb click): ancestor id → zoom to it; null → root. */
	function handleZoomNavigate(id: string | null) {
		animateZoom(id);
	}

	/**
	 * Animate the current view out (scale→0.95, opacity→0, 150ms), then swap
	 * to the target zoom level. Used for editor-initiated zooms (button, keyboard,
	 * breadcrumb). Palette-clicks skip the out-animation (modal overlays the view).
	 */
	async function animateZoom(targetId: string | null) {
		// Save scroll position for the current view before the out animation
		saveScroll(effectiveZoomId ?? '__root__', window.scrollY);
		// Apply the out-animation to the current zoom-view. It gets destroyed on
		// remount when the {#key} swaps — no cleanup needed (no flash possible).
		const view = editorEl?.querySelector('.zoom-view');
		view?.classList.add('zoom-view--out');
		await new Promise((r) => setTimeout(r, 150));
		if (targetId === null) zoomToRoot();
		else zoomTo(targetId);
	}

	/** Zoom into a block (hover button or Alt+→). */
	function handleZoom(id: string) {
		animateZoom(id);
	}

	/** Dezoom one level: zoom to the parent of the current zoom root, or Home. */
	function handleZoomOut() {
		// No-op at root — avoids a redundant history entry
		if (!effectiveZoomId) return;
		const target = zoomedBlock?.parent_id ?? null;
		animateZoom(target);
	}

	/**
	 * Called when Enter is pressed while editing the zoomed-block title.
	 * Creates a new empty block as the first child of the zoomed block,
	 * shifts existing children, and focuses the new block.
	 */
	async function handleCreateFirstChild() {
		if (!zoomedBlock) return;
		const parentId = zoomedBlock.id;

		// Shift existing children to make room at position 0
		const siblings = getSiblings(parentId);
		for (const sib of siblings) {
			sib.position += 1;
		}

		const newBlock: Block = {
			id: crypto.randomUUID(),
			parent_id: parentId,
			content: '',
			position: 0,
			collapsed: 0,
			created_at: Date.now()
		};

		insertBlockLocal(newBlock);
		autoEditRequest = { id: newBlock.id, caret: 0 };

		inflight++;
		try {
			await apiCreate(parentId, '', 0, newBlock.id);
			autoEditRequest = null;
			recordEntry(
				[{ kind: 'create', block: { ...newBlock } }],
				{ id: zoomedBlock.id, offset: zoomedBlock.content.length },
				{ id: newBlock.id, offset: 0 }
			);
		} finally {
			inflight--;
		}
	}

	/**
	 * Capture zone at the top of the root view: creates a new empty block at
	 * position 0 (newest on top — the "stream" flow), focuses it for typing.
	 */
	async function handleCreateRootBlock() {
		captureZoneUsed = true;

		const siblings = getSiblings(null);
		for (const sib of siblings) {
			sib.position += 1;
		}

		const newBlock: Block = {
			id: crypto.randomUUID(),
			parent_id: null,
			content: '',
			position: 0,
			collapsed: 0,
			created_at: Date.now()
		};

		insertBlockLocal(newBlock);
		autoEditRequest = { id: newBlock.id, caret: 0 };

		inflight++;
		try {
			await apiCreate(null, '', 0, newBlock.id);
			autoEditRequest = null;
			recordEntry(
				[{ kind: 'create', block: { ...newBlock } }],
				{ id: newBlock.id, offset: 0 },
				{ id: newBlock.id, offset: 0 }
			);
		} finally {
			inflight--;
		}
	}

	// --- Undo infrastructure ---

	const undoStack = new UndoStack();

	function recordEntry(
		mutations: Mutation[],
		caretBefore: { id: string; offset: number },
		caretAfter: { id: string; offset: number }
	) {
		undoStack.push({ mutations, caretBefore, caretAfter });
	}

	function handleSaveContent(id: string, before: string, after: string, caret?: number) {
		apiUpdateContent(id, after);
		if (before !== after) {
			recordEntry(
				[{ kind: 'update', id, before, after }],
				{ id, offset: before.length },
				{ id, offset: caret ?? after.length }
			);
		}
	}

	// --- Local tree manipulation (position-aware, mirrors server transaction logic) ---

	function insertBlockLocal(blk: Block) {
		const siblings = getSiblings(blk.parent_id);
		for (const sib of siblings) {
			if (sib.position >= blk.position) sib.position += 1;
		}
		blocks = [...blocks, blk];
	}

	function removeBlockLocal(blk: Block) {
		const siblings = getSiblings(blk.parent_id);
		for (const sib of siblings) {
			if (sib.position > blk.position) sib.position -= 1;
		}
		blocks = blocks.filter((b) => b.id !== blk.id);
	}

	function moveBlockLocal(blk: Block, toParentId: string | null, toPos: number) {
		const oldSiblings = getSiblings(blk.parent_id);
		for (const sib of oldSiblings) {
			if (sib.position > blk.position) sib.position -= 1;
		}
		const newSiblings = getSiblings(toParentId);
		for (const sib of newSiblings) {
			if (sib.position >= toPos) sib.position += 1;
		}
		blk.parent_id = toParentId;
		blk.position = toPos;
		blocks = [...blocks];
	}

	// --- Undo/redo interpreter ---

	let inflight = 0;

	async function applyMutation(m: Mutation, direction: 'do' | 'undo') {
		switch (m.kind) {
			case 'create': {
				const blk = m.block;
				if (direction === 'do') {
					insertBlockLocal(blk);
					await apiCreate(blk.parent_id, blk.content, blk.position, blk.id);
				} else {
					removeBlockLocal(blk);
					await apiDelete(blk.id);
				}
				break;
			}
			case 'delete': {
				const blk = m.block;
				if (direction === 'do') {
					removeBlockLocal(blk);
					await apiDelete(blk.id);
				} else {
					insertBlockLocal(blk);
					await apiCreate(blk.parent_id, blk.content, blk.position, blk.id);
				}
				break;
			}
			case 'update': {
				const newContent = direction === 'do' ? m.after : m.before;
				const blk = blocks.find((b) => b.id === m.id);
				if (blk) blk.content = newContent;
				await apiUpdateContent(m.id, newContent);
				break;
			}
			case 'move': {
				const blk = blocks.find((b) => b.id === m.id);
				if (!blk) break;
				const target = direction === 'do' ? m.to : m.from;
				moveBlockLocal(blk, target.parent_id, target.position);
				await apiMove(m.id, target.parent_id, target.position);
				break;
			}
		}
	}

	async function applyUndoEntry(entry: UndoEntry, direction: 'undo' | 'redo') {
		const mutations = direction === 'undo' ? [...entry.mutations].reverse() : entry.mutations;
		const targetCaret = direction === 'undo' ? entry.caretBefore : entry.caretAfter;

		for (const m of mutations) {
			await applyMutation(m, direction === 'undo' ? 'undo' : 'do');
		}

		autoEditRequest = { id: targetCaret.id, caret: targetCaret.offset };
		await tick();
		autoEditRequest = null;
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

		// Normalize key combo → command ID → dispatch to handler
		const cmd = keybindings[comboFromEvent(e)];
		if (cmd) commands[cmd]?.(e, block);
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
			const from = { parent_id: block.parent_id, position: block.position };
			inflight++;
			try {
				await outdent(block, 0);
			} finally {
				inflight--;
			}
			recordEntry(
				[
					{
						kind: 'move',
						id: block.id,
						from,
						to: { parent_id: block.parent_id, position: block.position }
					}
				],
				{ id: block.id, offset: 0 },
				{ id: block.id, offset: 0 }
			);
			return;
		}

		// Cursor at position 0: nothing to split — insert an empty sibling above
		// at the same level. (Without this, Enter at the start of a block with
		// visible children would push the entire block down as a child.)
		if (cursorPos === 0) {
			const parentId = block.parent_id;
			const newPos = block.position; // take this block's slot; it and later siblings shift
			const newBlock: Block = {
				id: crypto.randomUUID(),
				parent_id: parentId,
				content: '',
				position: newPos,
				collapsed: 0,
				created_at: Date.now()
			};

			insertBlockLocal(newBlock);
			autoEditRequest = { id: newBlock.id, caret: 0 };

			inflight++;
			try {
				await apiCreate(parentId, '', newPos, newBlock.id);
				autoEditRequest = null;
				recordEntry(
					[{ kind: 'create', block: { ...newBlock } }],
					{ id: block.id, offset: 0 },
					{ id: newBlock.id, offset: 0 }
				);
			} finally {
				inflight--;
			}
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

		// ID generated client-side (the server accepts it) — no pending-ID window during
		// which actions on the new block (delete, move, collapse) would hit the API
		// with an ID the DB doesn't know yet and silently no-op.
		const newBlock: Block = {
			id: crypto.randomUUID(),
			parent_id: targetParentId,
			content: after,
			position: newPos,
			collapsed: 0,
			created_at: Date.now()
		};
		autoEditRequest = { id: newBlock.id, caret: 0 };
		blocks = [...blocks, newBlock];

		inflight++;
		try {
			await apiCreate(targetParentId, after, newPos, newBlock.id);
			// autoEdit was consumed when the new block mounted (stable ID → no recreation)
			autoEditRequest = null;

			// Record the split as [update(full→truncated), create(new)]
			recordEntry(
				[
					{ kind: 'update', id: block.id, before: text, after: block.content },
					{ kind: 'create', block: { ...newBlock } }
				],
				{ id: block.id, offset: cursorPos },
				{ id: newBlock.id, offset: 0 }
			);
		} finally {
			inflight--;
		}
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

		// Zoom boundary: children of the zoom root can't outdent past it — they'd
		// move to an invisible parent and disappear from the current view.
		if (block.parent_id === effectiveZoomId) return;

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
		const caret = window.getSelection()?.focusOffset ?? 0;
		const from = { parent_id: block.parent_id, position: block.position };
		await indent(block, caret);
		recordEntry(
			[
				{
					kind: 'move',
					id: block.id,
					from,
					to: { parent_id: block.parent_id, position: block.position }
				}
			],
			{ id: block.id, offset: caret },
			{ id: block.id, offset: caret }
		);
	}

	async function handleShiftTab(e: KeyboardEvent, block: Block) {
		e.preventDefault();
		const caret = window.getSelection()?.focusOffset ?? 0;
		const from = { parent_id: block.parent_id, position: block.position };
		await outdent(block, caret);
		recordEntry(
			[
				{
					kind: 'move',
					id: block.id,
					from,
					to: { parent_id: block.parent_id, position: block.position }
				}
			],
			{ id: block.id, offset: caret },
			{ id: block.id, offset: caret }
		);
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
			const from = { parent_id: block.parent_id, position: block.position };
			await outdent(block, 0);
			recordEntry(
				[
					{
						kind: 'move',
						id: block.id,
						from,
						to: { parent_id: block.parent_id, position: block.position }
					}
				],
				{ id: block.id, offset: 0 },
				{ id: block.id, offset: 0 }
			);
			return;
		}

		// At root level: delete the block if it's empty. If there's a previous
		// visible block, move the caret there; otherwise just drop the caret.
		if (text.length === 0) {
			const idx = flatIndex.get(block.id);
			if (idx === undefined) return;
			const prevBlock = idx > 0 ? flatBlocks[idx - 1] : null;

			const siblings = getSiblings(block.parent_id);
			const blockIdx = siblings.findIndex((b) => b.id === block.id);
			for (const sib of siblings.slice(blockIdx + 1)) {
				sib.position -= 1;
			}

			blocks = blocks.filter((b) => b.id !== block.id);

			if (prevBlock) {
				autoEditRequest = { id: prevBlock.id, caret: prevBlock.content.length };
				await tick();
				autoEditRequest = null;
			} else {
				// First visible block: nowhere to go — just drop the caret.
				(document.activeElement as HTMLElement | null)?.blur();
			}

			await apiDelete(block.id);

			recordEntry(
				[
					{
						kind: 'delete',
						block: {
							id: block.id,
							parent_id: block.parent_id,
							content: block.content,
							position: block.position,
							collapsed: block.collapsed,
							created_at: block.created_at
						}
					}
				],
				{ id: block.id, offset: 0 },
				prevBlock
					? { id: prevBlock.id, offset: prevBlock.content.length }
					: { id: block.id, offset: 0 }
			);
		} else {
			// Root block with content, cursor at 0: if the previous visible
			// block is empty and childless, delete it (the "absorb" pass).
			const idx = flatIndex.get(block.id);
			if (idx !== undefined && idx > 0) {
				const prev = flatBlocks[idx - 1];
				const prevKids = childrenMap.get(prev.id) ?? [];
				if (prev.content.trim() === '' && prevKids.length === 0) {
					removeBlockLocal(prev);
					await apiDelete(prev.id);
					recordEntry(
						[{ kind: 'delete', block: { ...prev } }],
						{ id: block.id, offset: 0 },
						{ id: block.id, offset: 0 }
					);
				}
			}
		}
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

	// --- Mouse drag selection ---

	function clearSelection() {
		if (selectedIds.size > 0) selectedIds = new Set();
		selectionMenu = null;
	}

	/** Start potential drag-selection. Ignores clicks on editable text, buttons, and empty space. */
	function onEditorMousedown(e: MouseEvent) {
		// Only left button starts drag-selection (right-click must not clear the selection)
		if (e.button !== 0) return;
		// Don't interfere with text editing (caret moves, native selection)
		if ((e.target as HTMLElement).closest('[contenteditable="true"]')) return;
		// Don't interfere with button clicks (bullet toggle, menu)
		if ((e.target as HTMLElement).closest('button')) return;

		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		if (!blockEl) return;

		const id = blockEl.getAttribute('data-block-id');
		if (!id) return;

		clearSelection();
		dragPotential = true;
		dragAnchorId = id;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
	}

	function onWindowMousemove(e: MouseEvent) {
		if (!dragPotential) return;

		if (dragActive) {
			updateDragSelection(e);
			return;
		}

		// Only enter drag mode after ~4px movement (avoid single-click jitter)
		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;
		if (dx * dx + dy * dy < 16) return;

		dragActive = true;
		// Kill any native text selection that may have started during the first few pixels
		window.getSelection()?.removeAllRanges();
		editorEl?.classList.add('editor--selecting');
		updateDragSelection(e);
	}

	function onWindowMouseup(e: MouseEvent) {
		if (dragActive) {
			// Ensure the final cursor position is captured before resetting
			updateDragSelection(e);
		}
		dragPotential = false;
		dragActive = false;
		editorEl?.classList.remove('editor--selecting');
	}

	/** Compute the range between the anchor and the block under the cursor, in flatBlocks order. */
	function updateDragSelection(e: MouseEvent) {
		const blockEl = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest('[data-block-id]') as HTMLElement | null;
		if (!blockEl) return;

		const focusId = blockEl.getAttribute('data-block-id');
		if (!focusId) return;

		const anchorIdx = flatIndex.get(dragAnchorId!);
		const focusIdx = flatIndex.get(focusId);
		if (anchorIdx === undefined || focusIdx === undefined) return;

		const lo = Math.min(anchorIdx, focusIdx);
		const hi = Math.max(anchorIdx, focusIdx);
		selectedIds = new Set(flatBlocks.slice(lo, hi + 1).map((b) => b.id));
	}

	/**
	 * Right-click on a block (selected or not) → select it (or keep the existing selection)
	 * and open the format menu. Right-click in edit mode → browser default (spellcheck, paste).
	 * Right-click on empty space → clear selection + browser default.
	 */
	function onEditorContextMenu(e: MouseEvent) {
		// Don't hijack the native context menu when editing text
		if ((e.target as HTMLElement).closest('[contenteditable="true"]')) return;

		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		const id = blockEl?.getAttribute('data-block-id');
		if (!id) {
			if (selectedIds.size > 0) clearSelection();
			return;
		}

		e.preventDefault();
		if (!selectedIds.has(id)) {
			// Right-click on an unselected block → it becomes the sole selection
			selectedIds = new Set([id]);
		}
		selectionMenu = { x: e.clientX, y: e.clientY };
	}

	/**
	 * Delete all selected blocks (with their descendants) both client-side and server-side.
	 * Only calls API for top-level selected blocks — descendants are handled by FK cascade.
	 */
	async function deleteSelectedBlocks() {
		// Find top-level selected blocks (those without a selected ancestor)
		const topLevelIds: string[] = [];
		for (const id of selectedIds) {
			let isDescendant = false;
			let parentId = blocks.find((b) => b.id === id)?.parent_id ?? null;
			while (parentId) {
				if (selectedIds.has(parentId)) {
					isDescendant = true;
					break;
				}
				parentId = blocks.find((b) => b.id === parentId)?.parent_id ?? null;
			}
			if (!isDescendant) topLevelIds.push(id);
		}

		// Collect all IDs to remove: top-level + their descendants
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not in reactive context
		const toRemove = new Set<string>();
		function collectDescendants(blockId: string) {
			toRemove.add(blockId);
			const kids = childrenMap.get(blockId) ?? [];
			for (const kid of kids) {
				collectDescendants(kid.id);
			}
		}
		for (const id of topLevelIds) collectDescendants(id);

		// Optimistic: remove from client state
		clearSelection();
		blocks = blocks.filter((b) => !toRemove.has(b.id));

		// Delete top-level blocks via API — FK ON DELETE CASCADE handles server-side children
		for (const id of topLevelIds) {
			await apiDelete(id);
		}
	}

	/**
	 * Apply a formatting action to all currently selected blocks.
	 * Multi-block semantics: if all have the format → remove from all; else → apply to all.
	 * Updates content optimistically and persists each block individually via API.
	 */
	async function handleSelectionAction(action: FormatAction) {
		const selectedBlocks = flatBlocks.filter((b) => selectedIds.has(b.id));
		if (selectedBlocks.length === 0) return;

		if (action === 'delete') {
			// deleteSelectedBlocks clears the selection itself — clearing here first
			// would empty selectedIds before it reads them (no-op bug)
			await deleteSelectedBlocks();
			return;
		}

		const contents = selectedBlocks.map((b) => b.content);
		let newContents: string[];

		switch (action) {
			case 'h1':
				newContents = applyMultiHeading(contents, 1);
				break;
			case 'h2':
				newContents = applyMultiHeading(contents, 2);
				break;
			case 'h3':
				newContents = applyMultiHeading(contents, 3);
				break;
			case 'bold':
				newContents = applyMultiBold(contents);
				break;
			case 'italic':
				newContents = applyMultiItalic(contents);
				break;
			case 'highlight':
				newContents = applyMultiHighlight(contents);
				break;
			case 'strike':
				newContents = applyMultiStrikethrough(contents);
				break;
			case 'code':
				newContents = applyMultiCode(contents);
				break;
			default:
				return;
		}

		// Optimistic update + persist each block
		for (let i = 0; i < selectedBlocks.length; i++) {
			selectedBlocks[i].content = newContents[i];
			apiUpdateContent(selectedBlocks[i].id, newContents[i]);
		}
		blocks = [...blocks];
		clearSelection();
	}

	/**
	 * Window-level keydown: global undo/redo (works without editor focus), plus selection
	 * actions (Backspace/Delete/Escape) when blocks are selected.
	 */
	async function onWindowKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		// Edit mode is already handled by handleEditorKeydown (event bubbles from the
		// contenteditable through .editor up to window). Form fields keep their native undo.
		const inEditableField =
			target.closest('[contenteditable="true"]') !== null ||
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA';

		if (!inEditableField) {
			// Resolve through the registry — no hardcoded keys, rebinding follows automatically
			const cmd = keybindings[comboFromEvent(e)];
			if (cmd === 'edit.undo') {
				e.preventDefault();
				await performUndo();
				return;
			}
			if (cmd === 'edit.redo') {
				e.preventDefault();
				await performRedo();
				return;
			}
			if (cmd === 'view.zoomOut') {
				e.preventDefault();
				handleZoomOut();
				return;
			}
		}

		if (selectedIds.size === 0) return;

		// Don't steal Backspace/Delete/Escape from edit mode or form fields (palette input)
		if (
			target.closest('[contenteditable="true"]') ||
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA'
		)
			return;

		if (e.key === 'Backspace' || e.key === 'Delete') {
			e.preventDefault();
			await deleteSelectedBlocks();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			clearSelection();
		}
	}

	// --- Undo/redo handlers ---

	/** Wait for in-flight structural ops to settle. Local SQLite round-trips are ms; the cap is pure safety. */
	async function waitForInflight() {
		for (let i = 0; i < 200 && inflight > 0; i++) {
			await new Promise((r) => setTimeout(r, 10));
		}
	}

	/**
	 * Commit any in-progress edit session before undo/redo.
	 * blur() fires stopEditing synchronously: pending typing is saved and pushed onto the
	 * stack, and the block returns to view mode — which lets undo mutations render and
	 * autoEditRequest re-enter edit mode with the restored content.
	 */
	function flushActiveEdit() {
		const active = document.activeElement as HTMLElement | null;
		if (active?.getAttribute('contenteditable') === 'true') {
			active.blur();
		}
	}

	/**
	 * Core undo/redo logic, shared by the in-editor command handlers and the global
	 * window listener. Selection is cleared first: an undo may delete a selected block,
	 * which would otherwise leave a ghost id in selectedIds.
	 */
	async function performUndo() {
		await waitForInflight();
		if (inflight > 0) return;
		clearSelection();
		flushActiveEdit();
		const entry = undoStack.undo();
		if (entry) await applyUndoEntry(entry, 'undo');
	}
	async function performRedo() {
		await waitForInflight();
		if (inflight > 0) return;
		clearSelection();
		flushActiveEdit();
		const entry = undoStack.redo();
		if (entry) await applyUndoEntry(entry, 'redo');
	}

	async function handleUndo(e: KeyboardEvent, _block: Block) {
		void _block;
		e.preventDefault();
		await performUndo();
	}
	async function handleRedo(e: KeyboardEvent, _block: Block) {
		void _block;
		e.preventDefault();
		await performRedo();
	}

	const commands: Record<CommandId, (e: KeyboardEvent, block: Block) => void> = {
		'block.split': handleEnter,
		'block.indent': handleTab,
		'block.outdent': handleShiftTab,
		'block.backspace': handleBackspace,
		'block.moveUp': handleArrowUp,
		'block.moveDown': handleArrowDown,
		'edit.undo': handleUndo,
		'edit.redo': handleRedo,
		'view.zoomIn': (e, block) => {
			e.preventDefault();
			if (!block.content.trim()) return; // no zoom into empty blocks
			handleZoom(block.id);
		},
		'view.zoomOut': (e) => {
			e.preventDefault();
			handleZoomOut();
		}
	};
</script>

<!-- Single delegation container — catches keydown from view spans AND contenteditables -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="editor"
	class:editor--selecting={dragActive}
	class:editor--intro={props.intro ?? false}
	bind:this={editorEl}
	onkeydown={handleEditorKeydown}
	onmousedown={onEditorMousedown}
	oncontextmenu={onEditorContextMenu}
>
	{#if selRect}
		<div class="selection-overlay" style="top: {selRect.top}px; height: {selRect.height}px;"></div>
	{/if}
	{#key zoomId ?? '__root__'}
		<div class="zoom-view">
			{#if zoomedBlock && effectiveZoomId}
				<ZoomHeader
					block={zoomedBlock}
					path={breadcrumb}
					onNavigate={handleZoomNavigate}
					onSaveContent={handleSaveContent}
					onCreateFirstChild={handleCreateFirstChild}
				/>
			{/if}
			{#if !effectiveZoomId && !captureZoneUsed}
				<!-- Persistent capture zone at the top of root: click → new first block, cursor in it -->
				<button class="capture-zone" onclick={handleCreateRootBlock}> What's on your mind? </button>
			{/if}
			{#each rootBlocks as block, i (block.id)}
				{#if zoomedBlock && effectiveZoomId}
					<BlockComponent
						{block}
						{childrenMap}
						depth={0}
						{autoEditRequest}
						registerEl={(id: string, el: HTMLDivElement) => blockEls.set(id, el)}
						onSaveContent={handleSaveContent}
						onToggleCollapse={handleToggleCollapse}
						onZoom={handleZoom}
					/>
				{:else}
					<div class="intro-wrap" style="--i: {i}">
						<BlockComponent
							{block}
							{childrenMap}
							depth={0}
							{autoEditRequest}
							registerEl={(id: string, el: HTMLDivElement) => blockEls.set(id, el)}
							onSaveContent={handleSaveContent}
							onToggleCollapse={handleToggleCollapse}
							onZoom={handleZoom}
						/>
					</div>
				{/if}
			{/each}

			{#if rootBlocks.length === 0 && effectiveZoomId}
				<button class="capture-zone" onclick={handleCreateFirstChild}>
					What's on your mind?
				</button>
			{/if}
		</div>
	{/key}
</div>

{#if selectionMenu}
	<SelectionMenu
		x={selectionMenu.x}
		y={selectionMenu.y}
		onAction={handleSelectionAction}
		onClose={clearSelection}
	/>
{/if}

<svelte:window
	onmousemove={onWindowMousemove}
	onmouseup={onWindowMouseup}
	onkeydown={onWindowKeydown}
	onresize={measureSelection}
/>

<style>
	.editor {
		max-width: 840px;
		margin: 2rem auto;
		padding: 0 1rem;
		position: relative;
	}
	/* Single continuous band behind the selected blocks.
	   First child of .editor → blocks paint above it, no z-index needed. */
	.selection-overlay {
		position: absolute;
		left: 1rem;
		right: 1rem;
		background: color-mix(in srgb, var(--color-accent) 15%, var(--color-fond));
		pointer-events: none;
	}
	/* Disable native text selection while drag-selecting blocks (applied after ~4px threshold) */
	.editor.editor--selecting,
	.editor.editor--selecting * {
		user-select: none !important;
	}
	/* Capture zone: a tall ghost row sitting where the next block will be born.
	   Used at root (top of the list) and in empty zoomed views. Left padding
	   aligns the text with block content (gutter = zoom-w 1.35rem + bullet-w 1.5rem).
	   Hover stays in the encre palette — discreet, like the breadcrumb crumbs. */
	.capture-zone {
		display: flex;
		align-items: center;
		width: 100%;
		min-height: 3.25rem;
		border: none;
		background: none;
		font: inherit;
		font-style: italic;
		text-align: left;
		cursor: text;
		padding: 2px 4px 2px 2.85rem;
		color: color-mix(in srgb, var(--color-encre) 38%, transparent);
		border-radius: 8px;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.capture-zone:hover {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
	}
	/* One-shot staggered entrance when the home hero docks into the top bar.
	   --i is the root-block index, set inline by the each block above. */
	.editor--intro .intro-wrap {
		animation: intro-in 0.45s ease both;
		/* Cap the delay: blocks past the 12th all start together (long trees
		   shouldn't keep distant blocks invisible for seconds) */
		animation-delay: calc(min(var(--i), 12) * 60ms);
	}
	@keyframes intro-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* --- Zoom animations --- */

	/* Out: scale down + fade before the view swaps. Applied to the current
	   .zoom-view by animateZoom() — the element is destroyed on remount,
	   so no cleanup is needed. */
	@keyframes zoom-out {
		to {
			opacity: 0;
			transform: scale(0.95);
		}
	}
	:global(.zoom-view--out) {
		animation: zoom-out 150ms ease forwards;
	}

	/* In: the new view appears with a brief scale + fade. Plays on each mount
	   inside {#key zoomId} — the remounts IS the trigger. */
	@keyframes zoom-in {
		from {
			opacity: 0;
			transform: scale(1.02);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	.zoom-view {
		animation: zoom-in 150ms ease;
	}
	/* No zoom-in on the initial page load — the intro stagger handles it. */
	.editor--intro .zoom-view {
		animation: none;
	}
</style>
