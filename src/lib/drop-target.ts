import type { Block } from '$lib/server/db/queries';

/**
 * Where a drag would land right now. Coordinates are viewport pixels so the
 * editor can position its indicator without re-measuring at render time.
 */
export interface DropTarget {
	parentId: string | null;
	position: number;
	/** Insertion line Y (viewport px). */
	indicatorY: number;
	/** Insertion line X (viewport px) — the content column at the target depth. */
	indicatorX: number;
}

export interface DropCtx {
	blocks: Block[];
	/** Visible blocks in flat (depth-first) order, rooted at the current view. */
	flatBlocks: Block[];
	childrenMap: Map<string | null, Block[]>;
	/** Top-level roots of the drag (flat order). */
	dragRootIds: Set<string>;
	/** Lowest allowed depth: 1 inside a zoomed view, 0 at the root. A dragged
	 *  block must never leave the current view (same rule as outdent). */
	minDepth: number;
	/** Horizontal indent step in px (1rem). */
	indentStepPx: number;
	getRowRect: (id: string) => { top: number; bottom: number } | null;
	/** Left edge of a block's content column (viewport px), or null when hidden. */
	contentLeftOf: (id: string) => number | null;
}

/** Dead zone before the content column where the cursor starts outdenting. */
const OUTDENT_MARGIN_PX = 12;
/** The child zone begins at 60% of the row width — same level stays dominant
 *  (Logseq's full-row child zone is notorious for accidental deep drops). */
const CHILD_ZONE_FRACTION = 0.6;

/**
 * Compute the drop target from the cursor position (Workflowy-style waterline):
 * the insertion line follows Y between rows, its depth follows X. Three
 * horizontal zones per row: left of the content column = one level up, right
 * part of the row = child, middle = same level. The line snaps to the nearest
 * valid slot — it is never drawn at an impossible position, and it never lies
 * inside the dragged subtree or above the view boundary.
 *
 * Returns null when the drop is invalid: over the zoom header, the capture
 * zone, empty space, inside the dragged subtree (cycle), or a no-op slot.
 */
