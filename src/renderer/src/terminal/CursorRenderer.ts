import { Graphics } from 'pixi.js'
import { CellGrid, CELL_WIDTH, CELL_HEIGHT } from './CellGrid'
import { themeManager } from '../themes/ThemeManager'

export class CursorRenderer {
  readonly graphics: Graphics
  private cellGrid: CellGrid
  private blinkTimer = 0
  private visible = true
  private cursorX = 0
  private cursorY = 0
  private focused = true
  private yOffset: number

  constructor(cellGrid: CellGrid, yOffset: number) {
    this.cellGrid = cellGrid
    this.yOffset = yOffset
    this.graphics = new Graphics()
  }

  setFocused(focused: boolean) {
    this.focused = focused
  }

  setYOffset(yOffset: number) {
    this.yOffset = yOffset
  }

  update(x: number, y: number, dt: number, hidden: boolean = false) {
    // Validate inputs
    if (typeof x !== 'number' || typeof y !== 'number' || typeof dt !== 'number') return
    if (isNaN(x) || isNaN(y) || isNaN(dt)) return

    this.cursorX = x
    this.cursorY = y

    // Only blink if focused - unfocused panes show static cursor
    if (this.focused) {
      // Blink every 30 frames (~500ms at 60fps)
      this.blinkTimer += dt
      if (this.blinkTimer >= 30) {
        this.blinkTimer = 0
        this.visible = !this.visible
      }
    } else {
      // Unfocused: always show cursor (no blinking)
      this.visible = true
    }

    this.graphics.clear()
    // Respect DECTCEM: don't draw cursor when application has hidden it
    if (this.visible && !hidden) {
      // Use scaled positions from CellGrid (Phase 2 row scaling)
      const cellW = this.cellGrid.getRowCellWidth(y)
      const cellH = this.cellGrid.getRowCellHeight(y)
      const px = x * cellW
      const py = this.cellGrid.getRowYPosition(y)
      if (px >= 0 && py >= 0) {
        this.graphics.rect(px, py, cellW, cellH)
        // Use green for focused, gray for unfocused
        const color = this.focused ? themeManager.theme.cursor : themeManager.theme.cursorInactive
        this.graphics.fill({ color, alpha: 0.7 })
      }
    }
  }
}
