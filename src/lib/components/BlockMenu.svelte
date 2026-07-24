<script lang="ts">
	import type { Block } from '$lib/server/db/queries';

	let {
		block,
		onSaveContent
	}: {
		block: Block;
		onSaveContent: (id: string, content: string) => void;
	} = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	// --- Format toggles (whole-block) ---

	function stripHeading(content: string): { stripped: string; level: number } {
		const m = content.match(/^(#{1,3})\s(.+)/);
		return m ? { stripped: m[2], level: m[1].length } : { stripped: content, level: 0 };
	}

	function applyHeading(level: number) {
		const { stripped, level: current } = stripHeading(block.content);
		if (current === level) {
			block.content = stripped; // toggle off
		} else {
			block.content = '#'.repeat(level) + ' ' + stripped;
		}
		onSaveContent(block.id, block.content);
		close();
	}

	function wrapPair(text: string, marker: string): string {
		if (!text) return marker + marker;
		if (text.startsWith(marker) && text.endsWith(marker)) {
			const inner = text.slice(marker.length, -marker.length);
			// Only unwrap if the inner content doesn't start/end with the same marker
			// (avoids false positives with overlapping markers)
			return inner;
		}
		return marker + text + marker;
	}

	/** Bold: uses `**` markers. Also strips a single wrapping `*` (italic) to avoid overlap. */
	function applyBold() {
		let content = block.content;
		// Strip italic first if it wraps the whole content, to avoid `***` confusion
		if (content.startsWith('*') && content.endsWith('*') && !content.startsWith('**')) {
			content = content.slice(1, -1);
		}
		block.content = wrapPair(content, '**');
		onSaveContent(block.id, block.content);
		close();
	}

	function applyItalic() {
		// Strip bold first if it wraps the whole content
		let content = block.content;
		if (content.startsWith('**') && content.endsWith('**')) {
			content = content.slice(2, -2);
		}
		block.content = wrapPair(content, '*');
		onSaveContent(block.id, block.content);
		close();
	}

	function applyHighlight() {
		block.content = wrapPair(block.content, '==');
		onSaveContent(block.id, block.content);
		close();
	}

	function applyStrikethrough() {
		block.content = wrapPair(block.content, '~~');
		onSaveContent(block.id, block.content);
		close();
	}

	function applyCode() {
		block.content = wrapPair(block.content, '`');
		onSaveContent(block.id, block.content);
		close();
	}
</script>

<span class="menu-root">
	<button
		class="menu-btn"
		aria-label="Format"
		onclick={toggle}
		onmousedown={(e) => e.preventDefault()}
	>
		•••
	</button>

	{#if open}
		<div class="menu-backdrop" role="presentation" onclick={close}></div>
		<div class="menu-dropdown">
			<button class="menu-item" onclick={() => applyHeading(1)}>Titre 1</button>
			<button class="menu-item" onclick={() => applyHeading(2)}>Titre 2</button>
			<button class="menu-item" onclick={() => applyHeading(3)}>Titre 3</button>
			<hr class="menu-divider" />
			<button class="menu-item" onclick={applyBold}>Gras</button>
			<button class="menu-item" onclick={applyItalic}>Italique</button>
			<button class="menu-item" onclick={applyHighlight}>Surligné</button>
			<button class="menu-item" onclick={applyStrikethrough}>Barré</button>
			<button class="menu-item" onclick={applyCode}>Code</button>
		</div>
	{/if}
</span>

<style>
	.menu-root {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	.menu-btn {
		border: none;
		background: var(--color-fond); /* overlay guide lines */
		font: inherit;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
		padding: 0 2px;
		line-height: 1;
		letter-spacing: 0.1em;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}

	.menu-dropdown {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 50;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		min-width: 140px;
		padding: 4px 0;
		margin-top: 2px;
	}

	.menu-item {
		display: block;
		width: 100%;
		border: none;
		background: none;
		font: inherit;
		font-size: 0.85em;
		padding: 4px 12px;
		text-align: left;
		cursor: pointer;
		color: var(--color-encre);
	}
	.menu-item:hover {
		background: color-mix(in srgb, var(--color-encre) 6%, transparent);
	}
	.menu-item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.menu-divider {
		border: none;
		border-top: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
		margin: 2px 0;
	}
</style>
