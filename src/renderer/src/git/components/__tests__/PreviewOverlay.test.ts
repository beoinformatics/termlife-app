import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreviewOverlay, PreviewAction } from '../PreviewOverlay'
import type { GitFileStatus } from '../../../../../main/git/types'

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockContainer {
    children: any[] = []
    visible = true
    x = 0
    y = 0
    interactive = false
    addChild(child: any) { this.children.push(child); return child }
    removeChild(child: any) {
      const idx = this.children.indexOf(child)
      if (idx >= 0) this.children.splice(idx, 1)
    }
    removeChildren() { this.children = [] }
    destroy() { this.children = [] }
    on(_event: string, _fn: Function) { return this }
    emit(_event: string, ..._args: any[]) { return true }
  }
  class MockGraphics extends MockContainer {
    clear() { return this }
    rect() { return this }
    fill() { return this }
    circle() { return this }
    stroke() { return this }
    roundRect() { return this }
  }
  class MockText extends MockContainer {
    text = ''
    style: any = {}
    constructor(opts?: any) {
      super()
      if (opts) { this.text = opts.text ?? ''; this.style = opts.style ?? {} }
    }
  }
  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
  }
})

const mockFiles: GitFileStatus[] = [
  { path: 'src/app.ts', index: 'modified', workingTree: 'unmodified' },
  { path: 'src/utils.ts', index: 'added', workingTree: 'unmodified' },
  { path: 'src/conflict.ts', index: 'conflicted', workingTree: 'conflicted' },
]

describe('PreviewOverlay', () => {
  let overlay: PreviewOverlay

  beforeEach(() => {
    overlay = new PreviewOverlay(800, 600)
  })

  it('shows file change list for merge preview', () => {
    const action: PreviewAction = {
      type: 'merge',
      label: 'Merge feature into main',
      files: mockFiles,
    }
    overlay.show(action)
    expect(overlay.visible).toBe(true)
    expect(overlay.fileCount).toBe(3)
  })

  it('highlights conflicting files in orange', () => {
    const action: PreviewAction = {
      type: 'merge',
      label: 'Merge feature into main',
      files: mockFiles,
    }
    overlay.show(action)
    const conflictColors = overlay.getFileColors()
    // conflict.ts should be orange (0xf97316)
    expect(conflictColors['src/conflict.ts']).toBe(0xf97316)
  })

  it('"Proceed" button triggers action', () => {
    const onProceed = vi.fn()
    const onCancel = vi.fn()
    overlay.setHandlers(onProceed, onCancel)

    const action: PreviewAction = {
      type: 'merge',
      label: 'Merge feature',
      files: mockFiles,
    }
    overlay.show(action)
    overlay.triggerProceed()
    expect(onProceed).toHaveBeenCalled()
  })

  it('"Cancel" button dismisses overlay', () => {
    const onProceed = vi.fn()
    const onCancel = vi.fn()
    overlay.setHandlers(onProceed, onCancel)

    const action: PreviewAction = {
      type: 'merge',
      label: 'Merge feature',
      files: mockFiles,
    }
    overlay.show(action)
    overlay.triggerCancel()
    expect(onCancel).toHaveBeenCalled()
    expect(overlay.visible).toBe(false)
  })

  it('overlay blocks interaction with underlying view', () => {
    const action: PreviewAction = {
      type: 'checkout',
      label: 'Checkout branch',
      files: [],
    }
    overlay.show(action)
    // The overlay container should be interactive (to block clicks)
    expect(overlay.isBlocking).toBe(true)
  })

  it('dismiss hides overlay', () => {
    overlay.show({
      type: 'merge',
      label: 'Merge',
      files: mockFiles,
    })
    expect(overlay.visible).toBe(true)
    overlay.dismiss()
    expect(overlay.visible).toBe(false)
  })

  it('resize updates dimensions', () => {
    overlay.resize(1024, 768)
    expect(overlay.width).toBe(1024)
    expect(overlay.height).toBe(768)
  })
})
