import { describe, it, expect, vi } from 'vitest'
import { computeTreemap, type TreemapRect } from '../FileMap'

vi.mock('pixi.js', () => ({
  Container: class MockContainer {
    visible = true; children: any[] = []; x = 0; y = 0
    eventMode = 'auto'; cursor = 'default'
    addChild(child: any) { this.children.push(child); return child }
    removeChildren() { this.children = [] }
    on() { return this }
    off() { return this }
    emit() { return this }
  },
  Graphics: class MockGraphics {
    visible = true; x = 0; y = 0
    rect() { return this }
    fill() { return this }
    clear() { return this }
    destroy() {}
  },
  Text: class MockText {
    text = ''; visible = true; x = 0; y = 0; anchor = { set: vi.fn() }
    style: any = {}
    constructor(opts?: any) { if (opts) this.text = opts.text || '' }
    destroy() {}
  },
}))

describe('computeTreemap', () => {
  it('returns empty array for empty input', () => {
    expect(computeTreemap([], 400, 300)).toEqual([])
  })

  it('single file fills entire area', () => {
    const files = [{ path: 'file.ts', weight: 10, color: 0x22c55e }]
    const rects = computeTreemap(files, 400, 300)
    expect(rects).toHaveLength(1)
    expect(rects[0].x).toBe(0)
    expect(rects[0].y).toBe(0)
    expect(rects[0].w).toBe(400)
    expect(rects[0].h).toBe(300)
  })

  it('larger weight produces larger rectangle', () => {
    const files = [
      { path: 'big.ts', weight: 30, color: 0x22c55e },
      { path: 'small.ts', weight: 10, color: 0xef4444 },
    ]
    const rects = computeTreemap(files, 400, 300)
    expect(rects).toHaveLength(2)
    const bigArea = rects.find(r => r.path === 'big.ts')!
    const smallArea = rects.find(r => r.path === 'small.ts')!
    expect(bigArea.w * bigArea.h).toBeGreaterThan(smallArea.w * smallArea.h)
  })

  it('all rectangles fit within bounds', () => {
    const files = [
      { path: 'a.ts', weight: 10, color: 0x22c55e },
      { path: 'b.ts', weight: 20, color: 0xef4444 },
      { path: 'c.ts', weight: 15, color: 0xeab308 },
      { path: 'd.ts', weight: 5, color: 0x3b82f6 },
    ]
    const rects = computeTreemap(files, 400, 300)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w).toBeLessThanOrEqual(400 + 1) // allow rounding
      expect(r.y + r.h).toBeLessThanOrEqual(300 + 1)
    }
  })

  it('preserves path and color in output', () => {
    const files = [{ path: 'test.ts', weight: 5, color: 0xff0000 }]
    const rects = computeTreemap(files, 200, 100)
    expect(rects[0].path).toBe('test.ts')
    expect(rects[0].color).toBe(0xff0000)
  })
})
