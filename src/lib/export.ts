import type { Block } from '$lib/server/db/queries';
import type { PasteBlock } from './clipboard';

/**
 * File-format serializers for v0.6 import/export.
 *
 * Pure functions — they take a PasteBlock tree (the same shape the clipboard
 * uses) and return a string ready to be downloaded. No DOM, no server: the
 * caller (settings modal) builds the tree from the client-side store and
 * triggers the download itself.
 *
 * Three tiers, three audiences:
 * - toMarkdown — universal, human-readable (the clipboard already writes it)
 * - toOpml — the outliner interchange standard (Workflowy, Dynalist, Roam…)
 * - toDipleJson — lossless round-trip: content + collapsed + created_at
 */

/**
 * Nest flat blocks (the client-side tree store) into a PasteBlock tree for
 * export. Only the given roots and their descendants are kept — 'whole
 * tree' passes every root block's id, 'current page' the zoom block's id.
 * Each sibling group is sorted by position so the file order matches the
 * on-screen tree. Returns null when a root id doesn't exist (stale zoom
 * target) — the caller then has nothing to export.
 */
export function buildExportTree(blocks: Block[], rootIds: string[]): PasteBlock[] | null {
	const childrenMap = new Map<string | null, Block[]>();
	for (const b of blocks) {
		const list = childrenMap.get(b.parent_id) ?? [];
		list.push(b);
		childrenMap.set(b.parent_id, list);
	}
	for (const siblings of childrenMap.values()) {
		siblings.sort((a, b) => a.position - b.position);
	}
	const roots: Block[] = [];
	for (const id of rootIds) {
		const root = blocks.find((b) => b.id === id);
		if (!root) return null;
		roots.push(root);
	}
	return roots.map((blk) => toExportNode(childrenMap, blk));
}

/** File exports always carry created_at — the lossless tier (v2). */
function toExportNode(childrenMap: Map<string | null, Block[]>, blk: Block): PasteBlock {
	return {
		content: blk.content,
		collapsed: blk.collapsed,
		created_at: blk.created_at,
		children: (childrenMap.get(blk.id) ?? []).map((c) => toExportNode(childrenMap, c))
	};
}

/** One markdown line per block: `- content`, indented 4 spaces per level. */
export function toMarkdown(roots: PasteBlock[]): string {
	return roots.map((node) => toMarkdownNode(node, 0)).join('\n');
}

function toMarkdownNode(node: PasteBlock, depth: number): string {
	const head = '    '.repeat(depth);
	const lines = [head + '- ' + node.content];
	for (const child of node.children) lines.push(toMarkdownNode(child, depth + 1));
	return lines.join('\n');
}

/**
 * Serialize a tree as an OPML 2.0 document — the outliner interchange
 * format. Each block becomes a nested `<outline text="…">`; the collapsed
 * state is recorded as `_collapse="1"` on the collapsed parent, the same
 * underscore-prefixed convention Workflowy uses (so diple's own collapsed
 * state survives a trip through other outliners).
 */
export function toOpml(roots: PasteBlock[], title = 'diple export'): string {
	const lines: string[] = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<opml version="2.0">',
		'  <head>',
		`    <title>${escapeXml(title)}</title>`,
		'  </head>',
		'  <body>'
	];
	for (const node of roots) lines.push(...outlineXml(node, 2));
	lines.push('  </body>', '</opml>');
	return lines.join('\n');
}

/** One `<outline>` element, recursively, with 2-space XML indentation. */
function outlineXml(node: PasteBlock, depth: number): string[] {
	const pad = '  '.repeat(depth);
	const attrs = [`text="${escapeXml(node.content)}"`];
	if (node.collapsed === 1) attrs.push('_collapse="1"');
	const open = `${pad}<outline ${attrs.join(' ')}`;
	if (node.children.length === 0) return [`${open}/>`];
	const lines = [`${open}>`];
	for (const child of node.children) lines.push(...outlineXml(child, depth + 1));
	lines.push(`${pad}</outline>`);
	return lines;
}

/**
 * diple's lossless file format — JSON v2. Same nested shape as the
 * clipboard's v1, plus `created_at` (epoch ms) on each block, so `:today`
 * and recents survive a round-trip. Clipboard copies stay v1 on purpose: a
 * pasted subtree is a fresh copy and must not carry its source's timestamps.
 */
export function toDipleJson(roots: PasteBlock[]): string {
	return JSON.stringify({ v: 2, blocks: roots });
}

/** Escape the five XML entities — the only escaping attribute values need. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}
