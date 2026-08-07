<script lang="ts">
	import { formatBar } from '$lib/formatbar.svelte';
	import { t } from '$lib/i18n.svelte';
	import {
		toggleHeading,
		toggleBold,
		toggleItalic,
		toggleHighlight,
		toggleStrikethrough,
		toggleCode,
		wrapRange
	} from '$lib/utils/format';

	/**
	 * Mobile formatting bar (Obsidian-style). Fixed at the bottom, shown only
	 * while a block is being edited, and only under the same media rule that
	 * hides the gutter menus: `(hover: none), (max-width: 1023px)` — every
	 * device that can't reach the ••• menu gets the bar.
	 *
	 * ## Why writing the DOM directly
	 *
	 * The bar acts on the *live* contenteditable (formatBar.el): it rewrites
	 * its textContent and restores the selection. No state plumbing — the
	 * existing blur-commit (stopEditing) then saves and records the undo
	 * entry like any typing. One edit session = one undo entry, free.
	 *
	 * ## Why preventDefault on mousedown
	 *
	 * Tapping a button would move focus out of the contenteditable → blur →
	 * commit + keyboard closes on every tap. preventDefault on mousedown
	 * keeps focus where it is (the standard editor-toolbar technique), so
	 * the session survives the tap and the keyboard stays open.
	 */
	type BarAction = 'h1' | 'h2' | 'h3' | 'bold' | 'italic' | 'strike' | 'highlight' | 'code';

	/** Marker pair for each inline action — selection wrapping only. */
	const INLINE_MARKERS: Record<Exclude<BarAction, 'h1' | 'h2' | 'h3'>, string> = {
		bold: '**',
		italic: '*',
		strike: '~~',
		highlight: '==',
		code: '`'
	};

	/** Type guard: `in` doesn't narrow on Record types — this does. */
	function isInline(action: BarAction): action is Exclude<BarAction, 'h1' | 'h2' | 'h3'> {
		return action !== 'h1' && action !== 'h2' && action !== 'h3';
	}

	/**
	 * Keyboard offset in px: how much of the viewport bottom the on-screen
	 * keyboard covers. position:fixed; bottom:0 sits UNDER the iOS keyboard
	 * (the layout viewport doesn't shrink there), so the bar floats on
	 * `bottom: kbOffset`. Android resizes the layout viewport → offset 0.
	 * Capped at 45% so a pinch-zoom can't fling the bar mid-screen.
	 */
	let kbOffset = $state(0);
	$effect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => {
			kbOffset = Math.min(
				Math.max(0, window.innerHeight - vv.offsetTop - vv.height),
				window.innerHeight * 0.45
			);
		};
		update();
		vv.addEventListener('resize', update);
		vv.addEventListener('scroll', update);
		return () => {
			vv.removeEventListener('resize', update);
			vv.removeEventListener('scroll', update);
		};
	});

	/** Absolute offset of a DOM position within el (walks text siblings). */
	function offsetWithin(el: HTMLElement, node: Node, offset: number): number {
		let pos = offset;
		let cur: Node | null = node;
		while (cur && cur !== el) {
			let sib = cur.previousSibling;
			while (sib) {
				pos += sib.textContent?.length ?? 0;
				sib = sib.previousSibling;
			}
			cur = cur.parentNode;
		}
		return pos;
	}

	/**
	 * Selection offsets (start ≤ end) within el. Null when there is no
	 * selection, it is collapsed, or it lives outside el (e.g. the browser
	 * moved it after a programmatic change). The edited content is plain
	 * text, so offsets are content offsets.
	 */
	function selectionRange(el: HTMLElement): { start: number; end: number } | null {
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0) return null;
		const range = sel.getRangeAt(0);
		if (range.collapsed) return null;
		if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
		const start = offsetWithin(el, range.startContainer, range.startOffset);
		const end = offsetWithin(el, range.endContainer, range.endOffset);
		return start === end ? null : { start: Math.min(start, end), end: Math.max(start, end) };
	}

	/** Collapsed caret offset within el; el's length as fallback. */
	function caretOffset(el: HTMLElement): number {
		const sel = window.getSelection();
		if (sel && sel.rangeCount > 0) {
			const range = sel.getRangeAt(0);
			if (el.contains(range.startContainer)) {
				return offsetWithin(el, range.startContainer, range.startOffset);
			}
		}
		return el.textContent?.length ?? 0;
	}

	/** Collapse the caret into el's first text node (fresh node after write). */
	function placeCaret(el: HTMLElement, offset: number) {
		const sel = window.getSelection();
		if (!sel || !el.firstChild) return;
		const len = el.firstChild.textContent?.length ?? 0;
		sel.collapse(el.firstChild, Math.min(offset, len));
	}

	/** Select [start, end] inside el's first text node (fresh node after write). */
	function placeRange(el: HTMLElement, start: number, end: number) {
		const sel = window.getSelection();
		if (!sel || !el.firstChild) return;
		const len = el.firstChild.textContent?.length ?? 0;
		const range = document.createRange();
		range.setStart(el.firstChild, Math.min(start, len));
		range.setEnd(el.firstChild, Math.min(end, len));
		sel.removeAllRanges();
		sel.addRange(range);
	}

	/**
	 * Apply one formatting action to the edited block.
	 * - Non-collapsed selection inside the block (increment B): inline
	 *   markers wrap ONLY the selection, selection preserved.
	 * - Otherwise: whole-block toggle via the shared format.ts transforms
	 *   (same semantics as the ••• menu), caret clamped by the length delta.
	 * - Headings are always whole-block: blocks are single-line.
	 * The change is committed by the existing blur-commit — this function
	 * only rewrites the DOM and the selection.
	 */
	function apply(action: BarAction) {
		const el = formatBar.el;
		if (!el) return;
		const text = el.textContent ?? '';
		const selRange = selectionRange(el);
		const caret = caretOffset(el);

		let newText = text;
		let sel: { start: number; end: number } | null = null;

		if (selRange && isInline(action)) {
			const wrapped = wrapRange(text, selRange.start, selRange.end, INLINE_MARKERS[action]);
			newText = wrapped.text;
			sel = { start: wrapped.selStart, end: wrapped.selEnd };
		} else {
			switch (action) {
				case 'h1':
					newText = toggleHeading(text, 1);
					break;
				case 'h2':
					newText = toggleHeading(text, 2);
					break;
				case 'h3':
					newText = toggleHeading(text, 3);
					break;
				case 'bold':
					newText = toggleBold(text);
					break;
				case 'italic':
					newText = toggleItalic(text);
					break;
				case 'strike':
					newText = toggleStrikethrough(text);
					break;
				case 'highlight':
					newText = toggleHighlight(text);
					break;
				case 'code':
					newText = toggleCode(text);
					break;
			}
		}

		if (newText === text) return; // no-op toggle — nothing to commit
		el.textContent = newText;
		if (sel) {
			placeRange(el, sel.start, sel.end);
		} else {
			placeCaret(el, Math.min(caret + (newText.length - text.length), newText.length));
		}
	}

	/** Keep focus in the contenteditable — the bar never steals it (see header comment). */
	function keepEdit(e: MouseEvent) {
		e.preventDefault();
	}
