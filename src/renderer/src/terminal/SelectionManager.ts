import { Container, Graphics, Rectangle, FederatedPointerEvent } from 'pixi.js'
import { CellGrid, CELL_WIDTH, CELL_HEIGHT } from './CellGrid'
import { themeManager } from '../themes/ThemeManager'

export interface SelectionRange {
  startX: number
  startY: number
  endX: number
  endY: number
}

export class SelectionManager {
  readonly container: Container
  private overlay: Graphics
  private _cols: number
  private _rows: number
  private _yOffset: number
  private _cellGrid: CellGrid | null = null
  private isSelecting = false
  private hasDragged = false
  private selection: SelectionRange | null = null
  private dragStart: { x: number; y: number } | null = null
  private cellText: string[][] = []
  private autoScrollTimer: ReturnType<typeof setInterval> | null = null
  private autoScrollDirection: number = 0

  onSelectionChange?: (selection: SelectionRange | null, text: string) => void
  onScrollRequest?: (lines: number) => void

  constructor(cols: number, rows: number, yOffset: number) {
    this._cols = cols
    this._rows = rows
    this._yOffset = yOffset
    this.container = new Container()
    this.container.eventMode = 'static'
    this.container.interactiveChildren = true
    // Hit area covers the entire terminal area (relative to container, not global)
    this.container.hitArea = new Rectangle(0, 0, cols * CELL_WIDTH, rows * CELL_HEIGHT)

    this.overlay = new Graphics()
    this.overlay.eventMode = 'none'
    this.container.addChild(this.overlay)

    this.initCellText()
    this.setupMouseHandlers()
  }

  private initCellText() {
    this.cellText = []
    for (let y = 0; y < this._rows; y++) {
      this.cellText[y] = []
      for (let x = 0; x < this._cols; x++) {
        this.cellText[y][x] = ' '
      }
    }
  }

  setCellGrid(cellGrid: CellGrid): void {
    this._cellGrid = cellGrid
  }

  /** Get cell width for row y, accounting for scaling. */
  private cellW(y: number): number {
    return this._cellGrid ? this._cellGrid.getRowCellWidth(y) : CELL_WIDTH
  }

  /** Get cell height for row y, accounting for scaling. */
  private cellH(y: number): number {
    return this._cellGrid ? this._cellGrid.getRowCellHeight(y) : CELL_HEIGHT
  }

  /** Get Y pixel position for row y, accounting for scaling. */
  private rowY(y: number): number {
    return this._cellGrid ? this._cellGrid.getRowYPosition(y) : (y * CELL_HEIGHT + this._yOffset)
  }

  resize(cols: number, rows: number, yOffset: number) {
    this._cols = cols
    this._rows = rows
    this._yOffset = yOffset
    this.container.hitArea = new Rectangle(0, 0, cols * CELL_WIDTH, rows * CELL_HEIGHT)
    this.initCellText()
    this.clearSelection()
  }

  setCellText(x: number, y: number, char: string) {
    if (x >= 0 && x < this._cols && y >= 0 && y < this._rows) {
      this.cellText[y][x] = char || ' '
    }
  }

  private setupMouseHandlers() {
    const down = this.onPointerDown.bind(this)
    const move = this.onPointerMove.bind(this)
    const up = this.onPointerUp.bind(this)
    this.container.on('pointerdown', down)
    this.container.on('globalpointermove', move)
    this.container.on('pointerup', up)
    this.container.on('pointerupoutside', up)
  }

  private getCellFromPoint(x: number, y: number, clamp = false): { x: number; y: number } | null {
    const localX = x
    const localY = y

    // Find row by scanning Y positions (handles variable row heights)
    let row = -1
    if (this._cellGrid) {
      for (let r = 0; r < this._rows; r++) {
        const rY = this._cellGrid.getRowYPosition(r)
        const rH = this._cellGrid.getRowCellHeight(r)
        if (localY >= rY && localY < rY + rH) {
          row = r
          break
        }
      }
      if (row === -1) {
        // Above or below all rows
        if (localY < this._cellGrid.getRowYPosition(0)) row = 0
        else row = this._rows - 1
        if (!clamp) return null
      }
      const cellW = this._cellGrid.getRowCellWidth(row)
      let col = Math.floor(localX / cellW)
      if (clamp) {
        col = Math.max(0, Math.min(col, this._cols - 1))
        row = Math.max(0, Math.min(row, this._rows - 1))
        return { x: col, y: row }
      }
      if (col >= 0 && col < this._cols) return { x: col, y: row }
      return null
    }

    // Fallback: uniform cell sizes
    const unscaledY = localY - this._yOffset
    let col = Math.floor(localX / CELL_WIDTH)
    row = Math.floor(unscaledY / CELL_HEIGHT)

    if (clamp) {
      col = Math.max(0, Math.min(col, this._cols - 1))
      row = Math.max(0, Math.min(row, this._rows - 1))
      return { x: col, y: row }
    }

    if (col >= 0 && col < this._cols && row >= 0 && row < this._rows) {
      return { x: col, y: row }
    }
    return null
  }

  private onPointerDown(e: FederatedPointerEvent) {
    const pos = e.getLocalPosition(this.container)

    const cell = this.getCellFromPoint(pos.x, pos.y)
    if (!cell) return

    this.isSelecting = true
    this.hasDragged = false
    this.dragStart = cell
    // Don't render selection yet — wait until the user actually drags
    this.selection = null
    this.overlay.clear()
  }

