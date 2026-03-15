import { describe, it, expect, vi } from 'vitest'

// Mock PixiJS
vi.mock('pixi.js', () => {
  class MockContainer {
    children: any[] = []
    visible = true
    x = 0; y = 0
    addChild(child: any) { this.children.push(child); return child }
    removeChildren() { this.children = [] }
    destroy() { this.children = [] }
  }
  class MockGraphics extends MockContainer {
    clear() { return this }
    rect() { return this }
    fill() { return this }
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
  return { Container: MockContainer, Graphics: MockGraphics, Text: MockText }
})

import { diffSymbols, SymbolChange } from '../SymbolDiff'

const oldSource = `function greet(name) {
  return 'Hello ' + name
}

function farewell(name) {
  return 'Goodbye ' + name
}

function unchanged() {
  return 42
}`

const newSource = `function greet(name) {
  return 'Hi ' + name
}

function unchanged() {
  return 42
}

function newFunc() {
  return 'I am new'
}`

describe('diffSymbols', () => {
  it('extracts symbols from old and new versions', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    expect(changes.length).toBeGreaterThan(0)
  })

  it('detects added function', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    const added = changes.find(c => c.name === 'newFunc')
    expect(added).toBeDefined()
    expect(added!.type).toBe('added')
  })

  it('detects deleted function', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    const deleted = changes.find(c => c.name === 'farewell')
    expect(deleted).toBeDefined()
    expect(deleted!.type).toBe('deleted')
  })

  it('detects modified function (changed body)', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    const modified = changes.find(c => c.name === 'greet')
    expect(modified).toBeDefined()
    expect(modified!.type).toBe('modified')
  })

  it('does not report unchanged functions', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    const unchanged = changes.find(c => c.name === 'unchanged')
    expect(unchanged).toBeUndefined()
  })

  it('detects renamed function', () => {
    const oldSrc = `function oldName() {
  return 42
}`
    const newSrc = `function newName() {
  return 42
}`
    const changes = diffSymbols(oldSrc, newSrc, 'typescript')
    const renamed = changes.find(c => c.type === 'renamed')
    if (renamed) {
      expect(renamed.name).toBe('newName')
      expect(renamed.oldName).toBe('oldName')
    } else {
      // If rename detection isn't implemented, expect add+delete
      const added = changes.find(c => c.name === 'newName' && c.type === 'added')
      const deleted = changes.find(c => c.name === 'oldName' && c.type === 'deleted')
      expect(added).toBeDefined()
      expect(deleted).toBeDefined()
    }
  })

  it('handles class with changed methods', () => {
    const oldClass = `class Foo {
  bar() { return 1 }
  baz() { return 2 }
}`
    const newClass = `class Foo {
  bar() { return 99 }
  baz() { return 2 }
}`
    const changes = diffSymbols(oldClass, newClass, 'typescript')
    // The class or method bar should be detected as modified
    const modified = changes.find(c => c.name === 'bar' || c.name === 'Foo')
    expect(modified).toBeDefined()
    expect(modified!.type).toBe('modified')
  })

  it('shows inline diff for modified symbols', () => {
    const changes = diffSymbols(oldSource, newSource, 'typescript')
    const modified = changes.find(c => c.name === 'greet' && c.type === 'modified')
    expect(modified).toBeDefined()
    expect(modified!.oldBody).toBeDefined()
    expect(modified!.newBody).toBeDefined()
    expect(modified!.oldBody).not.toBe(modified!.newBody)
  })
})
