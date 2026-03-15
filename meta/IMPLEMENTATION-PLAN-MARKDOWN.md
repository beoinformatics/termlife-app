# Semi-Markdown Mode: Implementation Plan (TDD)

## Status: COMPLETE — All phases implemented (Phase 1 + 2 + 3)

## Methodology: Test-Driven Development

Every implementation step follows RED → GREEN → REFACTOR:
1. **RED** — Write a failing test first
2. **GREEN** — Write minimal code to make it pass
3. **REFACTOR** — Clean up while keeping tests green

Coverage target: **80%+** on all new code.

---

## Phase 0: Test Infrastructure Setup

- [x] Install vitest as dev dependency
- [x] Create `vitest.config.ts` with renderer source alias resolution
- [x] Add `"test"` and `"test:coverage"` scripts to `package.json`
- [x] Create `src/renderer/src/terminal/__tests__/` directory
- [x] Write a trivial smoke test to confirm vitest runs
- [x] Verify: `npm test` passes, coverage report generates

---

## Phase 1a: MarkdownStyler Core — Headings & Code Fences ✅

### Tests first (RED)

- [x] Test: `classifyRow('# Hello')` → `{ type: 'h1', contentStart: 2 }`
- [x] Test: `classifyRow('## Hello')` → `{ type: 'h2', contentStart: 3 }`
- [x] Test: `classifyRow('### Hello')` → `{ type: 'h3', contentStart: 4 }`
- [x] Test: `classifyRow('#### Too deep')` → `{ type: 'normal' }` (only h1–h3)
- [x] Test: `classifyRow('regular text')` → `{ type: 'normal' }`
- [x] Test: `classifyRow('#no space')` → `{ type: 'normal' }` (requires space after `#`)
- [x] Test: `` classifyRow('```python') `` → `{ type: 'code-fence' }`
- [x] Test: `` classifyRow('```') `` → `{ type: 'code-fence' }`
- [x] Test: `classifyRow('---')` → `{ type: 'hr' }`
- [x] Test: `classifyRow('***')` → `{ type: 'hr' }`
- [x] Test: `classifyRow('----extra')` → `{ type: 'normal' }` (must be only dashes)
- [x] Test: fence state tracking — rows between open/close fences classified as `code-body`
- [x] Test: nested fences — second `` ``` `` closes, third opens again
- [x] Test: `resetState()` clears fence tracking

### Implementation (GREEN)

- [x] Create `src/renderer/src/terminal/MarkdownStyler.ts`
- [x] Implement `classifyRow()` — heading, fence, HR, normal detection
- [x] Implement fence state tracking (`fenceOpen` boolean toggled on fence lines)
- [x] Implement `resetState()`

### Style application tests (RED)

- [x] Test: `styleRow()` on h1 — cells 0–1 (`# `) get dim fg, cells 2+ get bold + heading color
- [x] Test: `styleRow()` on code-body — all cells get codeBg background tint
- [x] Test: `styleRow()` on code-fence — all cells get dim fg
- [x] Test: `styleRow()` on hr — all cells get hrColor fg
- [x] Test: ANSI precedence — cell with non-default fg is NOT overridden
- [x] Test: `apply()` processes multiple rows with correct fence state continuity

### Implementation (GREEN)

- [x] Implement `styleRow()` — apply fg/bg/bold/italic overrides per annotation type
- [x] Implement `apply()` — iterate rows, classify, style
- [x] Add ANSI precedence rule: skip cells with non-default fg

### Refactor

- [x] Extract markdown color constants to a config object
- [x] Verify: `npm run test:coverage` shows 80%+ on MarkdownStyler (100% stmts, 87.7% branches)

---

## Phase 1b: Toggle Integration ✅

### Tests first (RED)

- [x] Test: `MarkdownStyler.toggle()` flips `isEnabled()` state
- [x] Test: `apply()` is a no-op when disabled (cells unchanged)
- [x] Test: toggling off resets fence state
- [x] Test: markdown theme colors have sensible defaults when `markdown` section omitted

### Implementation (GREEN)

- [x] MarkdownStyler stores enabled state per-instance (one per pane engine)
- [x] Default markdown colors provided via `DEFAULT_MARKDOWN_COLORS` constant
- [x] Register `[markdown:toggle]`, `[markdown:on]`, `[markdown:off]` in `main.ts` via `commandRegistry`
- [x] Bind `Ctrl+Shift+K` in `main.ts` keydown handler to `[markdown:toggle]`
- [x] Add `Ⓜ` toggle button to `TabBar.ts` (right-side button group at x=-280)
- [x] Button highlight state (green bg) reflects markdown enabled on active tab's panes
- [x] Tooltip: "Semi-Markdown (Ctrl+Shift+K)"

