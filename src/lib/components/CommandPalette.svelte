<script lang="ts">
	import { tick } from 'svelte';
	import { palette } from '$lib/palette.svelte';
	import { matchCommands, shortcutOf, type PaletteCommand } from '$lib/commands';
	import SearchPill from './SearchPill.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { SearchResult } from '$lib/server/db/queries';
	import { zoomTo } from '$lib/zoom';

	/**
	 * One selectable row: a block from search results or from recents.
	 * `path` crumbs are full {id, content} pairs so they stay clickable in recents.
	 */
	type ResultRow = {
		id: string;
		content: string;
		path: { id: string; content: string }[];
	};

	type Recent = ResultRow;

	type Item =
		| { kind: 'command'; command: PaletteCommand }
		| { kind: 'result'; row: ResultRow; recent: boolean };

	const RECENTS_KEY = 'diple:recents';
	const MAX_RECENTS = 8;

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let recents = $state<Recent[]>([]);
	let selected = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let listEl: HTMLElement | undefined = $state();
	let fetchSeq = 0;

	function loadRecents(): Recent[] {
		try {
			return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
		} catch {
			return [];
		}
	}

	function pushRecent(row: ResultRow) {
		const list = [row, ...loadRecents().filter((r) => r.id !== row.id)].slice(0, MAX_RECENTS);
		localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
	}

	const commands = $derived(matchCommands(query));

	const rows = $derived(
		results.map((r) => ({
			id: r.block.id,
			content: r.block.content,
			path: r.path.map((p) => ({ id: p.id, content: p.content }))
		}))
	);

	/** Flat selectable list, in display order: recents → commands → block results. */
	const items = $derived.by((): Item[] => {
		const list: Item[] = [];
		if (query.trim() === '') {
			for (const row of recents) list.push({ kind: 'result', row, recent: true });
		}
		for (const command of commands) list.push({ kind: 'command', command });
		for (const row of rows) list.push({ kind: 'result', row, recent: false });
		return list;
	});

	/** Section title for an item, used to render group headers on transitions. */
	function sectionOf(item: Item): string {
		if (item.kind === 'command') return 'Commands';
		return item.recent ? 'Recent' : 'Blocks';
	}

	// Fetch results on query change (debounced). `fetchSeq` drops stale responses.
	$effect(() => {
		if (!palette.open) return;
		const q = query.trim();
		const timer = setTimeout(
			async () => {
				if (q === '') {
					results = [];
					return;
				}
				const seq = ++fetchSeq;
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
				if (seq !== fetchSeq) return;
				if (!res.ok) {
					console.error(`[palette] search failed: ${res.status}`);
					return;
				}
				results = (await res.json()).results;
			},
			q === '' ? 0 : 120
		);
		return () => clearTimeout(timer);
	});

	// Reset state on each open, refresh recents, focus the input.
	$effect(() => {
		if (palette.open) {
			query = '';
			results = [];
			selected = 0;
			recents = loadRecents();
			tick().then(() => inputEl?.focus());
		}
	});

	// Keep the selection inside the list as it shrinks/grows.
	$effect(() => {
		if (selected >= items.length) selected = Math.max(0, items.length - 1);
	});

	// Scroll the selected row into view.
	$effect(() => {
		const i = selected;
		listEl?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	// Lock body scroll while the palette is open.
	$effect(() => {
		if (!palette.open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});

	function choose(item: Item) {
		if (item.kind === 'command') {
			palette.close();
			item.command.run();
			return;
		}
		// No zoom into empty blocks (filter-only queries like :today can return them)
		if (!item.row.content.trim()) return;
		pushRecent(item.row);
		palette.close();
		zoomTo(item.row.id);
	}

	/** Breadcrumb click: navigate to the ancestor itself, not the matched block. */
	function chooseCrumb(e: MouseEvent, row: ResultRow, crumbId: string) {
		e.stopPropagation();
		const idx = row.path.findIndex((p) => p.id === crumbId);
		if (idx === -1) return;
		const crumb = row.path[idx];
		if (!crumb.content.trim()) return; // no zoom into empty blocks
		pushRecent({ id: crumb.id, content: crumb.content, path: row.path.slice(0, idx) });
		palette.close();
		zoomTo(crumbId);
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selected = Math.min(selected + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selected = Math.max(selected - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = items[selected];
			if (item) choose(item);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			palette.close();
		}
	}
</script>

{#if palette.open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={() => palette.close()}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<div class="panel" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
			<SearchPill>
				<input
					bind:this={inputEl}
					bind:value={query}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="palette-list"
					placeholder="Search blocks or type a command… (:root, :leaves, :branches, :today)"
					onkeydown={onInputKeydown}
				/>
			</SearchPill>

			{#if items.length > 0}
				<div class="results" id="palette-list" role="listbox" bind:this={listEl}>
					{#each items as item, i (item.kind === 'command' ? 'cmd-' + item.command.id : item.row.id)}
						{#if i === 0 || sectionOf(items[i - 1]) !== sectionOf(item)}
							<div class="section">{sectionOf(item)}</div>
						{/if}
						<!-- Keyboard selection runs through the combobox input (aria-activedescendant pattern) -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div
							class="row"
							class:row--selected={i === selected}
							role="option"
							aria-selected={i === selected}
							data-idx={i}
							onmousemove={() => (selected = i)}
							onclick={() => choose(item)}
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
												<button class="crumb" onclick={(e) => chooseCrumb(e, item.row, crumb.id)}
													>{crumb.content || '(empty)'}</button
												>
											{/each}
										</span>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
					<div class="footer">↑↓ navigate · ↵ open · esc close</div>
				</div>
			{:else if query.trim() !== ''}
				<div class="results results--empty">No results</div>
			{/if}
		</div>
	</div>
{/if}

<svelte:window
	onkeydown={(e) => {
		if (palette.open && e.key === 'Escape') palette.close();
	}}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		justify-content: center;
		align-items: center;
		background: color-mix(in srgb, var(--color-fond) 45%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.panel input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font: inherit;
		color: var(--color-encre);
	}
	.panel input::placeholder {
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
	}
	/*
	 * Results drop below the pill WITHOUT shifting it: absolutely positioned
	 * relative to .panel (whose in-flow content is just the pill), so the pill
	 * stays vertically centered whether results are shown or not.
	 */
	.results {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: min(720px, calc(100vw - 2rem));
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
	.results--empty {
		padding: 1.25rem;
		text-align: center;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
		font-style: italic;
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
