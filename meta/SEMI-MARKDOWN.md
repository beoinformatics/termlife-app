# Semi-Markdown Mode — Architecture & Implementation Plan

## Motivation

AI chat sessions (Claude Code, ChatGPT CLI, etc.) emit markdown-formatted output to the terminal. Today this renders as flat monospace text — headings, code blocks, and lists are visually indistinguishable except by the raw markdown punctuation. Semi-markdown mode applies **visual styling hints** while preserving every character, so the user sees the markdown source *and* gets visual hierarchy.

---

## Design Principles

1. **Every character is preserved** — `## Heading` still shows `## `, but the line renders larger/bolder.
2. **No reflow** — the terminal grid width stays fixed. If a scaled heading overflows, it clips (in practice, headings are short enough).
3. **Toggle on/off** — markdown styling is a per-session visual layer, not a data transformation.
4. **Graceful degradation** — when disabled, zero visual or performance impact.
5. **Coexists with existing effects** — CRT filter, Matrix rain, themes all layer on top.

---

## Three Implementation Phases

### Phase 1 — Inline Styling (no layout changes)

**Goal:** Color and weight markdown tokens without touching cell dimensions.

| Pattern | Detection | Style Applied |
|---------|-----------|---------------|
| `# `, `## `, `### ` at line start | Regex on row text | **Bold**, heading-accent color for content; **dim** the `#` markers |
| `` `inline code` `` | Backtick pairs within a line | Distinct fg color (theme's cyan/green), slight bg tint |
| `**bold**` | Double-asterisk pairs | **Bold** weight |
| `*italic*` | Single-asterisk pairs (not `**`) | *Italic* style |
| `- ` or `* ` at line start | Regex | Bullet marker colored as accent |
| `---` or `***` (full line) | Regex | Render as horizontal rule (Graphics line) |
| `` ``` `` fence lines | Exact match at line start | Dim the fence, set a "in code block" flag |
| Lines inside fenced block | State tracked between fences | Subtle bg tint (theme's `codeBg`), reduced-brightness fg |

**Implementation:**

- New class: `MarkdownStyler` in `src/renderer/src/terminal/MarkdownStyler.ts`
- Runs **after** `TerminalEngine.sync()` populates CellGrid, **before** `CellGrid.flush()`
- Scans each row's text content, detects patterns, overrides `fg`, `bg`, `bold`, `italic` on affected cells via `setCellResolved()`
- Stateful: tracks whether we're inside a fenced code block (toggle on `` ``` `` lines)
- CellGrid changes: **none** — Phase 1 only uses existing `setCell`/`setCellResolved` APIs

**New theme properties:**

```typescript
// Added to ColorTheme interface
markdown?: {
  headingColor: number      // fg for heading text (e.g., bright yellow)
  markerDim: number         // fg for #, *, `, - markers (e.g., dark gray)
  codeFg: number            // fg inside code blocks
  codeBg: number            // bg tint for code blocks/inline code
  hrColor: number           // horizontal rule color
  boldColor?: number        // optional distinct color for bold text
  italicColor?: number      // optional distinct color for italic text
}
```

**Toggle integration:**

- Keyboard: `Ctrl+Shift+K` (D for "document" — available, not conflicting)
- TCL command: `[markdown:toggle]`, `[markdown:on]`, `[markdown:off]`
- TabBar button: `Ⓜ` or `≡` icon added to the right-side button group (next to split-pane buttons)
- State stored per-tab on TabManager (each tab can independently enable/disable)

**Estimated scope:** ~200 lines for MarkdownStyler, ~30 lines for toggle wiring.

---

### Phase 2 — Row-Level Font Scaling

**Goal:** Headings render larger, code blocks render smaller, while keeping the monospace grid per-row.

| Element | Scale Factor | Effective Cell Size |
|---------|-------------|-------------------|
| `#` H1 | 1.6× | CELL_WIDTH×1.6, CELL_HEIGHT×1.6 |
| `##` H2 | 1.35× | CELL_WIDTH×1.35, CELL_HEIGHT×1.35 |
| `###` H3 | 1.15× | CELL_WIDTH×1.15, CELL_HEIGHT×1.15 |
| Normal text | 1.0× | CELL_WIDTH, CELL_HEIGHT (unchanged) |
| Fenced code block | 0.85× | CELL_WIDTH×0.85, CELL_HEIGHT×0.85 |

