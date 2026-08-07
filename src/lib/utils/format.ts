/**
 * Pure formatting transforms for block content.
 * Every function takes a raw content string and returns a new one.
 * No side effects — callers handle state mutation and persistence.
 */

/** Strip leading heading markers, returning the clean text and the heading level (0–3). */
export function stripHeading(content: string): { stripped: string; level: number } {
	const m = content.match(/^(#{1,3})\s(.+)/);
	return m ? { stripped: m[2], level: m[1].length } : { stripped: content, level: 0 };
}

/**
 * Toggle a pair-marker wrapper on `text`.
 * If already wrapped → unwrap; otherwise → wrap.
 */
export function wrapPair(text: string, marker: string): string {
	if (!text) return marker + marker;
	if (text.startsWith(marker) && text.endsWith(marker)) {
		const inner = text.slice(marker.length, -marker.length);
		return inner;
	}
	return marker + text + marker;
}

/** Apply (or remove) heading level. Toggle: if already that level → strip; else → set. */
export function toggleHeading(content: string, level: number): string {
	const { stripped, level: current } = stripHeading(content);
	return current === level ? stripped : '#'.repeat(level) + ' ' + stripped;
}

/**
 * Toggle bold (`**` wrapper).
 * Strips a single `*` (italic) pre-wrap to avoid `***` confusion.
 */
export function toggleBold(content: string): string {
	let text = content;
	if (text.startsWith('*') && text.endsWith('*') && !text.startsWith('**')) {
		text = text.slice(1, -1);
	}
	return wrapPair(text, '**');
}

/**
 * Toggle italic (`*` wrapper).
 * Strips bold (`**`) pre-wrap to avoid `***` confusion.
 */
export function toggleItalic(content: string): string {
	let text = content;
	if (text.startsWith('**') && text.endsWith('**')) {
		text = text.slice(2, -2);
	}
	return wrapPair(text, '*');
}

/** Toggle highlight (`==` wrapper). */
export function toggleHighlight(content: string): string {
	return wrapPair(content, '==');
}

/** Toggle strikethrough (`~~` wrapper). */
export function toggleStrikethrough(content: string): string {
	return wrapPair(content, '~~');
}

/** Toggle inline code (`` ` `` wrapper). */
export function toggleCode(content: string): string {
	return wrapPair(content, '`');
}

/**
 * Selection-aware pair-marker toggle for the mobile formatting bar.
 *
 * Wraps (or unwraps) the substring [start, end) of `text` with `marker`
 * and reports the new selection — callers restore it in the editor so the
 * user keeps typing where they were. Collapsed selection (start === end):
 * inserts the marker pair at the caret, selection between the markers.
 *
 * Unlike wrapPair (whole-block toggle), there is no italic/bold pre-strip:
 * the action is scoped to the selected text, and stripping another marker
 * pair from a partial selection would be surprising.
 */
export function wrapRange(
	text: string,
	start: number,
	end: number,
	marker: string
): { text: string; selStart: number; selEnd: number } {
	const s = Math.min(start, end);
	const e = Math.max(start, end);
	const clampedE = Math.min(e, text.length);
	if (s >= clampedE) {
		const at = Math.min(s, text.length);
		const caret = at + marker.length;
		return {
			text: text.slice(0, at) + marker + marker + text.slice(at),
			selStart: caret,
			selEnd: caret
		};
	}
	const selected = text.slice(s, clampedE);
	const isWrapped =
		selected.startsWith(marker) &&
		selected.endsWith(marker) &&
		selected.length >= marker.length * 2;
	if (isWrapped) {
		return {
			text: text.slice(0, s) + selected.slice(marker.length, -marker.length) + text.slice(clampedE),
			selStart: s,
			selEnd: clampedE - marker.length * 2
		};
	}
	return {
		text: text.slice(0, s) + marker + selected + marker + text.slice(clampedE),
		selStart: s + marker.length,
		selEnd: clampedE + marker.length
	};
}

// --- Multi-block helpers ---
// Used when applying formatting to a selection of several blocks.
// Semantics: if ALL blocks already have the formatting → remove it from all.
// If ANY block doesn't have it → apply it to all.

function isWrapActive(content: string, marker: string): boolean {
	return (
		content.startsWith(marker) && content.endsWith(marker) && content.length >= marker.length * 2
	);
}

/** Like wrapPair but always wraps — never unwraps. */
function forceWrap(text: string, marker: string): string {
	if (!text) return marker + marker;
	return marker + text + marker;
}

/** Always unwraps — removes the marker pair unconditionally from start and end. */
function forceUnwrap(text: string, marker: string): string {
	if (!text.startsWith(marker) || !text.endsWith(marker)) return text;
	return text.slice(marker.length, -marker.length);
}

/**
 * Apply or remove a pair-marker across multiple block contents.
 * If all are already wrapped → unwrap all. Otherwise → wrap all.
 */
function applyWrapToAll(contents: string[], marker: string): string[] {
	const allWrapped = contents.every((c) => isWrapActive(c, marker));
	return contents.map((c) => (allWrapped ? forceUnwrap(c, marker) : forceWrap(c, marker)));
}

/** Apply heading `level` to all blocks (strips any existing heading prefix first). */
export function applyMultiHeading(contents: string[], level: number): string[] {
	return contents.map((c) => {
		const { stripped } = stripHeading(c);
		return '#'.repeat(level) + ' ' + stripped;
	});
}

/** Multi-block bold. Strips single italic marker before applying/un-applying bold. */
export function applyMultiBold(contents: string[]): string[] {
	const prepped = contents.map((c) => {
		if (c.startsWith('*') && c.endsWith('*') && !c.startsWith('**')) {
			return c.slice(1, -1);
		}
		return c;
	});
	return applyWrapToAll(prepped, '**');
}

/** Multi-block italic. Strips bold marker before applying/un-applying italic. */
export function applyMultiItalic(contents: string[]): string[] {
	const prepped = contents.map((c) => {
		if (c.startsWith('**') && c.endsWith('**')) {
			return c.slice(2, -2);
		}
		return c;
	});
	return applyWrapToAll(prepped, '*');
}

/** Multi-block highlight. */
export function applyMultiHighlight(contents: string[]): string[] {
	return applyWrapToAll(contents, '==');
}

/** Multi-block strikethrough. */
export function applyMultiStrikethrough(contents: string[]): string[] {
	return applyWrapToAll(contents, '~~');
}

/** Multi-block inline code. */
export function applyMultiCode(contents: string[]): string[] {
	return applyWrapToAll(contents, '`');
}
