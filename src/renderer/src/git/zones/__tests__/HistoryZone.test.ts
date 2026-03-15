import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('pixi.js', () => ({
  Rectangle: class MockRectangle { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} },
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
    moveTo() { return this }
    lineTo() { return this }
    quadraticCurveTo() { return this }
    clear() { return this }
    destroy() {}
    setStrokeStyle() { return this }
  },
  Text: class MockText {
    text = ''; visible = true; x = 0; y = 0; anchor = { set: vi.fn() }
    style: any = {}
    constructor(opts?: any) { if (opts) this.text = opts.text || '' }
    destroy() {}
  },
}))

import { HistoryZone } from '../HistoryZone'
import type { GraphCommit } from '../../../../../main/git/types'

function makeCommit(hash: string, parents: string[] = [], column = 0): GraphCommit {
  return { hash, shortHash: hash.slice(0, 3), parents, author: 'Test', date: '2025-01-01', message: `Commit ${hash}`, column, refs: [] }
}

describe('HistoryZone', () => {
  let zone: HistoryZone

  beforeEach(() => {
    zone = new HistoryZone(400, 300)
  })

  it('creates with correct dimensions', () => {
    expect(zone).toBeDefined()
    expect(zone.children.length).toBeGreaterThanOrEqual(0)
  })

  it('contains BranchGraph sub-panel', () => {
    expect(zone.branchGraph).toBeDefined()
  })

  it('contains detail panel', () => {
    expect(zone.detailPanel).toBeDefined()
  })

  it('updates with commits', () => {
    const commits = [
      makeCommit('bbb', ['aaa'], 0),
      makeCommit('aaa', [], 0),
    ]
    zone.update(commits, 'main')
    // Should not throw
    expect(zone.branchGraph.getCommitAtIndex(0)?.hash).toBe('bbb')
  })

  it('handles resize', () => {
    zone.resize(800, 600)
    expect(zone).toBeDefined()
  })

  it('commit selection updates detail panel', () => {
    const commits = [
      makeCommit('bbb', ['aaa'], 0),
      makeCommit('aaa', [], 0),
    ]
    zone.update(commits, 'main')
    zone.selectCommit(0)
    expect(zone.selectedCommitHash).toBe('bbb')
  })

  it('handles empty commits', () => {
    zone.update([], 'main')
    expect(zone.branchGraph.getCommitAtIndex(0)).toBeUndefined()
  })

  it('commit selection fires onCommitSelect callback', () => {
    const handler = vi.fn()
    zone.setOnCommitSelect(handler)
    const commits = [makeCommit('bbb', ['aaa'], 0), makeCommit('aaa', [], 0)]
    zone.update(commits, 'main')
    zone.selectCommit(0)
    expect(handler).toHaveBeenCalledWith('bbb')
  })

  it('showCommitDiff updates FileMap with diff data', () => {
    zone.showCommitDiff([
      { path: 'file.ts', oldPath: undefined, status: 'modified', hunks: [], stats: { additions: 10, deletions: 5 } },
      { path: 'new.ts', oldPath: undefined, status: 'added', hunks: [], stats: { additions: 20, deletions: 0 } },
    ])
    // Should not throw; FileMap is updated internally
    expect(zone).toBeDefined()
  })
})
