<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import PaletteResults from '$lib/components/PaletteResults.svelte';
	import { comboFromEvent } from '$lib/keybindings';
	import { commandFor } from '$lib/keybindings.svelte';

	let { children } = $props();

	/** Global palette shortcut: the combo bound to app.focusSearch (Ctrl+K by
	 *  default) focuses the inline search in the navbar. Reads the store so
	 *  a rebind works without touching this handler. */
	function onGlobalKeydown(e: KeyboardEvent) {
		if (commandFor(comboFromEvent(e)) === 'app.focusSearch') {
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
