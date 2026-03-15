import { Container, Text, TextStyle, Graphics } from 'pixi.js'
import { themeManager } from '../themes/ThemeManager'
import type { RowDecoration } from './MarkdownStyler'

// Build 256-color palette: first 16 come from theme, rest are standard
function buildPalette(): number[] {
  const palette = [...themeManager.theme.ansiPalette]
  // Generate 216 color cube (indices 16-231)
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        palette.push(
          (r ? r * 40 + 55 : 0) << 16 |
          (g ? g * 40 + 55 : 0) << 8 |
          (b ? b * 40 + 55 : 0)
        )
      }
    }
  }
  // Generate grayscale ramp (indices 232-255)
  for (let i = 0; i < 24; i++) {
    const v = i * 10 + 8
    palette.push(v << 16 | v << 8 | v)
  }
  return palette
}

let PALETTE = buildPalette()

// Re-export for consumers that need to rebuild palette on theme change
export function rebuildPalette(): void {
  PALETTE = buildPalette()
}

export const CELL_WIDTH = 9
export const CELL_HEIGHT = 18
const FONT_SIZE = 14
const FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Monaco, "Courier New", "Noto Sans Symbols 2", sans-serif'

type ColorMode = 'default' | 'palette' | 'rgb'

interface CellState {
  char: string
  fg: number
  bg: number
  bold: number
  italic: number
  underline: number
}

export class CellGrid {
  readonly container: Container
  private bgGraphics: Graphics
  private decoGraphics: Graphics
  private texts: Text[][] = []
  private cells: CellState[][] = []
  private prev: CellState[][] = []
  private _cols: number
  private _rows: number
  private _yOffset: number

  // Phase 2: per-row scaling
  private _rowScales: number[] = []
  private _rowYPositions: number[] = []
  private _prevRowScales: number[] = []

  constructor(cols: number, rows: number, yOffset: number) {
    this._cols = cols
    this._rows = rows
    this._yOffset = yOffset
    this.container = new Container()
    this.bgGraphics = new Graphics()
    this.decoGraphics = new Graphics()
    this.container.addChild(this.bgGraphics)
    this.buildGrid()
  }

  private buildGrid() {
    // Destroy old children except bgGraphics (re-added below)
    this.container.removeChildren()
    this.container.addChild(this.bgGraphics)
    this.texts = []
    this.cells = []
    this.prev = []

    // Initialize row scaling arrays
    this._rowScales = new Array(this._rows).fill(1.0)
    this._prevRowScales = new Array(this._rows).fill(1.0)
    this._rowYPositions = new Array(this._rows)
    for (let y = 0; y < this._rows; y++) {
      this._rowYPositions[y] = y * CELL_HEIGHT + this._yOffset
    }

    for (let y = 0; y < this._rows; y++) {
      this.texts[y] = []
      this.cells[y] = []
      this.prev[y] = []
      for (let x = 0; x < this._cols; x++) {
        this.cells[y][x] = { char: ' ', fg: themeManager.theme.foreground, bg: themeManager.theme.background, bold: 0, italic: 0, underline: 0 }
        this.prev[y][x] = { char: '', fg: 0, bg: 0, bold: 0, italic: 0, underline: 0 }

        const text = new Text({
          text: ' ',
          style: new TextStyle({
            fontFamily: FONT_FAMILY,
            fontSize: FONT_SIZE,
            fill: themeManager.theme.foreground,
          }),
        })
        text.x = x * CELL_WIDTH
        text.y = y * CELL_HEIGHT + this._yOffset
        this.texts[y][x] = text
        this.container.addChild(text)
      }
    }

    // Decoration overlay on top of text
    this.container.addChild(this.decoGraphics)
  }

  get cols() { return this._cols }
  get rows() { return this._rows }

  resize(cols: number, rows: number, yOffset: number) {
    this._cols = cols
    this._rows = rows
    this._yOffset = yOffset
    this.buildGrid()
  }

  resolveColor(color: number, mode: ColorMode, defaultColor: number): number {
    if (mode === 'rgb') return color
    if (mode === 'palette' && color >= 0 && color < PALETTE.length) return PALETTE[color]
    return defaultColor
  }

  get defaultFg(): number { return themeManager.theme.foreground }
  get defaultBg(): number { return themeManager.theme.background }

  /** Return the text content of row y as a string. */
  getRowText(y: number): string {
    if (y < 0 || y >= this._rows) return ''
    return this.cells[y].map(c => c.char).join('')
  }

  /** Return a mutable reference to the cell state at (x, y). */
  getCell(x: number, y: number): CellState | null {
    if (x < 0 || x >= this._cols || y < 0 || y >= this._rows) return null
    return this.cells[y][x]
  }

