<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { TreeStore } from '$lib/state/tree.svelte.js';
	import Block from '$lib/components/Block.svelte';

	let { data } = $props();
	const store = new TreeStore(data.blocks);
	store.onError = () => invalidateAll();

	const roots = $derived(store.roots());

	function createRoot() {
		store.create(null).then((id) => {
			store.focusedId = id;
		});
	}

	function handlePageKeydown(e: KeyboardEvent) {
		// Only handle Enter on empty page
		if (e.key === 'Enter' && roots.length === 0 && store.focusedId === null) {
			e.preventDefault();
			createRoot();
		}
	}
</script>

<svelte:window onkeydown={handlePageKeydown} />

<main class="mx-auto max-w-3xl px-4 py-8">
	{#if roots.length === 0}
		<button
			class="empty-state block w-full rounded-lg border-2 border-dashed border-gray-200 px-6 py-12 text-center text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-500"
			onclick={createRoot}
		>
			<span class="block text-lg italic">everything is a bullet point</span>
			<span class="mt-1 block text-sm">— always has been.</span>
			<span class="mt-3 block text-xs">click or press Enter to start</span>
		</button>
	{:else}
		<section>
			{#each roots as root (root.id)}
				<Block {store} block={root} />
			{/each}
		</section>
	{/if}
</main>
