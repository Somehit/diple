<script lang="ts">
	import type { Block } from '$lib/server/db/queries';
	import FormatMenuItems, { type FormatAction } from './FormatMenuItems.svelte';
	import {
		toggleHeading,
		toggleBold,
		toggleItalic,
		toggleHighlight,
		toggleStrikethrough,
		toggleCode
	} from '$lib/utils/format';

	/**
	 * Per-block "•••" menu (hover-revealed, like the zoom button).
	 * Formats the whole block via the pure transforms in format.ts — the same
	 * logic as the selection menu — and reports through the 4-arg onSaveContent
	 * so the change lands in the undo stack like any edit.
	 */
	let {
		block,
		onSaveContent
	}: {
		block: Block;
		onSaveContent: (id: string, before: string, after: string, caret?: number) => void;
	} = $props();

	let open = $state(false);
	let btnEl: HTMLButtonElement | undefined = $state();
	let menuPos = $state<{ x: number; y: number } | null>(null);

	function openMenu() {
		if (!btnEl) return;
		const rect = btnEl.getBoundingClientRect();
		// Clamp like SelectionMenu: keep the ~150×260 dropdown inside the viewport
		const x = Math.min(rect.left, (visualViewport?.width ?? window.innerWidth) - 150);
		const y = Math.min(rect.bottom + 4, (visualViewport?.height ?? window.innerHeight) - 260);
		menuPos = { x, y };
		open = true;
	}

	function apply(action: FormatAction) {
		open = false;
		const before = block.content;
		let after: string;
		switch (action) {
			case 'h1':
				after = toggleHeading(before, 1);
				break;
			case 'h2':
				after = toggleHeading(before, 2);
				break;
			case 'h3':
				after = toggleHeading(before, 3);
				break;
			case 'bold':
				after = toggleBold(before);
				break;
			case 'italic':
				after = toggleItalic(before);
				break;
			case 'highlight':
				after = toggleHighlight(before);
				break;
			case 'strike':
				after = toggleStrikethrough(before);
				break;
			case 'code':
				after = toggleCode(before);
				break;
			default:
				return; // 'delete' is not rendered in this menu
		}
		// Skip no-op saves (matches stopEditing's guard) — no phantom undo entries
		if (after !== before) onSaveContent(block.id, before, after);
	}
</script>

<button
	class="menu-btn"
	class:menu-btn--open={open}
	bind:this={btnEl}
	aria-label="Block options"
	onclick={openMenu}
>
	•••
</button>

{#if open && menuPos}
	<div class="menu-backdrop" role="presentation" onclick={() => (open = false)}></div>
	<div class="menu-dropdown" style="left: {menuPos.x}px; top: {menuPos.y}px;">
		<FormatMenuItems onApply={apply} showDelete={false} />
	</div>
{/if}

<style>
	.menu-btn {
		flex-shrink: 0;
		/* --menu-w is set on .block in Block.svelte and inherits through */
		width: var(--menu-w, 1.35rem);
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 0.75em;
		letter-spacing: 0.05em;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 30%, transparent);
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.menu-btn:hover {
		color: var(--color-accent);
	}
	/* Reveal on row hover — .block-row lives in Block.svelte, hence :global */
	:global(.block-row:hover) .menu-btn,
	.menu-btn--open {
		opacity: 1;
	}
	/* No hover reveal while drag-selecting (same rule as the zoom button) */
	:global(.editor--selecting) .menu-btn {
		opacity: 0;
	}
	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.menu-dropdown {
		position: fixed;
		z-index: 50;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		min-width: 140px;
		padding: 4px 0;
	}
</style>