  // --- Phase 2: Row scaling ---

  setRowScale(y: number, scale: number): void {
    if (y >= 0 && y < this._rows) {
      this._rowScales[y] = scale
    }
  }

  getRowScale(y: number): number {
    if (y >= 0 && y < this._rows) {
      return this._rowScales[y]
    }
    return 1.0
  }

  resetRowScales(): void {
    this._rowScales.fill(1.0)
  }

  recomputeRowPositions(): void {
    // Compute total height with current scales
    let totalHeight = 0
    for (let y = 0; y < this._rows; y++) {
      totalHeight += CELL_HEIGHT * this._rowScales[y]
    }

    // If total exceeds viewport, apply uniform correction factor
    const viewportHeight = this._rows * CELL_HEIGHT
    if (totalHeight > viewportHeight) {
      const correction = viewportHeight / totalHeight
      for (let y = 0; y < this._rows; y++) {
        this._rowScales[y] *= correction
      }
    }

    // Compute Y positions from (possibly corrected) scales
    let yPos = this._yOffset
    for (let y = 0; y < this._rows; y++) {
      this._rowYPositions[y] = yPos
      yPos += CELL_HEIGHT * this._rowScales[y]
    }
  }

  /** Get the computed Y pixel position for a row (accounts for scaling). */
  getRowYPosition(y: number): number {
    if (y >= 0 && y < this._rows) {
      return this._rowYPositions[y]
    }
    return y * CELL_HEIGHT + this._yOffset
  }

  /** Get the scaled cell width for a row. */
  getRowCellWidth(y: number): number {
    return CELL_WIDTH * this.getRowScale(y)
  }

  /** Get the scaled cell height for a row. */
  getRowCellHeight(y: number): number {
    return CELL_HEIGHT * this.getRowScale(y)
  }

  setCell(x: number, y: number, char: string, fg: number, fgMode: ColorMode, bg: number, bgMode: ColorMode, bold: number, italic: number) {
    if (x < 0 || x >= this._cols || y < 0 || y >= this._rows) return
    const cell = this.cells[y][x]
    cell.char = char
    cell.fg = this.resolveColor(fg, fgMode, themeManager.theme.foreground)
    cell.bg = this.resolveColor(bg, bgMode, themeManager.theme.background)
    cell.bold = bold
    cell.italic = italic
    cell.underline = 0
  }

  setCellResolved(x: number, y: number, char: string, fg: number, bg: number, bold: number, italic: number) {
    if (x < 0 || x >= this._cols || y < 0 || y >= this._rows) return
    const cell = this.cells[y][x]
    cell.char = char
    cell.fg = fg
    cell.bg = bg
    cell.bold = bold
    cell.italic = italic
    cell.underline = 0
  }

  flush() {
    // Redraw all non-default backgrounds
    this.bgGraphics.clear()
    this.decoGraphics.clear()

    for (let y = 0; y < this._rows; y++) {
      const scale = this._rowScales[y]
      const prevScale = this._prevRowScales[y]
      const scaleChanged = scale !== prevScale
      const rowY = this._rowYPositions[y]
      const cellW = CELL_WIDTH * scale
      const cellH = CELL_HEIGHT * scale
      const fontSize = FONT_SIZE * scale

      this._prevRowScales[y] = scale

      for (let x = 0; x < this._cols; x++) {
        const cell = this.cells[y][x]
        const prev = this.prev[y][x]

        // Draw background for non-default bg cells
        if (cell.bg !== themeManager.theme.background) {
          this.bgGraphics.rect(
            x * cellW,
            rowY,
            cellW,
            cellH
          )
          this.bgGraphics.fill(cell.bg)
        }

        // Draw underline every frame (decoGraphics is cleared each flush)
        if (cell.underline) {
          const ulY = rowY + cellH - 2
          this.decoGraphics.moveTo(x * cellW, ulY)
          this.decoGraphics.lineTo((x + 1) * cellW, ulY)
          this.decoGraphics.stroke({ width: 1, color: cell.fg, alpha: 0.7 })
        }

        // Update text position (always, since scale may have changed)
        const text = this.texts[y][x]
        text.x = x * cellW
        text.y = rowY

        if (
          cell.char === prev.char &&
          cell.fg === prev.fg &&
          cell.bg === prev.bg &&
          cell.bold === prev.bold &&
          cell.italic === prev.italic &&
          cell.underline === prev.underline &&
          !scaleChanged
        ) continue

        text.text = cell.char || ' '

        // Create new style to ensure update
        text.style = new TextStyle({
          fontFamily: FONT_FAMILY,
          fontSize: fontSize,
          fill: cell.fg,
          fontWeight: cell.bold ? 'bold' : 'normal',
          fontStyle: cell.italic ? 'italic' : 'normal',
        })

        // Apply visual skew for italic (many monospace fonts lack true italic glyphs)
        text.skew.x = cell.italic ? -0.2 : 0

        // Copy to prev
        prev.char = cell.char
        prev.fg = cell.fg
        prev.bg = cell.bg
        prev.bold = cell.bold
        prev.italic = cell.italic
        prev.underline = cell.underline
      }
    }
  }