### Verify

- [x] All Phase 1a + 1b tests pass (42 tests)
- [ ] Manual: toggle on/off with `Ctrl+Shift+K` — no rendering artifacts
- [ ] Manual: button state syncs with keyboard toggle

---

## Phase 1c: Remaining Inline Patterns ✅

### Tests first (RED)

- [x] Test: `**bold text**` — asterisks dimmed, inner text gets bold
- [x] Test: `*italic text*` — asterisks dimmed, inner text gets italic
- [x] Test: `**not closed` — no styling applied (unmatched pair)
- [x] Test: `***bold italic***` — both bold and italic applied
- [x] Test: `` `inline code` `` — backticks dimmed, inner text gets code fg + bg
- [x] Test: `` `unclosed `` — no styling (unmatched backtick)
- [x] Test: `- list item` — dash+space get accent color (from Phase 1a)
- [x] Test: `* list item` — asterisk+space get accent color (not confused with italic)
- [x] Test: `1. numbered` — `1.` gets accent color (from Phase 1a)
- [x] Test: `12. double digit` — `12.` gets accent color (from Phase 1a)
- [x] Test: inline patterns NOT applied inside code blocks (fence state respected)
- [x] Test: multiple inline patterns on one line: `**bold** and *italic*`

### Implementation (GREEN)

- [x] Detect `**bold**` pairs within a line → apply bold weight
- [x] Detect `*italic*` pairs (not `**`) within a line → apply italic style
- [x] Detect `` `inline code` `` pairs → apply code fg + subtle bg tint
- [x] Detect `- ` and `* ` bullet markers at line start → accent color on marker (Phase 1a)
- [x] Detect `1. `, `2. ` etc. numbered list markers → accent color on number (Phase 1a)
- [x] Skip inline pattern detection for rows classified as `code-body` or `code-fence`

### Refactor & Verify

- [x] All tests pass (52), coverage 95.8% stmts / 97.8% lines / 86.9% branches
- [ ] Manual: test with real Claude Code output
- [ ] Manual: test with real ChatGPT CLI output
- [ ] Manual: ANSI-colored output (`ls --color`, `bat`) not degraded
- [ ] Manual: no measurable frame rate impact (60fps on 80×40 grid)

---

## Phase 2a: CellGrid Row Scaling Infrastructure ✅

### Tests first (RED)

- [x] Test: `setRowScale(0, 1.6)` stores scale, `getRowScale(0)` returns 1.6
- [x] Test: default scale for all rows is 1.0
- [x] Test: `recomputeRowPositions()` — uniform 1.0 scales produce same positions as `y * CELL_HEIGHT`
- [x] Test: `recomputeRowPositions()` — row 0 at 1.6× shifts row 1 down by `CELL_HEIGHT * 1.6`
- [x] Test: mixed scales produce correct cumulative Y positions
- [x] Test: `resetRowScales()` sets all rows back to 1.0

### Implementation (GREEN)

- [x] Add `rowScale: number[]` array to `CellGrid` (default 1.0 per row)
- [x] Add `rowYPositions: number[]` for computed cumulative Y offsets
- [x] Add `setRowScale(y, scale)`, `getRowScale(y)`, `resetRowScales()` methods
- [x] Add `recomputeRowPositions()` — recalculate Y positions from scales
- [x] Update `flush()` — use `rowScale[y]` for fontSize, cellW, cellH per row
- [x] Update `flush()` — use `rowYPositions[y]` instead of `y * CELL_HEIGHT`
- [x] Update `bgGraphics` drawing to use scaled cell dimensions
- [x] Ensure row scaling is no-op when all scales are 1.0 (zero overhead)

### Verify

- [x] All CellGrid tests pass (11 tests)
- [ ] Manual: setting scale on a row visibly changes its rendered size

---

## Phase 2b: MarkdownStyler Scale Annotations ✅

### Tests first (RED)

- [x] Test: `apply()` on h1 row calls `setRowScale(y, 1.6)`
- [x] Test: `apply()` on h2 row calls `setRowScale(y, 1.35)`
- [x] Test: `apply()` on h3 row calls `setRowScale(y, 1.15)`
- [x] Test: `apply()` on code-body row calls `setRowScale(y, 0.85)`
- [x] Test: `apply()` on normal row calls `setRowScale(y, 1.0)`
- [x] Test: disabling markdown resets all row scales to 1.0

### Implementation (GREEN)

- [x] `MarkdownStyler.apply()` calls `cellGrid.setRowScale()` for each row
- [x] Call `recomputeRowPositions()` after all scales are set
- [x] Reset all scales to 1.0 when markdown mode is toggled off
- [x] `ScalableGrid` interface + runtime type check for backward compat with non-scalable grids

### Verify

- [x] All tests pass (75 tests: 52 Phase 1 + 11 Phase 2a + 12 Phase 2b)
- [x] Coverage: 96% stmts / 87% branches / 100% functions
- [ ] Manual: headings visibly larger, code blocks visibly smaller

---

## Phase 2c: Scrollback Fence State ✅

### Approach

ScrollbackManager delegates to @xterm/headless's own scrollback buffer (no separate per-row storage).
MarkdownStyler re-scans visible rows each frame. The key challenge is fence state when scrolled back
(viewport may start inside a code block that opened above).

### Tests first (RED)

- [x] Test: prescanFenceState with no fences leaves fenceOpen false
- [x] Test: prescanFenceState with one open fence sets fenceOpen true
- [x] Test: prescanFenceState with matched fences leaves fenceOpen false
- [x] Test: prescan + apply(preserveFenceState=true) styles first row as code-body
- [x] Test: apply without preserveFenceState resets fence (default behavior)
- [x] Test: prescan only considers lines starting with ```
- [x] Test: scrollback scale: code-body rows from prescan get scale 0.85

