<script lang="ts">
	import { t } from '$lib/i18n.svelte';

	export type FormatAction =
		| 'zoom'
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
		showZoom?: boolean;
	};

	let { onApply, showClipboard = true, showDelete = false, showZoom = false }: Props = $props();
</script>

{#if showZoom}
	<button class="menu-item" onclick={() => onApply('zoom')}>{t('menu.zoom')}</button>
	<hr class="menu-divider" />
{/if}
{#if showClipboard}
	<button class="menu-item" onclick={() => onApply('copy')}>{t('menu.copy')}</button>
	<button class="menu-item" onclick={() => onApply('cut')}>{t('menu.cut')}</button>
	<button class="menu-item" onclick={() => onApply('paste')}>{t('menu.paste')}</button>
	<hr class="menu-divider" />
{/if}
<button class="menu-item" onclick={() => onApply('h1')}>{t('menu.h1')}</button>
<button class="menu-item" onclick={() => onApply('h2')}>{t('menu.h2')}</button>
<button class="menu-item" onclick={() => onApply('h3')}>{t('menu.h3')}</button>
<hr class="menu-divider" />
<button class="menu-item" onclick={() => onApply('bold')}>{t('menu.bold')}</button>
<button class="menu-item" onclick={() => onApply('italic')}>{t('menu.italic')}</button>
<button class="menu-item" onclick={() => onApply('highlight')}>{t('menu.highlight')}</button>
<button class="menu-item" onclick={() => onApply('strike')}>{t('menu.strike')}</button>
<button class="menu-item" onclick={() => onApply('code')}>{t('menu.code')}</button>
{#if showDelete}
	<hr class="menu-divider" />
	<button class="menu-item menu-item--danger" onclick={() => onApply('delete')}>
		{t('menu.delete')}
	</button>
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
