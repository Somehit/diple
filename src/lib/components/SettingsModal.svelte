<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { commandShortcuts } from '$lib/commands';
	import { settings, updateSettings, type Lang } from '$lib/settings.svelte';
	import { t } from '$lib/i18n.svelte';

	/**
	 * Centered settings modal, opened from the sidebar footer button.
	 * Preferences is the real tab (language, appearance, layout, block
	 * count); Shortcuts documents the rebindable table (rebinding UI is a
	 * later increment); the last two tabs are empty shells.
	 */
	let { open = false, onClose }: { open?: boolean; onClose?: () => void } = $props();

	const TABS = [
		{ id: 'preferences', labelKey: 'settings.tabs.preferences' },
		{ id: 'shortcuts', labelKey: 'settings.tabs.shortcuts' },
		{ id: 'import-export', labelKey: 'settings.tabs.importExport' },
		{ id: 'account', labelKey: 'settings.tabs.account' }
	] as const;

	type TabId = (typeof TABS)[number]['id'];
	let activeTab = $state<TabId>('preferences');

	/** Option groups — values are Settings keys, labels come from the i18n
	 *  dict (translated live on language switch). */
	const LANG_OPTIONS = [
		{ value: 'fr', labelKey: 'lang.fr' },
		{ value: 'en', labelKey: 'lang.en' }
	] as const;
	const THEME_OPTIONS = [
		{ value: 'light', labelKey: 'pref.theme.light' },
		{ value: 'dark', labelKey: 'pref.theme.dark' },
		{ value: 'system', labelKey: 'pref.theme.system' }
	] as const;
	const FONT_SIZE_OPTIONS = [
		{ value: 'small', labelKey: 'pref.fontSize.small' },
		{ value: 'medium', labelKey: 'pref.fontSize.medium' },
		{ value: 'large', labelKey: 'pref.fontSize.large' }
	] as const;
	const FONT_OPTIONS = [
		{ value: 'sans', labelKey: 'pref.font.sans' },
		{ value: 'serif', labelKey: 'pref.font.serif' },
		{ value: 'mono', labelKey: 'pref.font.mono' }
	] as const;
	const WIDTH_OPTIONS = [
		{ value: 'narrow', labelKey: 'pref.width.narrow' },
		{ value: 'medium', labelKey: 'pref.width.medium' },
		{ value: 'wide', labelKey: 'pref.width.wide' }
	] as const;
	const BLOCK_COUNT_OPTIONS = [
		{ value: 'hidden', labelKey: 'pref.blockCount.hidden' },
		{ value: 'descendants', labelKey: 'pref.blockCount.descendants' },
		{ value: 'children', labelKey: 'pref.blockCount.children' }
	] as const;

	/** Close only when the click lands on the scrim itself, never on the modal. */
	function handleScrimClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose?.();
	}
</script>

