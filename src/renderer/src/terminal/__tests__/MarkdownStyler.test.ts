import { describe, it, expect, beforeEach } from 'vitest'
import {
  MarkdownStyler,
  DEFAULT_MARKDOWN_COLORS,
  ROW_SCALES,
  type StylableGrid,
  type StylableCell,
  type ScalableGrid,
} from '../MarkdownStyler'

// ---------------------------------------------------------------------------
// Test helpers — mock grid that doesn't need PixiJS
// ---------------------------------------------------------------------------

const DEFAULT_FG = 0xffffff
const DEFAULT_BG = 0x000000

function makeCell(char = ' '): StylableCell {
  return { char, fg: DEFAULT_FG, bg: DEFAULT_BG, bold: 0, italic: 0 }
}

function makeGrid(lines: string[]): StylableGrid & { cellRows: StylableCell[][] } {
  const cols = Math.max(...lines.map(l => l.length), 1)
  const cellRows = lines.map(line => {
    const row: StylableCell[] = []
    for (let x = 0; x < cols; x++) {
      row.push(makeCell(x < line.length ? line[x] : ' '))
    }
    return row
  })

  return {
    cols,
    rows: lines.length,
    defaultFg: DEFAULT_FG,
    defaultBg: DEFAULT_BG,
    cellRows,
    getRowText(y: number): string {
      return cellRows[y].map(c => c.char).join('')
    },
    getCell(x: number, y: number): StylableCell | null {
      if (y < 0 || y >= cellRows.length || x < 0 || x >= cols) return null
      return cellRows[y][x]
    },
  }
}

// ---------------------------------------------------------------------------
// classifyRow tests
// ---------------------------------------------------------------------------

describe('MarkdownStyler.classifyRow', () => {
  let styler: MarkdownStyler

  beforeEach(() => {
    styler = new MarkdownStyler()
  })

  // Headings
  it('classifies "# Hello" as h1 with contentStart 2', () => {
    const result = styler.classifyRow('# Hello')
    expect(result).toEqual({ type: 'h1', contentStart: 2 })
  })

  it('classifies "## Hello" as h2 with contentStart 3', () => {
    const result = styler.classifyRow('## Hello')
    expect(result).toEqual({ type: 'h2', contentStart: 3 })
  })

  it('classifies "### Hello" as h3 with contentStart 4', () => {
    const result = styler.classifyRow('### Hello')
    expect(result).toEqual({ type: 'h3', contentStart: 4 })
  })

  it('classifies "#### Too deep" as normal (only h1-h3)', () => {
    const result = styler.classifyRow('#### Too deep')
    expect(result.type).toBe('normal')
  })

  it('classifies "regular text" as normal', () => {
    const result = styler.classifyRow('regular text')
    expect(result.type).toBe('normal')
  })

  it('classifies "#no space" as normal (requires space after #)', () => {
    const result = styler.classifyRow('#no space')
    expect(result.type).toBe('normal')
  })

  it('classifies empty string as normal', () => {
    const result = styler.classifyRow('')
    expect(result.type).toBe('normal')
  })

  // Code fences
  it('classifies "```python" as code-fence', () => {
    const result = styler.classifyRow('```python')
    expect(result.type).toBe('code-fence')
  })

  it('classifies "```" as code-fence', () => {
    const result = styler.classifyRow('```')
    expect(result.type).toBe('code-fence')
  })

  // Horizontal rules
  it('classifies "---" as hr', () => {
    const result = styler.classifyRow('---')
    expect(result.type).toBe('hr')
  })

  it('classifies "***" as hr', () => {
    const result = styler.classifyRow('***')
    expect(result.type).toBe('hr')
  })

  it('classifies "-----" as hr', () => {
    const result = styler.classifyRow('-----')
    expect(result.type).toBe('hr')
  })

  it('classifies "----extra" as normal (must be only dashes)', () => {
    const result = styler.classifyRow('----extra')
    expect(result.type).toBe('normal')
  })

  it('classifies "--" as normal (min 3 dashes)', () => {
    const result = styler.classifyRow('--')
    expect(result.type).toBe('normal')
  })

  // Bullets
  it('classifies "- list item" as bullet', () => {
    const result = styler.classifyRow('- list item')
    expect(result).toEqual({ type: 'bullet', contentStart: 2 })
  })

  it('classifies "* list item" as bullet', () => {
    const result = styler.classifyRow('* list item')
    expect(result).toEqual({ type: 'bullet', contentStart: 2 })
  })

  it('classifies "  - indented" as bullet with correct contentStart', () => {
    const result = styler.classifyRow('  - indented')
    expect(result).toEqual({ type: 'bullet', contentStart: 4 })
  })

  // Numbered lists
  it('classifies "1. numbered" as numbered', () => {
    const result = styler.classifyRow('1. numbered')
    expect(result).toEqual({ type: 'numbered', contentStart: 3 })
  })

  it('classifies "12. double digit" as numbered', () => {
    const result = styler.classifyRow('12. double digit')
    expect(result).toEqual({ type: 'numbered', contentStart: 4 })
  })
})

