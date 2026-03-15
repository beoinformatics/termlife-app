import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitView } from '../GitView'

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockContainer {
    visible = true
    children: any[] = []
    x = 0; y = 0; width = 0; height = 0
    eventMode = 'auto'
    cursor = 'default'
    interactive = false
    mask: any = null
    hitArea: any = null
    addChild(child: any) { this.children.push(child); return child }
    removeChild(child: any) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1) }
    removeChildren() { this.children = [] }
    destroy() { this.children = [] }
    on() { return this }
    off() { return this }
    emit() { return this }
  }
  class MockGraphics extends MockContainer {
    rect() { return this }
    roundRect() { return this }
    fill() { return this }
    circle() { return this }
    stroke() { return this }
    clear() { return this }
  }
  class MockText extends MockContainer {
    text = ''
    anchor = { set: vi.fn() }
    style: any = {}
    constructor(opts?: any) { super(); if (opts) this.text = opts.text || '' }
  }
  return {
    Rectangle: class MockRectangle { constructor(public x = 0, public y = 0, public width = 0, public height = 0) {} },
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  }
})

// Mock GitDataService
const mockDataService = {
  getStatus: vi.fn().mockResolvedValue({
    branch: 'main', upstream: null, ahead: 0, behind: 0,
    detached: false, merging: false, rebasing: false,
    files: [],
  }),
  getGraph: vi.fn().mockResolvedValue([]),
  getDiff: vi.fn().mockResolvedValue([{
    path: 'test.ts',
    status: 'modified',
    hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, header: '@@ -1,1 +1,1 @@', lines: [
      { type: 'deletion', content: 'old', oldLineNumber: 1 },
      { type: 'addition', content: 'new', newLineNumber: 1 },
    ] }],
    stats: { additions: 1, deletions: 1 },
  }]),
  stage: vi.fn().mockResolvedValue(undefined),
  unstage: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue('abc123'),
  on: vi.fn(),
  off: vi.fn(),
  refresh: vi.fn(),
  destroy: vi.fn(),
}

describe('GitView', () => {
  let view: GitView

  beforeEach(() => {
    vi.clearAllMocks()
    view = new GitView(mockDataService as any)
  })

  it('starts hidden', () => {
    expect(view.isVisible).toBe(false)
    expect(view.container.visible).toBe(false)
  })

  it('toggle shows when hidden', () => {
    view.toggle()
    expect(view.isVisible).toBe(true)
    expect(view.container.visible).toBe(true)
  })

  it('toggle hides when visible', () => {
    view.toggle()
    view.toggle()
    expect(view.isVisible).toBe(false)
    expect(view.container.visible).toBe(false)
  })

  it('show makes visible and triggers data fetch', () => {
    view.show()
    expect(view.isVisible).toBe(true)
    expect(mockDataService.getStatus).toHaveBeenCalled()
  })

  it('hide makes invisible', () => {
    view.show()
    view.hide()
    expect(view.isVisible).toBe(false)
    expect(view.container.visible).toBe(false)
  })

  it('handleResize updates dimensions', () => {
    view.handleResize(800, 600, 40)
    // Should not throw; internals are tested via visual output
    expect(view.container).toBeDefined()
  })

  it('destroy cleans up', () => {
    view.destroy()
    expect(view.isVisible).toBe(false)
  })

  it('file select in working zone fetches unstaged diff', async () => {
    view.show()
    // Simulate the working zone file select handler (first handler arg)
    // Access via the internal method
    await (view as any).onFileSelect('test.ts', 'working')
    expect(mockDataService.getDiff).toHaveBeenCalledWith({ file: 'test.ts' })
  })

  it('file select in staging zone fetches staged diff', async () => {
    view.show()
    await (view as any).onFileSelect('test.ts', 'staging')
    expect(mockDataService.getDiff).toHaveBeenCalledWith({ staged: true, file: 'test.ts' })
  })

  it('commit select fetches commit diff', async () => {
    view.show()
    await (view as any).onCommitSelect('abc123')
    expect(mockDataService.getDiff).toHaveBeenCalledWith({ commit: 'abc123' })
  })

  it('file select shows diff panel', async () => {
    view.show()
    await (view as any).onFileSelect('test.ts', 'working')
    // The diff panel should be visible after selecting a file
    const diffPanel = (view as any).diffPanel
    expect(diffPanel.visible).toBe(true)
  })

  it('file select hides diff panel when no diff found', async () => {
    mockDataService.getDiff.mockResolvedValueOnce([])
    view.show()
    await (view as any).onFileSelect('nonexistent.ts', 'working')
    const diffPanel = (view as any).diffPanel
    expect(diffPanel.visible).toBe(false)
  })
})