  private onPointerMove(e: FederatedPointerEvent) {
    if (!this.isSelecting || !this.dragStart) return

    const pos = e.getLocalPosition(this.container)
    const localY = pos.y - this._yOffset

    // Check if cursor is above or below the terminal viewport for auto-scroll
    const viewportHeight = this._rows * CELL_HEIGHT
    if (localY < 0) {
      this.startAutoScroll(-1)
    } else if (localY > viewportHeight) {
      this.startAutoScroll(1)
    } else {
      this.stopAutoScroll()
    }

    const cell = this.getCellFromPoint(pos.x, pos.y, true)
    if (!cell) return

    // Only start showing selection once the user has moved to a different cell
    if (!this.hasDragged) {
      if (cell.x === this.dragStart.x && cell.y === this.dragStart.y) return
      this.hasDragged = true
    }

    // Normalize selection (start is always top-left, end is bottom-right)
    const startX = Math.min(this.dragStart.x, cell.x)
    const startY = Math.min(this.dragStart.y, cell.y)
    const endX = Math.max(this.dragStart.x, cell.x)
    const endY = Math.max(this.dragStart.y, cell.y)

    this.selection = { startX, startY, endX, endY }
    this.renderSelection()
  }

  private onPointerUp(_e: FederatedPointerEvent) {
    if (!this.isSelecting) return
    this.isSelecting = false
    this.stopAutoScroll()

    // If the user didn't drag, treat it as a click that clears selection
    if (!this.hasDragged) {
      this.clearSelection()
      return
    }

    const selectedText = this.getSelectedText()
    if (this.onSelectionChange && this.selection) {
      this.onSelectionChange(this.selection, selectedText)
    }
  }

  private renderSelection() {
    this.overlay.clear()

    if (!this.selection) return

    const { startX, startY, endX, endY } = this.selection

    // Draw selection highlight for each row (using scaled positions)
    for (let y = startY; y <= endY; y++) {
      const rowStartX = y === startY ? startX : 0
      const rowEndX = y === endY ? endX : this._cols - 1

      const cw = this.cellW(y)
      const ch = this.cellH(y)
      const x = rowStartX * cw
      const width = (rowEndX - rowStartX + 1) * cw
      const yPos = this.rowY(y)

      this.overlay.rect(x, yPos, width, ch)
    }

    this.overlay.fill({ color: themeManager.theme.selectionBackground, alpha: themeManager.theme.selectionAlpha })
  }

  getSelectedText(): string {
    if (!this.selection) return ''

    const { startX, startY, endX, endY } = this.selection
    const lines: string[] = []

    for (let y = startY; y <= endY; y++) {
      const rowStartX = y === startY ? startX : 0
      const rowEndX = y === endY ? endX : this._cols - 1

      let line = ''
      for (let x = rowStartX; x <= rowEndX; x++) {
        line += this.cellText[y]?.[x] || ' '
      }
      // Trim trailing spaces but preserve internal spaces
      lines.push(line.replace(/\s+$/, ''))
    }

    return lines.join('\n')
  }

  clearSelection() {
    this.selection = null
    this.dragStart = null
    this.isSelecting = false
    this.overlay.clear()
    if (this.onSelectionChange) {
      this.onSelectionChange(null, '')
    }
  }

  hasSelection(): boolean {
    return this.selection !== null
  }

  async copyToClipboard(): Promise<boolean> {
    const text = this.getSelectedText()
    if (!text) return false

    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
      return false
    }
  }

  async pasteFromClipboard(): Promise<string | null> {
    try {
      const text = await navigator.clipboard.readText()
      return text.replace(/\r?\n/g, '\r') // Convert newlines to CR for terminal
    } catch (err) {
      console.error('Failed to read from clipboard:', err)
      return null
    }
  }

  // Double-click to select word
  selectWordAt(x: number, y: number) {
    if (x < 0 || x >= this._cols || y < 0 || y >= this._rows) return

    // Find word boundaries (non-whitespace)
    const line = this.cellText[y]
    if (!line) return

    // Expand left
    let startX = x
    while (startX > 0 && line[startX - 1].trim()) {
      startX--
    }

    // Expand right
    let endX = x
    while (endX < this._cols - 1 && line[endX + 1].trim()) {
      endX++
    }

    this.selection = { startX, startY: y, endX, endY: y }
    this.renderSelection()

    const text = this.getSelectedText()
    if (this.onSelectionChange) {
      this.onSelectionChange(this.selection, text)
    }
  }

  // Triple-click to select line
  selectLine(y: number) {
    if (y < 0 || y >= this._rows) return

    this.selection = { startX: 0, startY: y, endX: this._cols - 1, endY: y }
    this.renderSelection()

    const text = this.getSelectedText()
    if (this.onSelectionChange) {
      this.onSelectionChange(this.selection, text)
    }
  }

  private startAutoScroll(direction: number) {
    if (this.autoScrollTimer && this.autoScrollDirection === direction) return
    this.stopAutoScroll()
    this.autoScrollDirection = direction
    this.autoScrollTimer = setInterval(() => {
      if (this.onScrollRequest) {
        // direction: -1 = scroll up (toward older content), 1 = scroll down (toward newer)
        this.onScrollRequest(this.autoScrollDirection * -2)
      }
    }, 80)
  }

  private stopAutoScroll() {
    if (this.autoScrollTimer) {
      clearInterval(this.autoScrollTimer)
      this.autoScrollTimer = null
      this.autoScrollDirection = 0
    }
  }

  getSelectionBounds(): Rectangle | null {
    if (!this.selection) return null

    const { startX, startY, endX, endY } = this.selection
    const topY = this.rowY(startY)
    let totalH = 0
    for (let y = startY; y <= endY; y++) {
      totalH += this.cellH(y)
    }
    return new Rectangle(
      startX * this.cellW(startY),
      topY,
      (endX - startX + 1) * this.cellW(startY),
      totalH
    )
  }
}