// ---------------------------------------------------------------------------
// Fence state tracking
// ---------------------------------------------------------------------------

describe('MarkdownStyler fence state', () => {
  let styler: MarkdownStyler

  beforeEach(() => {
    styler = new MarkdownStyler()
  })

  it('rows between open/close fences classified as code-body', () => {
    styler.classifyRow('```')         // opens
    expect(styler.fenceOpen).toBe(true)

    const body = styler.classifyRow('some code')
    expect(body.type).toBe('code-body')

    styler.classifyRow('```')         // closes
    expect(styler.fenceOpen).toBe(false)
  })

  it('nested fences — second closes, third opens again', () => {
    styler.classifyRow('```')         // open
    expect(styler.fenceOpen).toBe(true)

    styler.classifyRow('```')         // close
    expect(styler.fenceOpen).toBe(false)

    styler.classifyRow('```')         // open again
    expect(styler.fenceOpen).toBe(true)
  })

  it('headings inside fences are classified as code-body, not headings', () => {
    styler.classifyRow('```')
    const result = styler.classifyRow('# Not a heading')
    expect(result.type).toBe('code-body')
  })

  it('HR inside fences is classified as code-body', () => {
    styler.classifyRow('```')
    const result = styler.classifyRow('---')
    expect(result.type).toBe('code-body')
  })

  it('resetState() clears fence tracking', () => {
    styler.classifyRow('```')
    expect(styler.fenceOpen).toBe(true)

    styler.resetState()
    expect(styler.fenceOpen).toBe(false)

    const result = styler.classifyRow('normal text')
    expect(result.type).toBe('normal')
  })
})

// ---------------------------------------------------------------------------
// styleRow tests
// ---------------------------------------------------------------------------