{#snippet segmented(
	options: readonly { value: string; labelKey: string }[],
	value: string,
	onSelect: (value: string) => void
)}
	<div class="seg">
		{#each options as opt (opt.value)}
			<button
				class="seg-btn"
				class:seg-btn--active={value === opt.value}
				aria-pressed={value === opt.value}
				onclick={() => onSelect(opt.value)}
			>
				{t(opt.labelKey)}
			</button>
		{/each}
	</div>
{/snippet}

{#if open}
	<!-- Scrim: darkens the app behind the modal. Click-to-close lives here;
	     Escape is handled at page level (with the panel Escape). -->
	<div class="scrim" onclick={handleScrimClick} in:fade={{ duration: 120 }}>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			aria-label={t('settings.title')}
			in:scale={{ duration: 120, start: 0.96 }}
		>
			<header class="modal-header">
				<h2 class="modal-title">{t('settings.title')}</h2>
				<button
					class="modal-close"
					onclick={onClose}
					aria-label={t('settings.close')}
					title={t('settings.closeEsc')}
				>
					<!-- X (Lucide "x", MIT) -->
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</header>

			<!-- Tab bar — the active tab carries a 2px accent underline that
			     doubles as the separator above the body. -->
			<nav class="tabs" role="tablist" aria-label={t('settings.title')}>
				{#each TABS as tab (tab.id)}
					<button
						class="tab"
						class:tab--active={activeTab === tab.id}
						role="tab"
						aria-selected={activeTab === tab.id}
						onclick={() => (activeTab = tab.id)}
					>
						{t(tab.labelKey)}
					</button>
				{/each}
			</nav>

			<div class="tab-body" role="tabpanel">
				{#if activeTab === 'preferences'}
					<!-- Language first — the user asked for it front and centre;
					     every other section re-renders in the new language
					     immediately (t() reads settings.lang). -->
					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.language')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.language.label')}</span>
							{@render segmented(LANG_OPTIONS, settings.lang, (v) =>
								updateSettings({ lang: v as Lang })
							)}
						</div>
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.appearance')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.theme.label')}</span>
							{@render segmented(THEME_OPTIONS, settings.theme, (v) =>
								updateSettings({ theme: v as typeof settings.theme })
							)}
						</div>
						<div class="pref-row">
							<span class="pref-label">{t('pref.fontSize.label')}</span>
							{@render segmented(FONT_SIZE_OPTIONS, settings.fontSize, (v) =>
								updateSettings({ fontSize: v as typeof settings.fontSize })
							)}
						</div>
						<div class="pref-row">
							<span class="pref-label">{t('pref.font.label')}</span>
							{@render segmented(FONT_OPTIONS, settings.font, (v) =>
								updateSettings({ font: v as typeof settings.font })
							)}
						</div>
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.width.label')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.width.label')}</span>
							{@render segmented(WIDTH_OPTIONS, settings.contentWidth, (v) =>
								updateSettings({ contentWidth: v as typeof settings.contentWidth })
							)}
						</div>
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.blockCount.label')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.blockCount.label')}</span>
							{@render segmented(BLOCK_COUNT_OPTIONS, settings.blockCount, (v) =>
								updateSettings({ blockCount: v as typeof settings.blockCount })
							)}
						</div>
					</section>
				{:else if activeTab === 'shortcuts'}
					<section class="pref-section">
						<h3 class="pref-heading">{t('shortcuts.title')}</h3>
						<ul class="shortcut-list">
							{#each commandShortcuts() as row (row.combo)}
								<li class="shortcut-row">
									<kbd class="shortcut-kbd">{row.combo}</kbd>
									<span class="shortcut-label">{row.label}</span>
								</li>
							{/each}
						</ul>
					</section>

					<!-- Keys handled outside the keybindings table — contextual
					     behaviours, not rebindable commands. -->
					<section class="pref-section">
						<h3 class="pref-heading">{t('shortcuts.contextual')}</h3>
						<ul class="shortcut-list">
							<li class="shortcut-row">
								<kbd class="shortcut-kbd">Esc</kbd>
								<span class="shortcut-label">{t('shortcuts.esc')}</span>
							</li>
							<li class="shortcut-row">
								<kbd class="shortcut-kbd">Backspace / Delete</kbd>
								<span class="shortcut-label">{t('shortcuts.backspace')}</span>
							</li>
						</ul>
					</section>
				{:else}
					<p class="tab-empty">{t('settings.empty')}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 100; /* above the side panels (55) and their toggles (56) */
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-encre) 35%, transparent);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.modal {
		width: min(560px, 100%);
		max-height: min(80vh, 100%);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-fond);
		border: 1px solid color-mix(in srgb, var(--color-encre) 10%, transparent);
		border-radius: 10px;
		box-shadow: 0 20px 60px color-mix(in srgb, var(--color-encre) 25%, transparent);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
	}
	.modal-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-encre);
	}
	.modal-close {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		padding: 0;
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.modal-close:hover {
		color: var(--color-encre);
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
	}

	.tabs {
		display: flex;
		gap: 0.125rem;
		padding: 0 0.75rem;
		overflow-x: auto;
	}
	.tab {
		border: none;
		background: none;
		padding: 0.5rem 0.75rem;
		font: inherit;
		font-size: 0.85rem;
		border-radius: 6px 6px 0 0;
		cursor: pointer;
		white-space: nowrap;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
		border-bottom: 2px solid transparent;
		transition:
			color 0.15s ease,
			background 0.15s ease;
	}
	.tab:hover {
		color: var(--color-encre);
		background: color-mix(in srgb, var(--color-encre) 4%, transparent);
	}
	.tab--active {
		color: var(--color-encre);
		font-weight: 600;
		border-bottom-color: var(--color-accent);
	}

	.tab-body {
		padding: 1.25rem 1rem;
		overflow-y: auto;
		min-height: 10rem;
	}
	.tab-empty {
		margin: 0;
		text-align: center;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
	}

	/* --- Preferences --- */
	.pref-section {
		margin-bottom: 1.25rem;
	}
	.pref-heading {
		margin: 0 0 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	.pref-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.25rem 0;
	}
	.pref-label {
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 75%, transparent);
	}
	/* Segmented control: raised pill on a recessed track. The active state
	   lifts via the light surface — reads as a toggle, not a tab. */
	.seg {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-encre) 7%, transparent);
	}
	.seg-btn {
		border: none;
		background: none;
		font: inherit;
		font-size: 0.82rem;
		padding: 0.25rem 0.625rem;
		border-radius: 6px;
		cursor: pointer;
		white-space: nowrap;
		color: color-mix(in srgb, var(--color-encre) 60%, transparent);
		transition:
			background 0.12s ease,
			color 0.12s ease;
	}
	.seg-btn:hover {
		color: var(--color-encre);
	}
	.seg-btn--active {
		background: var(--color-fond);
		color: var(--color-encre);
		font-weight: 600;
		box-shadow: 0 1px 3px color-mix(in srgb, var(--color-encre) 15%, transparent);
	}

	/* --- Shortcuts tab — same visual language as the help panel --- */
	.shortcut-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.shortcut-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 75%, transparent);
	}
	.shortcut-kbd {
		flex-shrink: 0;
		min-width: 2.75rem;
		text-align: center;
		font-family: var(--font-sans);
		font-size: 0.72rem;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		color: color-mix(in srgb, var(--color-encre) 70%, transparent);
	}
	.shortcut-label {
		min-width: 0;
	}
</style>
