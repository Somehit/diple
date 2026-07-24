<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import type { Block } from '$lib/server/db/queries';

	let { data }: { data: { blocks: Block[] } } = $props();
</script>

<Editor blocks={data.blocks} />