describe('MarkdownStyler.styleRow', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('h1 — marker cells get dim fg, content cells get bold + heading color', () => {
    const grid = makeGrid(['# Hello'])
    styler.styleRow(grid, 0, { type: 'h1', contentStart: 2 })

    // "# " (indices 0,1) should be dimmed
    expect(grid.cellRows[0][0].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][1].fg).toBe(colors.markerDim)

    // "H" (index 2) onwards should be heading color + bold
    expect(grid.cellRows[0][2].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][2].bold).toBe(1)
    expect(grid.cellRows[0][3].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][3].bold).toBe(1)
  })

  it('h2 — marker "## " dimmed, content styled', () => {
    const grid = makeGrid(['## Sub'])
    styler.styleRow(grid, 0, { type: 'h2', contentStart: 3 })

    expect(grid.cellRows[0][0].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][1].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][2].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][3].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][3].bold).toBe(1)
  })

  it('code-body — all cells get codeFg and codeBg', () => {
    const grid = makeGrid(['  x = 1'])
    styler.styleRow(grid, 0, { type: 'code-body', contentStart: 0 })

    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].fg).toBe(colors.codeFg)
      expect(grid.cellRows[0][x].bg).toBe(colors.codeBg)
    }
  })

  it('code-fence — all cells get dim fg', () => {
    const grid = makeGrid(['```python'])
    styler.styleRow(grid, 0, { type: 'code-fence', contentStart: 0 })

    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].fg).toBe(colors.markerDim)
    }
  })

  it('hr — all cells get hrColor', () => {
    const grid = makeGrid(['---'])
    styler.styleRow(grid, 0, { type: 'hr', contentStart: 0 })

    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].fg).toBe(colors.hrColor)
    }
  })

  it('bullet — marker gets accent color, content unchanged', () => {
    const grid = makeGrid(['- item'])
    styler.styleRow(grid, 0, { type: 'bullet', contentStart: 2 })

    expect(grid.cellRows[0][0].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][1].fg).toBe(colors.headingColor)
    // Content cells unchanged
    expect(grid.cellRows[0][2].fg).toBe(DEFAULT_FG)
  })

  it('numbered — marker gets accent color', () => {
    const grid = makeGrid(['12. item'])
    styler.styleRow(grid, 0, { type: 'numbered', contentStart: 4 })

    expect(grid.cellRows[0][0].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][1].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][2].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][3].fg).toBe(colors.headingColor)
    // Content unchanged
    expect(grid.cellRows[0][4].fg).toBe(DEFAULT_FG)
  })

  it('ANSI precedence — cell with non-default fg is NOT overridden', () => {
    const grid = makeGrid(['# Hello'])
    // Simulate ANSI color on the "H" cell
    grid.cellRows[0][2].fg = 0xff0000

    styler.styleRow(grid, 0, { type: 'h1', contentStart: 2 })

    // Should NOT be overridden
    expect(grid.cellRows[0][2].fg).toBe(0xff0000)
    // But next cell (default fg) should be styled
    expect(grid.cellRows[0][3].fg).toBe(colors.headingColor)
  })

  it('normal row — no cells modified', () => {
    const grid = makeGrid(['just text'])
    styler.styleRow(grid, 0, { type: 'normal', contentStart: 0 })

    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].fg).toBe(DEFAULT_FG)
      expect(grid.cellRows[0][x].bg).toBe(DEFAULT_BG)
      expect(grid.cellRows[0][x].bold).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// apply() integration tests
// ---------------------------------------------------------------------------

