<script lang="ts">
	import { fade } from 'svelte/transition';
	import SearchPill from './SearchPill.svelte';
	import PillTrigger from './PillTrigger.svelte';

	/**
	 * The docked top bar. Appears exactly when the hero pill scrolls up to its
	 * level — a plain fade makes the swap invisible (same spot, same size).
	 */
</script>

<header class="topbar" transition:fade={{ duration: 150 }}>
	<div class="topbar-pill">
		<SearchPill>
			<PillTrigger />
		</SearchPill>
	</div>
</header>

<style>
	.topbar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		/* Don't block clicks on elements below (breadcrumb) — only the pill
		   inside is interactive, the decorative padding/mask area is passive. */
		pointer-events: none;
		padding: 0.875rem 1rem 2.75rem;
		/* Softer full-width blur band, extending further below the pill and
		   fading out at the bottom edge — no hard line */
		background: color-mix(in srgb, var(--color-fond) 45%, transparent);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		mask-image: linear-gradient(to bottom, black 55%, transparent);
		-webkit-mask-image: linear-gradient(to bottom, black 55%, transparent);
	}
	/* Restore interactivity for the pill inside the decorative navbar shell */
	.topbar-pill {
		pointer-events: auto;
	}
</style>
