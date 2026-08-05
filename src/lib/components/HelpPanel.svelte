<script lang="ts">
	import { commandShortcuts } from '$lib/commands';
	import { t } from '$lib/i18n.svelte';

	/**
	 * Right-hand help panel, toggled by the "?" button in the navbar.
	 * Reference only — it documents what exists, it doesn't change state.
	 * Mirrors the left Sidebar's look and slide behaviour (fixed, 280px,
	 * blur, translateX(100%) → 0).
	 */
	let { open = false }: { open?: boolean } = $props();

	/**
	 * Documented duplicate of FilterName in src/lib/server/db/queries.ts —
	 * that module is server-only and can't be imported from the client.
	 * Keep in sync when search filters change.
	 */
	const FILTERS: { token: string; labelKey: string }[] = [
		{ token: ':root', labelKey: 'help.filter.root' },
		{ token: ':leaves', labelKey: 'help.filter.leaves' },
		{ token: ':branches', labelKey: 'help.filter.branches' },
		{ token: ':today', labelKey: 'help.filter.today' }
	];
</script>

<aside class="help-panel" class:help-panel--open={open} aria-label={t('help.aria')}>
	<div class="help-scroll">
		<h2 class="help-title">{t('help.title')}</h2>

		<section class="help-section">
			<h3 class="help-heading">{t('help.shortcuts')}</h3>
			<ul class="help-list">
				{#each commandShortcuts() as row (row.combo)}
					<li class="help-row">
						<kbd class="help-kbd">{row.combo}</kbd>
						<span class="help-label">{row.label}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="help-section">
			<h3 class="help-heading">{t('help.filters')}</h3>
			<p class="help-hint">{t('help.filters.hint')}</p>
			<ul class="help-list">
				{#each FILTERS as filter (filter.token)}
					<li class="help-row">
						<kbd class="help-kbd">{filter.token}</kbd>
						<span class="help-label">{t(filter.labelKey)}</span>
					</li>
				{/each}
			</ul>
			<p class="help-example">
				{t('help.filters.example')}: <kbd class="help-kbd">:today meeting</kbd>
			</p>
		</section>
	</div>
</aside>

<style>
	.help-panel {
		position: fixed;
		top: 0;
		right: 0;
		/* 100vh fallback, then 100dvh so the panel clears the mobile URL
		   bar instead of running under it. */
		height: 100vh;
		height: 100dvh;
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

	/* Narrow (< 1024px): the corner buttons float at the actions row
	   (top ≈ 82–118px) above the drawer — the content must clear them,
	   not just the old 1rem row. Width comes from --help-w (layout.css). */
	@media (max-width: 1023px) {
		.help-scroll {
			padding-top: calc(var(--actions-row-top) + 36px + 0.5rem);
		}
	}
</style>