describe('MarkdownStyler.apply', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
  })

  it('is a no-op when disabled', () => {
    const grid = makeGrid(['# Hello'])
    styler.apply(grid)

    // Nothing should change
    expect(grid.cellRows[0][0].fg).toBe(DEFAULT_FG)
    expect(grid.cellRows[0][2].fg).toBe(DEFAULT_FG)
  })

  it('processes multiple rows with correct fence state', () => {
    const grid = makeGrid([
      '# Title',
      '```',
      'code line',
      '```',
      'normal text',
    ])

    styler.enable()
    styler.apply(grid)

    // Row 0: heading — content should be heading color
    expect(grid.cellRows[0][2].fg).toBe(colors.headingColor)

    // Row 1: fence — dimmed
    expect(grid.cellRows[1][0].fg).toBe(colors.markerDim)

    // Row 2: code body — code fg + bg
    expect(grid.cellRows[2][0].fg).toBe(colors.codeFg)
    expect(grid.cellRows[2][0].bg).toBe(colors.codeBg)

    // Row 3: closing fence — dimmed
    expect(grid.cellRows[3][0].fg).toBe(colors.markerDim)

    // Row 4: normal — unchanged
    expect(grid.cellRows[4][0].fg).toBe(DEFAULT_FG)
  })

  it('resets fence state at start of each apply() call', () => {
    styler.enable()

    // First call leaves fence open
    const grid1 = makeGrid(['```', 'inside'])
    styler.apply(grid1)
    // fence was open after row 0, row 1 is code-body
    expect(grid1.cellRows[1][0].fg).toBe(colors.codeFg)

    // Second call should start fresh — "inside" is now normal
    const grid2 = makeGrid(['normal text'])
    styler.apply(grid2)
    expect(grid2.cellRows[0][0].fg).toBe(DEFAULT_FG)
  })

  it('toggling off resets fence state', () => {
    styler.enable()
    styler.classifyRow('```')
    expect(styler.fenceOpen).toBe(true)

    styler.toggle()  // disables
    expect(styler.fenceOpen).toBe(false)
    expect(styler.enabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// toggle / enable / disable
// ---------------------------------------------------------------------------

describe('MarkdownStyler toggle', () => {
  it('toggle flips enabled state', () => {
    const styler = new MarkdownStyler()
    expect(styler.enabled).toBe(false)

    styler.toggle()
    expect(styler.enabled).toBe(true)

    styler.toggle()
    expect(styler.enabled).toBe(false)
  })

  it('enable/disable are explicit', () => {
    const styler = new MarkdownStyler()
    styler.enable()
    expect(styler.enabled).toBe(true)

    styler.disable()
    expect(styler.enabled).toBe(false)
  })

  it('custom colors are applied', () => {
    const styler = new MarkdownStyler({ headingColor: 0xff0000 })
    expect(styler.colors.headingColor).toBe(0xff0000)
    // Other defaults preserved
    expect(styler.colors.markerDim).toBe(DEFAULT_MARKDOWN_COLORS.markerDim)
  })

  it('markdown colors object has all required fields', () => {
    const styler = new MarkdownStyler()
    expect(styler.colors.headingColor).toBeTruthy()
    expect(styler.colors.markerDim).toBeTruthy()
    expect(styler.colors.codeFg).toBeTruthy()
    expect(styler.colors.codeBg).toBeTruthy()
    expect(styler.colors.hrColor).toBeTruthy()
  })

  it('disable resets fence state', () => {
    const styler = new MarkdownStyler()
    styler.enable()
    styler.classifyRow('```')
    expect(styler.fenceOpen).toBe(true)

    styler.disable()
    expect(styler.fenceOpen).toBe(false)
    expect(styler.enabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Phase 1c: Inline pattern tests
// ---------------------------------------------------------------------------

describe('MarkdownStyler inline patterns', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('**bold text** — asterisks dimmed, inner text gets bold', () => {
    const grid = makeGrid(['hello **bold** world'])
    styler.apply(grid)

    // "**" at positions 6-7 should be dimmed
    expect(grid.cellRows[0][6].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][7].fg).toBe(colors.markerDim)
    // "bold" at positions 8-11 should be bold
    expect(grid.cellRows[0][8].bold).toBe(1)
    expect(grid.cellRows[0][9].bold).toBe(1)
    expect(grid.cellRows[0][10].bold).toBe(1)
    expect(grid.cellRows[0][11].bold).toBe(1)
    // closing "**" at 12-13 should be dimmed
    expect(grid.cellRows[0][12].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][13].fg).toBe(colors.markerDim)
    // "hello " and " world" should be untouched
    expect(grid.cellRows[0][0].fg).toBe(DEFAULT_FG)
    expect(grid.cellRows[0][0].bold).toBe(0)
  })

  it('*italic text* — asterisks dimmed, inner text gets italic', () => {
    const grid = makeGrid(['hello *italic* world'])
    styler.apply(grid)

    // "*" at position 6 should be dimmed
    expect(grid.cellRows[0][6].fg).toBe(colors.markerDim)
    // "italic" at 7-12 should be italic
    expect(grid.cellRows[0][7].italic).toBe(1)
    expect(grid.cellRows[0][12].italic).toBe(1)
    // closing "*" at 13 should be dimmed
    expect(grid.cellRows[0][13].fg).toBe(colors.markerDim)
    // surrounding text untouched
    expect(grid.cellRows[0][0].italic).toBe(0)
  })

  it('**not closed — no styling applied (unmatched pair)', () => {
    const grid = makeGrid(['hello **not closed'])
    styler.apply(grid)

    // Nothing should be bolded
    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].bold).toBe(0)
    }
  })

  it('***bold italic*** — both bold and italic applied', () => {
    const grid = makeGrid(['***both***'])
    styler.apply(grid)

    // "both" at positions 3-6 should have both bold and italic
    expect(grid.cellRows[0][3].bold).toBe(1)
    expect(grid.cellRows[0][3].italic).toBe(1)
    expect(grid.cellRows[0][6].bold).toBe(1)
    expect(grid.cellRows[0][6].italic).toBe(1)
    // "***" markers dimmed
    expect(grid.cellRows[0][0].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][1].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][2].fg).toBe(colors.markerDim)
  })

  it('`inline code` — backticks dimmed, inner text gets code fg + bg', () => {
    const grid = makeGrid(['run `npm install` now'])
    styler.apply(grid)

    // "`" at position 4 should be dimmed
    expect(grid.cellRows[0][4].fg).toBe(colors.markerDim)
    // "npm install" at 5-15 should get code styling
    expect(grid.cellRows[0][5].fg).toBe(colors.codeFg)
    expect(grid.cellRows[0][5].bg).toBe(colors.codeBg)
    expect(grid.cellRows[0][15].fg).toBe(colors.codeFg)
    expect(grid.cellRows[0][15].bg).toBe(colors.codeBg)
    // closing "`" at 16 should be dimmed
    expect(grid.cellRows[0][16].fg).toBe(colors.markerDim)
    // "run " and " now" untouched
    expect(grid.cellRows[0][0].fg).toBe(DEFAULT_FG)
  })

  it('`unclosed — no styling (unmatched backtick)', () => {
    const grid = makeGrid(['hello `unclosed'])
    styler.apply(grid)

    // No code styling should be applied
    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].bg).toBe(DEFAULT_BG)
    }
  })

  it('inline patterns NOT applied inside code blocks', () => {
    const grid = makeGrid([
      '```',
      '**not bold** and `not code`',
      '```',
    ])
    styler.apply(grid)

    // Row 1 is code-body — should have code styling, not inline patterns
    expect(grid.cellRows[1][0].fg).toBe(colors.codeFg)
    expect(grid.cellRows[1][0].bg).toBe(colors.codeBg)
    // Should NOT be bold (inline patterns skipped in code blocks)
    expect(grid.cellRows[1][2].bold).toBe(0)
  })

  it('multiple inline patterns on one line: **bold** and *italic*', () => {
    const grid = makeGrid(['**bold** and *italic*'])
    styler.apply(grid)

    // "bold" should be bold
    expect(grid.cellRows[0][2].bold).toBe(1)
    expect(grid.cellRows[0][5].bold).toBe(1)
    // "*" markers at 13 and 20 should be dimmed
    expect(grid.cellRows[0][13].fg).toBe(colors.markerDim)
    expect(grid.cellRows[0][20].fg).toBe(colors.markerDim)
    // "italic" at 14-19 should be italic
    expect(grid.cellRows[0][14].italic).toBe(1)
    expect(grid.cellRows[0][19].italic).toBe(1)
    // "and" should be neither
    expect(grid.cellRows[0][8].bold).toBe(0)
    expect(grid.cellRows[0][8].italic).toBe(0)
  })

  it('* list item — not confused with italic', () => {
    const grid = makeGrid(['* list item'])
    styler.apply(grid)

    // Should be classified as bullet, not italic
    expect(grid.cellRows[0][0].fg).toBe(colors.headingColor) // bullet marker accent
    // Content should not be italic
    expect(grid.cellRows[0][2].italic).toBe(0)
  })

  it('inline code with ANSI-colored cell preserves ANSI color', () => {
    const grid = makeGrid(['`colored`'])
    // Simulate ANSI color on a cell inside the backticks
    grid.cellRows[0][3].fg = 0xff0000

    styler.apply(grid)

    // ANSI-colored cell should keep its color
    expect(grid.cellRows[0][3].fg).toBe(0xff0000)
    // But adjacent default-fg cells should get code styling
    expect(grid.cellRows[0][1].fg).toBe(colors.codeFg)
  })
})

