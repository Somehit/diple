import { parsePlainText, parseDipleJson, type PasteBlock } from './clipboard';

/**
 * File parsers for v0.6 import/export.
 *
 * Pure functions where possible: the markdown and JSON paths reuse the
 * clipboard parsers verbatim; OPML is split in two — a thin DOMParser
 * wrapper (browser-only) that extracts a generic plain-node shape, and
 * `opmlToPasteBlocks` which is pure and node-testable.
 *
 * `parseFile` is the single entry point: it detects the format from the
 * filename and content, and returns null when the file isn't usable — the
 * caller shows an error instead of importing garbage.
 */

export type ImportFormat = 'markdown' | 'opml' | 'json';

/** Where imported blocks land: as children of the current page's root,
 *  or as new root blocks of the whole tree. */
export type ImportDestination = 'page' | 'root';

export interface ParsedImport {
	format: ImportFormat;
	roots: PasteBlock[];
}

/**
 * Detect the format and parse a file. The extension is authoritative
 * (.opml → OPML, .json → diple JSON); other filenames (.md, .txt, none)
 * fall back to content sniffing — `<opml` for OPML, `{` for diple JSON —
 * then to plain text (the tolerant markdown parser that already handles
 * Workflowy tabs and Obsidian/Roam 4-space indentation).
 */
export function parseFile(name: string, text: string): ParsedImport | null {
	const lower = name.toLowerCase();
	if (lower.endsWith('.opml')) {
		const roots = parseOpml(text);
		return roots ? { format: 'opml', roots } : null;
	}
	if (lower.endsWith('.json')) {
		const roots = parseDipleJson(text);
		return roots ? { format: 'json', roots } : null;
	}
	const trimmed = text.trimStart();
	if (/^<opml[\s>]/.test(trimmed)) {
		const roots = parseOpml(text);
		return roots ? { format: 'opml', roots } : null;
	}
	// A `{` might be markdown that merely starts with a brace — if the JSON
	// parse fails, fall through to plain text instead of erroring out.
	if (trimmed.startsWith('{')) {
		const roots = parseDipleJson(text);
		if (roots) return { format: 'json', roots };
	}
	const roots = parsePlainText(text);
	return roots.length > 0 ? { format: 'markdown', roots } : null;
}

/** Total blocks in a tree, including all descendants — the import summary. */
export function countBlocks(roots: PasteBlock[]): number {
	let n = 0;
	for (const r of roots) n += 1 + countBlocks(r.children);
	return n;
}

/** Generic OPML outline shape — the DOM-free core that opmlToPasteBlocks eats. */
export interface RawOutline {
	text: string | null;
	collapse: boolean;
	outlines: RawOutline[];
}

/** Pure: turn extracted outline nodes into PasteBlocks (node-testable). */
export function opmlToPasteBlocks(raw: RawOutline[]): PasteBlock[] {
	return raw.map((o) => ({
		content: o.text ?? '',
		collapsed: o.collapse ? 1 : 0,
		children: opmlToPasteBlocks(o.outlines)
	}));
}

/**
 * Parse an OPML document with the browser's XML parser. Returns null on
 * malformed XML (the parsererror element) or when there are no outlines —
 * a file that smells like OPML but yields nothing is an error, never a
 * silent empty import.
 */
export function parseOpml(xml: string): PasteBlock[] | null {
	const doc = new DOMParser().parseFromString(xml, 'text/xml');
	if (doc.querySelector('parsererror')) return null;
	const body = doc.querySelector('body');
	if (!body) return null;
	const roots: RawOutline[] = [];
	for (const el of body.children) {
		if (el.localName.toLowerCase() === 'outline') roots.push(domToRaw(el));
	}
	return roots.length > 0 ? opmlToPasteBlocks(roots) : null;
}

function domToRaw(el: Element): RawOutline {
	return {
		text: el.getAttribute('text'),
		collapse: el.getAttribute('_collapse') === '1',
		outlines: Array.from(el.children)
			.filter((c) => c.localName.toLowerCase() === 'outline')
			.map(domToRaw)
	};
}
