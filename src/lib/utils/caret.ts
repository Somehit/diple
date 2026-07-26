/**
 * Map a click on a view-mode element to a raw-content caret offset.
 *
 * Exact only when the rendered view is a SINGLE text node (no markdown
 * formatting): renderMarkdown only escapes entities for plain text, and the
 * DOM unescapes them — so rendered text === raw source, and the click offset
 * maps 1:1 to the content offset.
 *
 * Anything else (bold, italic, code, mark, del, links, headings) produces
 * element children → the offset no longer maps to the raw source → fall back
 * to 0 (deterministic start). Also 0 when the API is missing (older engines)
 * or the click lands off the text node (padding).
 */
export function caretFromClick(
	e: MouseEvent | undefined,
	viewEl: HTMLElement | undefined,
	contentLength: number
): number {
	if (!e || !viewEl) return 0;
	if (typeof document.caretPositionFromPoint !== 'function') return 0;

	if (viewEl.childNodes.length !== 1 || viewEl.firstChild?.nodeType !== Node.TEXT_NODE) {
		return 0;
	}

	const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
	if (!pos || pos.offsetNode !== viewEl.firstChild) return 0;

	return Math.min(pos.offset, contentLength);
}