**CellGrid changes required:**

```typescript
// New per-row scale tracking
private rowScale: number[] = []         // scale factor per row (default 1.0)
private rowYPositions: number[] = []    // computed Y pixel offset per row

// Called by MarkdownStyler after pattern detection
setRowScale(y: number, scale: number): void {
  this.rowScale[y] = scale
}

// Recompute cumulative Y positions when scales change
recomputeRowPositions(): void {
  let yPos = this._yOffset
  for (let y = 0; y < this._rows; y++) {
    this.rowYPositions[y] = yPos
    yPos += CELL_HEIGHT * this.rowScale[y]
  }
}
```

**flush() changes:**

```typescript
// In flush(), replace fixed positioning with scaled positioning:
const scale = this.rowScale[y]
const fontSize = FONT_SIZE * scale
const cellW = CELL_WIDTH * scale
const cellH = CELL_HEIGHT * scale

text.x = x * cellW
text.y = this.rowYPositions[y]
text.style = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: fontSize,
  fill: cell.fg,
  fontWeight: cell.bold ? 'bold' : 'normal',
  fontStyle: cell.italic ? 'italic' : 'normal',
})
```

**The overflow question:**

A heading at 1.6× scale: 80 cols × 9px × 1.6 = 1152px. Typical window is ~1200px wide. So H1 headings can fit ~83 characters at 1.6× in a 1200px window. Since the terminal's logical column count doesn't change (still 80 cols), and the AI already wraps to the terminal width, headings won't overflow in practice.

For code blocks at 0.85×: the text is narrower, leaving extra space on the right. This actually looks fine — code blocks naturally look indented/contained.

**The scrollback challenge:**

ScrollbackManager stores historical rows. When markdown mode is on, scrollback rows also need scale annotations. Two options:

- **Option A:** Store scale per scrollback row. Simple, small memory overhead.
- **Option B:** Re-detect markdown patterns when scrollback rows are displayed. Stateless but requires re-scanning (the fence-tracking state makes this tricky).

**Recommendation:** Option A — store `rowScale` alongside scrollback cell data.

**Estimated scope:** ~150 lines CellGrid changes, ~50 lines ScrollbackManager changes, ~30 lines MarkdownStyler additions.

---

### Phase 3 — Enhanced Visual Elements

**Goal:** Polish items that go beyond font styling.

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Horizontal rules** | `---` renders as a PixiJS Graphics line spanning the full row width | Low |
| **Code block border** | Thin left-border (2px accent line) on code block rows, like GitHub | Low |
| **Heading underline** | H1 gets a subtle underline spanning text width | Low |
| **Bullet replacement** | `- ` marker rendered as `•` (bullet kept in cell, but overridden visually) | Low |
| **Numbered list detection** | `1. ` patterns get accent-colored numbers | Low |
| **Link detection** | `[text](url)` — dim the brackets/parens, highlight the text | Medium |
| **Table alignment** | Detect `|` column separators, apply subtle column bg alternation | Medium |
| **Collapsible code blocks** | Click fence line to collapse/expand block | High — needs interaction layer |

---

## Architecture

### Data Flow

```
PTY data
  → @xterm/headless (ANSI parse)
  → TerminalEngine.sync() (populate CellGrid)
  → MarkdownStyler.apply(cellGrid, scrollOffset)    ← NEW
  → CellGrid.flush() (render to PixiJS)
```

### MarkdownStyler Class

```
src/renderer/src/terminal/MarkdownStyler.ts
```

```typescript
interface RowAnnotation {
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'code-fence' | 'code-body' | 'hr' | 'normal'
  contentStart: number  // column where content begins (after markers)
  scale: number         // row scale factor (Phase 2)
}

export class MarkdownStyler {
  private enabled = false
  private fenceOpen = false   // state: inside a fenced code block?

  toggle(): void
  isEnabled(): boolean

  /**
   * Main entry — scan all visible rows in the CellGrid and apply styling.
   * Called every frame between sync() and flush().
   *
   * Phase 1: modifies fg/bg/bold/italic on cells
   * Phase 2: also calls cellGrid.setRowScale()
   */
  apply(grid: CellGrid, rows: number, cols: number): void

  /**
   * Analyze a single row's text and return its annotation.
   */
  private classifyRow(rowText: string): RowAnnotation

  /**
   * Apply Phase 1 inline styles to cells based on annotation.
   */
  private styleRow(grid: CellGrid, y: number, annotation: RowAnnotation): void

  /**
   * Reset fence tracking state (called on clear screen, tab switch).
   */
  resetState(): void
}
```

