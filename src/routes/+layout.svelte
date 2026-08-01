<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import PaletteResults from '$lib/components/PaletteResults.svelte';

	let { children } = $props();

	/** Global palette shortcut: Ctrl/Cmd+K focuses the inline search in the navbar. */
	function onGlobalKeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			// Focus the first InlinePalette input on the page (navbar)
			const input = document.querySelector<HTMLInputElement>('.inline-palette input');
			input?.focus();
		}
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<svelte:window onkeydown={onGlobalKeydown} />
{@render children()}
<PaletteResults />
