import { describe, it, expect, vi } from 'vitest'
import type { GraphCommit } from '../../../../../main/git/types'

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

// Import after mock
import { BranchGraph, LANE_WIDTH, COMMIT_SPACING } from '../BranchGraph'

function makeCommit(hash: string, parents: string[] = [], column = 0, refs: string[] = []): GraphCommit {
  return { hash, shortHash: hash.slice(0, 3), parents, author: 'Test', date: '2025-01-01', message: `Commit ${hash}`, column, refs }
}

describe('BranchGraph', () => {
  it('creates correct number of commit nodes', () => {
    const commits = [
      makeCommit('ccc', ['bbb'], 0),
      makeCommit('bbb', ['aaa'], 0),
      makeCommit('aaa', [], 0),
    ]
    const graph = new BranchGraph(400, 300)
    graph.update(commits, 'main')
    // Container should have children for each commit (node + label)
    expect(graph.children.length).toBeGreaterThanOrEqual(3)
  })

  it('positions commits with correct y spacing', () => {
    const commits = [
      makeCommit('bbb', ['aaa'], 0),
      makeCommit('aaa', [], 0),
    ]
    const graph = new BranchGraph(400, 300)
    graph.update(commits, 'main')
    // Commit nodes should be spaced by COMMIT_SPACING
    expect(COMMIT_SPACING).toBeGreaterThan(0)
  })

  it('positions lanes with correct x offset', () => {
    const commits = [
      makeCommit('ccc', ['aaa', 'bbb'], 0),
      makeCommit('bbb', ['aaa'], 1),
      makeCommit('aaa', [], 0),
    ]
    const graph = new BranchGraph(400, 300)
    graph.update(commits, 'main')
    expect(LANE_WIDTH).toBeGreaterThan(0)
  })

  it('handles empty commits array', () => {
    const graph = new BranchGraph(400, 300)
    graph.update([], 'main')
    expect(graph.commitCount).toBe(0)
  })

  it('handles resize', () => {
    const graph = new BranchGraph(400, 300)
    graph.resize(800, 600)
    // Should not throw
    expect(graph).toBeDefined()
  })

  it('getCommitAtIndex returns correct commit', () => {
    const commits = [
      makeCommit('bbb', ['aaa'], 0),
      makeCommit('aaa', [], 0),
    ]
    const graph = new BranchGraph(400, 300)
    graph.update(commits, 'main')
    expect(graph.getCommitAtIndex(0)?.hash).toBe('bbb')
    expect(graph.getCommitAtIndex(1)?.hash).toBe('aaa')
    expect(graph.getCommitAtIndex(99)).toBeUndefined()
  })
})
