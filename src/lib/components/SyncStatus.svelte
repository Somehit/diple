<script lang="ts">
	import { sync } from '$lib/sync.svelte';

	/**
	 * Discreet sync-status dot (top-right corner cluster) + hover popover.
	 * Dot colour: green = healthy, amber = mutation in flight, red = server
	 * unreachable. `online` is the truth from GET /api/health — navigator.onLine
	 * is only used as a trigger to re-ping, never as truth.
	 */

	let hovered = $state(false);

	/** "31/07/2026, 22:02:04 GMT-4" — dd/MM/yyyy + hh:mm:ss + tz abbreviation. */
	const lastChangeLabel = $derived(
		sync.lastChange === null
			? 'Never'
			: new Date(sync.lastChange).toLocaleString('en-GB', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					timeZoneName: 'short'
				})
	);

	const statusLabel = $derived(
		sync.online
			? sync.pendingLocal > 0
				? `Sync: syncing (${sync.pendingLocal} pending)`
				: 'Sync: online'
			: 'Sync: offline'
	);

	async function ping() {
		try {
			const res = await fetch('/api/health');
			if (!res.ok) throw new Error(`health ${res.status}`);
			const data = (await res.json()) as { lastChange?: number | null };
			sync.online = true;
			// The ping is server truth, but never clobber a fresher local commit.
			if (typeof data.lastChange === 'number' && data.lastChange > (sync.lastChange ?? 0)) {
				sync.lastChange = data.lastChange;
			}
		} catch {
			sync.online = false;
		}
	}

	// Ping on mount, every 30s, and when the browser claims connectivity is back.
	$effect(() => {
		ping();
		const timer = setInterval(ping, 30_000);
		window.addEventListener('online', ping);
		return () => {
			clearInterval(timer);
			window.removeEventListener('online', ping);
		};
	});
</script>

<div
	class="sync"
	class:sync--amber={sync.online && sync.pendingLocal > 0}
	class:sync--offline={!sync.online}
	role="status"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	aria-label={statusLabel}
>
	<span class="dot"></span>

	{#if hovered}
		<div class="tooltip" role="tooltip">
			<p class="title">Diple is <strong>{sync.online ? 'online' : 'offline'}</strong></p>
			<p class="row"><strong>{sync.pendingLocal}</strong> pending local changes</p>
			<p class="row"><strong>{sync.pendingRemote}</strong> pending remote changes</p>
			<p class="last-label">Last change in server:</p>
			<p class="last-value">{lastChangeLabel}</p>
		</div>
	{/if}
</div>

<style>
	.sync {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Same 36px footprint as the corner buttons — the dot keeps the
		   cluster's spacing rhythm ([dot][collapse][?] all 36px wide). */
		width: 36px;
		pointer-events: auto; /* the corner cluster is pointer-events: none */
		cursor: default;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #2f9e44; /* healthy green — muted, fits the warm palette */
		transition: background 0.2s ease;
	}
	.sync--amber .dot {
		background: var(--color-accent);
	}
	.sync--offline .dot {
		background: var(--color-erreur);
	}

	/* Popover — drops below the dot, right-aligned to the cluster edge.
	   Inside .corner-btns (z-56) → above the help panel (z-55). */
	.tooltip {
		position: absolute;
		top: calc(100% + 10px);
		right: 0;
		width: max-content;
		min-width: 210px;
		background: var(--color-surface);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		padding: 0.625rem 0.75rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--color-encre) 75%, transparent);
	}
	.tooltip p {
		margin: 0;
	}
	.tooltip strong {
		color: var(--color-encre);
		font-weight: 600;
	}
	.title {
		margin-bottom: 0.375rem;
	}
	.last-label {
		margin-top: 0.5rem;
		color: color-mix(in srgb, var(--color-encre) 45%, transparent);
	}
	.last-value {
		color: var(--color-encre);
	}
</style>
