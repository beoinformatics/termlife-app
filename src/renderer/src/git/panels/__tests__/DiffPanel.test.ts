import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock PixiJS
vi.mock('pixi.js', () => ({
  Rectangle: class MockRectangle { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} },
  Container: class MockContainer {
    visible = true
    children: any[] = []
    x = 0; y = 0
    mask: any = null
    eventMode = 'auto'
    addChild(child: any) { this.children.push(child); return child }
    removeChild(child: any) { this.children = this.children.filter((c: any) => c !== child); return child }
    removeChildren() { this.children = [] }
    destroy() { this.children = [] }
    on() { return this }
    off() { return this }
    emit() { return this }
  },
  Graphics: class MockGraphics {
    visible = true
    x = 0; y = 0
    rect() { return this }
    fill() { return this }
    clear() { return this }
    destroy() {}
  },
  Text: class MockText {
    text = ''; visible = true; x = 0; y = 0
    style: any = {}
    constructor(opts?: any) { if (opts) this.text = opts.text || '' }
    destroy() {}
  },
}))

import { DiffPanel, type DiffDisplayMode } from '../DiffPanel'
import type { GitDiff, DiffHunk, DiffLine } from '../../../../../main/git/types'

function makeDiff(overrides?: Partial<GitDiff>): GitDiff {
  return {
    path: 'test.ts',
    status: 'modified',
    hunks: [],
    stats: { additions: 0, deletions: 0 },
    ...overrides,
  }
}

function makeHunk(lines: DiffLine[], overrides?: Partial<DiffHunk>): DiffHunk {
  return {
    oldStart: 1,
    oldLines: lines.length,
    newStart: 1,
    newLines: lines.length,
    header: '@@ -1,3 +1,3 @@',
    lines,
    ...overrides,
  }
}

function line(type: DiffLine['type'], content: string, old?: number, new_?: number): DiffLine {
  const l: DiffLine = { type, content }
  if (old !== undefined) l.oldLineNumber = old
  if (new_ !== undefined) l.newLineNumber = new_
  return l
}