// ---------------------------------------------------------------------------
// Phase 2b: ScalableGrid mock + scale annotation tests
// ---------------------------------------------------------------------------

function makeScalableGrid(lines: string[]): ScalableGrid & { cellRows: StylableCell[][]; scales: number[]; recomputeCalled: boolean } {
  const base = makeGrid(lines)
  const scales = new Array(lines.length).fill(1.0)
  let recomputeCalled = false

  return {
    ...base,
    scales,
    get recomputeCalled() { return recomputeCalled },
    set recomputeCalled(v: boolean) { recomputeCalled = v },
    setRowScale(y: number, scale: number): void {
      if (y >= 0 && y < lines.length) scales[y] = scale
    },
    getRowScale(y: number): number {
      return (y >= 0 && y < lines.length) ? scales[y] : 1.0
    },
    resetRowScales(): void {
      scales.fill(1.0)
    },
    recomputeRowPositions(): void {
      recomputeCalled = true
    },
  }
}

describe('MarkdownStyler Phase 2b — scale annotations', () => {
  let styler: MarkdownStyler

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('apply() on h1 row sets scale 1.6', () => {
    const grid = makeScalableGrid(['# Title'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(ROW_SCALES.h1)
    expect(grid.scales[0]).toBe(1.6)
  })

  it('apply() on h2 row sets scale 1.35', () => {
    const grid = makeScalableGrid(['## Subtitle'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(ROW_SCALES.h2)
    expect(grid.scales[0]).toBe(1.35)
  })

  it('apply() on h3 row sets scale 1.15', () => {
    const grid = makeScalableGrid(['### Section'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(ROW_SCALES.h3)
    expect(grid.scales[0]).toBe(1.15)
  })

  it('apply() on code-body row sets scale 0.85', () => {
    const grid = makeScalableGrid(['```', 'code line', '```'])
    styler.apply(grid)
    expect(grid.scales[1]).toBe(ROW_SCALES['code-body'])
    expect(grid.scales[1]).toBe(0.85)
  })

  it('apply() on code-fence row sets scale 0.85', () => {
    const grid = makeScalableGrid(['```', 'code', '```'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(ROW_SCALES['code-fence'])
    expect(grid.scales[0]).toBe(0.85)
  })

  it('apply() on normal row sets scale 1.0', () => {
    const grid = makeScalableGrid(['just text'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(1.0)
  })

  it('apply() on bullet row sets scale 1.0', () => {
    const grid = makeScalableGrid(['- item'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(1.0)
  })

  it('apply() on hr row sets scale 1.0', () => {
    const grid = makeScalableGrid(['---'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(1.0)
  })

  it('apply() calls recomputeRowPositions after setting scales', () => {
    const grid = makeScalableGrid(['# Title', 'normal'])
    styler.apply(grid)
    expect(grid.recomputeCalled).toBe(true)
  })

  it('mixed content sets correct scales per row', () => {
    const grid = makeScalableGrid([
      '# Title',
      'normal text',
      '```',
      'code line',
      '```',
      '## Subtitle',
    ])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(1.6)    // h1
    expect(grid.scales[1]).toBe(1.0)    // normal
    expect(grid.scales[2]).toBe(0.85)   // code-fence
    expect(grid.scales[3]).toBe(0.85)   // code-body
    expect(grid.scales[4]).toBe(0.85)   // code-fence (closing)
    expect(grid.scales[5]).toBe(1.35)   // h2
  })

  it('disabling markdown resets all row scales to 1.0', () => {
    const grid = makeScalableGrid(['# Title', '```', 'code', '```'])
    styler.apply(grid)
    expect(grid.scales[0]).toBe(1.6)

    styler.disable()
    styler.apply(grid)  // apply when disabled should reset
    expect(grid.scales[0]).toBe(1.0)
    expect(grid.scales[1]).toBe(1.0)
    expect(grid.scales[2]).toBe(1.0)
    expect(grid.scales[3]).toBe(1.0)
  })

  it('non-scalable grid still works (Phase 1 backward compat)', () => {
    const grid = makeGrid(['# Title'])
    styler.apply(grid)
    // Should not throw — just styles without scaling
    expect(grid.cellRows[0][2].fg).toBe(DEFAULT_MARKDOWN_COLORS.headingColor)
  })
})

// ---------------------------------------------------------------------------
// Phase 2c: Fence state prescan for scrollback
// ---------------------------------------------------------------------------

describe('MarkdownStyler Phase 2c — prescanFenceState', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('prescan with no fences leaves fenceOpen false', () => {
    styler.prescanFenceState(['normal text', '# heading'])
    expect(styler.fenceOpen).toBe(false)
  })

  it('prescan with one open fence sets fenceOpen true', () => {
    styler.prescanFenceState(['```python', 'code line'])
    expect(styler.fenceOpen).toBe(true)
  })

  it('prescan with matched fences leaves fenceOpen false', () => {
    styler.prescanFenceState(['```', 'code', '```'])
    expect(styler.fenceOpen).toBe(false)
  })

  it('prescan with open fence + apply(preserveFenceState=true) styles first row as code-body', () => {
    styler.prescanFenceState(['```python'])
    const grid = makeGrid(['inside code block', '```', 'normal text'])
    styler.apply(grid, true)

    // Row 0 should be code-body (fence was open from prescan)
    expect(grid.cellRows[0][0].fg).toBe(colors.codeFg)
    expect(grid.cellRows[0][0].bg).toBe(colors.codeBg)
    // Row 1 is closing fence
    expect(grid.cellRows[1][0].fg).toBe(colors.markerDim)
    // Row 2 is normal (after fence closed)
    expect(grid.cellRows[2][0].fg).toBe(DEFAULT_FG)
  })

  it('apply without preserveFenceState resets fence (default behavior)', () => {
    styler.prescanFenceState(['```python'])
    expect(styler.fenceOpen).toBe(true)

    const grid = makeGrid(['inside code block'])
    styler.apply(grid)  // preserveFenceState defaults to false

    // Should NOT be styled as code-body because fence was reset
    expect(grid.cellRows[0][0].fg).toBe(DEFAULT_FG)
  })

  it('prescan only considers lines starting with ```', () => {
    styler.prescanFenceState(['normal', 'has ``` in middle', '```'])
    // Only the last line (starts with ```) opens the fence
    expect(styler.fenceOpen).toBe(true)
  })

  it('scrollback scale: code-body rows from prescan get scale 0.85', () => {
    styler.prescanFenceState(['```python'])
    const grid = makeScalableGrid(['code line', '```', 'normal'])
    styler.apply(grid, true)

    expect(grid.scales[0]).toBe(0.85)  // code-body
    expect(grid.scales[1]).toBe(0.85)  // code-fence (closing)
    expect(grid.scales[2]).toBe(1.0)   // normal
  })
})

// ---------------------------------------------------------------------------
// Phase 3: Visual polish — decorations, bullet replacement, links, _italic_
// ---------------------------------------------------------------------------

describe('MarkdownStyler Phase 3 — decorations', () => {
  let styler: MarkdownStyler

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('HR row produces hr-line decoration', () => {
    const grid = makeGrid(['---'])
    styler.apply(grid)
    const deco = styler.getDecoration(0)
    expect(deco).not.toBeNull()
    expect(deco!.kind).toBe('hr-line')
  })

  it('code-body row produces code-border decoration', () => {
    const grid = makeGrid(['```', 'code', '```'])
    styler.apply(grid)
    const deco = styler.getDecoration(1)
    expect(deco).not.toBeNull()
    expect(deco!.kind).toBe('code-border')
  })

  it('h1 row produces h1-underline decoration', () => {
    const grid = makeGrid(['# Title'])
    styler.apply(grid)
    const deco = styler.getDecoration(0)
    expect(deco).not.toBeNull()
    expect(deco!.kind).toBe('h1-underline')
  })

  it('normal row has no decoration', () => {
    const grid = makeGrid(['plain text'])
    styler.apply(grid)
    expect(styler.getDecoration(0)).toBeNull()
  })

  it('h2/h3 rows have no decoration', () => {
    const grid = makeGrid(['## Sub', '### Section'])
    styler.apply(grid)
    expect(styler.getDecoration(0)).toBeNull()
    expect(styler.getDecoration(1)).toBeNull()
  })

  it('decorations cleared when disabled', () => {
    const grid = makeGrid(['---'])
    styler.apply(grid)
    expect(styler.getDecoration(0)).not.toBeNull()

    styler.disable()
    styler.apply(grid)
    expect(styler.getDecoration(0)).toBeNull()
  })
})

describe('MarkdownStyler Phase 3 — bullet replacement', () => {
  let styler: MarkdownStyler

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('- list item: dash replaced with bullet •', () => {
    const grid = makeGrid(['- item'])
    styler.apply(grid)
    expect(grid.cellRows[0][0].char).toBe('•')
  })

  it('* list item: asterisk replaced with bullet •', () => {
    const grid = makeGrid(['* item'])
    styler.apply(grid)
    expect(grid.cellRows[0][0].char).toBe('•')
  })

  it('indented bullet: correct position replaced', () => {
    const grid = makeGrid(['  - nested'])
    styler.apply(grid)
    expect(grid.cellRows[0][2].char).toBe('•')
    expect(grid.cellRows[0][0].char).toBe(' ')  // leading space preserved
  })
})

describe('MarkdownStyler Phase 3 — _underscore italic_', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('_italic text_ — underscores dimmed, inner text italic', () => {
    const grid = makeGrid(['hello _italic_ world'])
    styler.apply(grid)

    // "_" at position 6 dimmed
    expect(grid.cellRows[0][6].fg).toBe(colors.markerDim)
    // "italic" at 7-12 italic
    expect(grid.cellRows[0][7].italic).toBe(1)
    expect(grid.cellRows[0][12].italic).toBe(1)
    // closing "_" at 13 dimmed
    expect(grid.cellRows[0][13].fg).toBe(colors.markerDim)
    // surrounding text not italic
    expect(grid.cellRows[0][0].italic).toBe(0)
  })

  it('_unclosed — no italic applied', () => {
    const grid = makeGrid(['hello _unclosed'])
    styler.apply(grid)
    for (let x = 0; x < grid.cols; x++) {
      expect(grid.cellRows[0][x].italic).toBe(0)
    }
  })

  it('_italic_ not applied inside code blocks', () => {
    const grid = makeGrid(['```', '_not italic_', '```'])
    styler.apply(grid)
    expect(grid.cellRows[1][1].italic).toBe(0)
  })
})

describe('MarkdownStyler Phase 3 — [text](url) links', () => {
  let styler: MarkdownStyler
  const colors = DEFAULT_MARKDOWN_COLORS

  beforeEach(() => {
    styler = new MarkdownStyler()
    styler.enable()
  })

  it('[text](url) — brackets/parens dimmed, text highlighted', () => {
    const grid = makeGrid(['see [docs](http://x.com) here'])
    styler.apply(grid)

    // "[" at 4 dimmed
    expect(grid.cellRows[0][4].fg).toBe(colors.markerDim)
    // "docs" at 5-8 highlighted + underlined
    expect(grid.cellRows[0][5].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][5].underline).toBe(1)
    expect(grid.cellRows[0][8].fg).toBe(colors.headingColor)
    expect(grid.cellRows[0][8].underline).toBe(1)
    // "]" at 9 dimmed
    expect(grid.cellRows[0][9].fg).toBe(colors.markerDim)
    // "(" at 10 dimmed
    expect(grid.cellRows[0][10].fg).toBe(colors.markerDim)
    // url dimmed
    expect(grid.cellRows[0][11].fg).toBe(colors.markerDim)
    // ")" at 23 dimmed
    expect(grid.cellRows[0][23].fg).toBe(colors.markerDim)
    // " here" untouched
    expect(grid.cellRows[0][24].fg).toBe(DEFAULT_FG)
  })

  it('no link match for [incomplete', () => {
    const grid = makeGrid(['[incomplete text'])
    styler.apply(grid)
    expect(grid.cellRows[0][0].fg).toBe(DEFAULT_FG)
  })

  it('links not applied inside code blocks', () => {
    const grid = makeGrid(['```', '[link](url)', '```'])
    styler.apply(grid)
    // Should be code styling, not link styling
    expect(grid.cellRows[1][0].fg).toBe(colors.codeFg)
  })
})
