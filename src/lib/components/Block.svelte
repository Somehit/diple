<script lang="ts">
	import { marked } from 'marked';
	import { type Block, type TreeStore } from '$lib/state/tree.svelte.js';
	import BlockComponent from './Block.svelte';

	let { store, block }: { store: TreeStore; block: Block } = $props();

	let localContent = $state(block.content);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	const children = $derived(store.childrenOf(block.id));
	const focused = $derived(store.focusedId === block.id);

	// Sync when block changes externally (e.g. server reload)
	$effect(() => {
		if (!focused) localContent = block.content;
	});

	// Focus the textarea when this block becomes active
	$effect(() => {
		if (focused && textareaEl) {
			textareaEl.focus();
			const pos = store.caretPos ?? textareaEl.value.length;
			textareaEl.setSelectionRange(pos, pos);
			store.caretPos = null;
			autoResize(textareaEl);
		}
	});

	function autoResize(el: HTMLTextAreaElement) {
		el.style.height = '0';
		el.style.height = el.scrollHeight + 'px';
	}

	function handleInput(e: Event) {
		const ta = e.target as HTMLTextAreaElement;
		localContent = ta.value;
		store.saveContent(block.id, ta.value);
		autoResize(ta);
	}

	function handleKeydown(e: KeyboardEvent) {
		const ta = e.target as HTMLTextAreaElement;
		const hasChildren = children.length > 0;

		if (e.key === 'Enter') {
			e.preventDefault();
			const pos = ta.selectionStart;
			const before = ta.value.slice(0, pos);
			const after = ta.value.slice(pos);

			store.saveContent(block.id, before);
			store.create(block.parent_id, after, block.position + 1).then((newId) => {
				store.focusedId = newId;
				store.caretPos = 0;
			});
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			if (e.shiftKey) {
				store.outdent(block.id);
			} else {
				store.indent(block.id);
			}
			return;
		}

		if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0) {
			if (ta.value === '' && !hasChildren) {
				e.preventDefault();
				store.deleteBlock(block.id).then((prevId) => {
					if (prevId) store.focusedId = prevId;
				});
			}
			return;
		}

		if (e.key === 'Delete' && ta.value === '' && !hasChildren) {
			e.preventDefault();
			const flat = store.flatList();
			const idx = flat.findIndex((b) => b.id === block.id);
			const nextId = idx < flat.length - 1 ? flat[idx + 1].id : null;
			store.deleteBlock(block.id).then(() => {
				if (nextId) store.focusedId = nextId;
			});
			return;
		}

		const flat = store.flatList();
		const idx = flat.findIndex((b) => b.id === block.id);

		if (e.key === 'ArrowUp' && idx > 0) {
			e.preventDefault();
			store.focusedId = flat[idx - 1].id;
			store.caretPos = flat[idx - 1].content.length;
		}

		if (e.key === 'ArrowDown' && idx < flat.length - 1) {
			e.preventDefault();
			store.focusedId = flat[idx + 1].id;
			store.caretPos = 0;
		}
	}
</script>

<div class="block-wrapper">
	<div class="block-row flex items-start gap-1">
		<span class="bullet mt-[3px] w-4 shrink-0 text-center text-gray-400 select-none">•</span>
		<div class="min-w-0 flex-1">
			{#if focused}
				<textarea
					bind:this={textareaEl}
					class="textarea w-full resize-none overflow-hidden border-none bg-transparent p-0 leading-relaxed outline-none"
					rows="1"
					value={localContent}
					oninput={handleInput}
					onkeydown={handleKeydown}></textarea>
			{:else}
				<div
					class="display markdown-body min-h-[1.5em] cursor-text leading-relaxed"
					onclick={() => {
						store.focusedId = block.id;
						store.caretPos = block.content.length;
					}}
					role="button"
					tabindex="0"
				>
					{#if block.content}
						{@html marked.parseInline(block.content)}
					{:else}
						<span class="text-gray-300 italic">empty</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if children.length > 0}
		<section class="ml-6">
			{#each children as child (child.id)}
				<BlockComponent {store} block={child} />
			{/each}
		</section>
	{/if}
</div>

<style>
	.markdown-body :global(strong) {
		font-weight: 600;
	}

	.markdown-body :global(em) {
		font-style: italic;
	}

	.markdown-body :global(a) {
		color: #3b82f6;
		text-decoration: underline;
	}

	.markdown-body :global(code) {
		font-family: ui-monospace, monospace;
		font-size: 0.875em;
		background: #f1f5f9;
		border-radius: 3px;
		padding: 0.1em 0.3em;
	}
</style>
