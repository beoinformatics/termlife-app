import { describe, it, expect, beforeEach } from 'vitest'

/**
 * Phase 2a: CellGrid Row Scaling — Pure logic tests using a mock ScalableGrid.
 *
 * These tests verify the scaling math without PixiJS dependencies.
 * The actual CellGrid integration is tested via MarkdownStyler.apply().
 */

const CELL_HEIGHT = 18  // matches CellGrid constant

/**
 * Minimal ScalableGrid implementation for testing scaling logic.
 */
class MockScalableGrid {
  readonly cols: number
  readonly rows: number
  private _rowScales: number[]
  private _rowYPositions: number[]
  private _yOffset: number

  constructor(cols: number, rows: number, yOffset = 0) {
    this.cols = cols
    this.rows = rows
    this._yOffset = yOffset
    this._rowScales = new Array(rows).fill(1.0)
    this._rowYPositions = new Array(rows).fill(0)
    this.recomputeRowPositions()
  }

  setRowScale(y: number, scale: number): void {
    if (y >= 0 && y < this.rows) {
      this._rowScales[y] = scale
    }
  }

  getRowScale(y: number): number {
    if (y >= 0 && y < this.rows) {
      return this._rowScales[y]
    }
    return 1.0
  }

  resetRowScales(): void {
    this._rowScales.fill(1.0)
  }

  recomputeRowPositions(): void {
    let yPos = this._yOffset
    for (let y = 0; y < this.rows; y++) {
      this._rowYPositions[y] = yPos
      yPos += CELL_HEIGHT * this._rowScales[y]
    }
  }

  getRowYPosition(y: number): number {
    return this._rowYPositions[y]
  }

  get totalHeight(): number {
    let h = 0
    for (let y = 0; y < this.rows; y++) {
      h += CELL_HEIGHT * this._rowScales[y]
    }
    return h
  }
}

// ---------------------------------------------------------------------------
// Phase 2a: Row scale storage and retrieval
// ---------------------------------------------------------------------------

describe('CellGrid row scaling — storage', () => {
  let grid: MockScalableGrid

  beforeEach(() => {
    grid = new MockScalableGrid(80, 24)
  })

  it('default scale for all rows is 1.0', () => {
    for (let y = 0; y < 24; y++) {
      expect(grid.getRowScale(y)).toBe(1.0)
    }
  })

  it('setRowScale stores scale, getRowScale retrieves it', () => {
    grid.setRowScale(0, 1.6)
    expect(grid.getRowScale(0)).toBe(1.6)
  })

  it('setRowScale on multiple rows stores independently', () => {
    grid.setRowScale(0, 1.6)
    grid.setRowScale(1, 1.35)
    grid.setRowScale(5, 0.85)
    expect(grid.getRowScale(0)).toBe(1.6)
    expect(grid.getRowScale(1)).toBe(1.35)
    expect(grid.getRowScale(5)).toBe(0.85)
    expect(grid.getRowScale(2)).toBe(1.0)  // untouched
  })

  it('resetRowScales sets all rows back to 1.0', () => {
    grid.setRowScale(0, 1.6)
    grid.setRowScale(3, 0.85)
    grid.resetRowScales()
    for (let y = 0; y < 24; y++) {
      expect(grid.getRowScale(y)).toBe(1.0)
    }
  })

  it('out-of-bounds getRowScale returns 1.0', () => {
    expect(grid.getRowScale(-1)).toBe(1.0)
    expect(grid.getRowScale(100)).toBe(1.0)
  })

  it('out-of-bounds setRowScale is a no-op', () => {
    grid.setRowScale(-1, 2.0)  // should not throw
    grid.setRowScale(100, 2.0) // should not throw
    // All rows still 1.0
    for (let y = 0; y < 24; y++) {
      expect(grid.getRowScale(y)).toBe(1.0)
    }
  })
})

// ---------------------------------------------------------------------------
// Phase 2a: Row Y position computation
// ---------------------------------------------------------------------------

describe('CellGrid row scaling — Y positions', () => {
  it('uniform 1.0 scales produce same positions as y * CELL_HEIGHT', () => {
    const grid = new MockScalableGrid(80, 5)
    grid.recomputeRowPositions()

    for (let y = 0; y < 5; y++) {
      expect(grid.getRowYPosition(y)).toBe(y * CELL_HEIGHT)
    }
  })

  it('uniform 1.0 scales with yOffset produce y * CELL_HEIGHT + yOffset', () => {
    const yOffset = 30
    const grid = new MockScalableGrid(80, 5, yOffset)
    grid.recomputeRowPositions()

    for (let y = 0; y < 5; y++) {
      expect(grid.getRowYPosition(y)).toBe(y * CELL_HEIGHT + yOffset)
    }
  })

  it('row 0 at 1.6× shifts row 1 down by CELL_HEIGHT * 1.6', () => {
    const grid = new MockScalableGrid(80, 5)
    grid.setRowScale(0, 1.6)
    grid.recomputeRowPositions()

    expect(grid.getRowYPosition(0)).toBe(0)
    expect(grid.getRowYPosition(1)).toBeCloseTo(CELL_HEIGHT * 1.6)
    // Row 2 = row1_y + CELL_HEIGHT * 1.0
    expect(grid.getRowYPosition(2)).toBeCloseTo(CELL_HEIGHT * 1.6 + CELL_HEIGHT)
  })

  it('mixed scales produce correct cumulative Y positions', () => {
    const grid = new MockScalableGrid(80, 5)
    grid.setRowScale(0, 1.6)   // h1
    grid.setRowScale(1, 1.0)   // normal
    grid.setRowScale(2, 0.85)  // code
    grid.setRowScale(3, 0.85)  // code
    grid.setRowScale(4, 1.0)   // normal
    grid.recomputeRowPositions()

    let expected = 0
    expect(grid.getRowYPosition(0)).toBeCloseTo(expected)
    expected += CELL_HEIGHT * 1.6
    expect(grid.getRowYPosition(1)).toBeCloseTo(expected)
    expected += CELL_HEIGHT * 1.0
    expect(grid.getRowYPosition(2)).toBeCloseTo(expected)
    expected += CELL_HEIGHT * 0.85
    expect(grid.getRowYPosition(3)).toBeCloseTo(expected)
    expected += CELL_HEIGHT * 0.85
    expect(grid.getRowYPosition(4)).toBeCloseTo(expected)
  })

  it('resetRowScales + recompute restores uniform positions', () => {
    const grid = new MockScalableGrid(80, 5)
    grid.setRowScale(0, 1.6)
    grid.setRowScale(2, 0.85)
    grid.recomputeRowPositions()

    // Positions are non-uniform
    expect(grid.getRowYPosition(1)).not.toBe(CELL_HEIGHT)

    // Reset
    grid.resetRowScales()
    grid.recomputeRowPositions()

    for (let y = 0; y < 5; y++) {
      expect(grid.getRowYPosition(y)).toBe(y * CELL_HEIGHT)
    }
  })
})