export function computeDropTarget(x: number, y: number, ctx: DropCtx): DropTarget | null {
	const {
		blocks,
		flatBlocks,
		childrenMap,
		dragRootIds,
		minDepth,
		indentStepPx,
		getRowRect,
		contentLeftOf
	} = ctx;
	if (flatBlocks.length === 0) return null;

	// The block row under the cursor. The native drag image is not a DOM
	// element, so it never intercepts hit testing.
	const el = document.elementFromPoint(x, y)?.closest('[data-block-id]') as HTMLElement | null;
	const cursorId = el?.getAttribute('data-block-id') ?? null;
	const cursorBlock = cursorId ? blocks.find((b) => b.id === cursorId) : undefined;
	if (!cursorBlock || !el) return null;

	const row = el.querySelector(':scope > .block-row') ?? el;
	const rowRect = row.getBoundingClientRect();
	const above = y < rowRect.top + rowRect.height / 2;

	// Per-call indexes over the flat list: flat order, depth (parent walk,
	// cycle-guarded), and id lookup.
	const byId = new Map(blocks.map((b) => [b.id, b]));
	const flatIndex = new Map<string, number>();
	const flatDepth = new Map<string, number>();
	flatBlocks.forEach((b, i) => {
		flatIndex.set(b.id, i);
		let d = 0;
		let cursor = b.parent_id;
		const seen = new Set([b.id]);
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			d++;
			cursor = byId.get(cursor)?.parent_id ?? null;
		}
		flatDepth.set(b.id, d);
	});
	const depth = flatDepth.get(cursorBlock.id) ?? parseInt(el.getAttribute('data-depth') ?? '0', 10);

	// Horizontal zone against the block's content column.
	const contentLeft = contentLeftOf(cursorBlock.id) ?? rowRect.left;
	const zone =
		x < contentLeft - OUTDENT_MARGIN_PX
			? -1
			: x >= contentLeft + rowRect.width * CHILD_ZONE_FRACTION
				? 1
				: 0;
	// Target depth, clamped to the view boundary (zoom boundary). When the
	// clamp kicks in (zone -1 at the minimum depth) the drop degrades to a
	// same-level one — the line simply stays put.
	const depthTarget = Math.max(minDepth, depth + zone);

	/** True when `parentId` is inside the dragged subtree — a cycle, forbidden. */
	function hasDraggedAncestor(parentId: string | null): boolean {
		const seen = new Set<string>();
		let cursor = parentId;
		while (cursor && !seen.has(cursor)) {
			if (dragRootIds.has(cursor)) return true;
			seen.add(cursor);
			cursor = byId.get(cursor)?.parent_id ?? null;
		}
		return false;
	}

	function childrenCount(parentId: string | null): number {
		return childrenMap.get(parentId)?.length ?? 0;
	}

	/** Bottom edge of the last visible descendant of `id` (its own row when leaf).
	 *  Used by the snapped indicator: the line sits at the end of a subtree. */
	function subtreeBottom(id: string): number {
		const start = flatIndex.get(id);
		if (start === undefined) return getRowRect(id)?.bottom ?? rowRect.bottom;
		const parentDepth = flatDepth.get(id) ?? 0;
		let last = start;
		for (let i = start + 1; i < flatBlocks.length; i++) {
			if ((flatDepth.get(flatBlocks[i].id) ?? 0) > parentDepth) last = i;
			else break;
		}
		return getRowRect(flatBlocks[last].id)?.bottom ?? getRowRect(id)?.bottom ?? rowRect.bottom;
	}

	let parentId: string | null;
	let position: number;
	let indicatorY: number;

	if (zone === -1 && depthTarget >= depth) {
		// Clamped at the view boundary — behave like a same-level drop.
		parentId = cursorBlock.parent_id;
		position = above ? cursorBlock.position : cursorBlock.position + 1;
		indicatorY = above ? rowRect.top : rowRect.bottom;
	} else if (zone === -1) {
		// One level up: a sibling of the cursor block's parent. Above the row
		// = before the parent, below = after the parent's whole subtree (the
		// line snaps to the end of it — Workflowy's snapping).
		const parent = byId.get(cursorBlock.parent_id ?? '');
		if (!parent) return null;
		parentId = parent.parent_id;
		position = above ? parent.position : parent.position + 1;
		indicatorY = above ? (getRowRect(parent.id)?.top ?? rowRect.top) : subtreeBottom(parent.id);
	} else if (zone === 0) {
		parentId = cursorBlock.parent_id;
		position = above ? cursorBlock.position : cursorBlock.position + 1;
		indicatorY = above ? rowRect.top : rowRect.bottom;
	} else {
		// Child. Below the row = FIRST child (the line sits right under the
		// row, above the existing children — line-honest, and the dropped
		// block stays visible near the cursor even inside a huge subtree).
		// Above the row = LAST child of the previous visible block (the line
		// sits at the end of its subtree).
		if (above) {
			const idx = flatIndex.get(cursorBlock.id);
			const prev = idx !== undefined && idx > 0 ? flatBlocks[idx - 1] : undefined;
			if (!prev) return null;
			parentId = prev.id;
			position = childrenCount(prev.id);
			indicatorY = subtreeBottom(prev.id);
		} else {
			parentId = cursorBlock.id;
			position = 0;
			indicatorY = rowRect.bottom;
		}
	}

	// Defensive clamp — the per-zone resolution is always in bounds already.
	position = Math.min(position, childrenCount(parentId));

	// Cycle guard: the drop parent must not be inside the dragged subtree.
	if (hasDraggedAncestor(parentId)) return null;

	// No-op guard: dropping the first dragged root at its own slot, or the one
	// right after it (the line below its own row), does nothing — it must
	// never trigger an accidental swap with the next sibling.
	const roots = [...dragRootIds].sort((a, b) => (flatIndex.get(a) ?? 0) - (flatIndex.get(b) ?? 0));
	const firstRoot = roots[0] ? byId.get(roots[0]) : undefined;
	if (
		firstRoot &&
		parentId === firstRoot.parent_id &&
		(position === firstRoot.position || position === firstRoot.position + 1)
	) {
		return null;
	}

	const indicatorX = contentLeft + (depthTarget - depth) * indentStepPx;

	return { parentId, position, indicatorY, indicatorX };
}
