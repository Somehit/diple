<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * The floating search bar shell — same look everywhere: hero (centered),
	 * top bar (docked) and palette modal (live input). The caller provides the
	 * control inside (button for display mode, input for the modal).
	 */
	let { children }: { children: Snippet } = $props();
</script>

<div class="pill">
	{@render children()}
</div>

<style>
	.pill {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: min(720px, calc(100vw - 2rem));
		height: 60px;
		padding: 0 1.125rem;
		border-radius: 14px;
		/* Semi-transparent + blur: content shows through, per the design refs */
		background: color-mix(in srgb, var(--color-fond) 72%, transparent);
		backdrop-filter: blur(14px) saturate(1.3);
		-webkit-backdrop-filter: blur(14px) saturate(1.3);
		border: 1px solid color-mix(in srgb, var(--color-encre) 12%, transparent);
		box-shadow: 0 8px 30px color-mix(in srgb, var(--color-encre) 14%, transparent);
	}
</style>