describe('DiffPanel', () => {
  let panel: DiffPanel

  beforeEach(() => {
    panel = new DiffPanel(600, 400)
  })

  it('renders correct number of lines from DiffHunk', () => {
    const diff = makeDiff({
      hunks: [makeHunk([
        line('context', 'line1', 1, 1),
        line('deletion', 'old', 2),
        line('addition', 'new', undefined, 2),
        line('context', 'line3', 3, 3),
      ])],
    })
    panel.showDiff(diff)
    // Should have line texts for each diff line + hunk header
    const lineCount = panel.getRenderedLineCount()
    expect(lineCount).toBe(5) // 1 hunk header + 4 lines
  })

  it('handles empty diff (no hunks)', () => {
    const diff = makeDiff({ hunks: [] })
    panel.showDiff(diff)
    expect(panel.getRenderedLineCount()).toBe(0)
    expect(panel.isEmpty()).toBe(true)
  })

  it('handles null diff (clear)', () => {
    panel.clear()
    expect(panel.isEmpty()).toBe(true)
  })

  it('renders multiple hunks with headers', () => {
    const diff = makeDiff({
      hunks: [
        makeHunk(
          [line('context', 'a', 1, 1), line('deletion', 'b', 2)],
          { header: '@@ -1,2 +1,1 @@' },
        ),
        makeHunk(
          [line('context', 'x', 20, 20), line('addition', 'y', undefined, 21)],
          { header: '@@ -20,1 +20,2 @@', oldStart: 20, newStart: 20 },
        ),
      ],
    })
    panel.showDiff(diff)
    // 2 hunk headers + 2 + 2 lines = 6
    expect(panel.getRenderedLineCount()).toBe(6)
  })

  it('getLineColor returns correct colors for line types', () => {
    expect(DiffPanel.lineColor('addition')).toBe(0x22c55e)
    expect(DiffPanel.lineColor('deletion')).toBe(0xef4444)
    expect(DiffPanel.lineColor('context')).toBe(0xcccccc)
  })

  it('getLineBgColor returns correct background colors', () => {
    expect(DiffPanel.lineBgColor('addition')).toBe(0x1a2e1a)
    expect(DiffPanel.lineBgColor('deletion')).toBe(0x2e1a1a)
    expect(DiffPanel.lineBgColor('context')).toBe(0x000000)
  })

  it('displays file path in header', () => {
    const diff = makeDiff({ path: 'src/components/App.tsx' })
    panel.showDiff(diff)
    expect(panel.getHeaderText()).toContain('src/components/App.tsx')
  })

  it('displays stats in header', () => {
    const diff = makeDiff({
      stats: { additions: 5, deletions: 3 },
      hunks: [makeHunk([line('addition', 'a', undefined, 1)])],
    })
    panel.showDiff(diff)
    expect(panel.getHeaderText()).toContain('+5')
    expect(panel.getHeaderText()).toContain('-3')
  })

  it('defaults to inline mode', () => {
    expect(panel.mode).toBe('inline')
  })

  it('can switch to side-by-side mode', () => {
    panel.setMode('side-by-side')
    expect(panel.mode).toBe('side-by-side')
  })

  it('re-renders when mode changes', () => {
    const diff = makeDiff({
      hunks: [makeHunk([
        line('context', 'ctx', 1, 1),
        line('deletion', 'old', 2),
        line('addition', 'new', undefined, 2),
      ])],
    })
    panel.showDiff(diff)
    const inlineCount = panel.getRenderedLineCount()
    panel.setMode('side-by-side')
    // Side-by-side pairs deletion+addition on same row
    const sbsCount = panel.getRenderedLineCount()
    // In side-by-side, context=1 row, del+add paired=1 row, plus header=1
    // So 3 rows vs 4 in inline (header + 3 lines)
    expect(sbsCount).toBeLessThanOrEqual(inlineCount)
  })

  it('resize updates dimensions', () => {
    panel.resize(800, 500)
    // Should not throw
    expect(panel).toBeDefined()
  })

  describe('side-by-side mode', () => {
    beforeEach(() => {
      panel.setMode('side-by-side')
    })

    it('pairs deletions and additions on same row', () => {
      const diff = makeDiff({
        hunks: [makeHunk([
          line('deletion', 'old line', 1),
          line('addition', 'new line', undefined, 1),
        ])],
      })
      panel.showDiff(diff)
      const rows = panel.getSideBySideRows()
      // 1 hunk header + 1 paired row
      expect(rows).toHaveLength(1)
      expect(rows[0].left?.content).toBe('old line')
      expect(rows[0].right?.content).toBe('new line')
    })

    it('shows blank on left for pure additions', () => {
      const diff = makeDiff({
        hunks: [makeHunk([
          line('addition', 'added line', undefined, 1),
        ])],
      })
      panel.showDiff(diff)
      const rows = panel.getSideBySideRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].left).toBeNull()
      expect(rows[0].right?.content).toBe('added line')
    })

    it('shows blank on right for pure deletions', () => {
      const diff = makeDiff({
        hunks: [makeHunk([
          line('deletion', 'removed line', 1),
        ])],
      })
      panel.showDiff(diff)
      const rows = panel.getSideBySideRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].left?.content).toBe('removed line')
      expect(rows[0].right).toBeNull()
    })

    it('context lines appear on both sides', () => {
      const diff = makeDiff({
        hunks: [makeHunk([
          line('context', 'same line', 5, 5),
        ])],
      })
      panel.showDiff(diff)
      const rows = panel.getSideBySideRows()
      expect(rows).toHaveLength(1)
      expect(rows[0].left?.content).toBe('same line')
      expect(rows[0].right?.content).toBe('same line')
    })

    it('handles uneven deletion/addition counts', () => {
      const diff = makeDiff({
        hunks: [makeHunk([
          line('deletion', 'del1', 1),
          line('deletion', 'del2', 2),
          line('addition', 'add1', undefined, 1),
        ])],
      })
      panel.showDiff(diff)
      const rows = panel.getSideBySideRows()
      // del1 paired with add1, del2 unpaired
      expect(rows).toHaveLength(2)
      expect(rows[0].left?.content).toBe('del1')
      expect(rows[0].right?.content).toBe('add1')
      expect(rows[1].left?.content).toBe('del2')
      expect(rows[1].right).toBeNull()
    })
  })
})
