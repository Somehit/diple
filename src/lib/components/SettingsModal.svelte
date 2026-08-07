<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { commandShortcuts } from '$lib/commands';
	import {
		settings,
		updateSettings,
		factoryDefaults,
		resetSettings,
		type Lang
	} from '$lib/settings.svelte';
	import { t } from '$lib/i18n.svelte';
	import { buildExportTree, toMarkdown, toOpml, toDipleJson } from '$lib/export';
	import { parseFile, countBlocks, type ImportDestination } from '$lib/import';
	import type { PasteBlock } from '$lib/clipboard';
	import { tree } from '$lib/tree.svelte';
	import { zoomTarget } from '$lib/zoom.svelte';

	/**
	 * Centered settings modal, opened from the sidebar footer button.
	 * Preferences is the real tab (language, appearance, layout, block
	 * count); Shortcuts documents the rebindable table (rebinding UI is a
	 * later increment); the last two tabs are empty shells.
	 */
	let {
		open = false,
		onClose,
		initialTab,
		onImport
	}: {
		open?: boolean;
		onClose?: () => void;
		initialTab?: TabId;
		/** Called with the parsed tree + destination; the page wires it to the editor. */
		onImport?: (roots: PasteBlock[], destination: ImportDestination) => void;
	} = $props();

	const TABS = [
		{ id: 'preferences', labelKey: 'settings.tabs.preferences' },
		{ id: 'shortcuts', labelKey: 'settings.tabs.shortcuts' },
		{ id: 'import-export', labelKey: 'settings.tabs.importExport' },
		{ id: 'account', labelKey: 'settings.tabs.account' }
	] as const;

	type TabId = (typeof TABS)[number]['id'];
	let activeTab = $state<TabId>('preferences');

	// Each open shows the requested tab (••• "Export" → import/export), so
	// the entry point decides the first screen instead of stale last state.
	$effect(() => {
		if (open) activeTab = initialTab ?? 'preferences';
	});

	// --- Import / Export tab ---

	type ExportScope = 'all' | 'page';
	type ExportFormat = 'markdown' | 'opml' | 'json';

	const EXPORT_SCOPES = [
		{ value: 'all', labelKey: 'settings.io.scope.all' },
		{ value: 'page', labelKey: 'settings.io.scope.page' }
	] as const;
	const EXPORT_FORMATS = [
		{ value: 'markdown', labelKey: 'settings.io.format.markdown' },
		{ value: 'opml', labelKey: 'settings.io.format.opml' },
		{ value: 'json', labelKey: 'settings.io.format.json' }
	] as const;

	/** Export defaults — the segmented control badges them with "Default". */
	let exportScope = $state<ExportScope>('all');
	let exportFormat = $state<ExportFormat>('markdown');

	/** True while zoomed — the only time the two export scopes differ. */
	const exportScopeEnabled = $derived(zoomTarget.id !== null);

	/**
	 * Serialize the tree (or the current page) to the chosen format and
	 * download it. Purely client-side: the blocks live in the shared tree
	 * store, buildExportTree and the serializers are pure functions — no
	 * server round-trip.
	 */
	function handleExport() {
		const blocks = tree.blocks;
		if (blocks.length === 0) return;

		// 'whole tree' = every root block; 'current page' = the zoom block.
		// At the root the two scopes coincide (the selector is disabled there).
		const rootIds =
			exportScope === 'page' && zoomTarget.id
				? [zoomTarget.id]
				: blocks.filter((b) => b.parent_id === null).map((b) => b.id);
		const paste = buildExportTree(blocks, rootIds);
		if (!paste || paste.length === 0) return; // stale zoom id, empty tree

		const date = new Date().toISOString().slice(0, 10);
		let filename: string;
		let mime: string;
		let content: string;
		if (exportFormat === 'markdown') {
			filename = `diple-${date}.md`;
			mime = 'text/markdown';
			content = toMarkdown(paste);
		} else if (exportFormat === 'opml') {
			filename = `diple-${date}.opml`;
			mime = 'text/x-opml';
			content = toOpml(paste);
		} else {
			filename = `diple-${date}.json`;
			mime = 'application/json';
			content = toDipleJson(paste);
		}
		download(filename, mime, content);
	}

	/** Trigger a browser download from a string payload. */
	function download(filename: string, mime: string, content: string) {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// --- Import ---

	const IMPORT_DESTINATIONS = [
		{ value: 'page', labelKey: 'settings.io.destination.page' },
		{ value: 'root', labelKey: 'settings.io.destination.root' }
	] as const;

	/** The parsed file, once a readable one was chosen. Null = nothing chosen (yet). */
	let importFile = $state<{ name: string; roots: PasteBlock[] } | null>(null);
	let importError = $state<string | null>(null);
	let importDestination = $state<ImportDestination>('page');

	/** "name — N blocks" once a file parsed; reactive to language switches. */
	const importSummary = $derived(
		importFile
			? `${importFile.name} — ${countBlocks(importFile.roots)} ${t(
					countBlocks(importFile.roots) === 1 ? 'settings.io.blocks.one' : 'settings.io.blocks.many'
				)}`
			: ''
	);

	/**
	 * Read the chosen file as text and parse it (format autodetected from
	 * name + content). The summary and destination radio appear only once
	 * a file parsed. The input value is reset so choosing the same file
	 * again re-fires onchange.
	 */
	function handleFileChosen(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		importFile = null;
		importError = null;
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const parsed = parseFile(file.name, String(reader.result ?? ''));
			if (!parsed) {
				importError = t('settings.io.error');
				return;
			}
			importFile = { name: file.name, roots: parsed.roots };
		};
		reader.onerror = () => (importError = t('settings.io.error'));
		reader.readAsText(file);
		input.value = '';
	}

	/** Fire the import callback — the page closes the modal, the editor inserts. */
	function handleImport() {
		if (!importFile) return;
		onImport?.(importFile.roots, importDestination);
		// Clear the summary so a reopened modal starts clean (no accidental re-import).
		importFile = null;
		importError = null;
	}

	/** What a fresh browser shows — compared against the live settings to
	 *  badge the default option of every control, and what the reset
	 *  button restores. lang follows the browser (see factoryDefaults). */
	const defaults = factoryDefaults();

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
	const SIDEBAR_MODE_OPTIONS = [
		{ value: 'siblings', labelKey: 'pref.sidebar.siblings' },
		{ value: 'page', labelKey: 'pref.sidebar.page' },
		{ value: 'home', labelKey: 'pref.sidebar.home' }
	] as const;

	/** Reset confirmation — a layer inside the modal (see the markup at the
	 *  bottom). Open state lives here so handleScrimClick can treat an
	 *  outer click as "close only the dialog". */
	let confirmOpen = $state(false);
	let confirmCard = $state<HTMLDivElement | null>(null);
	let confirmCancelBtn = $state<HTMLButtonElement | null>(null);
	let resetBtn = $state<HTMLButtonElement | null>(null);
	/** Set once the dialog has been open — the close branch then knows the
	 *  focus was inside it and hands it back to the reset button. */
	let confirmWasOpen = false;

	$effect(() => {
		if (confirmOpen) {
			confirmWasOpen = true;
			confirmCancelBtn?.focus();
		} else if (confirmWasOpen) {
			confirmWasOpen = false;
			resetBtn?.focus();
		}
	});

	/** Focus stays inside the two-button dialog (Tab wraps), and Escape
	 *  closes only it — stopPropagation keeps the page-level handler
	 *  (which closes the whole modal) from firing underneath. */
	function onConfirmKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			confirmOpen = false;
			return;
		}
		if (e.key !== 'Tab' || !confirmCard) return;
		const buttons = confirmCard.querySelectorAll('button');
		if (buttons.length < 2) return;
		const first = buttons[0];
		const last = buttons[buttons.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	/** Close only when the click lands on the scrim itself, never on the
	 *  modal. While the reset confirmation is open, an outer click closes
	 *  just the dialog — settings survive an accidental misclick. */
	function handleScrimClick(e: MouseEvent) {
		if (e.target !== e.currentTarget) return;
		if (confirmOpen) {
			confirmOpen = false;
			return;
		}
		onClose?.();
	}
</script>

{#snippet segmented(
	options: readonly { value: string; labelKey: string }[],
	value: string,
	onSelect: (value: string) => void,
	defaultValue: string,
	disabled = false
)}
	<div class="seg">
		{#each options as opt (opt.value)}
			<button
				class="seg-btn"
				class:seg-btn--active={value === opt.value}
				aria-pressed={value === opt.value}
				{disabled}
				onclick={() => onSelect(opt.value)}
			>
				{t(opt.labelKey)}
				{#if defaultValue === opt.value}
					<span class="pref-default">{t('pref.default')}</span>
				{/if}
			</button>
		{/each}
	</div>
{/snippet}

{#snippet radios(
	options: readonly { value: string; labelKey: string }[],
	group: string,
	value: string,
	onSelect: (value: string) => void,
	defaultValue: string,
	labelledby: string
)}
	<!-- Compact radio list — one line per option: native radio + label, no
	     card chrome. The section heading names the group (labelledby). -->
	<div class="pref-radios" role="radiogroup" aria-labelledby={labelledby}>
		{#each options as opt (opt.value)}
			<label class="pref-radio">
				<input
					type="radio"
					name={group}
					value={opt.value}
					checked={value === opt.value}
					onchange={() => onSelect(opt.value)}
				/>
				<span class="pref-radio-label">{t(opt.labelKey)}</span>
				{#if defaultValue === opt.value}
					<span class="pref-default">{t('pref.default')}</span>
				{/if}
			</label>
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
			<header class="modal-header" inert={confirmOpen}>
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

			<!-- Tab bar — square underline tabs: the 1px divider under the
			     row separates tabs from the body; the active tab's 2px
			     accent underline sits flush on it. -->
			<nav class="tabs" role="tablist" aria-label={t('settings.title')} inert={confirmOpen}>
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

			<div class="tab-body" role="tabpanel" inert={confirmOpen}>
				{#if activeTab === 'preferences'}
					<!-- Language first — the user asked for it front and centre;
					     every other section re-renders in the new language
					     immediately (t() reads settings.lang). -->
					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.language')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.language.label')}</span>
							{@render segmented(
								LANG_OPTIONS,
								settings.lang,
								(v) => updateSettings({ lang: v as Lang }),
								defaults.lang
							)}
						</div>
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.appearance')}</h3>
						<div class="pref-row">
							<span class="pref-label">{t('pref.theme.label')}</span>
							{@render segmented(
								THEME_OPTIONS,
								settings.theme,
								(v) => updateSettings({ theme: v as typeof settings.theme }),
								defaults.theme
							)}
						</div>
						<div class="pref-row">
							<span class="pref-label">{t('pref.fontSize.label')}</span>
							{@render segmented(
								FONT_SIZE_OPTIONS,
								settings.fontSize,
								(v) => updateSettings({ fontSize: v as typeof settings.fontSize }),
								defaults.fontSize
							)}
						</div>
						<div class="pref-row">
							<span class="pref-label">{t('pref.font.label')}</span>
							{@render segmented(
								FONT_OPTIONS,
								settings.font,
								(v) => updateSettings({ font: v as typeof settings.font }),
								defaults.font
							)}
						</div>
						<!-- Text column width sits with the other look-and-feel rows:
						     its own section with the same name was pure echo. -->
						<div class="pref-row">
							<span class="pref-label">{t('pref.width.label')}</span>
							{@render segmented(
								WIDTH_OPTIONS,
								settings.contentWidth,
								(v) => updateSettings({ contentWidth: v as typeof settings.contentWidth }),
								defaults.contentWidth
							)}
						</div>
					</section>

					<section class="pref-section">
						<h3 class="pref-heading" id="pref-blockcount">{t('pref.blockCount.label')}</h3>
						<p class="pref-desc">{t('pref.blockCount.desc')}</p>
						{@render radios(
							BLOCK_COUNT_OPTIONS,
							'blockCount',
							settings.blockCount,
							(v) => updateSettings({ blockCount: v as typeof settings.blockCount }),
							defaults.blockCount,
							'pref-blockcount'
						)}
					</section>

					<section class="pref-section">
						<h3 class="pref-heading" id="pref-sidebar">{t('pref.sidebar.label')}</h3>
						<p class="pref-desc">{t('pref.sidebar.desc')}</p>
						{@render radios(
							SIDEBAR_MODE_OPTIONS,
							'sidebarMode',
							settings.sidebarMode,
							(v) => updateSettings({ sidebarMode: v as typeof settings.sidebarMode }),
							defaults.sidebarMode,
							'pref-sidebar'
						)}
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('pref.reset.label')}</h3>
						<p class="pref-reset-desc">{t('pref.reset.desc')}</p>
						<!-- Red and full-width: a destructive action earns the loudest
						     button in the modal. It never fires directly — the
						     confirmation layer below has the final word. -->
						<button class="pref-reset" bind:this={resetBtn} onclick={() => (confirmOpen = true)}>
							{t('pref.reset.action')}
						</button>
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
				{:else if activeTab === 'import-export'}
					<!-- Import first — the tab is titled "Import / Export". -->
					<section class="pref-section">
						<h3 class="pref-heading">{t('settings.io.import')}</h3>
						<p class="pref-desc">{t('settings.io.importDesc')}</p>
						<label class="io-file">
							<input type="file" accept=".md,.txt,.opml,.json" onchange={handleFileChosen} />
							{#if importFile}
								<span class="io-file-label">{importSummary}</span>
							{:else}
								{t('settings.io.file')}
							{/if}
						</label>
						{#if importError}
							<p class="pref-desc io-error">{importError}</p>
						{/if}
						{#if importFile}
							<p class="pref-desc" id="io-import-dest">{t('settings.io.destination')}</p>
							{@render radios(
								IMPORT_DESTINATIONS,
								'importDestination',
								importDestination,
								(v) => (importDestination = v as ImportDestination),
								'page',
								'io-import-dest'
							)}
							<button class="io-action" onclick={handleImport}>
								{t('settings.io.importAction')}
							</button>
						{/if}
					</section>

					<section class="pref-section">
						<h3 class="pref-heading">{t('settings.io.export')}</h3>
						<p class="pref-desc">{t('settings.io.exportDesc')}</p>
						<div class="pref-row">
							<span class="pref-label">{t('settings.io.scope')}</span>
							{@render segmented(
								EXPORT_SCOPES,
								exportScope,
								(v) => (exportScope = v as ExportScope),
								'all',
								!exportScopeEnabled
							)}
						</div>
						{#if !exportScopeEnabled}
							<p class="pref-desc">{t('settings.io.scope.disabled')}</p>
						{/if}
						<div class="pref-row">
							<span class="pref-label">{t('settings.io.format')}</span>
							{@render segmented(
								EXPORT_FORMATS,
								exportFormat,
								(v) => (exportFormat = v as ExportFormat),
								'markdown'
							)}
						</div>
						<button class="io-action" onclick={handleExport}>
							{t('settings.io.download')}
						</button>
					</section>
				{:else}
					<p class="tab-empty">{t('settings.empty')}</p>
				{/if}
			</div>

			{#if confirmOpen}
				<!-- Confirmation layer — covers the modal and blocks its content
				     (inert) so Tab cannot reach the settings behind the dialog.
				     Escape closes only this layer: stopPropagation keeps the
				     page-level Escape handler from closing the whole modal. -->
				<div
					class="confirm-overlay"
					role="presentation"
					onclick={(e) => {
						if (e.target === e.currentTarget) confirmOpen = false;
					}}
				>
					<div
						class="confirm-card"
						role="alertdialog"
						aria-modal="true"
						aria-labelledby="confirm-title"
						aria-describedby="confirm-desc"
						tabindex="-1"
						bind:this={confirmCard}
						onkeydown={onConfirmKeydown}
						in:scale={{ duration: 100, start: 0.96 }}
					>
						<h3 class="confirm-title" id="confirm-title">{t('pref.reset.confirm.title')}</h3>
						<p class="confirm-desc" id="confirm-desc">{t('pref.reset.confirm.desc')}</p>
						<div class="confirm-actions">
							<button
								class="confirm-cancel"
								bind:this={confirmCancelBtn}
								onclick={() => (confirmOpen = false)}
							>
								{t('pref.reset.cancel')}
							</button>
							<button
								class="confirm-ok"
								onclick={() => {
									resetSettings();
									confirmOpen = false;
								}}
							>
								{t('pref.reset.confirm.action')}
							</button>
						</div>
					</div>
				</div>
			{/if}
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
		position: relative; /* the confirmation layer positions against it */
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
		/* The single horizontal line of the tab bar — under the tabs, not
		   above them. The active tab's 2px accent underline sits flush on
		   it (flex stretch puts each button's bottom edge on the content
		   box bottom, directly above this border). */
		border-bottom: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
	}
	.tab {
		border: none;
		background: none;
		padding: 0.5rem 0.75rem;
		font: inherit;
		font-size: 0.85rem;
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
		/* inline-flex so the Default badge inside a segment aligns with
		   the label instead of hanging on the baseline. */
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.seg-btn:hover {
		color: var(--color-encre);
	}
	.seg-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.seg-btn:disabled:hover {
		color: color-mix(in srgb, var(--color-encre) 60%, transparent);
	}
	.seg-btn--active {
		background: var(--color-fond);
		color: var(--color-encre);
		font-weight: 600;
		box-shadow: 0 1px 3px color-mix(in srgb, var(--color-encre) 15%, transparent);
	}

	/* --- Compact radio list — one line per option: native radio + label,
	   no card chrome. The checked dot uses the ink colour (accent is
	   reserved for functional states elsewhere); :has keeps the label
	   emphasis tied to the input state without JS. */
	.pref-desc {
		margin: 0 0 0.375rem;
		font-size: 0.78rem;
		line-height: 1.35;
		color: color-mix(in srgb, var(--color-encre) 50%, transparent);
	}
	.pref-radios {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.pref-radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.375rem;
		margin-left: -0.375rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 70%, transparent);
		transition: background 0.12s ease;
	}
	.pref-radio:hover {
		background: color-mix(in srgb, var(--color-encre) 4%, transparent);
	}
	.pref-radio input {
		width: 14px;
		height: 14px;
		margin: 0;
		flex-shrink: 0;
		accent-color: var(--color-encre);
	}
	.pref-radio:has(input:checked) .pref-radio-label {
		color: var(--color-encre);
		font-weight: 600;
	}

	/* The "Default" marker — a small muted pill, shared by the segmented
	   buttons and the radio cards. */
	.pref-default {
		flex-shrink: 0;
		font-size: 0.62rem;
		font-weight: 500;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}

	/* --- Import/Export action button — full-width, neutral (additive
	   actions are never red; the reset button owns the error colour). */
	.io-action {
		width: 100%;
		border: none;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		border-radius: 8px;
		padding: 0.625rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-encre);
		cursor: pointer;
		transition: background 0.12s ease;
	}
	.io-action:hover {
		background: color-mix(in srgb, var(--color-encre) 13%, transparent);
	}

	/* --- Import file picker — a dashed label hiding the native input
	   (the label IS the button: click anywhere to choose). */
	.io-file {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		border: 1px dashed color-mix(in srgb, var(--color-encre) 22%, transparent);
		border-radius: 8px;
		padding: 0.625rem 0.75rem;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 60%, transparent);
		cursor: pointer;
		transition:
			background 0.12s ease,
			border-color 0.12s ease;
	}
	.io-file:hover {
		background: color-mix(in srgb, var(--color-encre) 4%, transparent);
		border-color: color-mix(in srgb, var(--color-encre) 35%, transparent);
	}
	.io-file input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.io-file-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-encre);
	}
	.io-error {
		color: var(--color-erreur);
	}

	/* --- Reset section — full-width solid red button: a destructive action
	   earns the loudest control in the modal. It opens the confirmation
	   dialog instead of firing directly. */
	.pref-reset-desc {
		margin: 0 0 0.5rem;
		font-size: 0.78rem;
		line-height: 1.35;
		color: color-mix(in srgb, var(--color-encre) 50%, transparent);
	}
	.pref-reset {
		width: 100%;
		border: none;
		background: var(--color-erreur);
		border-radius: 8px;
		padding: 0.625rem;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		color: #fff;
		cursor: pointer;
		transition: background 0.12s ease;
	}
	.pref-reset:hover {
		background: color-mix(in srgb, var(--color-erreur) 88%, black);
	}

	/* --- Reset confirmation — a layer inside the modal: dims the modal
	   behind and drops a small card. The outer scrim click while this is
	   open closes only the dialog (see handleScrimClick). */
	.confirm-overlay {
		position: absolute;
		inset: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: color-mix(in srgb, var(--color-encre) 30%, transparent);
		border-radius: 10px;
	}
	.confirm-card {
		width: min(320px, 100%);
		background: var(--color-fond);
		border: 1px solid color-mix(in srgb, var(--color-encre) 10%, transparent);
		border-radius: 10px;
		box-shadow: 0 10px 30px color-mix(in srgb, var(--color-encre) 25%, transparent);
		padding: 1rem;
	}
	.confirm-title {
		margin: 0 0 0.25rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-encre);
	}
	.confirm-desc {
		margin: 0 0 0.875rem;
		font-size: 0.82rem;
		line-height: 1.4;
		color: color-mix(in srgb, var(--color-encre) 55%, transparent);
	}
	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.confirm-cancel {
		border: 1px solid color-mix(in srgb, var(--color-encre) 15%, transparent);
		background: none;
		border-radius: 6px;
		padding: 0.375rem 0.75rem;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 500;
		color: color-mix(in srgb, var(--color-encre) 70%, transparent);
		cursor: pointer;
		transition:
			background 0.12s ease,
			color 0.12s ease;
	}
	.confirm-cancel:hover {
		background: color-mix(in srgb, var(--color-encre) 5%, transparent);
		color: var(--color-encre);
	}
	.confirm-ok {
		border: none;
		background: var(--color-erreur);
		border-radius: 6px;
		padding: 0.375rem 0.75rem;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		color: #fff;
		cursor: pointer;
		transition: background 0.12s ease;
	}
	.confirm-ok:hover {
		background: color-mix(in srgb, var(--color-erreur) 88%, black);
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