### Implementation (GREEN)

- [x] Add `prescanFenceState(linesAbove)` to MarkdownStyler
- [x] Add `preserveFenceState` parameter to `apply()`
- [x] TerminalEngine: when scrolled back, scan lines above viewport for ``` markers
- [x] Pass fence-only lines to prescanFenceState, then call apply(grid, true)

### Phase 2 Final Verification

- [x] All Phase 2 tests pass (82 tests), MarkdownStyler coverage 96%+ stmts / 87%+ branches
- [ ] Manual: scrolling through mixed content shows correct scaling
- [ ] Manual: cursor positioning correct in scaled rows
- [ ] Manual: selection (SelectionManager) accounts for variable row heights
- [ ] Manual: split panes each scale independently
- [ ] Manual: toggle off → all rows immediately revert to uniform size
- [ ] Manual: no visual glitches at scale transition boundaries

---

## Phase 3: Visual Polish ✅

### Tests first (RED)

- [x] Test: HR row produces hr-line decoration
- [x] Test: code-body rows produce code-border decoration
- [x] Test: h1 row produces h1-underline decoration
- [x] Test: normal/h2/h3 rows have no decoration
- [x] Test: decorations cleared when disabled
- [x] Test: bullet `- ` visually replaced with `•` when markdown on
- [x] Test: `* ` bullet also replaced with `•`
- [x] Test: indented bullet `  - ` replaces correct position
- [x] Test: `_italic_` — underscores dimmed, inner text italic
- [x] Test: `_unclosed` — no italic applied
- [x] Test: `_italic_` not applied inside code blocks
- [x] Test: `[text](url)` — brackets/parens dimmed, text highlighted
- [x] Test: incomplete `[link` — no styling
- [x] Test: links not applied inside code blocks
- [ ] Test: `|col1|col2|` — pipe separators detected for column styling (deferred)

### Implementation (GREEN)

- [x] Decoration system: `RowDecoration` type + `getDecoration(y)` on MarkdownStyler
- [x] Horizontal rule: PixiJS Graphics line for `---`/`***` rows (hr-line decoration)
- [x] Code block left-border: 2px accent line on left edge of code rows (code-border)
- [x] H1 underline: subtle line beneath H1 heading rows (h1-underline)
- [x] CellGrid `drawDecorations()` method renders Graphics overlays
- [x] Bullet replacement: visually render `- ` / `* ` as `• ` (override cell char)
- [x] `_italic_` underscore detection with marker dimming
- [x] Link detection: `[text](url)` — dim brackets/parens/url, highlight link text
- [x] Italic visual rendering: skew transform on italic cells in CellGrid flush()
- [ ] Table column detection: deferred (lower priority)
- [ ] Collapsible code blocks: deferred (needs interaction layer)

### Additional fixes

- [x] CursorRenderer: use scaled row positions from CellGrid
- [x] SelectionManager: use scaled positions for hit testing, selection rendering, bounds
- [x] TerminalEngine: timestamp overlay uses scaled row positions

### Phase 3 Final Verification

- [x] All tests pass (97 tests), coverage 94.7% stmts / 84.8% branches / 100% functions
- [ ] Manual: visual elements render correctly across themes (light + dark)
- [ ] Manual: graphics overlays don't interfere with text selection
- [ ] Manual: all Phase 3 features degrade gracefully when markdown mode is off
