<script lang="ts">
	import SearchPill from './SearchPill.svelte';
	import { matchCommands } from '$lib/commands';
	import { t } from '$lib/i18n.svelte';
	import type { SearchResult } from '$lib/server/db/queries';
	import { zoomTo } from '$lib/zoom.svelte';
	import { loadRecents, pushRecent, removeRecent, type RecentEntry } from '$lib/recent';
	import { resultsState, type ResultRow, type Item } from '$lib/palette.svelte';

	/**
	 * Inline command palette — lives in the navbar, always visible.
	 * No modal, no overlay. The input is always rendered.
	 * Results are rendered at body level via PaletteResults.svelte
	 * (escapes the navbar's mask-image and backdrop-filter).
	 */

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let recents = $state<RecentEntry[]>([]);
	let selected = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let listEl = $state<HTMLElement | null>(null);
	let fetchSeq = 0;
	let focused = $state(false);
	let pillEl: HTMLElement | undefined = $state();

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

	function sectionOf(item: Item): string {
		if (item.kind === 'command') return t('palette.commands');
		return item.recent ? t('palette.recent') : t('palette.blocks');
	}

	// --- Fetch results on query change (debounced) ---
	$effect(() => {
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
					console.error(`[search] failed: ${res.status}`);
					return;
				}
				results = (await res.json()).results;
			},
			q === '' ? 0 : 120
		);
		return () => clearTimeout(timer);
	});

	// --- Focus / blur ---
	function onFocus() {
		focused = true;
		recents = loadRecents();
		selected = 0;
	}

	function onBlur() {
		// Delay so clicks on results register before the dropdown disappears
		setTimeout(() => {
			focused = false;
			query = '';
			results = [];
			selected = 0;
		}, 150);
	}

	// --- Keyboard ---
	function onKeydown(e: KeyboardEvent) {
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
			inputEl?.blur();
		}
	}

	// Keep selection in bounds
	$effect(() => {
		if (selected >= items.length) selected = Math.max(0, items.length - 1);
	});

	// Scroll selected into view
	$effect(() => {
		const i = selected;
		listEl?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	// --- Actions ---
	async function choose(item: Item) {
		if (item.kind === 'command') {
			inputEl?.blur();
			item.command.run();
			return;
		}
		if (!item.row.content.trim()) return;
		pushRecent(item.row);
		// Validate recent exists before zooming (stale recent cleanup)
		if (item.recent) {
			const check = await fetch(`/api/blocks/${encodeURIComponent(item.row.id)}`);
			if (!check.ok) {
				removeRecent(item.row.id);
				recents = loadRecents();
				inputEl?.blur();
				return;
			}
		}
		inputEl?.blur();
		zoomTo(item.row.id);
	}

	function chooseCrumb(e: MouseEvent, row: ResultRow, crumbId: string) {
		e.stopPropagation();
		const idx = row.path.findIndex((p) => p.id === crumbId);
		if (idx === -1) return;
		const crumb = row.path[idx];
		if (!crumb.content.trim()) return;
		pushRecent({ id: crumb.id, content: crumb.content, path: row.path.slice(0, idx) });
		inputEl?.blur();
		zoomTo(crumbId);
	}

	// --- Sync to shared resultsState (portal to PaletteResults) ---
	$effect(() => {
		resultsState.visible = focused && items.length > 0;
		resultsState.items = items;
		resultsState.selected = selected;
		resultsState.sectionOf = sectionOf;
		resultsState.choose = choose;
		resultsState.chooseCrumb = chooseCrumb;
		resultsState.onMousemove = (i: number) => (selected = i);
		resultsState.listEl = listEl;
		if (pillEl) {
			const rect = pillEl.getBoundingClientRect();
			resultsState.pillTop = rect.top;
			resultsState.pillLeft = rect.left;
			resultsState.pillWidth = rect.width;
		}
	});

	// Update pill position on scroll/resize for the dropdown portal
	$effect(() => {
		if (!focused) return;
		function update() {
			if (pillEl) {
				const rect = pillEl.getBoundingClientRect();
				resultsState.pillTop = rect.top;
				resultsState.pillLeft = rect.left;
				resultsState.pillWidth = rect.width;
			}
		}
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update, { passive: true });
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	});

	/** Exposed for parent to focus programmatically (hero dismiss → focus search). */
	export function focusInput() {
		inputEl?.focus();
	}
</script>

<div class="inline-palette" bind:this={pillEl}>
	<SearchPill>
		<svg
			class="icon"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="7" />
			<line x1="16.5" y1="16.5" x2="21" y2="21" />
		</svg>
		<input
			bind:this={inputEl}
			bind:value={query}
			type="text"
			role="combobox"
			aria-expanded={focused && items.length > 0}
			aria-controls="search-results"
			placeholder={t('palette.placeholder')}
			onfocus={onFocus}
			onblur={onBlur}
			onkeydown={onKeydown}
		/>
	</SearchPill>
</div>

<style>
	.inline-palette {
		position: relative;
		pointer-events: auto;
	}
	.icon {
		flex-shrink: 0;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font: inherit;
		color: var(--color-encre);
	}
	input::placeholder {
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
	}
</style>
