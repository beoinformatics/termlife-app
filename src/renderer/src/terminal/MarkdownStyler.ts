/**
 * MarkdownStyler — Semi-markdown visual styling for terminal output.
 *
 * Scans visible rows for markdown patterns and applies style overrides
 * to CellGrid cells. Runs between TerminalEngine.sync() and CellGrid.flush().
 *
 * Phase 1: inline styling only (fg/bg/bold/italic overrides, no layout changes).
 */

export interface MarkdownColors {
  headingColor: number
  markerDim: number
  codeFg: number
  codeBg: number
  hrColor: number
}

export const DEFAULT_MARKDOWN_COLORS: MarkdownColors = {
  headingColor: 0x00d4ff,  // Electric cyan - eye-catching headings
  markerDim: 0x6b7280,     // Warm gray - subtle but visible
  codeFg: 0xff6b9d,        // Hot pink - code stands out!
  codeBg: 0x2a1a2a,        // Rich burgundy tint
  hrColor: 0xff8c42,        // Coral orange - decorative pop
}

/** Per-row scale factors for markdown elements (Phase 2). */
export const ROW_SCALES: Record<string, number> = {
  h1: 1.6,
  h2: 1.35,
  h3: 1.15,
  'code-body': 0.85,
  'code-fence': 0.85,
  normal: 1.0,
  hr: 1.0,
  bullet: 1.0,
  numbered: 1.0,
}

export type RowType = 'h1' | 'h2' | 'h3' | 'bullet' | 'numbered' | 'code-fence' | 'code-body' | 'hr' | 'normal'

export interface RowAnnotation {
  type: RowType
  contentStart: number  // column where content begins (after markers)
}

/** Phase 3: Visual decoration types drawn by CellGrid as Graphics overlays. */
export type RowDecoration =
  | { kind: 'hr-line'; color: number }
  | { kind: 'code-border'; color: number }
  | { kind: 'h1-underline'; color: number }
  | null

/**
 * Cell interface — minimal abstraction so we can test without CellGrid.
 */
export interface StylableCell {
  char: string
  fg: number
  bg: number
  bold: number
  italic: number
  underline?: number
}

/**
 * Grid interface — minimal abstraction so we can test without CellGrid/PixiJS.
 */
export interface StylableGrid {
  readonly cols: number
  readonly rows: number
  readonly defaultFg: number
  readonly defaultBg: number
  getRowText(y: number): string
  getCell(x: number, y: number): StylableCell | null
}

/**
 * Extended grid interface that supports per-row scaling (Phase 2).
 */
export interface ScalableGrid extends StylableGrid {
  setRowScale(y: number, scale: number): void
  getRowScale(y: number): number
  resetRowScales(): void
  recomputeRowPositions(): void
}

export class MarkdownStyler {
  private _enabled = false
  private _fenceOpen = false
  colors: MarkdownColors

  /** Phase 3: per-row decoration annotations, indexed by row. */
  private _decorations: (RowDecoration)[] = []

  constructor(colors?: Partial<MarkdownColors>) {
    this.colors = { ...DEFAULT_MARKDOWN_COLORS, ...colors }
  }

  get enabled(): boolean { return this._enabled }
  get fenceOpen(): boolean { return this._fenceOpen }

  /** Get the decoration for a given row (Phase 3). */
  getDecoration(y: number): RowDecoration {
    return this._decorations[y] ?? null
  }

  toggle(): void {
    this._enabled = !this._enabled
    if (!this._enabled) {
      this.resetState()
    }
  }

  enable(): void {
    this._enabled = true
  }

  disable(): void {
    this._enabled = false
    this.resetState()
  }

  resetState(): void {
    this._fenceOpen = false
  }

