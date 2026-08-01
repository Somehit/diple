import type { Block } from '$lib/server/db/queries';

/**
 * Clipboard format for diple block subtrees.
 *
 * One copy is written in TWO formats:
 * - `application/x-diple-blocks`: JSON `{ v: 1, blocks: [{content, collapsed, children}] }`.
 *   The structure is nested and carries NO ids — a paste always mints fresh
 *   UUIDs, so duplicating a subtree never collides with the original.
 * - `application/x-diple-blocks`: JSON `{ v: 1, blocks: [{content, collapsed, children}] }`.
 *   The structure is nested and carries NO ids — a paste always mints fresh
 *   UUIDs, so duplicating a subtree never collides with the original.
 * - `text/plain`: one markdown line per block — `- content`, depth encoded as
 *   4 leading spaces per level. This is what shows up when pasting into other
 *   apps (readable outliner text), and it's enough to rebuild the tree when
 *   only plain text survives (parsePlainText reads this exact shape).
 *
 * Besides the system clipboard, every copy also fills an in-module buffer so a
 * same-tab paste works even when the async clipboard API is blocked or missing
 * (permission prompts, older browsers). The system clipboard covers
 * cross-tab/cross-session pastes.
 */

export const MIME_DIPLE = 'application/x-diple-blocks';

/** A clipboard tree node — structure only, no ids, no timestamps. */
export interface PasteBlock {
	content: string;
	collapsed: number;
	children: PasteBlock[];
}

export interface DipleData {
	/** JSON payload for `application/x-diple-blocks`. */
	json: string;
	/** Markdown rendering: `- content`, 4-space indent per level. */
	text: string;
}

/** Session-local copy of the last diple write (covers clipboard API failures). */
let internal: DipleData | null = null;

/**
 * Nest flat `roots` (and their descendants via childrenMap) into PasteBlocks.
 * childrenMap is position-sorted, so sibling order survives the round-trip.
 */
export function buildPasteTree(
	roots: Block[],
	childrenMap: Map<string | null, Block[]>
): PasteBlock[] {
	function toTree(blk: Block): PasteBlock {
		return {
			content: blk.content,
			collapsed: blk.collapsed,
			children: (childrenMap.get(blk.id) ?? []).map(toTree)
		};
	}
	return roots.map(toTree);
}

/** Serialize a subtree into the two clipboard payloads. */
export function serializeToDiple(roots: PasteBlock[]): DipleData {
	const json = JSON.stringify({ v: 1, blocks: roots });
	const text = roots.map((node) => toPlainText(node, 0)).join('\n');
	return { json, text };
}

/** One markdown line per block: `- content`, indented 4 spaces per level. */
function toPlainText(node: PasteBlock, depth: number): string {
	const head = '    '.repeat(depth);
	const lines = [head + '- ' + node.content];
	for (const child of node.children) lines.push(toPlainText(child, depth + 1));
	return lines.join('\n');
}

/**
 * Parse the JSON payload. Returns null when the payload isn't ours (wrong
 * shape or version) — callers then fall back to plain text / native paste.
 */
export function parseDipleJson(json: string): PasteBlock[] | null {
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== 'object' || parsed === null) return null;
		const blocks = (parsed as { blocks?: unknown }).blocks;
		if (!Array.isArray(blocks)) return null;
		if ((parsed as { v?: unknown }).v !== 1) return null;
		return blocks.map(parseNode);
	} catch {
		return null;
	}
}

function parseNode(raw: unknown): PasteBlock {
	const node = (raw ?? {}) as { content?: unknown; collapsed?: unknown; children?: unknown };
	return {
		content: typeof node.content === 'string' ? node.content : '',
		collapsed: node.collapsed === 1 ? 1 : 0,
		children: Array.isArray(node.children) ? node.children.map(parseNode) : []
	};
}

/**
 * Rebuild a tree from pasted plain text — diple's own text/plain payload, or
 * external text (Workflowy tabs, Roam/Obsidian spaces + markdown bullets).
 * Parent of a node = the most recent line with a strictly smaller
 * indentation — the classic outliner rule.
 * Blank lines (paragraph separators) are skipped: they are not blocks, and
 * an empty block between two pasted lines would stack up as a visible gap.
 */
export function parsePlainText(text: string): PasteBlock[] {
	const roots: PasteBlock[] = [];
	// Ancestor chain: stack[depth-1] is the parent for a node at `depth`.
	const stack: PasteBlock[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const { indent, content } = splitIndent(rawLine);
		if (content === '') continue; // blank line → not a block
		const node: PasteBlock = { content, collapsed: 0, children: [] };
		while (stack.length > indent) stack.pop();
		const parent = stack[indent - 1];
		if (parent) parent.children.push(node);
		else roots.push(node);
		stack.push(node);
	}
	return roots;
}