### Integration Points

| File | Change |
|------|--------|
| `TerminalEngine.ts` | After `sync()`, call `markdownStyler.apply()` if enabled |
| `CellGrid.ts` | Phase 2: add `rowScale[]`, `setRowScale()`, `recomputeRowPositions()` |
| `TabManager.ts` | Store `markdownEnabled: boolean` per tab |
| `TabBar.ts` | Add `Ⓜ` toggle button |
| `InputHandler.ts` | Bind `Ctrl+Shift+K` to `[markdown:toggle]` |
| `CommandRegistry.ts` | Register `markdown:toggle`, `markdown:on`, `markdown:off` |
| `ScrollbackManager.ts` | Phase 2: store `rowScale` per scrollback row |
| `ThemeManager.ts` | Add `markdown` sub-object to `ColorTheme` |

### Toggle Button Placement

```
┌──────────────────────────────────────────────────────────┐
│ [Tab1] [Tab2] [Tab3]              [Ⓜ] [+] [⧧] [⧤] [⊞] │
└──────────────────────────────────────────────────────────┘
```

The `Ⓜ` button sits left of the split-pane buttons. When active, it gets a highlight background (same pattern as the existing CRT/Matrix/Crazy toggles). Tooltip: "Semi-Markdown (Ctrl+Shift+K)".

---

## Edge Cases & Decisions

### Fence State Across Scrollback

When the user scrolls up, the renderer shows scrollback rows. Fence state (are we inside a code block?) depends on prior rows that may be off-screen.

**Solution:** MarkdownStyler scans from the top of the visible window downward, but initializes `fenceOpen` from a cached value stored per scrollback position. When scrollback rows are committed, the fence state at each row boundary is stored alongside the row data.

### ANSI Colors vs Markdown Styling

Some AI tools emit ANSI-colored output AND markdown. When markdown mode is on:

- ANSI colors take precedence for foreground — markdown styling only applies to cells that have the default fg color.
- Background tinting (code blocks) always applies, blending with any existing bg.
- Bold/italic from ANSI and markdown are OR'd together.

This ensures tools that already colorize their output (like `glow`, `bat`) aren't degraded.

### Performance

MarkdownStyler runs every frame during `flush()`. For an 80×40 grid (3,200 cells), the row classification is 40 regex tests — negligible. The per-cell style overrides are simple assignments. No measurable performance impact expected.

For Phase 2 (row scaling), `recomputeRowPositions()` is O(rows) — also negligible. The main cost is that scaled rows create non-uniform Text objects, but PixiJS handles mixed sizes efficiently since each cell is already an independent Text.

### Split Panes

Each pane has its own CellGrid and MarkdownStyler instance. The toggle applies to all panes in the active tab (consistent with how CRT/Matrix toggles work).

---

## TCL Commands

| Command | Description |
|---------|-------------|
| `[markdown:toggle]` | Toggle semi-markdown mode for current tab |
| `[markdown:on]` | Enable semi-markdown mode |
| `[markdown:off]` | Disable semi-markdown mode |

---

## Implementation Order

1. **Phase 1a** — `MarkdownStyler` with heading detection + code fence detection only (most impactful patterns)
2. **Phase 1b** — Toggle button in TabBar + keyboard shortcut + TCL command
3. **Phase 1c** — Remaining inline patterns (bold, italic, bullets, inline code, HR)
4. **Phase 2a** — CellGrid row scaling infrastructure
5. **Phase 2b** — MarkdownStyler emits scale annotations, CellGrid renders them
6. **Phase 2c** — ScrollbackManager scale storage
7. **Phase 3** — Visual polish items (cherry-pick from the table above)

Each sub-phase is independently testable and deployable.
