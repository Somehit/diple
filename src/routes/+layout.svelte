<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import { palette } from '$lib/palette.svelte';

	let { children } = $props();

	/** Global palette shortcut: Ctrl/Cmd+P opens the unified palette. */
	function onGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
			e.preventDefault();
			palette.openPalette();
		}
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window onkeydown={onGlobalKeydown} />
{@render children()}
<CommandPalette />
