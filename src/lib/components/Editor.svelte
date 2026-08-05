<script lang="ts">
	import { tick } from 'svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
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
	import { comboFromEvent, type CommandId } from '$lib/keybindings';
	import { effectiveKeybindings } from '$lib/keybindings.svelte';
	import { UndoStack } from '$lib/undo';
	import type { Mutation, UndoEntry } from '$lib/undo';
	import {
		zoomTarget,
		cleanZoomUrl,
		zoomTo,
		zoomToRoot,
		saveScroll,
		restoreScroll
	} from '$lib/zoom.svelte';
	import { pushRecent } from '$lib/recent';
	import { tree } from '$lib/tree.svelte';
	import {
		MIME_DIPLE,
		buildPasteTree,
		clipboardRootsFromEvent,
		parseDipleJson,
		parsePlainText,
		readFromClipboard,
		serializeToDiple,
		writeToClipboard,
		type PasteBlock
	} from '$lib/clipboard';
	import { syncBegin, syncCommit, syncFail } from '$lib/sync.svelte';
	import { t } from '$lib/i18n.svelte';
	import { computeDropTarget, type DropTarget, type DropCtx } from '$lib/drop-target';

	let {
		blocks: initialBlocks,
		intro,
		onWorkIntent,
		collapseAll = $bindable<() => void>(() => {}),
		revealAll = $bindable<() => void>(() => {}),
		allCollapsed = $bindable(false)
	}: {
		blocks: Block[];
		intro?: boolean;
		onWorkIntent?: () => void;
		collapseAll?: () => void;
		revealAll?: () => void;
		allCollapsed?: boolean;
	} = $props();
	let blocks = $state(initialBlocks);
	tree.blocks = blocks;
	$effect(() => {
		tree.blocks = blocks;
	});

	// --- Zoom state ---
	// zoomTarget is a module-level $state singleton (see zoom.ts). It's updated
	// synchronously by zoomTo/zoomToRoot/cleanZoomUrl, so the {#key} swap is
	// immediate — no microtask gap where the out-animated old view would be stuck.
	//
	// Popstate (back/forward) and initial SSR load: sync from page.state.
	// SvelteKit restores page.state correctly on history navigation, and the
	// $effect reads it reactively.  pushState updates are handled by the
	// synchronous path (zoomTo writes zoomTarget.id before calling pushState)
	// so the $effect's write is a harmless no-op in that case.
	$effect(() => {
		// Only sync when page.state.zoom is explicitly set (popstate, pushState).
		// On direct URL loads (bookmark, typed URL), page.state.zoom is undefined
		// during hydration — +page.svelte already seeded zoomTarget.id from
		// data.zoomId, so we must NOT overwrite it with null.
		if (page.state.zoom !== undefined && page.state.zoom !== zoomTarget.id) {
			if (import.meta.env.DEV) {
				console.warn('[zoom:overwrite]', {
					target: zoomTarget.id,
					pageState: page.state.zoom
				});
			}
			zoomTarget.id = page.state.zoom;
		}
	});

	const zoomedBlock = $derived(
		zoomTarget.id ? (blocks.find((b) => b.id === zoomTarget.id) ?? null) : null
	);
	/** Falls back to null when zoomTarget.id is invalid (block deleted / stale URL). */
	const effectiveZoomId = $derived(zoomTarget.id && zoomedBlock ? zoomTarget.id : null);

	// Clean up the URL when the zoom target no longer exists (e.g. undone/deleted).
	$effect(() => {
		if (zoomTarget.id && !zoomedBlock) {
			if (import.meta.env.DEV) {
				console.warn('[zoom:clean]', { target: zoomTarget.id });
			}
			cleanZoomUrl();
		}
	});

	// --- Scroll management ---
	// Saves: navigateZoom() saves the OLD view's scroll before navigating out.
	// Restores: this effect fires after a zoom change. Dezoom → restored position.
	// Fresh zoom-in → scroll to the editor top (so the zoomed title is visible,
	// not the hero above). First mount on root → no scroll.

	let scrollFirstRun = true;

	/** Navbar clearance in px — reads --navbar-h (layout.css). Wide: "4.5rem",
	 *  narrow: a px-resolved calc(). Rem→px conversion covers the wide case. */
	function navbarClearance(): number {
		const raw = getComputedStyle(document.documentElement).getPropertyValue('--navbar-h').trim();
		const px = raw.endsWith('rem') ? parseFloat(raw) * 16 : parseFloat(raw);
		return Number.isFinite(px) ? px : 72;
	}

	function scrollToEditorTop() {
		if (!editorEl) return;
		const rect = editorEl.getBoundingClientRect();
		const y = rect.top + window.scrollY - navbarClearance();
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

	// Drag & drop (native HTML5): the diple starts it, the editor computes the
	// drop target and applies the move. dragRoots is non-empty only while a
	// drag is in flight.
	let dragRoots = $state<string[]>([]);
	let dropTarget = $state<DropTarget | null>(null);
	let dragImageEl: HTMLElement | null = null;
	let indentStepPx = 16;
	let expandTimer: ReturnType<typeof setTimeout> | undefined;
	let expandTimerId: string | null = null;
	let dragLeaveDepth = 0;

	// Position of the auto-open format menu (null = closed). Set on mouseup after a drag.
	let selectionMenu = $state<{ x: number; y: number } | null>(null);

	// --- Touch long-press (mobile) ---
	// Explicit timer — we don't rely on the browser's long-press → contextmenu
	// synthesis (unreliable on iOS text). On fire it opens the same SelectionMenu
	// as right-click; two flags neutralise the native side effects that follow:
	// the browser's own contextmenu (Android) and the click synthesized on finger
	// release (which would hit the menu's backdrop and close it).
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressStart: { x: number; y: number; id: string } | null = null;
	let suppressMenuUntil = 0;
	let suppressNextClick = false;

	function clearLongPress() {
		if (longPressTimer) clearTimeout(longPressTimer);
		longPressTimer = null;
		longPressStart = null;
	}

	function openTouchMenu(id: string, x: number, y: number) {
		clearLongPress();
		// Same path as right-click: the block becomes the sole selection.
		selectedIds = new Set([id]);
		selectionMenu = { x, y };
		// Swallow the browser's native contextmenu that follows a long-press
		// (Android) so it can't open a second menu.
		suppressMenuUntil = Date.now() + 1500;
		// Swallow the click synthesized on finger release — it would land on the
		// menu's backdrop and close the menu before the user picks an action.
		suppressNextClick = true;
	}

	/**
	 * Touch pointer press on a block: arm the 500ms long-press timer.
	 * Excluded: edit surfaces (contenteditable), links, and buttons (bullet,
	 * collapse) — those have their own tap behaviour.
	 */
	function onEditorPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		if ((e.target as HTMLElement).closest('[contenteditable="true"], button, a, input, textarea'))
			return;
		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		const id = blockEl?.getAttribute('data-block-id');
		if (!id) return;
		clearLongPress();
		longPressStart = { x: e.clientX, y: e.clientY, id };
		longPressTimer = setTimeout(() => openTouchMenu(id, e.clientX, e.clientY), 500);
	}

	/** Any new touch press cancels the post-long-press click suppression. */
	function onWindowPointerDown() {
		suppressNextClick = false;
	}

	/** Finger moved > 12px = scroll intent, not a long-press. */
	function onWindowPointerMove(e: PointerEvent) {
		if (e.pointerType !== 'touch' || !longPressTimer || !longPressStart) return;
		const dx = e.clientX - longPressStart.x;
		const dy = e.clientY - longPressStart.y;
		if (dx * dx + dy * dy > 144) clearLongPress();
	}

	function onWindowPointerEnd(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		clearLongPress();
	}

	/** Window-level capture: swallow the click synthesized after a long-press
	 *  release — it would otherwise land on the open menu's backdrop and close
	 *  it. Cleared by the next pointer press (onWindowPointerDown). */
	function onWindowClickCapture(e: MouseEvent) {
		if (suppressNextClick) {
			suppressNextClick = false;
			e.preventDefault();
			e.stopPropagation();
		}
	}

	// Hidden textarea that receives native paste events when blocks are selected
	// (see onWindowKeydown) — reading e.clipboardData needs no permission.
	let clipCatcherEl: HTMLTextAreaElement | undefined = $state();

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

	$effect(() => {
		if (!import.meta.env.DEV) return;
		console.info('[zoom:view]', {
			target: zoomTarget.id,
			found: zoomedBlock?.id ?? null,
			effective: effectiveZoomId,
			roots: rootBlocks.map((block) => block.id)
		});
	});

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

	/** True when every parent in the visible tree is collapsed. */
	const isAllCollapsed = $derived.by(() => {
		function walk(parentId: string | null): boolean {
			const kids = childrenMap.get(parentId) ?? [];
			for (const kid of kids) {
				const hasChildren = (childrenMap.get(kid.id)?.length ?? 0) > 0;
				if (hasChildren) {
					if (kid.collapsed === 0) return false;
					if (!walk(kid.id)) return false;
				}
			}
			return true;
		}
		return walk(effectiveZoomId);
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

	/**
	 * Drop indicator position relative to .editor. Re-computed on every
	 * dragover (dropTarget is a fresh object each time), so the editor rect is
	 * always current — same pattern as the selection overlay.
	 */
	const indicatorPos = $derived.by(() => {
		if (!dropTarget || !editorEl) return null;
		const r = editorEl.getBoundingClientRect();
		return { top: dropTarget.indicatorY - r.top, left: dropTarget.indicatorX - r.left };
	});

	// Sync bindable props to parent so the page/Navbar can read them.
	$effect(() => {
		collapseAll = handleCollapseAll;
		revealAll = handleRevealAll;
		allCollapsed = isAllCollapsed;
	});

	function getSiblings(parentId: string | null): Block[] {
		return blocks.filter((b) => b.parent_id === parentId).sort((a, b) => a.position - b.position);
	}

	// --- API helpers ---

	/**
	 * Surface server failures in devtools, then throw. Callers apply changes
	 * optimistically before the API responds — a swallowed error would leave the
	 * client believing a change is saved when the server never saw it.
	 */
	function checkRes(res: Response, label: string) {
		if (!res.ok) {
			console.error(`[api] ${label} failed: ${res.status} ${res.statusText}`);
			throw new Error(`${label}: ${res.status} ${res.statusText}`);
		}
	}

	/**
	 * Wrap a mutation fetch so the sync dot tracks it: pendingLocal++ while in
	 * flight, -- on ack, offline on failure. checkRes lives here — a non-ok
	 * response is a failure like any network error.
	 */
	async function tracked(label: string, request: Promise<Response>): Promise<Response> {
		syncBegin();
		try {
			const res = await request;
			checkRes(res, label);
			syncCommit();
			return res;
		} catch (e) {
			syncFail();
			throw e;
		}
	}

	async function apiCreate(
		parent_id: string | null,
		content: string,
		position: number,
		id?: string
	): Promise<Block> {
		const res = await tracked(
			`POST /api/blocks (${id ?? 'new'})`,
			fetch('/api/blocks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ parent_id, content, position, id })
			})
		);
		return res.json();
	}

	async function apiMove(id: string, parent_id: string | null, position: number) {
		await tracked(
			`PATCH move ${id}`,
			fetch(`/api/blocks/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ parent_id, position })
			})
		);
	}

	async function apiUpdateContent(id: string, content: string) {
		await tracked(
			`PATCH content ${id}`,
			fetch(`/api/blocks/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content })
			})
		);
	}

	async function apiDelete(id: string) {
		await tracked(`DELETE ${id}`, fetch(`/api/blocks/${id}`, { method: 'DELETE' }));
	}

	async function apiSetCollapsed(id: string, collapsed: boolean) {
		await tracked(
			`PATCH collapsed ${id}`,
			fetch(`/api/blocks/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ collapsed: collapsed ? 1 : 0 })
			})
		);
	}

	// --- Sync failure feedback ---

	/** Non-null while a sync-error toast is visible. */
	let syncError = $state<string | null>(null);
	let syncErrorTimer: ReturnType<typeof setTimeout> | undefined;

	/** Brief toast for failed server round-trips — optimistic UI must never fail silently. */
	function showSyncError(message: string) {
		syncError = message;
		clearTimeout(syncErrorTimer);
		syncErrorTimer = setTimeout(() => (syncError = null), 5000);
	}

	/**
	 * Fire-and-forget content save with rollback. On failure, restores `before`
	 * only if the block wasn't edited since — newer keystrokes always win.
	 */
	async function saveContentWithRollback(id: string, before: string, after: string) {
		try {
			await apiUpdateContent(id, after);
		} catch {
			const blk = blocks.find((b) => b.id === id);
			if (blk && blk.content === after) {
				blk.content = before;
				blocks = [...blocks];
				showSyncError(t('editor.errReverted'));
			} else {
				showSyncError(t('editor.errKept'));
			}
		}
	}

	// --- Callbacks ---

	function handleToggleCollapse(id: string) {
		const block = blocks.find((b) => b.id === id);
		if (!block) return;
		block.collapsed = block.collapsed ? 0 : 1;
		const applied = block.collapsed;
		blocks = [...blocks];
		apiSetCollapsed(id, applied === 1).catch(() => {
			// Revert only if the user hasn't toggled again since
			if (block.collapsed === applied) {
				block.collapsed = applied ? 0 : 1;
				blocks = [...blocks];
			}
			showSyncError(t('editor.errReverted'));
		});
	}

	async function apiSetCollapsedBatch(items: { id: string; collapsed: number }[]) {
		await tracked(
			'POST /api/blocks/batch-collapse',
			fetch('/api/blocks/batch-collapse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ items })
			})
		);
	}

	/** One transaction for the whole pasted subtree — see createBlocksBatch. */
	async function apiCreateBatch(blocks: Block[]) {
		await tracked(
			'POST /api/blocks/batch-create',
			fetch('/api/blocks/batch-create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					blocks: blocks.map((b) => ({
						id: b.id,
						parent_id: b.parent_id,
						content: b.content,
						position: b.position,
						collapsed: b.collapsed
					}))
				})
			})
		);
	}

	/**
	 * Collect every block reachable from `roots` via childrenMap (the full
	 * visible subtree), regardless of current collapsed state.
	 */
	function collectSubtree(roots: Block[]): Block[] {
		const result: Block[] = [];
		function walk(list: Block[]) {
			for (const b of list) {
				result.push(b);
				const kids = childrenMap.get(b.id);
				if (kids) walk(kids);
			}
		}
		walk(roots);
		return result;
	}

	function handleCollapseAll() {
		const all = collectSubtree(rootBlocks);
		const items: { id: string; collapsed: number }[] = [];
		for (const b of all) {
			const kids = childrenMap.get(b.id);
			if (kids && kids.length > 0) {
				b.collapsed = 1;
				items.push({ id: b.id, collapsed: 1 });
			}
		}
		if (items.length === 0) return;
		blocks = [...blocks];
		apiSetCollapsedBatch(items).catch(() => showSyncError(t('editor.errCollapse')));
	}

	function handleRevealAll() {
		const all = collectSubtree(rootBlocks);
		const items: { id: string; collapsed: number }[] = [];
		for (const b of all) {
			const kids = childrenMap.get(b.id);
			if (kids && kids.length > 0 && b.collapsed === 1) {
				b.collapsed = 0;
				items.push({ id: b.id, collapsed: 0 });
			}
		}
		if (items.length === 0) return;
		blocks = [...blocks];
		apiSetCollapsedBatch(items).catch(() => showSyncError(t('editor.errReveal')));
	}

	/**
	 * Synchronous zoom navigation — editor-initiated zooms (button, keyboard,
	 * breadcrumb, home).  Saves the current scroll position, then calls zoomTo
	 * or zoomToRoot synchronously.  zoomTarget.id is updated before pushState
	 * (see zoom.svelte.ts), so the {#key} block swaps in the same microtask —
	 * no async gap that could leave the old view stuck in a broken state.
	 *
	 * Palette and sidebar also call zoomTo directly without going through
	 * this wrapper, which is fine — saveScroll is only needed for editor
	 * zooms where the user may dezoom and expect to find their old scroll.
	 */
	function navigateZoom(targetId: string | null) {
		saveScroll(effectiveZoomId ?? '__root__', window.scrollY);
		if (targetId === null) zoomToRoot();
		else zoomTo(targetId);
	}

	/** Zoom navigation (breadcrumb click): ancestor id → zoom to it; null → root. */
	function handleZoomNavigate(id: string | null) {
		navigateZoom(id);
	}

	/** Zoom into a block (hover button or Alt+→). */
	function handleZoom(id: string) {
		navigateZoom(id);
		const blk = blocks.find((b) => b.id === id);
		if (blk) pushRecent({ id: blk.id, content: blk.content, path: pathToRoot(blk) });
	}

	/** Dezoom one level: zoom to the parent of the current zoom root, or Home. */
	function handleZoomOut() {
		// No-op at root — avoids a redundant history entry
		if (!effectiveZoomId) return;
		const target = zoomedBlock?.parent_id ?? null;
		navigateZoom(target);
	}

	/**
	 * Build breadcrumb path (root → direct parent) for a block, for recents.
	 * Uses the live blocks array — no DB call needed.
	 */
	function pathToRoot(block: Block): { id: string; content: string }[] {
		const path: { id: string; content: string }[] = [];
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- utility, not reactive
		const seen = new Set<string>([block.id]);
		let cursor = block.parent_id;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			const parent = blocks.find((b) => b.id === cursor);
			if (!parent) break;
			path.unshift({ id: parent.id, content: parent.content });
			cursor = parent.parent_id;
		}
		return path;
	}

	/**
	 * Called when Enter is pressed while editing the zoomed-block title.
	 * Creates a new empty block as the first child of the zoomed block,
	 * shifts existing children, and focuses the new block.
	 */
	async function handleCreateFirstChild() {
		if (!zoomedBlock) return;
		const parentId = zoomedBlock.id;

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
		} catch {
			removeBlockLocal(newBlock);
			if (autoEditRequest?.id === newBlock.id) autoEditRequest = null;
			showSyncError(t('editor.errReverted'));
		} finally {
			inflight--;
		}
	}

	/**
	 * Capture zone at the top of the root view: creates a new empty block at
	 * position 0 (newest on top — the "stream" flow), focuses it for typing.
	 */
	async function handleCreateRootBlock() {
		onWorkIntent?.();
		captureZoneUsed = true;

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
		} catch {
			removeBlockLocal(newBlock);
			if (autoEditRequest?.id === newBlock.id) autoEditRequest = null;
			showSyncError(t('editor.errReverted'));
		} finally {
			inflight--;
		}
	}

	/**
	 * Any click inside the editor (capture zone, block, empty space) signals
	 * work intent — the hero should be dismissed.
	 *
	 * We use `onclick`, not `onfocusin`: mousedown gives the browser focus to
	 * the clicked element, which would fire focusin and trigger the dismiss
	 * *before* the click event.  The hero unmount shifts the layout mid-click,
	 * causing the click to land on a different element — the capture zone's
	 * own handler never runs.
	 */
	function handleClickIntent() {
		onWorkIntent?.();
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
		saveContentWithRollback(id, before, after);
		if (before !== after) {
			recordEntry(
				[{ kind: 'update', id, before, after }],
				{ id, offset: before.length },
				{ id, offset: caret ?? after.length }
			);
		}
		// Push edited block to recents so it shows in the command palette
		const blk = blocks.find((b) => b.id === id);
		if (blk) pushRecent({ id: blk.id, content: after, path: pathToRoot(blk) });
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
					// Live lookup: earlier mutations of the same replay may have
					// shifted positions since this one was recorded.
					const live = blocks.find((b) => b.id === blk.id) ?? blk;
					removeBlockLocal(live);
					if (m.descendants?.length) {
						const ids = m.descendants.map((d) => d.id);
						blocks = blocks.filter((b) => !ids.includes(b.id));
					}
					await apiDelete(blk.id);
				} else {
					// Restore the subtree parents-first: each create references an
					// existing parent (FK), and position shifts stay correct with
					// siblings coming back in ascending position order.
					insertBlockLocal(blk);
					await apiCreate(blk.parent_id, blk.content, blk.position, blk.id);
					// createBlock resets collapsed server-side — re-apply the recorded state
					if (blk.collapsed === 1) await apiSetCollapsed(blk.id, true);
					for (const d of m.descendants ?? []) {
						insertBlockLocal(d);
						await apiCreate(d.parent_id, d.content, d.position, d.id);
						if (d.collapsed === 1) await apiSetCollapsed(d.id, true);
					}
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
		const cmd = effectiveKeybindings()[comboFromEvent(e)];
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
				// No-op (zoom boundary) or rolled back — nothing to record
				if (!(await outdent(block, 0))) return;
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
			} finally {
				inflight--;
			}
			return;
		}

		// Cursor at position 0 on a non-empty block: nothing to split — insert an
		// empty sibling above at the same level. (Without this, Enter at the start
		// of a block with visible children would push the entire block down as a
		// child.) Empty blocks fall through to the standard split: new sibling
		// below, caret moves into it.
		if (cursorPos === 0 && text.length > 0) {
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
			} catch {
				removeBlockLocal(newBlock);
				if (autoEditRequest?.id === newBlock.id) autoEditRequest = null;
				showSyncError(t('editor.errReverted'));
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
			// Create first, then truncate: if the create fails, nothing was persisted
			// server-side and the rollback below is exact.
			await apiCreate(targetParentId, after, newPos, newBlock.id);
			await apiUpdateContent(block.id, before);
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
		} catch {
			removeBlockLocal(newBlock);
			// Best-effort server cleanup in case the create went through before a
			// later step failed (deleting a never-created id is a silent no-op).
			void apiDelete(newBlock.id).catch(() => undefined);
			// Restore the full text only if the user hasn't typed since
			if (block.content === before) {
				block.content = text;
				el.textContent = text;
			}
			if (autoEditRequest?.id === newBlock.id) autoEditRequest = null;
			showSyncError(t('editor.errReverted'));
		} finally {
			inflight--;
		}
	}

	/**
	 * Returns true when the move was persisted. On API failure the block is
	 * moved back locally and false is returned, so callers skip the undo entry.
	 */
	async function indent(block: Block, caret: number): Promise<boolean> {
		const siblings = getSiblings(block.parent_id);
		const idx = siblings.findIndex((b) => b.id === block.id);
		if (idx <= 0) return false;

		const newParent = siblings[idx - 1];
		const from = { parent_id: block.parent_id, position: block.position };

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
		try {
			await apiMove(block.id, newParent.id, newPos);
			return true;
		} catch {
			moveBlockLocal(block, from.parent_id, from.position);
			showSyncError(t('editor.errReverted'));
			return false;
		}
	}

	/** Same contract as indent: true when persisted, false after rollback/no-op. */
	async function outdent(block: Block, caret: number): Promise<boolean> {
		if (block.parent_id === null) return false;

		// Zoom boundary: children of the zoom root can't outdent past it — they'd
		// move to an invisible parent and disappear from the current view.
		if (block.parent_id === effectiveZoomId) return false;

		const parent = blocks.find((b) => b.id === block.parent_id);
		if (!parent) return false;

		const from = { parent_id: block.parent_id, position: block.position };
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
		try {
			await apiMove(block.id, grandParentId, newPos);
			return true;
		} catch {
			moveBlockLocal(block, from.parent_id, from.position);
			showSyncError(t('editor.errReverted'));
			return false;
		}
	}

	async function handleTab(e: KeyboardEvent, block: Block) {
		e.preventDefault();
		const caret = window.getSelection()?.focusOffset ?? 0;
		const from = { parent_id: block.parent_id, position: block.position };
		if (!(await indent(block, caret))) return;
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
		if (!(await outdent(block, caret))) return;
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
			if (!(await outdent(block, 0))) return;
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
			// Never cascade-delete a subtree via backspace: a block with children
			// is undeletable here (server cascades, undo can't restore descendants).
			const kids = childrenMap.get(block.id) ?? [];
			if (kids.length > 0) return;

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

			try {
				await apiDelete(block.id);
			} catch {
				insertBlockLocal(block);
				showSyncError(t('editor.errReverted'));
				return;
			}

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
					try {
						await apiDelete(prev.id);
					} catch {
						insertBlockLocal(prev);
						showSyncError(t('editor.errReverted'));
						return;
					}
					recordEntry(
						[{ kind: 'delete', block: { ...prev } }],
						{ id: block.id, offset: 0 },
						{ id: block.id, offset: 0 }
					);
				}
			}
		}
	}

	/**
	 * Arrow keys navigate BETWEEN blocks, not line-by-line inside them (blocks
	 * are single-line). The caret lands on the neighbor at the closest position
	 * to where it was — clamped to the neighbor's length. On the first block
	 * (up) or last block (down) there is no neighbor: let the browser handle it
	 * (caret to line start/end — still useful inside a long wrapped block).
	 */
	async function handleArrowUp(e: KeyboardEvent, block: Block) {
		const el = blockEls.get(block.id);
		if (!el) return;

		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;

		const idx = flatIndex.get(block.id);
		if (idx === undefined || idx <= 0) return; // no block above → native

		e.preventDefault();
		const prev = flatBlocks[idx - 1];
		autoEditRequest = { id: prev.id, caret: Math.min(cursorPos, prev.content.length) };
		await tick();
		autoEditRequest = null;
	}

	async function handleArrowDown(e: KeyboardEvent, block: Block) {
		const el = blockEls.get(block.id);
		if (!el) return;

		const sel = window.getSelection();
		const cursorPos = sel?.focusOffset ?? 0;

		const idx = flatIndex.get(block.id);
		if (idx === undefined || idx >= flatBlocks.length - 1) return; // no block below → native

		e.preventDefault();
		const next = flatBlocks[idx + 1];
		autoEditRequest = { id: next.id, caret: Math.min(cursorPos, next.content.length) };
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
		// Don't interfere with the diple — it's the drag handle, and the native
		// drag & drop takes the gesture over (no selection-drag from here).
		if ((e.target as HTMLElement).closest('.bullet')) return;

		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		if (!blockEl) return;

		const id = blockEl.getAttribute('data-block-id');
		if (!id) return;

		clearSelection();
		dragPotential = true;
		dragAnchorId = id;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		// Block-selection is the only drag in view mode: apply user-select:none
		// immediately so the browser never starts a native text selection inside
		// the blocks — it would otherwise survive the drag in some browsers and
		// end up coexisting with the block selection.
		editorEl?.classList.add('editor--selecting');
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
		// No removeAllRanges here: a text caret is a collapsed selection, and
		// wiping it on every mouseup would erase the caret of a contenteditable
		// being edited. The user-select:none class (added on mousedown) already
		// prevents text selections from forming during a block drag.
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

	// --- Drag & drop (native HTML5, initiated from the diple) ---

	/**
	 * Called from the bullet's dragstart (Block.svelte). Snapshots the dragged
	 * roots ONCE: a block inside an active selection drags the whole selection
	 * (its top-level roots, flat order — Workflowy behavior). The custom drag
	 * image replaces the tiny diple snapshot the browser would otherwise use.
	 */
	function handleDragStart(id: string, e: DragEvent) {
		// Block.svelte already guards dataTransfer in its own dragstart handler;
		// this guard satisfies TS strict (nullable dataTransfer).
		if (!e.dataTransfer) return;
		dragRoots = selectedIds.has(id) ? topLevelSelectedIds() : [id];
		selectionMenu = null;
		cancelExpandTimer();
		dropTarget = null;
		indentStepPx = measureIndentStep();
		const blk = blocks.find((b) => b.id === id);
		const label =
			dragRoots.length > 1
				? t('editor.points', { n: dragRoots.length })
				: blk?.content.trim() || '…';
		e.dataTransfer.setDragImage(buildDragImage(label), 12, 12);
	}

	/** A pill with the dragged content — the native ghost would be a bare diple. */
	function buildDragImage(label: string): HTMLElement {
		const el = document.createElement('div');
		el.style.cssText =
			'position:absolute;left:-9999px;top:0;background:var(--color-surface);' +
			'border:1px solid color-mix(in srgb, var(--color-encre) 15%, transparent);' +
			'border-radius:6px;padding:4px 10px;box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
			'font-size:0.875rem;color:var(--color-encre);max-width:240px;' +
			'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
		el.textContent = label;
		document.body.appendChild(el);
		dragImageEl = el;
		return el;
	}

	/** 1rem of indent, measured from two rendered depths — fallback 16px. */
	function measureIndentStep(): number {
		const left = (depth: number) =>
			document.querySelector(`[data-depth="${depth}"] .block-content-wrap`)?.getBoundingClientRect()
				.left;
		const l0 = left(0);
		const l1 = left(1);
		const l2 = left(2);
		if (l0 !== undefined && l1 !== undefined) return l1 - l0;
		if (l1 !== undefined && l2 !== undefined) return l2 - l1;
		return 16;
	}

	/** Geometry helpers the drop-target module reads (viewport px). */
	function blockRowRect(id: string): { top: number; bottom: number } | null {
		const el = document.querySelector(`[data-block-id="${id}"]`);
		const row = el?.querySelector(':scope > .block-row') ?? el;
		const r = row?.getBoundingClientRect();
		return r ? { top: r.top, bottom: r.bottom } : null;
	}
	/** The content column, not the gutter — .block-content-wrap is always visible
	 *  (the view span hides while its block is being edited). */
	function contentLeftOf(id: string): number | null {
		const el = document.querySelector(`[data-block-id="${id}"] .block-content-wrap`);
		const r = el?.getBoundingClientRect();
		return r ? r.left : null;
	}

	function dropCtx(): DropCtx {
		return {
			blocks,
			flatBlocks,
			childrenMap,
			dragRootIds: new Set(dragRoots),
			minDepth: effectiveZoomId ? 1 : 0,
			indentStepPx,
			getRowRect: blockRowRect,
			contentLeftOf
		};
	}

	function handleDragOver(e: DragEvent) {
		if (dragRoots.length === 0 || !e.dataTransfer) return; // foreign drags keep their own behavior
		const target = computeDropTarget(e.clientX, e.clientY, dropCtx());
		dropTarget = target;
		if (target) {
			// preventDefault marks the editor as a drop target; without it the
			// browser shows the no-drop cursor and no drop event fires.
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			scheduleAutoExpand(target);
		} else {
			cancelExpandTimer();
		}
	}

	/**
	 * The drop lands inside a collapsed block — expand it after a short dwell
	 * so the user sees where it will land (Workflowy behavior). Only when the
	 * collapsed block is the drop PARENT (child insertion); a same-level drop
	 * beside it needs no expansion.
	 */
	function scheduleAutoExpand(target: DropTarget) {
		const parent = target.parentId ? blocks.find((b) => b.id === target.parentId) : undefined;
		if (parent && parent.collapsed === 1 && (childrenMap.get(parent.id)?.length ?? 0) > 0) {
			if (expandTimerId !== parent.id) {
				cancelExpandTimer();
				expandTimerId = parent.id;
				expandTimer = setTimeout(() => expandBlock(parent.id), 600);
			}
		} else {
			cancelExpandTimer();
		}
	}

	function cancelExpandTimer() {
		if (expandTimer) {
			clearTimeout(expandTimer);
			expandTimer = undefined;
			expandTimerId = null;
		}
	}

	/** Optimistic expand with rollback — mirrors handleToggleCollapse. */
	function expandBlock(id: string) {
		const blk = blocks.find((b) => b.id === id);
		if (!blk || blk.collapsed === 0) return;
		blk.collapsed = 0;
		blocks = [...blocks];
		apiSetCollapsed(id, false).catch(() => {
			if (blk.collapsed === 0) {
				blk.collapsed = 1;
				blocks = [...blocks];
			}
			showSyncError(t('editor.errReverted'));
		});
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		if (dragRoots.length === 0 || !dropTarget) return;
		const target = dropTarget;
		dropTarget = null;
		cancelExpandTimer();
		await applyDrop(target);
	}

	/**
	 * Apply the drop: the roots move sequentially to consecutive slots under
	 * the target parent, keeping their relative order. Optimistic local moves
	 * first, then one API call per root; any failure restores the snapshot
	 * (pasteRoots pattern) and records nothing, so undo stays clean.
	 */
	async function applyDrop(target: DropTarget) {
		const roots = dragRoots
			.map((id) => blocks.find((b) => b.id === id))
			.filter((b): b is Block => b !== undefined);
		if (roots.length === 0) return;

		// from-positions must be captured before the local moves mutate the blocks.
		const from = roots.map((r) => ({ parent_id: r.parent_id, position: r.position }));
		const snapshot = blocks.map((b) => ({ ...b }));

		try {
			for (let i = 0; i < roots.length; i++) {
				moveBlockLocal(roots[i], target.parentId, target.position + i);
			}
			for (let i = 0; i < roots.length; i++) {
				await apiMove(roots[i].id, target.parentId, target.position + i);
			}
		} catch {
			blocks = snapshot;
			showSyncError(t('editor.errMove'));
			return;
		}

		recordEntry(
			roots.map(
				(root, i) =>
					({
						kind: 'move',
						id: root.id,
						from: from[i],
						to: { parent_id: target.parentId, position: target.position + i }
					}) as Mutation
			),
			{ id: roots[0].id, offset: 0 },
			{ id: roots[0].id, offset: 0 }
		);
		// The selection stays selected after a move — it's still contiguous and
		// the overlay re-measures to the new position.
	}

	function handleDragEnter() {
		dragLeaveDepth++;
	}

	function handleDragLeave() {
		dragLeaveDepth--;
		if (dragLeaveDepth <= 0) {
			dragLeaveDepth = 0;
			dropTarget = null;
			cancelExpandTimer();
		}
	}

	/** Fires on the source after drop OR cancel (Esc) — teardown either way. */
	function handleDragEnd() {
		dropTarget = null;
		dragRoots = [];
		dragLeaveDepth = 0;
		cancelExpandTimer();
		if (dragImageEl) {
			dragImageEl.remove();
			dragImageEl = null;
		}
	}

	/**
	 * Right-click on a block (selected or not) → select it (or keep the existing selection)
	 * and open the format menu. Right-click in edit mode → browser default (spellcheck, paste).
	 * Right-click on empty space → clear selection + browser default.
	 */
	function onEditorContextMenu(e: MouseEvent) {
		// Don't hijack the native context menu when editing text
		if ((e.target as HTMLElement).closest('[contenteditable="true"]')) return;

		// A native contextmenu right after our own long-press (Android) —
		// suppress it without opening a second menu.
		if (Date.now() < suppressMenuUntil) {
			e.preventDefault();
			return;
		}

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
	 * The selected blocks that have no selected ancestor — the roots of the
	 * selection. Descendants always travel with their root, so every selection
	 * action (copy/cut/delete) only needs to address these. Sorted in flat
	 * (visual) order so the clipboard contents and paste targets match the screen.
	 */
	function topLevelSelectedIds(): string[] {
		const top: string[] = [];
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
			if (!isDescendant) top.push(id);
		}
		return top.sort((a, b) => (flatIndex.get(a) ?? 0) - (flatIndex.get(b) ?? 0));
	}

	/**
	 * Delete a set of blocks (with their descendants) both client-side and server-side.
	 * Only calls API for top-level blocks — descendants are handled by FK cascade.
	 * Recorded as one undo entry: a delete mutation per root, each carrying its
	 * whole subtree so undo can restore it.
	 */
	async function deleteBlocks(ids: Iterable<string>) {
		// Find top-level blocks (those without an ancestor in the same set)
		const topLevelIds: string[] = [];
		for (const id of ids) {
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

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, not in reactive context
		const toRemove = new Set<string>();
		/** Subtree copies, parents first and siblings in position order — undo's replay order. */
		function subtreeOf(root: Block): Block[] {
			const subtree: Block[] = [];
			function collect(blk: Block) {
				subtree.push({ ...blk });
				toRemove.add(blk.id);
				for (const kid of childrenMap.get(blk.id) ?? []) collect(kid);
			}
			collect(root);
			return subtree;
		}

		const roots = topLevelIds
			.map((id) => blocks.find((b) => b.id === id))
			.filter((b): b is Block => b !== undefined);
		if (roots.length === 0) return;

		const mutations: Mutation[] = roots.map((root): Mutation => {
			const subtree = subtreeOf(root);
			return { kind: 'delete', block: subtree[0], descendants: subtree.slice(1) };
		});

		// Snapshot for rollback: a failed delete loop must not leave partial state
		const snapshot = blocks.map((b) => ({ ...b }));
		clearSelection();

		// Optimistic: drop the subtrees, then close the position gaps among the
		// remaining siblings of every affected parent — mirrors the server's
		// per-delete renumbering (this used to drift until the next reload).
		const affectedParents = roots.map((r) => r.parent_id);
		blocks = blocks.filter((b) => !toRemove.has(b.id));
		for (const pid of affectedParents) {
			getSiblings(pid).forEach((sib, i) => (sib.position = i));
		}
		blocks = [...blocks];

		// Delete top-level blocks via API — FK ON DELETE CASCADE handles server-side children
		try {
			for (const id of topLevelIds) {
				await apiDelete(id);
			}
		} catch {
			blocks = snapshot;
			showSyncError(t('editor.errDelete'));
			return;
		}

		// Focus the first restored root after an undo
		recordEntry(mutations, { id: roots[0].id, offset: 0 }, { id: roots[0].id, offset: 0 });
	}

	/** Delete the currently selected blocks (drag selection, Backspace/Delete, menu). */
	function deleteSelectedBlocks() {
		return deleteBlocks(selectedIds);
	}

	// --- Clipboard: copy / cut / paste ---

	/**
	 * Copy the selected blocks (with their subtrees) into the clipboard: diple's
	 * JSON format (structure-preserving) plus tab-indented plain text. Writing
	 * the system clipboard is best-effort; the session buffer covers same-tab
	 * pastes either way.
	 */
	function copySelectedBlocks() {
		const roots = topLevelSelectedIds()
			.map((id) => blocks.find((b) => b.id === id))
			.filter((b): b is Block => b !== undefined);
		if (roots.length === 0) return;
		writeToClipboard(serializeToDiple(buildPasteTree(roots, childrenMap)));
	}

	/** Copy, then delete — the two halves of a cut land as separate undo entries. */
	async function cutSelectedBlocks() {
		copySelectedBlocks();
		await deleteSelectedBlocks();
	}

	/**
	 * Paste target when blocks are selected: right after the LAST selected block
	 * (in flat order), at that block's level. Drag selections are always a
	 * contiguous flat range, so "last" is well-defined; pasting into a deep
	 * selection lands inside that block's parent, mirroring where the anchor
	 * sits.
	 */
	function selectionPasteTarget(): { parentId: string | null; position: number } | null {
		const last = [...selectedIds]
			.map((id) => blocks.find((b) => b.id === id))
			.filter((b): b is Block => b !== undefined)
			.sort((a, b) => (flatIndex.get(a.id) ?? 0) - (flatIndex.get(b.id) ?? 0))
			.at(-1);
		if (!last) return null;
		return { parentId: last.parent_id, position: last.position + 1 };
	}

	/**
	 * Insert a clipboard tree as siblings starting at `position` under
	 * `parentId`, structure preserved. New UUIDs are minted — a paste is always
	 * a fresh copy. The flat insertion list is parents-first (each child
	 * references an existing parent, and insertBlockLocal shifts by insert), and
	 * each sibling group carries final, distinct ascending positions so the
	 * per-insert shifting never reorders the pasted rows. One undo entry with a
	 * create mutation per block.
	 */
	async function pasteRoots(parentId: string | null, position: number, roots: PasteBlock[]) {
		const created: Block[] = [];
		function walk(list: PasteBlock[], targetParentId: string | null, basePos: number) {
			list.forEach((node, i) => {
				const blk: Block = {
					id: crypto.randomUUID(),
					parent_id: targetParentId,
					content: node.content,
					position: basePos + i,
					collapsed: node.collapsed,
					created_at: Date.now()
				};
				created.push(blk);
				walk(node.children, blk.id, 0);
			});
		}
		walk(roots, parentId, position);

		const snapshot = blocks.map((b) => ({ ...b }));
		clearSelection();
		for (const blk of created) insertBlockLocal(blk);

		try {
			await apiCreateBatch(created);
		} catch {
			blocks = snapshot;
			showSyncError(t('editor.errPaste'));
			return;
		}

		recordEntry(
			created.map((blk) => ({ kind: 'create', block: { ...blk } }) as Mutation),
			{ id: created[0].id, offset: 0 },
			{ id: created[0].id, offset: 0 }
		);
	}

	/**
	 * Resolve a paste with the current selection: drop the tree after the last
	 * selected block — or at the end of the current view's roots when nothing
	 * is selected (no anchor case). `roots` may be passed in when the caller
	 * already read the clipboard (the catcher textarea); otherwise the
	 * clipboard is read here (menu "Coller" path, permission required).
	 */
	async function pasteAtSelection(roots?: PasteBlock[]) {
		const resolved = roots ?? (await readFromClipboard());
		if (!resolved || resolved.length === 0) return;
		const target = selectionPasteTarget();
		if (target) await pasteRoots(target.parentId, target.position, resolved);
		else
			await pasteRoots(effectiveZoomId, (childrenMap.get(effectiveZoomId) ?? []).length, resolved);
	}

	/**
	 * "•••" menu actions: address one block's whole subtree. Copy/cut write the
	 * subtree to the clipboard; paste inserts after the block; delete cascades
	 * like the multi-block delete (same undo entry).
	 */
	async function handleBlockClipboardAction(id: string, action: FormatAction) {
		const block = blocks.find((b) => b.id === id);
		if (!block) return;
		switch (action) {
			case 'copy':
				writeToClipboard(serializeToDiple(buildPasteTree([block], childrenMap)));
				break;
			case 'cut': {
				writeToClipboard(serializeToDiple(buildPasteTree([block], childrenMap)));
				await deleteBlocks([id]);
				break;
			}
			case 'paste': {
				const roots = await readFromClipboard();
				if (roots && roots.length > 0) await pasteRoots(block.parent_id, block.position + 1, roots);
				break;
			}
			case 'delete':
				await deleteBlocks([id]);
				break;
			default:
				break; // formatting actions never arrive here
		}
	}

	/**
	 * Paste handler of the hidden catcher textarea. Receives the native paste
	 * event when blocks are selected (the keydown focused the catcher instead
	 * of preventDefaulting). e.clipboardData is readable without any clipboard
	 * permission; then the paste lands after the last selected block and focus
	 * returns to the document.
	 */
	function handleClipCatcherPaste(e: ClipboardEvent) {
		e.preventDefault();
		const roots = clipboardRootsFromEvent(e.clipboardData);
		(e.target as HTMLElement).blur();
		if (!roots || roots.length === 0) return;
		void pasteAtSelection(roots);
	}

	/**
	 * Edit-mode paste (delegated from .editor). When the clipboard carries
	 * diple's own block format OR multi-line external text, take over: insert
	 * the structure as siblings after the block being edited, so the focus
	 * never leaves it. Text selection and single-line external text keep the
	 * native behavior — replacing selected text / pasting a word inline.
	 */
	function handleEditorPaste(e: ClipboardEvent) {
		const blockEl = (e.target as HTMLElement).closest('[data-block-id]') as HTMLElement | null;
		if (!blockEl) return; // zoomed title / capture zone / catcher → native
		const blockId = blockEl.getAttribute('data-block-id');
		if (!blockId) return;

		const sel = window.getSelection();
		if (sel && !sel.isCollapsed) return; // text-selection replace → native

		let roots: PasteBlock[] | null = null;
		const json = e.clipboardData?.getData(MIME_DIPLE);
		if (json) roots = parseDipleJson(json);
		if (!roots) {
			// External text: multi-line pastes become blocks (one per line,
			// leading tabs rebuild the hierarchy — Workflowy-style). A paste
			// with no newline is treated as inline text and stays native.
			const text = e.clipboardData?.getData('text/plain') ?? '';
			if (text.includes('\n')) roots = parsePlainText(text);
		}
		if (!roots || roots.length === 0) return;

		e.preventDefault();
		const block = blocks.find((b) => b.id === blockId);
		if (!block) return;
		void pasteRoots(block.parent_id, block.position + 1, roots);
	}

	/**
	 * Apply a formatting action to all currently selected blocks.
	 * Multi-block semantics: if all have the format → remove from all; else → apply to all.
	 * Updates content optimistically and persists each block individually via API.
	 */
	async function handleSelectionAction(action: FormatAction) {
		const selectedBlocks = flatBlocks.filter((b) => selectedIds.has(b.id));
		if (selectedBlocks.length === 0) return;

		if (action === 'copy') {
			copySelectedBlocks();
			// Close the menu but keep the visual selection (unlike cut/paste/delete,
			// which mutate the tree and clear it).
			selectionMenu = null;
			return;
		}
		if (action === 'cut') {
			await cutSelectedBlocks();
			return;
		}
		if (action === 'paste') {
			await pasteAtSelection();
			return;
		}

		if (action === 'delete') {
			// deleteSelectedBlocks clears the selection itself — clearing here first
			// would empty selectedIds before it reads them (no-op bug)
			await deleteSelectedBlocks();
			return;
		}

		if (action === 'zoom') {
			// Zoom addresses a single block — right-click / long-press select
			// exactly one. Multi-selection: no-op.
			if (selectedBlocks.length === 1) {
				clearSelection();
				handleZoom(selectedBlocks[0].id);
			}
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

		// Optimistic update + persist each block (per-block rollback on failure)
		for (let i = 0; i < selectedBlocks.length; i++) {
			selectedBlocks[i].content = newContents[i];
			saveContentWithRollback(selectedBlocks[i].id, contents[i], newContents[i]);
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

		const cmd = effectiveKeybindings()[comboFromEvent(e)];

		// Block-selection clipboard: only when blocks are selected AND no text is
		// selected (native copy/cut/paste keeps working for text) AND we're not in
		// a form field (palette). A collapsed caret inside a contenteditable still
		// counts as block context — the native paste would be a no-op there.
		if (cmd === 'edit.copy' || cmd === 'edit.cut' || cmd === 'edit.paste') {
			const sel = window.getSelection();
			const hasTextSelection = sel !== null && !sel.isCollapsed;
			if (
				selectedIds.size > 0 &&
				!hasTextSelection &&
				target.tagName !== 'INPUT' &&
				target.tagName !== 'TEXTAREA'
			) {
				if (cmd === 'edit.paste') {
					// Delegate to the hidden catcher textarea: the browser dispatches
					// the native paste event on the focused element, and reading
					// e.clipboardData needs NO clipboard-read permission. No
					// preventDefault here — the paste must reach the catcher.
					clipCatcherEl?.focus();
					return;
				}
				e.preventDefault();
				if (cmd === 'edit.copy') copySelectedBlocks();
				else await cutSelectedBlocks();
				return;
			}
			// Otherwise fall through — the browser handles it natively.
		}

		if (!inEditableField) {
			// Resolve through the registry — no hardcoded keys, rebinding follows automatically
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

	/**
	 * Page teardown (refresh, tab close): the active edit is normally saved on
	 * blur, but a quick reload right after typing never fires blur. Send the
	 * in-progress content with a keepalive fetch — it survives the page being
	 * torn down, unlike a regular fetch. Covers edited blocks and the zoomed
	 * title (identified via [data-zoom-title]). Best-effort: if the request
	 * can't be queued it's swallowed — blur remains the normal save path.
	 */
	function handleBeforeUnload() {
		const active = document.activeElement as HTMLElement | null;
		if (active?.getAttribute('contenteditable') !== 'true') return;

		const blockEl = active.closest('[data-block-id]') as HTMLElement | null;
		const zoomTitle = active.closest('[data-zoom-title]') as HTMLElement | null;
		const id = blockEl?.getAttribute('data-block-id') ?? (zoomTitle ? effectiveZoomId : null);
		if (!id) return;

		const content = active.textContent ?? '';
		void fetch(`/api/blocks/${id}`, {
			method: 'PATCH',
			keepalive: true,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ content })
		}).catch(() => undefined);
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
	/**
	 * Replay an entry, surfacing API failures. A failed replay stops mid-entry —
	 * remaining mutations never ran, so only a reload can resync the client.
	 */
	async function replayEntry(entry: UndoEntry, direction: 'undo' | 'redo') {
		try {
			await applyUndoEntry(entry, direction);
		} catch {
			showSyncError(t('editor.errSync'));
		}
	}

	async function performUndo() {
		await waitForInflight();
		if (inflight > 0) return;
		clearSelection();
		flushActiveEdit();
		const entry = undoStack.undo();
		if (entry) await replayEntry(entry, 'undo');
	}
	async function performRedo() {
		await waitForInflight();
		if (inflight > 0) return;
		clearSelection();
		flushActiveEdit();
		const entry = undoStack.redo();
		if (entry) await replayEntry(entry, 'redo');
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

	// Partial on purpose: the keybinding table also holds global commands
	// (app.*) that window-level handlers own — the editor must not claim
	// them. `commands[cmd]?.` at dispatch is the same guard: an unhandled
	// combo resolves to no command here and is simply a no-op.
	const commands: Partial<Record<CommandId, (e: KeyboardEvent, block: Block) => void>> = {
		'block.split': handleEnter,
		'block.indent': handleTab,
		'block.outdent': handleShiftTab,
		'block.backspace': handleBackspace,
		'block.moveUp': handleArrowUp,
		'block.moveDown': handleArrowDown,
		'edit.undo': handleUndo,
		'edit.redo': handleRedo,
		// Clipboard commands are no-ops in edit mode: the native browser behavior
		// must win there (text copy/cut/paste inside the contenteditable). Block
		// selection copies are handled by onWindowKeydown, edit-mode diple pastes
		// by handleEditorPaste.
		'edit.copy': () => undefined,
		'edit.cut': () => undefined,
		'edit.paste': () => undefined,
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
	class:editor--dragging={dragRoots.length > 0}
	class:editor--intro={intro ?? false}
	bind:this={editorEl}
	onclick={handleClickIntent}
	onkeydown={handleEditorKeydown}
	onmousedown={onEditorMousedown}
	oncontextmenu={onEditorContextMenu}
	onpaste={handleEditorPaste}
	onpointerdown={onEditorPointerDown}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	ondragend={handleDragEnd}
>
	{#if selRect}
		<div class="selection-overlay" style="top: {selRect.top}px; height: {selRect.height}px;"></div>
	{/if}
	{#if indicatorPos}
		<div
			class="drop-indicator"
			style="top: {indicatorPos.top}px; left: {indicatorPos.left}px;"
		></div>
	{/if}
	{#key zoomTarget.id ?? '__root__'}
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
				<!-- Ghost block row — identical alignment and structure as a real block
				     so the capture zone looks like "the first block" instead of a button.
				     The diple chevron and text are both pale (encre 38%, currentColor). -->
				<button class="capture-zone" onclick={handleCreateRootBlock}>
					<span class="cz-gutter" aria-hidden="true">
						<span class="cz-spacer"></span>
						<span class="cz-spacer"></span>
						<span class="cz-bullet"><span class="cz-diple"></span></span>
					</span>
					<span class="cz-text">Write anything…</span>
				</button>
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
						onClipboardAction={handleBlockClipboardAction}
						onDragStart={handleDragStart}
						isDragging={dragRoots.includes(block.id)}
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
							onClipboardAction={handleBlockClipboardAction}
							onDragStart={handleDragStart}
							isDragging={dragRoots.includes(block.id)}
						/>
					</div>
				{/if}
			{/each}

			{#if rootBlocks.length === 0 && effectiveZoomId}
				<button class="capture-zone" onclick={handleCreateFirstChild}>
					<span class="cz-gutter" aria-hidden="true">
						<span class="cz-spacer"></span>
						<span class="cz-spacer"></span>
						<span class="cz-bullet"><span class="cz-diple"></span></span>
					</span>
					<span class="cz-text">Write anything…</span>
				</button>
			{/if}
		</div>
	{/key}

	<!-- Hidden catcher: receives native paste events when blocks are selected
	     (see onWindowKeydown) so the clipboard can be read without the
	     clipboard-read permission. Out of the layout, unfocusable by tab. -->
	<textarea
		class="clip-catcher"
		tabindex="-1"
		aria-hidden="true"
		bind:this={clipCatcherEl}
		onpaste={handleClipCatcherPaste}></textarea>
</div>

{#if selectionMenu}
	<SelectionMenu
		x={selectionMenu.x}
		y={selectionMenu.y}
		onAction={handleSelectionAction}
		onClose={clearSelection}
	/>
{/if}

{#if syncError}
	<div class="sync-toast" role="alert">{syncError}</div>
{/if}

<svelte:window
	onmousemove={onWindowMousemove}
	onmouseup={onWindowMouseup}
	onkeydown={onWindowKeydown}
	onresize={measureSelection}
	onbeforeunload={handleBeforeUnload}
	onpointermove={onWindowPointerMove}
	onpointerup={onWindowPointerEnd}
	onpointercancel={onWindowPointerEnd}
	onpointerdown={onWindowPointerDown}
	onclickcapture={onWindowClickCapture}
/>

<style>
	.editor {
		width: min(var(--content-w), calc(100vw - 2rem));
		margin: 2rem auto;
		padding: 0;
		position: relative;
		/* Touch: keep pan/pinch-zoom, disable the browser's double-tap zoom and
		   the legacy 300ms tap delay — our own double-tap (zoom) owns the gesture. */
		touch-action: manipulation;
	}
	/* Single continuous band behind the selected blocks.
	   First child of .editor → blocks paint above it, no z-index needed. */
	.selection-overlay {
		position: absolute;
		left: 0;
		right: 0;
		background: color-mix(in srgb, var(--color-accent) 15%, var(--color-fond));
		pointer-events: none;
	}
	/* Disable native text selection while drag-selecting blocks (applied after ~4px threshold) */
	.editor.editor--selecting,
	.editor.editor--selecting * {
		user-select: none !important;
	}
	/* Drop target line: a short accent tick at the target depth column.
	   Drawn like the selection overlay — absolute in the editor, no layout. */
	.drop-indicator {
		position: absolute;
		width: 2rem;
		height: 2px;
		border-radius: 1px;
		background: var(--color-accent);
		pointer-events: none;
	}
	/* While dragging, hide the hover-revealed gutter buttons (same rule as
	   drag-selecting) so the row stays clean under the drag image. */
	.editor.editor--dragging :global(.zoom-btn),
	.editor.editor--dragging :global(.menu-btn) {
		opacity: 0;
	}
	/* Ghost block row: mirrors the metrics of a real block (.block, .block-row,
	   .block-gutter, .diple) so the capture zone sits pixel-identical to a real
	   block in the list.  Pale gray (encre 38%) signals it's a placeholder.
	   Depth‑0 gutter hangs into the left margin via negative margin-left. */
	.capture-zone {
		display: flex;
		align-items: flex-start;
		padding: 6px 0; /* match .block */
		/* Gutter mirrors a real block: zoom slot + menu slot + bullet. The
		   offsets derive from the SAME vars Block.svelte zeroes on touch /
		   narrow (< 1024px), so the ghost row stays aligned with real blocks
		   in every mode. Negative margin hangs the gutter left; expanded
		   width compensates so the right edge stays flush with the content
		   column (a <button> needs this explicitly — it doesn't auto-stretch
		   like a <div>). */
		--zoom-w: 1.35rem;
		--menu-w: 1.35rem;
		--bullet-w: 1.5rem;
		width: calc(100% + var(--zoom-w) + var(--menu-w) + var(--bullet-w) / 2);
		margin-left: calc(-1 * (var(--zoom-w) + var(--menu-w) + var(--bullet-w) / 2));
		border: none;
		background: none;
		font: inherit;
		text-align: left;
		cursor: text;
		color: color-mix(in srgb, var(--color-encre) 38%, transparent);
		transition: color 0.15s ease;
	}
	@media (max-width: 850px) {
		.capture-zone {
			margin-left: 0;
			width: 100%;
		}
	}
	/* Touch OR narrow (< 1024px): the gutter is gone — Block.svelte zeroes
	   the same vars there, so only the vars need zeroing here; the
	   width/margin above follow automatically. The 850px rule above still
	   pins <850px to margin 0 / width 100% (matching the blocks' own 850px
	   rule) — no ordering conflict, they fix different properties. */
	@media (hover: none), (max-width: 1023px) {
		.capture-zone {
			--zoom-w: 0;
			--menu-w: 0;
		}
	}
	/* No background fill on hover — the text simply brightens. */
	.capture-zone:hover {
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
	}
	.cz-gutter {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		height: calc(1.5em + 4px); /* match .block-gutter */
	}
	.cz-spacer {
		flex-shrink: 0;
	}
	/* Two spacers mirror the zoom and menu slots of a real block — sized
	   from the same vars (zeroed together on touch/narrow). nth-of-type is
	   brittle if the gutter markup changes: keep both spacers directly
	   before the bullet. */
	.cz-spacer:nth-of-type(1) {
		width: var(--zoom-w);
	}
	.cz-spacer:nth-of-type(2) {
		width: var(--menu-w);
	}
	.cz-bullet {
		flex-shrink: 0;
		width: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cz-diple {
		display: block;
		width: 0.4em;
		height: 0.4em;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(-45deg);
	}
	.cz-text {
		flex: 1;
		min-width: 0;
		padding: 2px 4px; /* match .block-content */
		line-height: 1.5em;
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

	/* --- Zoom animation ---

	   In: the new view appears with a brief scale + fade. Plays on each mount
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

	/* Sync failure toast: fixed so it survives scroll/zoom, above menus. */
	.sync-toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 1rem;
		border-radius: 8px;
		background: var(--color-encre);
		color: var(--color-fond);
		font-size: 0.875rem;
		z-index: 100;
	}
	/* Paste catcher: fixed, off-screen, invisible — never in the layout, but
	   focusable programmatically so the browser dispatches paste events to it. */
	.clip-catcher {
		position: fixed;
		top: 0;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
