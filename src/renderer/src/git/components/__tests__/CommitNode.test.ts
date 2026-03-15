import { describe, it, expect, vi } from 'vitest'
import { commitNodeColor, commitNodeSize, friendlyTime } from '../../components/CommitNode'

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
    circle() { return this }
    stroke() { return this }
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

describe('commitNodeColor', () => {
  it('produces deterministic color from author string', () => {
    const c1 = commitNodeColor('alice@example.com')
    const c2 = commitNodeColor('alice@example.com')
    expect(c1).toBe(c2)
  })

  it('produces different colors for different authors', () => {
    const c1 = commitNodeColor('alice@example.com')
    const c2 = commitNodeColor('bob@example.com')
    expect(c1).not.toBe(c2)
  })

  it('returns a valid hex color number', () => {
    const color = commitNodeColor('test@test.com')
    expect(color).toBeGreaterThan(0)
    expect(color).toBeLessThanOrEqual(0xffffff)
  })
})

describe('commitNodeSize', () => {
  it('returns 8 for commit without refs', () => {
    expect(commitNodeSize([])).toBe(8)
  })

  it('returns 12 for commit with refs', () => {
    expect(commitNodeSize(['HEAD -> main'])).toBe(12)
  })

  it('returns 12 for commit with tag', () => {
    expect(commitNodeSize(['tag: v1.0'])).toBe(12)
  })
})

describe('friendlyTime', () => {
  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString()
    expect(friendlyTime(now)).toBe('just now')
  })

  it('returns minutes ago', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(friendlyTime(tenMinAgo)).toBe('10m ago')
  })

  it('returns hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    expect(friendlyTime(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    expect(friendlyTime(twoDaysAgo)).toBe('2d ago')
  })

  it('returns weeks ago', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    expect(friendlyTime(twoWeeksAgo)).toBe('2w ago')
  })

  it('returns months ago for old dates', () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    expect(friendlyTime(threeMonthsAgo)).toBe('3mo ago')
  })
})
