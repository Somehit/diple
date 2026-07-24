/**
 * Render markdown patterns to HTML.
 * Handles headings, highlight, strikethrough, bold, italic, code, and links.
 * HTML entities are escaped first.
 */
export function renderMarkdown(text: string): string {
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	// Headings (#, ##, ###) — processed first so inline patterns inside still work
	html = html.replace(/^(#{1,3})\s+(.+)$/, (_full, hashes: string, content: string) => {
		const level = hashes.length;
		return `<span class="md-h${level}">${content}</span>`;
	});

	// Inline patterns
	html = html
		// inline code (before bold/italic/other so `**` inside code is preserved)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		// highlight
		.replace(/==([^=]+)==/g, '<mark>$1</mark>')
		// strikethrough
		.replace(/~~([^~]+)~~/g, '<del>$1</del>')
		// bold
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		// italic
		.replace(/\*([^*]+)\*/g, '<em>$1</em>')
		// links: [text](url)
		.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
		);

	return html;
}