</script>

{#if formatBar.el}
	<div
		class="formatbar"
		role="toolbar"
		aria-label={t('formatbar.aria')}
		aria-orientation="horizontal"
		tabindex="-1"
		style="bottom: calc({kbOffset}px + var(--formatbar-m));"
		onmousedown={keepEdit}
	>
		<div class="formatbar-scroll">
			<button class="fb-btn fb-btn--h" aria-label={t('menu.h1')} onclick={() => apply('h1')}>
				H1
			</button>
			<button class="fb-btn fb-btn--h" aria-label={t('menu.h2')} onclick={() => apply('h2')}>
				H2
			</button>
			<button class="fb-btn fb-btn--h" aria-label={t('menu.h3')} onclick={() => apply('h3')}>
				H3
			</button>
			<span class="fb-sep" aria-hidden="true"></span>
			<button class="fb-btn fb-btn--b" aria-label={t('menu.bold')} onclick={() => apply('bold')}>
				B
			</button>
			<button
				class="fb-btn fb-btn--i"
				aria-label={t('menu.italic')}
				onclick={() => apply('italic')}
			>
				I
			</button>
			<button
				class="fb-btn fb-btn--s"
				aria-label={t('menu.strike')}
				onclick={() => apply('strike')}
			>
				S
			</button>
			<button class="fb-btn" aria-label={t('menu.highlight')} onclick={() => apply('highlight')}>
				==
			</button>
			<button class="fb-btn fb-btn--code" aria-label={t('menu.code')} onclick={() => apply('code')}>
				&lt;/&gt;
			</button>
		</div>
		<!-- Right-edge fade: hints that more options are reachable by sliding -->
		<div class="fb-fade" aria-hidden="true"></div>
	</div>
{/if}

<style>
	/*
	 * The bar floats over the content, centered like the search pill.
	 * z-40: above the editor, below the navbar/drawers (50/55) and the
	 * context menus (50) — an open menu covers it, which is correct.
	 */
	.formatbar {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		z-index: 40;
		max-width: calc(100vw - 2 * var(--formatbar-m));
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		border-radius: 10px;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
		padding: 0.25rem 0 0.25rem 0.25rem;
		/* Notched phones: keep clear of the home indicator */
		padding-bottom: calc(0.25rem + env(safe-area-inset-bottom));
		overflow: hidden;
		animation: formatbar-in 0.15s ease;
		touch-action: manipulation;
	}
	/*
	 * The mobile rule from Block.svelte's gutter, inverted: hide the bar
	 * only where hover menus exist AND the window is wide.
	 */
	@media (min-width: 1024px) and (hover: hover) {
		.formatbar {
			display: none;
		}
	}
	@keyframes formatbar-in {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}

	.formatbar-scroll {
		display: flex;
		align-items: center;
		gap: 2px;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		-webkit-overflow-scrolling: touch;
		/* The scrollbar is pure noise on a floating toolbar */
		scrollbar-width: none;
	}
	.formatbar-scroll::-webkit-scrollbar {
		display: none;
	}

	/* Edge fade: sits above the scroll row, content scrolls underneath */
	.fb-fade {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		width: 1.5rem;
		pointer-events: none;
		background: linear-gradient(to left, var(--color-surface), transparent);
	}

	.fb-btn {
		flex-shrink: 0;
		scroll-snap-align: center;
		min-width: 2.5rem;
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		border-radius: 8px;
		font: inherit;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
		cursor: pointer;
		/* No text selection / no callout when long-pressing the toolbar */
		-webkit-user-select: none;
		user-select: none;
	}
	.fb-btn:hover,
	.fb-btn:active {
		color: var(--color-encre);
	}
	/* Glyph variants — text as icon, same trick as Obsidian */
	.fb-btn--h {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.fb-btn--b {
		font-weight: 700;
	}
	.fb-btn--i {
		font-style: italic;
	}
	.fb-btn--s {
		text-decoration: line-through;
	}
	.fb-btn--code {
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace;
		font-size: 0.8rem;
	}

	.fb-sep {
		flex-shrink: 0;
		width: 1px;
		height: 1.5rem;
		margin: 0 0.125rem;
		background: color-mix(in srgb, var(--color-encre) 12%, transparent);
	}
</style>