  /**
   * Classify a single row's text and return its annotation.
   */
  classifyRow(text: string): RowAnnotation {
    // Code fence: starts with ``` (optionally followed by language)
    if (/^```/.test(text)) {
      this._fenceOpen = !this._fenceOpen
      return { type: 'code-fence', contentStart: 0 }
    }

    // Inside a fenced code block
    if (this._fenceOpen) {
      return { type: 'code-body', contentStart: 0 }
    }

    // Headings: # followed by space (only h1-h3)
    const headingMatch = text.match(/^(#{1,3}) /)
    if (headingMatch) {
      const level = headingMatch[1].length
      const type = `h${level}` as 'h1' | 'h2' | 'h3'
      return { type, contentStart: level + 1 }
    }

    // Horizontal rule: line is only dashes or asterisks (min 3)
    if (/^-{3,}\s*$/.test(text) || /^\*{3,}\s*$/.test(text)) {
      return { type: 'hr', contentStart: 0 }
    }

    // Bullet list: - or * followed by space
    if (/^(\s*)[-*] /.test(text)) {
      const match = text.match(/^(\s*)[-*] /)!
      return { type: 'bullet', contentStart: match[0].length }
    }

    // Numbered list: digits followed by . and space
    if (/^(\s*)\d+\. /.test(text)) {
      const match = text.match(/^(\s*)\d+\. /)!
      return { type: 'numbered', contentStart: match[0].length }
    }

    return { type: 'normal', contentStart: 0 }
  }

  /**
   * Apply styling to a single row's cells based on its annotation.
   */
  styleRow(grid: StylableGrid, y: number, annotation: RowAnnotation): void {
    const { type, contentStart } = annotation
    const cols = grid.cols

    switch (type) {
      case 'h1':
      case 'h2':
      case 'h3': {
        // Dim the marker characters (e.g., "## ")
        for (let x = 0; x < contentStart && x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell && cell.fg === grid.defaultFg) {
            cell.fg = this.colors.markerDim
          }
        }
        // Bold + heading color for content
        for (let x = contentStart; x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell && cell.fg === grid.defaultFg) {
            cell.fg = this.colors.headingColor
            cell.bold = 1
          }
        }
        break
      }

      case 'code-fence': {
        // Dim the entire fence line
        for (let x = 0; x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell && cell.fg === grid.defaultFg) {
            cell.fg = this.colors.markerDim
          }
        }
        break
      }

      case 'code-body': {
        // Code fg + bg tint for the entire row
        for (let x = 0; x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell) {
            if (cell.fg === grid.defaultFg) {
              cell.fg = this.colors.codeFg
            }
            if (cell.bg === grid.defaultBg) {
              cell.bg = this.colors.codeBg
            }
          }
        }
        break
      }

      case 'hr': {
        for (let x = 0; x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell && cell.fg === grid.defaultFg) {
            cell.fg = this.colors.hrColor
          }
        }
        break
      }

      case 'bullet':
      case 'numbered': {
        // Accent color on the marker portion
        for (let x = 0; x < contentStart && x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell && cell.fg === grid.defaultFg) {
            cell.fg = this.colors.headingColor
          }
        }
        break
      }

      case 'normal':
        // No row-level styling
        break
    }
  }

  /**
   * Apply inline patterns (bold, italic, inline code) to a row's cells.
   * Only runs on rows that are NOT code-body, code-fence, or hr.
   */
  styleInline(grid: StylableGrid, y: number, text: string): void {
    const cols = grid.cols

    // Process ***bold italic*** (3 asterisks) first, then **, then *
    // Process inline code backticks
    // We work on the raw text to find marker positions, then apply to cells.

    // Track which columns have been claimed by a pattern (avoid double-styling)
    const claimed = new Set<number>()

    // --- Inline code: `...` ---
    this.applyInlineCode(grid, y, text, cols, claimed)

    // --- Bold italic: ***...*** ---
    this.applyAsterisks(grid, y, text, cols, claimed, 3)

    // --- Bold: **...** ---
    this.applyAsterisks(grid, y, text, cols, claimed, 2)

    // --- Italic: *...* (single, not preceded/followed by *) ---
    this.applyAsterisks(grid, y, text, cols, claimed, 1)

    // --- Underscore italic: _..._ ---
    this.applyUnderscoreItalic(grid, y, text, cols, claimed)

    // --- Links: [text](url) ---
    this.applyLinks(grid, y, text, cols, claimed)
  }

  private applyInlineCode(
    grid: StylableGrid, y: number, text: string, cols: number, claimed: Set<number>
  ): void {
    let i = 0
    while (i < text.length) {
      if (text[i] === '`' && !claimed.has(i)) {
        // Find closing backtick
        const closeIdx = text.indexOf('`', i + 1)
        if (closeIdx === -1) break // no match — stop

        // Dim opening backtick
        const openCell = grid.getCell(i, y)
        if (openCell && openCell.fg === grid.defaultFg) openCell.fg = this.colors.markerDim
        claimed.add(i)

        // Style content between backticks
        for (let x = i + 1; x < closeIdx && x < cols; x++) {
          const cell = grid.getCell(x, y)
          if (cell) {
            if (cell.fg === grid.defaultFg) cell.fg = this.colors.codeFg
            if (cell.bg === grid.defaultBg) cell.bg = this.colors.codeBg
          }
          claimed.add(x)
        }

        // Dim closing backtick
        const closeCell = grid.getCell(closeIdx, y)
        if (closeCell && closeCell.fg === grid.defaultFg) closeCell.fg = this.colors.markerDim
        claimed.add(closeIdx)

        i = closeIdx + 1
      } else {
        i++
      }
    }
  }

  private applyAsterisks(
    grid: StylableGrid, y: number, text: string, cols: number, claimed: Set<number>, count: 1 | 2 | 3
  ): void {
    const marker = '*'.repeat(count)
    let i = 0
    while (i < text.length - count) {
      if (claimed.has(i)) { i++; continue }

      // Check for marker at position i
      if (text.substring(i, i + count) === marker) {
        // For single *, make sure it's not part of ** or ***
        if (count === 1 && (text[i + 1] === '*' || (i > 0 && text[i - 1] === '*'))) {
          i++; continue
        }
        if (count === 2 && (text[i + 2] === '*' || (i > 0 && text[i - 1] === '*'))) {
          i++; continue
        }

        // Find closing marker
        const searchFrom = i + count
        const closeIdx = text.indexOf(marker, searchFrom)
        if (closeIdx === -1) { i++; continue }

        // For single *, verify closing is not part of **
        if (count === 1 && (text[closeIdx + 1] === '*' || (closeIdx > 0 && text[closeIdx - 1] === '*'))) {
          i++; continue
        }
        if (count === 2 && ((closeIdx + 2 < text.length && text[closeIdx + 2] === '*') || (closeIdx > 0 && text[closeIdx - 1] === '*'))) {
          i++; continue
        }

        // Dim opening markers
        for (let m = 0; m < count; m++) {
          const cell = grid.getCell(i + m, y)
          if (cell && cell.fg === grid.defaultFg) cell.fg = this.colors.markerDim
          claimed.add(i + m)
        }

        // Style content
        for (let x = i + count; x < closeIdx && x < cols; x++) {
          if (claimed.has(x)) continue
          const cell = grid.getCell(x, y)
          if (cell) {
            if (count === 1 || count === 3) cell.italic = 1
            if (count === 2 || count === 3) cell.bold = 1
          }
          claimed.add(x)
        }

        // Dim closing markers
        for (let m = 0; m < count; m++) {
          const cell = grid.getCell(closeIdx + m, y)
          if (cell && cell.fg === grid.defaultFg) cell.fg = this.colors.markerDim
          claimed.add(closeIdx + m)
        }

        i = closeIdx + count
      } else {
        i++
      }
    }
  }

  /**
   * Detect _italic_ underscore pairs and apply italic styling.
   */
  private applyUnderscoreItalic(
    grid: StylableGrid, y: number, text: string, cols: number, claimed: Set<number>
  ): void {
    let i = 0
    while (i < text.length - 1) {
      if (claimed.has(i)) { i++; continue }

      if (text[i] === '_' && text[i + 1] !== '_') {
        // Find closing _
        const closeIdx = text.indexOf('_', i + 1)
        if (closeIdx === -1 || closeIdx <= i + 1) { i++; continue }
        // Ensure closing _ is not part of __
        if (closeIdx + 1 < text.length && text[closeIdx + 1] === '_') { i++; continue }
        if (text[closeIdx - 1] === '_') { i++; continue }

        // Dim opening underscore
        const openCell = grid.getCell(i, y)
        if (openCell && openCell.fg === grid.defaultFg) openCell.fg = this.colors.markerDim
        claimed.add(i)

        // Apply italic to content
        for (let x = i + 1; x < closeIdx && x < cols; x++) {
          if (claimed.has(x)) continue
          const cell = grid.getCell(x, y)
          if (cell) cell.italic = 1
          claimed.add(x)
        }

        // Dim closing underscore
        const closeCell = grid.getCell(closeIdx, y)
        if (closeCell && closeCell.fg === grid.defaultFg) closeCell.fg = this.colors.markerDim
        claimed.add(closeIdx)

        i = closeIdx + 1
      } else {
        i++
      }
    }
  }

  /**
   * Detect [text](url) link patterns — dim brackets/parens, highlight link text.
   */
  private applyLinks(
    grid: StylableGrid, y: number, text: string, cols: number, claimed: Set<number>
  ): void {
    // Match [text](url) pattern
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = linkRegex.exec(text)) !== null) {
      const fullStart = match.index
      const bracketOpenIdx = fullStart                    // [
      const textStart = fullStart + 1                     // start of link text
      const textEnd = textStart + match[1].length         // end of link text
      const bracketCloseIdx = textEnd                     // ]
      const parenOpenIdx = textEnd + 1                    // (
      const parenCloseIdx = fullStart + match[0].length - 1  // )

      // Dim [ and ]
      for (const idx of [bracketOpenIdx, bracketCloseIdx]) {
        if (idx < cols && !claimed.has(idx)) {
          const cell = grid.getCell(idx, y)
          if (cell && cell.fg === grid.defaultFg) cell.fg = this.colors.markerDim
          claimed.add(idx)
        }
      }

      // Highlight link text with heading color + underline
      for (let x = textStart; x < textEnd && x < cols; x++) {
        if (claimed.has(x)) continue
        const cell = grid.getCell(x, y)
        if (cell) {
          if (cell.fg === grid.defaultFg) cell.fg = this.colors.headingColor
          cell.underline = 1
        }
        claimed.add(x)
      }

      // Dim ( url ) portion
      for (let x = parenOpenIdx; x <= parenCloseIdx && x < cols; x++) {
        if (claimed.has(x)) continue
        const cell = grid.getCell(x, y)
        if (cell && cell.fg === grid.defaultFg) cell.fg = this.colors.markerDim
        claimed.add(x)
      }
    }
  }

  /**
   * Pre-scan lines above the visible viewport to determine if we start
   * inside a code fence. Call this before apply() when scrolled back.
   * Pass an array of line texts from above the viewport (any number of lines).
   */
  prescanFenceState(linesAbove: string[]): void {
    this._fenceOpen = false
    for (const line of linesAbove) {
      if (/^```/.test(line)) {
        this._fenceOpen = !this._fenceOpen
      }
    }
  }

  /**
   * Check if a grid supports row scaling (Phase 2).
   */
  private isScalable(grid: StylableGrid): grid is ScalableGrid {
    return 'setRowScale' in grid && 'recomputeRowPositions' in grid
  }

  /**
   * Main entry — scan all visible rows and apply styling.
   * Must be called every frame between sync() and flush().
   *
   * If prescanFenceState() was called beforehand, pass preserveFenceState=true
   * to keep the pre-scanned fence state instead of resetting to false.
   */
  apply(grid: StylableGrid, preserveFenceState = false): void {
    if (!this._enabled) {
      // When disabled, reset scales and decorations
      this._decorations = []
      if (this.isScalable(grid)) {
        grid.resetRowScales()
        grid.recomputeRowPositions()
      }
      return
    }

    // Reset fence state unless caller pre-scanned it
    if (!preserveFenceState) {
      this._fenceOpen = false
    }

    const scalable = this.isScalable(grid)
    this._decorations = new Array(grid.rows).fill(null)

    for (let y = 0; y < grid.rows; y++) {
      const text = grid.getRowText(y)
      const annotation = this.classifyRow(text)
      this.styleRow(grid, y, annotation)

      // Phase 3: row decorations
      switch (annotation.type) {
        case 'hr':
          this._decorations[y] = { kind: 'hr-line', color: this.colors.hrColor }
          break
        case 'code-body':
          this._decorations[y] = { kind: 'code-border', color: this.colors.codeFg }
          break
        case 'h1':
          this._decorations[y] = { kind: 'h1-underline', color: this.colors.headingColor }
          break
      }

      // Phase 3: bullet replacement (- → •, * → •)
      if (annotation.type === 'bullet') {
        const bulletCol = annotation.contentStart - 2  // position of - or *
        const match = text.match(/^(\s*)[-*] /)
        if (match) {
          const bulletX = match[1].length  // skip leading whitespace
          const cell = grid.getCell(bulletX, y)
          if (cell) cell.char = '•'
        }
      }

      // Set row scale (Phase 2)
      if (scalable) {
        grid.setRowScale(y, ROW_SCALES[annotation.type] ?? 1.0)
      }

      // Apply inline patterns only on non-code, non-fence, non-hr rows
      if (annotation.type !== 'code-body' && annotation.type !== 'code-fence' && annotation.type !== 'hr') {
        this.styleInline(grid, y, text)
      }
    }

    // Recompute Y positions after all scales are set
    if (scalable) {
      grid.recomputeRowPositions()
    }
  }
}
