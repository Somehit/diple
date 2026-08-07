/**
 * Edit-session signal for the mobile formatting bar (FormatBar).
 *
 * ## Why a module-level $state singleton
 *
 * The `editing` state lives inside each Block instance (and ZoomHeader) —
 * component-local, by design. But the formatting bar is global chrome
 * mounted in +page.svelte: it must know *which* contenteditable is being
 * edited right now, to read its selection and write back into it.
 *
 * One field is the whole API: the element being edited, or null. Written
 * via property assignment (like zoomTarget.id) — Svelte 5 forbids
 * reassigning an imported $state binding, and the object form matches the
 * codebase's existing singletons.
 *
 * ## Why the guard on clear
 *
 * Two blocks can never be edited at the same time (blur commits the first),
 * but the blur of block A can fire *after* block B started editing (the
 * mousedown that blurs A is also the click that starts B). Every clear
 * checks `el === formatBar.el` so a late blur never erases the current
 * session.
 */
export const formatBar = $state<{ el: HTMLDivElement | null }>({ el: null });
