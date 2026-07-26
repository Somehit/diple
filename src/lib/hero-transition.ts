/**
 * Shared crossfade instance — ties the hero pill (center) to the navbar pill
 * (top) so the transition is a physical slide, not a form-cutting fade.
 *
 * +page.svelte imports `send` for the hero pill's out:send.
 * Navbar.svelte imports `receive` for the top bar pill's in:receive.
 */
import { crossfade } from 'svelte/transition';

export const [send, receive] = crossfade({ duration: 250 });
