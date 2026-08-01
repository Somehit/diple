import type { Block } from '$lib/server/db/queries';

/**
 * Singleton reactive blocks state shared between Editor (writes) and Sidebar
 * (reads).  Initialised by +page.svelte on load, kept current by Editor's
 * $effect sync after every structural mutation.
 *
 * Wrapped in an object because ESM imports cannot be reassigned, only
 * mutated — tree.blocks = [...] is fine, liveBlocks = [...] is not.
 */
export const tree = $state<{ blocks: Block[] }>({ blocks: [] });