  /**
   * Phase 3: Draw row decorations (HR lines, code borders, H1 underlines).
   * Called by TerminalEngine after apply() and flush().
   */
  drawDecorations(getDecoration: (y: number) => RowDecoration): void {
    // Note: decoGraphics is cleared at the start of flush() — we append here
    const totalWidth = this._cols * CELL_WIDTH

    for (let y = 0; y < this._rows; y++) {
      const deco = getDecoration(y)
      if (!deco) continue

      const rowY = this._rowYPositions[y]
      const cellH = CELL_HEIGHT * this._rowScales[y]

      switch (deco.kind) {
        case 'hr-line': {
          // Horizontal rule: centered line spanning full width
          const lineY = rowY + cellH / 2
          this.decoGraphics.moveTo(0, lineY)
          this.decoGraphics.lineTo(totalWidth, lineY)
          this.decoGraphics.stroke({ width: 1, color: deco.color, alpha: 0.6 })
          break
        }
        case 'code-border': {
          // Left border: 2px accent line on left edge
          this.decoGraphics.moveTo(1, rowY)
          this.decoGraphics.lineTo(1, rowY + cellH)
          this.decoGraphics.stroke({ width: 2, color: deco.color, alpha: 0.4 })
          break
        }
        case 'h1-underline': {
          // Subtle underline beneath H1
          const lineY = rowY + cellH - 1
          this.decoGraphics.moveTo(0, lineY)
          this.decoGraphics.lineTo(totalWidth, lineY)
          this.decoGraphics.stroke({ width: 1, color: deco.color, alpha: 0.3 })
          break
        }
      }
    }
  }

  /**
   * Capture the current visible text grid for animation.
   * Returns array of characters with their screen positions.
   */
  captureVisibleContent(): { char: string; x: number; y: number; fg: number; bg: number }[] {
    const result: { char: string; x: number; y: number; fg: number; bg: number }[] = []
    for (let y = 0; y < this._rows; y++) {
      const scale = this._rowScales[y]
      const cellW = CELL_WIDTH * scale
      for (let x = 0; x < this._cols; x++) {
        const cell = this.cells[y][x]
        if (cell.char && cell.char !== ' ') {
          result.push({
            char: cell.char,
            x: x * cellW,
            y: this._rowYPositions[y],
            fg: cell.fg,
            bg: cell.bg,
          })
        }
      }
    }
    return result
  }

  get yOffset(): number {
    return this._yOffset
  }

  /**
   * Render the cell grid content to a Graphics object for screenshot capture.
   * Returns a Graphics with text drawn at the specified position.
   */
  renderToGraphics(targetX: number, targetY: number): Graphics {
    const graphics = new Graphics()

    // Draw background color for each cell
    for (let y = 0; y < this._rows; y++) {
      const scale = this._rowScales[y]
      const cellW = CELL_WIDTH * scale
      const cellH = CELL_HEIGHT * scale
      const rowY = this._rowYPositions[y] - this._yOffset  // relative to grid origin
      for (let x = 0; x < this._cols; x++) {
        const cell = this.cells[y][x]
        if (cell.bg !== themeManager.theme.background) {
          graphics.rect(targetX + x * cellW, targetY + rowY, cellW, cellH)
          graphics.fill(cell.bg)
        }
      }
    }

    // Draw text on top
    for (let y = 0; y < this._rows; y++) {
      const scale = this._rowScales[y]
      const cellW = CELL_WIDTH * scale
      const fontSize = FONT_SIZE * scale
      const rowY = this._rowYPositions[y] - this._yOffset
      for (let x = 0; x < this._cols; x++) {
        const cell = this.cells[y][x]
        if (cell.char && cell.char !== ' ') {
          const text = new Text({
            text: cell.char,
            style: new TextStyle({
              fontFamily: FONT_FAMILY,
              fontSize: fontSize,
              fill: cell.fg,
              fontWeight: cell.bold ? 'bold' : 'normal',
              fontStyle: cell.italic ? 'italic' : 'normal',
            }),
          })
          text.x = targetX + x * cellW
          text.y = targetY + rowY
          graphics.addChild(text)
        }
      }
    }

    return graphics
  }
}
