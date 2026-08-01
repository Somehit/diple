<script lang="ts">
	import { keybindings, type CommandId } from '$lib/keybindings';
	import { comboLabel } from '$lib/commands';

	/**
	 * Right-hand help panel, toggled by the "?" button in the navbar.
	 * Reference only — it documents what exists, it doesn't change state.
	 * Mirrors the left Sidebar's look and slide behaviour (fixed, 260px,
	 * blur, translateX(100%) → 0).
	 */
	let { open = false }: { open?: boolean } = $props();

	/** Human labels for the editor's command ids (keybindings.ts). */
	const COMMAND_LABELS: Partial<Record<CommandId, string>> = {
		'block.split': 'Split block',
		'block.indent': 'Indent',
		'block.outdent': 'Outdent',
		'block.backspace': 'Delete block',
		'block.moveUp': 'Move block up',
		'block.moveDown': 'Move block down',
		'edit.undo': 'Undo',
		'edit.redo': 'Redo',
		'edit.copy': 'Copy',
		'edit.cut': 'Cut',
		'edit.paste': 'Paste',
		'view.zoomIn': 'Zoom into block',
		'view.zoomOut': 'Zoom out'
	};

	/**
	 * Shortcut rows, in keybindings.ts insertion order (modifier combos are
	 * pretty-printed via comboLabel). Ctrl+K is appended separately: the
	 * global search focus handler lives in +layout.svelte, not in the
	 * keybindings table.
	 */
	const shortcutRows: { combo: string; label: string }[] = Object.entries(keybindings).map(
		([combo, cmd]) => ({ combo: comboLabel(combo), label: COMMAND_LABELS[cmd] ?? cmd })
	);
	shortcutRows.push({ combo: comboLabel('ctrl+k'), label: 'Focus search' });

	/**
	 * Documented duplicate of FilterName in src/lib/server/db/queries.ts —
	 * that module is server-only and can't be imported from the client.
	 * Keep in sync when search filters change.
	 */
	const FILTERS: { token: string; label: string }[] = [
		{ token: ':root', label: 'Top-level blocks only' },
		{ token: ':leaves', label: 'Blocks with no children' },
		{ token: ':branches', label: 'Blocks with children' },
		{ token: ':today', label: 'Blocks created today' }
	];
</script>

<aside class="help-panel" class:help-panel--open={open} aria-label="Help">
	<div class="help-scroll">
		<h2 class="help-title">Help</h2>

		<section class="help-section">
			<h3 class="help-heading">Shortcuts</h3>
			<ul class="help-list">
				{#each shortcutRows as row (row.combo)}
					<li class="help-row">
						<kbd class="help-kbd">{row.combo}</kbd>
						<span class="help-label">{row.label}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="help-section">
			<h3 class="help-heading">Search filters</h3>
			<p class="help-hint">Type a filter in the search bar, optionally with words.</p>
			<ul class="help-list">
				{#each FILTERS as filter (filter.token)}
					<li class="help-row">
						<kbd class="help-kbd">{filter.token}</kbd>
						<span class="help-label">{filter.label}</span>
					</li>
				{/each}
			</ul>
			<p class="help-example">
				Example: <kbd class="help-kbd">:today meeting</kbd>
			</p>
		</section>
	</div>
</aside>

<style>
	.help-panel {
		position: fixed;
		top: 0;
		right: 0;
		height: 100vh;
		z-index: 55;
		width: var(--help-w);
		background: color-mix(in srgb, var(--color-fond) 92%, transparent);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-left: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
		overflow: hidden;
		transform: translateX(100%);
		transition: transform 0.2s ease;
	}
	.help-panel--open {
		transform: translateX(0);
	}

	.help-scroll {
		/* Top clearance: the floating corner buttons (1rem + 36px) occupy the
		   panel's top-right corner — content starts below them. */
		padding: 3.75rem 0.625rem 0.625rem;
		overflow-y: auto;
		height: 100%;
	}

	.help-title {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-encre);
	}

	.help-section {
		margin-bottom: 1.25rem;
	}
	.help-heading {
		margin: 0 0 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}

	.help-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}
	.help-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: color-mix(in srgb, var(--color-encre) 75%, transparent);
	}
	.help-kbd {
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
	.help-label {
		min-width: 0;
	}

	.help-hint {
		margin: 0 0 0.375rem;
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--color-encre) 55%, transparent);
	}
	.help-example {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: color-mix(in srgb, var(--color-encre) 55%, transparent);
	}
</style>
