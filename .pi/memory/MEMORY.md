# Diple — project memory

## Sync status (P6)

- Dot 8px in the top-right corner cluster (after the help button) + hover
  popover: « Diple is online / N pending local changes / N pending remote
  changes / Last change in server: <dd/MM/yyyy, HH:mm:ss GMT±X> ».
- Honest-local semantics (no remote yet): online = GET /api/health responds
  (ping at mount, every 30s, on window 'online'); pendingLocal = mutations
  in flight, wired via Editor's `tracked()` wrapper around the 7 API helpers;
  pendingRemote always 0 (documented in sync.svelte.ts); lastChange =
  server memory (touchLastChange in the 4 mutation endpoints) + fallback
  mtime of the DB file and its -wal (WAL mode).
- Dot colors: green #2f9e44 healthy, amber = accent while syncing, red =
  --color-erreur offline. Failures flip online=false (rollback already
  covers divergence) — pendingLocal counts in-flight only.

## Topbar / sidebar UI (P1)

- Settings button in the sidebar footer is a RESERVED slot (icon + label, no
  action) until real settings exist — user's explicit choice.
- Help panel ("?" button, top-right, right of collapse): right-side panel,
  content = keyboard shortcuts (from keybindings.ts + Ctrl+K) + the 4 search
  filters (:root, :leaves, :branches, :today) only — user chose no "Basics"
  section. Filter list is a documented duplicate of FilterName (queries.ts is
  server-only).
- Collapse/help/hamburger buttons share one look: 36×36, hover 8% ink,
  inset 1rem from the screen edges (top and side equal). The two top-right
  buttons live OUTSIDE the topbar in a fixed `.corner-btns` container (z-56)
  — the topbar's z-50 stacking context would cap them under the help panel
  (z-55). They are FIXED: they float above the open panel, never slide, so
  their padding is identical open/closed. The pill stays centered — opening
  a panel never moves the navbar (a panel's blur covers the pill's edge on
  narrow windows; user accepted). Sidebar `open` stays local (the P4 lift to
  +page was reverted). Hamburger slides with its panel: left 1rem closed /
  276px open (260 + 16). Help panel width = --help-w (layout.css); its
  content starts at 3.75rem top padding to clear the floating buttons.
  Collapse icon = converging chevrons (fold) / diverging (unfold).

## Gates & repo state

- `npm run check` and `npm run build` pass; `npm run format` clean.
- Global `npm run lint` FAILS on pre-existing errors in the uncommitted v0.3 work
  (seed.ts no-useless-escape/unused, ZoomHeader.svelte, Block.svelte 93/204,
  Editor.svelte selectedIds/blockEls/childrenMap/flatIndex + useless-assignment).
  Not introduced by the clipboard work (v0.3 P1) — do not "fix" them without the user.
- Repo has lots of uncommitted work (v0.3 zoom) — check `git status` before assuming a file is untouched.

## Clipboard (P1) decisions

- Paste with an active block selection wins over a collapsed caret in a
  contenteditable (same rule as Backspace/Delete): after a drag-select + click
  into a block, Ctrl+V pastes after the last selected block, not into the block.
  Escape clears the selection.
- Edit-mode diple paste inserts structure as siblings after the block (focus
  stays); text selection or external text = native paste.
- Clipboard: `application/x-diple-blocks` JSON (no ids, minted at paste) +
  tab-indented text/plain; session buffer covers same-tab pastes when the
  async clipboard API is blocked (permission prompts).
- Batch-create endpoint shifts each sibling group ONCE then inserts with final
  positions (per-insert shifting would reorder pasted siblings).
