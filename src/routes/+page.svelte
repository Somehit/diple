<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import SearchPill from '$lib/components/SearchPill.svelte';
	import PillTrigger from '$lib/components/PillTrigger.svelte';
	import type { Block } from '$lib/server/db/queries';
	import { currentZoomId } from '$lib/zoom';

	let { data }: { data: { blocks: Block[] } } = $props();

	let editor: Editor | undefined = $state();
	let pillEl: HTMLElement | undefined = $state();
	/** Whether the zoom is active — used to relax main's min-height. */
	const zoomed = $derived(currentZoomId() !== null);
	/** Hero pill scrolled up to the top bar's level → search lives there. */
	let docked = $state(false);
	/** Drives the staggered block entrance (editor--intro class). */
	let intro = $state(false);
	/**
	 * Plain (non-reactive) flag: the effect below must not read `intro`,
	 * or writing it would retrigger the effect and kill the animation.
	 * Guarantees the entrance plays exactly once — blocks created later
	 * (Enter) never animate.
	 */
	let introPlayed = false;

	// Dock when the hero pill's top edge nears the top bar's pill position:
	// 14px = navbar padding-top (exact coincidence), + 58px of anticipation so
	// the docked bar is already there when the hero pill arrives. Reversible.
	$effect(() => {
		if (!pillEl) return;
		const observer = new IntersectionObserver(([entry]) => (docked = !entry.isIntersecting), {
			rootMargin: '-72px 0px 0px 0px'
		});
		observer.observe(pillEl);
		return () => observer.disconnect();
	});

	// One-shot intro: the longest cascade is ~1.2s (capped delay 720ms + 450ms
	// duration), so the class comes off at 1.5s and later blocks mount silently.
	$effect(() => {
		if (docked && !introPlayed) {
			introPlayed = true;
			intro = true;
			const timer = setTimeout(() => (intro = false), 1500);
			return () => {
				clearTimeout(timer);
				intro = false;
			};
		}
	});
</script>

{#if docked || zoomed}
	<Navbar />
{/if}

{#if !zoomed}
	<section class="hero">
		<div class="hero-pill" class:hero-pill--hidden={docked} bind:this={pillEl}>
			<SearchPill>
				<PillTrigger />
			</SearchPill>
		</div>
		<h1 class="wordmark">Diple</h1>
		<p class="scroll-hint">Scroll down to go home ↓</p>
	</section>
{/if}

<main class:main--zoomed={zoomed}>
	<Editor bind:this={editor} blocks={data.blocks} {intro} />
</main>

<style>
	.hero {
		position: relative;
		height: 100svh;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	/*
	 * The pill — not the wordmark/pill/hint cluster — sits at the exact
	 * viewport center. Wordmark and hint are anchored to it absolutely.
	 * Net effect: hero pill and palette pill occupy the same screen position.
	 */
	.hero-pill {
		transition: opacity 0.15s ease;
	}
	.hero-pill--hidden {
		opacity: 0;
		pointer-events: none;
	}
	.wordmark {
		position: absolute;
		top: 50%;
		left: 50%;
		/* -100% = own height; 30px = half the pill height; 2rem = gap */
		transform: translate(-50%, calc(-100% - 30px - 2rem));
		margin: 0;
		font-family: var(--font-serif, Georgia, serif);
		font-weight: 600;
		font-size: clamp(3rem, 8vw, 4.75rem);
		letter-spacing: -0.02em;
		white-space: nowrap;
	}
	.scroll-hint {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, calc(30px + 2rem));
		margin: 0;
		font-size: 0.9rem;
		color: color-mix(in srgb, var(--color-encre) 40%, transparent);
		white-space: nowrap;
	}
	/* Guarantee scrollability so the dock observer fires even with a tiny tree */
	main {
		min-height: 100vh;
	}
	/* When zoomed, main hugs its content — no forced void below a short zoom view.
	   Top clearance so the zoom header sits below the fixed navbar pill (no hero to push it). */
	.main--zoomed {
		min-height: auto;
		padding-top: 4.5rem;
	}
</style>
