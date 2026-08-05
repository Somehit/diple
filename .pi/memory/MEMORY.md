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
  narrow windows; user accepted). Hamburger slides with its panel on wide
  screens: left 1rem closed / 276px open (260 + 16). Help panel width =
  --help-w (layout.css); its content starts at 3.75rem top padding to clear
  the floating buttons. Collapse icon = converging chevrons (fold) /
  diverging (unfold).

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

## Gates & repo state

- `npm run check` passes again (0 errors — the drag&drop `dataTransfer`
  errors in Block.svelte got fixed by the user); `npm run build` passes;
  `npm run format` clean. `npm run lint` global still fails on the
  pre-existing v0.3 errors (Editor.svelte Set/Map/useless-assignment,
  Block.svelte, ZoomHeader.svelte, seed.ts) — check each touched file
  individually with npx eslint.
- Global `npm run lint` FAILS on pre-existing errors in the uncommitted v0.3 work
  (seed.ts no-useless-escape/unused, ZoomHeader.svelte, Block.svelte 93/204,
  Editor.svelte selectedIds/blockEls/childrenMap/flatIndex + useless-assignment).
  Not introduced by the clipboard work (v0.3 P1) — do not "fix" them without the user.
- Repo has lots of uncommitted work (v0.3 zoom) — check `git status` before assuming a file is untouched.

## Responsive layout (P1)

- Breakpoint 1024px (measured collision of pill 720px + hamburger + corner
  cluster ≈ 984px; 1023px keeps margin). CSS vars in layout.css: --pill-h
  (60px), --navbar-h (4.5rem wide / calc ≈130px narrow), --actions-row-top
  (1rem / calc 82px), --drawer-w min(84vw, 320px), --help-w narrow = same
  min(). Media queries can't read vars → 1023px repeated per component,
  keep in sync.
- Two rows below 1024px: pill full width on row 1, action buttons on row 2
  (corner cluster top: var(--actions-row-top); topbar band/mask extends,
  opaque zone still ends just below the buttons). Main padding, sticky
  breadcrumbs (ZoomHeader top: var(--navbar-h)) and Editor
  scrollToEditorTop (navbarClearance() reads the var, rem→px) all derive
  from --navbar-h.
- Exclusive panels: single `panel: 'sidebar' | 'help' | null` state in
  +page.svelte (Sidebar `open` lifted to props — the old P4 local-state
  note above is superseded). Toggle switches, Escape closes, scrim tap
  closes (narrow only).
- Drawers below 1024px: both panels min(84vw, 320px) over a z-54 scrim
  (fond encre 35%, fade-in); hamburger hidden while open in narrow
  (close = scrim / Escape / navigation — handleSidebarNavigate closes when
  isNarrow, via matchMedia listener); help content clears the floating
  buttons with calc(var(--actions-row-top) + 36px + 0.5rem) padding.
- Panels use 100dvh (fallback 100vh) for the mobile URL bar. Obsolete
  190px/220px @600px rules removed. Safe-area insets out of scope.
- P2: below 1024px --content-w widens to min(100vw - 2rem, 860px) (text/
  blocks start further left on tablets — at 1000px ~70px instead of ~140px;
  pill + editor + palette results all follow, alignment preserved; 860→720
  jump at the breakpoint accepted). Navbar gains a sidebarOpen prop → in
  narrow, .corner-btns--sidebar-open drops to z-54 (behind the drawer;
  same z as the scrim which renders later → covers them). Help drawer keeps
  buttons above (content clears them). Sidebar text (.side-item /
  .side-parent-text / .side-settings) now inherits the body size (1.125rem).

## Touch interactions (P2)

- Long-press (500ms, touch pointer only, Editor.svelte) on a block → same
  SelectionMenu as right-click (block becomes sole selection). Explicit
  timer — no reliance on the browser's long-press→contextmenu synthesis.
  Flags: suppressMenuUntil (native Android contextmenu that follows is
  preventDefault+ignored in onEditorContextMenu) and suppressNextClick
  (the click synthesized on release would hit the menu backdrop — swallowed
  by a window 'click' capture listener, cleared on the next pointerdown).
  Finger move > 12px cancels. touch-action: manipulation on .editor.
