<script lang="ts">
	import { resultsState } from '$lib/palette.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { shortcutOf } from '$lib/commands';

	/**
	 * Renders the search results dropdown at body level, escaping the navbar's
	 * mask-image and backdrop-filter. All state comes from resultsState (shared
	 * in palette.svelte.ts); InlinePalette updates it.
	 */
</script>

{#if resultsState.visible}
	<div
		class="results"
		id="search-results"
		role="listbox"
		bind:this={resultsState.listEl}
		style="top: {resultsState.pillTop +
			60 +
			8}px; left: {resultsState.pillLeft}px; width: {resultsState.pillWidth}px;"
	>
		{#each resultsState.items as item, i (item.kind === 'command' ? 'cmd-' + item.command.id : item.row.id)}
			{#if i === 0 || resultsState.sectionOf(resultsState.items[i - 1]) !== resultsState.sectionOf(item)}
				<div class="section">{resultsState.sectionOf(item)}</div>
			{/if}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div
				class="row"
				class:row--selected={i === resultsState.selected}
				role="option"
				aria-selected={i === resultsState.selected}
				data-idx={i}
				onmousemove={() => resultsState.onMousemove(i)}
				onclick={() => resultsState.choose(item)}
			>
				{#if item.kind === 'command'}
					<span class="row-label">{item.command.label}</span>
					{#if shortcutOf(item.command)}
						<kbd>{shortcutOf(item.command)}</kbd>
					{/if}
				{:else}
					<div class="row-main">
						<span class="row-content">
							{#if item.row.content}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes entities first -->
								{@html renderMarkdown(item.row.content)}
							{:else}
								<em class="empty">(empty)</em>
							{/if}
						</span>
						{#if item.row.path.length > 0}
							<span class="crumbs">
								{#each item.row.path as crumb, ci (crumb.id)}
									{#if ci > 0}<span class="crumb-sep">›</span>{/if}
									<button
										class="crumb"
										onclick={(e) => resultsState.chooseCrumb(e, item.row, crumb.id)}
									>
										{crumb.content || '(empty)'}
									</button>
								{/each}
							</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		<div class="footer">↑↓ navigate · ↵ open · esc close</div>
	</div>
{/if}

<style>
	.results {
		position: fixed;
		z-index: 200;
		max-height: 40vh;
		overflow-y: auto;
		border-radius: 14px;
		background: color-mix(in srgb, var(--color-fond) 82%, transparent);
		backdrop-filter: blur(14px) saturate(1.3);
		-webkit-backdrop-filter: blur(14px) saturate(1.3);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		box-shadow: 0 8px 30px color-mix(in srgb, var(--color-encre) 14%, transparent);
		padding: 6px;
	}
	.section {
		padding: 0.375rem 0.75rem 0.125rem;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		border-radius: 9px;
		cursor: pointer;
	}
	.row--selected {
		background: color-mix(in srgb, var(--color-accent) 14%, transparent);
	}
	.row-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.row-content {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.empty {
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
	}
	.crumbs {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
		white-space: nowrap;
		font-size: 0.8rem;
	}
	.crumb {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-size: inherit;
		cursor: pointer;
		color: color-mix(in srgb, var(--color-encre) 50%, transparent);
		max-width: 14ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.crumb:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}
	.crumb-sep {
		color: color-mix(in srgb, var(--color-encre) 30%, transparent);
	}
	kbd {
		font-family: inherit;
		font-size: 0.75rem;
		padding: 0.125rem 0.5rem;
		border-radius: 6px;
		background: color-mix(in srgb, var(--color-encre) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-encre) 14%, transparent);
		color: color-mix(in srgb, var(--color-encre) 65%, transparent);
		white-space: nowrap;
	}
	.footer {
		padding: 0.375rem 0.75rem;
		font-size: 0.72rem;
		text-align: center;
		color: color-mix(in srgb, var(--color-encre) 35%, transparent);
		border-top: 1px solid color-mix(in srgb, var(--color-encre) 8%, transparent);
		margin-top: 4px;
	}
</style>