/**
 * Split a pasted line into (indentation level, content).
 * - Leading tabs: one level each (Workflowy style).
 * - Leading runs of 4 spaces: one level each (markdown-outline convention —
 *   Roam/Obsidian paste indentation as spaces, not tabs).
 * - Markdown list markers ("- ", "* ", "+ ") after the indentation are
 *   stripped: pasted bullets become diple's own bullets, not text.
 * The remaining 1-3 spaces of a partial run stay in the content.
 */
function splitIndent(line: string): { indent: number; content: string } {
	const match = line.match(/^(\t*)( *)/) ?? ['', '', ''];
	const tabs = match[1].length;
	const spaces = match[2].length;
	const consumed = tabs + spaces - (spaces % 4);
	const indent = tabs + Math.floor(spaces / 4);
	return { indent, content: line.slice(consumed).replace(/^[-*+]\s+/, '') };
}

/**
 * Write a diple payload to the system clipboard (custom JSON + text/plain)
 * and remember it in the session buffer. The modern async API needs the
 * clipboard-write permission and can fail silently — so on any failure we
 * fall back to execCommand('copy') on a hidden textarea carrying the plain
 * text form (no permission required, still supported everywhere). The
 * tab-indented plain text is enough to rebuild the tree on paste
 * (parsePlainText / clipboardRootsFromEvent), so the custom JSON is a bonus,
 * not a requirement. Failures are logged in dev instead of swallowed — a copy
 * the user relies on must not die quietly.
 */
export async function writeToClipboard(data: DipleData): Promise<void> {
	internal = data;
	try {
		const item = new ClipboardItem({
			[MIME_DIPLE]: new Blob([data.json], { type: MIME_DIPLE }),
			'text/plain': new Blob([data.text], { type: 'text/plain' })
		});
		await navigator.clipboard.write([item]);
		return;
	} catch (err) {
		if (import.meta.env.DEV) {
			console.warn('[clipboard] navigator.clipboard.write failed, using execCommand fallback', err);
		}
	}
	try {
		const ta = document.createElement('textarea');
		ta.value = data.text;
		ta.setAttribute('readonly', '');
		ta.style.position = 'fixed';
		ta.style.opacity = '0';
		ta.style.pointerEvents = 'none';
		document.body.appendChild(ta);
		ta.select();
		if (!document.execCommand('copy') && import.meta.env.DEV) {
			console.warn('[clipboard] execCommand copy returned false');
		}
		ta.remove();
	} catch (err) {
		if (import.meta.env.DEV) {
			console.warn('[clipboard] execCommand fallback failed', err);
		}
	}
}

/** The session buffer — same-tab fallback when the system write failed. */
export function getInternalClipboard(): DipleData | null {
	return internal;
}

/**
 * Extract pasteable roots from a native paste event's data — the ONLY way to
 * read the system clipboard without the clipboard-read permission. Order:
 * our JSON payload → plain text (tabs rebuild the tree) → the session buffer
 * (covers same-tab pastes when the system write failed entirely). Returns
 * null when the clipboard holds nothing we can turn into blocks.
 */
export function clipboardRootsFromEvent(cd: DataTransfer | null): PasteBlock[] | null {
	const json = cd?.getData(MIME_DIPLE);
	if (json) {
		const parsed = parseDipleJson(json);
		if (parsed) return parsed;
	}
	const text = cd?.getData('text/plain');
	if (text && text.trim()) return parsePlainText(text);
	const buffered = getInternalClipboard();
	if (buffered) return parseDipleJson(buffered.json);
	return null;
}

/**
 * Read a paste payload. Prefers the session buffer (no permission needed),
 * then the system clipboard (custom JSON via read(), then plain text via
 * readText() for external text). All permission/API failures are swallowed —
 * a paste with nothing to paste simply does nothing.
 */
export async function readFromClipboard(): Promise<PasteBlock[] | null> {
	if (internal) return parseDipleJson(internal.json);

	try {
		const items = await navigator.clipboard.read();
		for (const item of items) {
			if (item.types.includes(MIME_DIPLE)) {
				const blob = await item.getType(MIME_DIPLE);
				const parsed = parseDipleJson(await blob.text());
				if (parsed) return parsed;
			}
		}
	} catch {
		// clipboard-read denied or unsupported — fall through to readText.
	}

	try {
		const text = await navigator.clipboard.readText();
		return text.trim() ? parsePlainText(text) : null;
	} catch {
		return null;
	}
}
