<script lang="ts">
	export type FormatAction =
		| 'h1'
		| 'h2'
		| 'h3'
		| 'bold'
		| 'italic'
		| 'highlight'
		| 'strike'
		| 'code'
		| 'copy'
		| 'cut'
		| 'paste'
		| 'delete';

	type Props = {
		onApply: (action: FormatAction) => void;
		showClipboard?: boolean;
		showDelete?: boolean;
	};

	let { onApply, showClipboard = true, showDelete = false }: Props = $props();
</script>

{#if showClipboard}
	<button class="menu-item" onclick={() => onApply('copy')}>Copier</button>
	<button class="menu-item" onclick={() => onApply('cut')}>Couper</button>
	<button class="menu-item" onclick={() => onApply('paste')}>Coller</button>
	<hr class="menu-divider" />
{/if}
<button class="menu-item" onclick={() => onApply('h1')}>Titre 1</button>
<button class="menu-item" onclick={() => onApply('h2')}>Titre 2</button>
<button class="menu-item" onclick={() => onApply('h3')}>Titre 3</button>
<hr class="menu-divider" />
<button class="menu-item" onclick={() => onApply('bold')}>Gras</button>
<button class="menu-item" onclick={() => onApply('italic')}>Italique</button>
<button class="menu-item" onclick={() => onApply('highlight')}>Surligné</button>
<button class="menu-item" onclick={() => onApply('strike')}>Barré</button>
<button class="menu-item" onclick={() => onApply('code')}>Code</button>
{#if showDelete}
	<hr class="menu-divider" />
	<button class="menu-item menu-item--danger" onclick={() => onApply('delete')}>Supprimer</button>
{/if}

<style>
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
	.menu-item--danger {
		color: var(--color-danger, #d32f2f);
	}

	.menu-divider {
		border: none;
		border-top: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
		margin: 2px 0;
	}
</style>