- Double-tap on block content (touch only) → zoom (onZoom). Tap→edit is
  delayed 260ms for double-tap disambiguation; tap state is module-scope in
  Block.svelte (<script module>) so a tap on block B cancels A's pending
  edit. Desktop keeps instant click→edit (no dblclick zoom).
- Gutter removed at @media (hover: none), (max-width: 1023px): .zoom-btn +
  .menu-btn hidden, .block --zoom-w/--menu-w → 0 (content starts right
  after the bullet). Width-based too — works in a desktop-narrow window
  (the P2 hover:none-only scoping didn't apply there; that's why the
  gutter stayed visible). user-select none + -webkit-touch-callout none on
  .block-content--view stays hover:none ONLY (a narrow desktop window
  keeps native text selection; contenteditable unaffected). Trade-off
  accepted: no native iOS text selection in view mode on touch. Editor
  .capture-zone derives its width/margin from the same vars (defaults
  1.35/1.35/1.5rem on .capture-zone, zeroed in the same media) with
  .cz-spacer:nth-of-type(1/2) = zoom/menu slots — ghost row stays aligned
  in every mode (<850px hang 0 via the 850px rule, 850-1023px -0.75rem,
  ≥1024px 3.45rem, iPad landscape touch -0.75rem).
- FormatAction + 'zoom' (FormatMenuItems showZoom, first item): available in
  BlockMenu (onZoom prop) and SelectionMenu; Editor handleSelectionAction
  zoom → single selected block → clearSelection + handleZoom; multi-select
  → silent no-op. Menu height clamps bumped -340 → -400.

## Keybindings store (settings command center, inc A)

- `keybindings.ts` = pure defaults + helpers (mergeBindings, conflictOf,
  validateCapture) — no runes, node-testable. `keybindings.svelte.ts` =
  reactive store: `overrides` $state (localStorage `diple:keybindings:v1`,
  `typeof window` guard for SSR), `effectiveKeybindings()` plain function
  (Svelte 5 forbids exporting a module-level $derived), API setBinding /
  unbind / resetCommand / resetAll / commandFor / combosFor.
- Ctrl+K migrated into the table as `app.focusSearch` (was hardcoded in
  +layout.svelte): Editor's commands map is now `Partial<Record<CommandId>>`
  — app.* commands are window-level, the editor no-ops on them.
- validateCapture rejects: Escape (reserved), lone modifier, plain key
  without modifier (opinionated — would steal typing).
- Rebinding UI (capture, conflicts, reset buttons) = increment B, not built yet.

## Drag & drop (v0.4)

- Handle = the diple (bullet): click still toggles collapse, drag moves (native
  HTML5 DnD, no library). The bullet--toggle's old `onmousedown preventDefault`
  was REMOVED — it suppresses dragstart in Chrome. Custom drag image pill
  (content or "N points"), source row dims (.drag-source), gutter buttons hide
  while dragging (.editor--dragging).
- `src/lib/drop-target.ts` = pure computeDropTarget(x, y, ctx): waterline + 3
  horizontal zones (left of content = −1 level, right 60% of row = child,
  middle = same level — same-level stays dominant, Logseq lesson). Clamped to
  minDepth (1 in zoomed view) — a block can never leave the current view.
  Child drop BELOW a row = FIRST child (line-honest, stays visible near the
  cursor); ABOVE = last child of the previous block. No-op guard: same parent
  AND position == current or current+1 (never an accidental swap).
- Selection drag: grabbing a block inside an active selection moves the whole
  selection (top-level roots, flat order, consecutive slots under the drop
  parent). One undo entry with one `move` mutation per root; rollback =
  full blocks snapshot (pasteRoots pattern). Selection stays selected after.
- Auto-expand: hovering a collapsed block as the drop PARENT (child zone)
  expands it after 600ms (optimistic, rollback like handleToggleCollapse).
- Server: moveBlock now cycle-guards (silent no-op when the target parent is
  inside the moved block's subtree) — keyboard moves can't cycle, a drag can.
- Known limitation (accepted, mirrors deleteBlocks): a mid-sequence API failure
  during a multi-root move restores the client snapshot but earlier roots may
  already be persisted server-side — reload resyncs; toast warns.
