/**
 * Map a click on a view-mode element to a raw-content caret offset.
 *
 * The view span renders MARKDOWN (`renderMarkdown`): the raw content and the
 * rendered text differ by the marker characters (`# `, `**`, backticks…).
 * A rendered click position therefore maps back to the raw content through a
 * marker-aware walk, validated against the real rendered text (see
 * `visibleToRawMap`). If the walk ever diverges from the rendered DOM, the
 * mapping is discarded and the deterministic start (0) is used — the mapping
 * can never make the caret worse than the previous behavior.
 */
export function caretFromClick(
	e: MouseEvent | undefined,
	viewEl: HTMLElement | undefined,
	content: string
): number {
	if (!e || !viewEl) return 0;

	// Native hit-test first — exact, including wrapped lines. Accept any text
	// node inside viewEl (the engine returns the node under the cursor).
	let hit: { node: Text; offset: number } | null = null;
	if (typeof document.caretPositionFromPoint === 'function') {
		const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
		if (pos && pos.offsetNode.nodeType === Node.TEXT_NODE && viewEl.contains(pos.offsetNode)) {
			hit = { node: pos.offsetNode as Text, offset: pos.offset };
		}
	}
	if (!hit && typeof document.caretRangeFromPoint === 'function') {
		const range = document.caretRangeFromPoint(e.clientX, e.clientY);
		if (
			range &&
			range.startContainer.nodeType === Node.TEXT_NODE &&
			viewEl.contains(range.startContainer)
		) {
			hit = { node: range.startContainer as Text, offset: range.startOffset };
		}
	}
	if (hit) return mapRenderedToRaw(viewEl, content, hit.node, hit.offset) ?? 0;

	// Geometric fallback for plain single-line text (the hit-test failed —
	// padding click, engine quirk): binary-search the character under the
	// click by cumulative widths, then map it like a hit. Markdown blocks
	// can't be measured this way → 0.
	const text = firstContentText(viewEl);
	if (!text) return 0;
	const full = document.createRange();
	full.selectNodeContents(text);
	const box = full.getBoundingClientRect();
	if (e.clientY < box.top || e.clientY > box.bottom) return 0;
	if (e.clientX <= box.left) return 0;
	if (e.clientX >= box.right) return text.length;

	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		const probe = document.createRange();
		probe.setStart(text, 0);
		probe.setEnd(text, mid);
		if (e.clientX > probe.getBoundingClientRect().right) lo = mid;
		else hi = mid - 1;
	}
	return mapRenderedToRaw(viewEl, content, text, lo) ?? 0;
}

/**
 * Read the caret position the browser itself placed at the click point.
 * On mousedown, the engine hit-tests the selectable view text and sets a
 * collapsed native selection BEFORE dispatching the event — so at the moment
 * this runs (inside the span's own mousedown handler, before .editor applies
 * user-select: none) the selection already carries the exact click position.
 * Returns null when there is no selection, or it isn't a text node inside
 * `viewEl` (padding hit, selection elsewhere) — callers fall back to
 * caretFromClick.
 */
export function caretFromNativeSelection(
	viewEl: HTMLElement | undefined,
	content: string
): number | null {
	if (!viewEl) return null;
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	const node = sel.getRangeAt(0).startContainer;
	if (node.nodeType !== Node.TEXT_NODE || !viewEl.contains(node)) return null;
	return mapRenderedToRaw(viewEl, content, node as Text, sel.getRangeAt(0).startOffset);
}

/**
 * Map a position inside a RENDERED text node of viewEl to an offset in the
 * raw markdown content: cumulative visible offset of the node (sum of the
 * preceding text siblings + the offset inside it), then raw via
 * `visibleToRawMap`. null when the walk diverges from the real DOM — callers
 * fall back to the deterministic start.
 */
function mapRenderedToRaw(
	viewEl: HTMLElement,
	content: string,
	textNode: Text,
	offsetInNode: number
): number | null {
	let before = 0;
	for (const child of viewEl.childNodes) {
		if (child === textNode) break;
		if (child.nodeType === Node.TEXT_NODE) before += (child as Text).length;
	}
	const visiblePos = before + offsetInNode;

	const map = visibleToRawMap(content, viewEl);
	if (!map) return null;
	if (visiblePos >= map.length) return content.length;
	return Math.min(map[visiblePos], content.length);
}

/**
 * Walk the raw markdown content, recording for each VISIBLE character its
 * index in the raw string (skipping the marker characters renderMarkdown
 * consumes). The patterns are applied in renderMarkdown's order at each
 * position: heading line, inline code, highlight, strikethrough, bold,
 * italic, link. The reconstructed visible text MUST equal the element's real
 * textContent — otherwise the walk diverged from the engine (nested exotic
 * cases) and null is returned so callers keep the previous behavior.
 */
export function visibleToRawMap(content: string, viewEl: HTMLElement): number[] | null {
	const map: number[] = [];
	let visible = '';
	let i = 0;
	while (i < content.length) {
		const rest = content.slice(i);

		// Headings: `# ` marker at the start of the (single-line) content.
		if (i === 0) {
			const h = rest.match(/^(#{1,3})\s+(.+)$/);
			if (h) {
				i += h[1].length + (h[0].length - h[1].length - h[2].length);
				continue;
			}
		}
		// Inline code: `...`
		const code = rest.match(/^`([^`]+)`/);
		if (code) {
			i += 1;
			for (const ch of code[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 1;
			continue;
		}
		// Highlight: ==...==
		const hl = rest.match(/^==([^=]+)==/);
		if (hl) {
			i += 2;
			for (const ch of hl[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 2;
			continue;
		}
		// Strikethrough: ~~...~~
		const st = rest.match(/^~~([^~]+)~~/);
		if (st) {
			i += 2;
			for (const ch of st[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 2;
			continue;
		}
		// Bold: **...**
		const b = rest.match(/^\*\*([^*]+)\*\*/);
		if (b) {
			i += 2;
			for (const ch of b[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 2;
			continue;
		}
		// Italic: *...*
		const it = rest.match(/^\*([^*]+)\*/);
		if (it) {
			i += 1;
			for (const ch of it[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 1;
			continue;
		}
		// Link: [text](url) — only the label is visible.
		const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
		if (link) {
			i += 1;
			for (const ch of link[1]) {
				map.push(i);
				visible += ch;
				i++;
			}
			i += 1 + link[2].length + 2;
			continue;
		}

		map.push(i);
		visible += content[i];
		i++;
	}
	return visible === (viewEl.textContent ?? '') ? map : null;
}

/** First direct text child with non-whitespace content. */
function firstContentText(el: HTMLElement): Text | null {
	for (const child of el.childNodes) {
		if (child.nodeType === Node.TEXT_NODE && (child as Text).data.trim() !== '') {
			return child as Text;
		}
	}
	return null;
}
