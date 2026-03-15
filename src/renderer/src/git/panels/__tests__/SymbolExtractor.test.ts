import { describe, it, expect } from 'vitest'
import { extractSymbols, SymbolInfo } from '../SymbolExtractor'

describe('extractSymbols', () => {
  it('extracts a simple function declaration', () => {
    const source = `function greet(name: string) {
  return 'Hello ' + name
}`
    const symbols = extractSymbols(source, 'typescript')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('greet')
    expect(symbols[0].kind).toBe('function')
    expect(symbols[0].startLine).toBe(0)
    expect(symbols[0].endLine).toBe(2)
  })

  it('extracts an exported function', () => {
    const source = `export function add(a: number, b: number): number {
  return a + b
}`
    const symbols = extractSymbols(source, 'typescript')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('add')
    expect(symbols[0].kind).toBe('function')
  })

  it('extracts arrow function assigned to const', () => {
    const source = `const multiply = (a: number, b: number) => {
  return a * b
}

const single = (x: number) => x * 2`
    const symbols = extractSymbols(source, 'typescript')
    const names = symbols.map(s => s.name)
    expect(names).toContain('multiply')
  })

  it('extracts a class declaration', () => {
    const source = `class Calculator {
  add(a: number, b: number): number {
    return a + b
  }

  subtract(a: number, b: number): number {
    return a - b
  }
}`
    const symbols = extractSymbols(source, 'typescript')
    const classSymbol = symbols.find(s => s.kind === 'class')
    expect(classSymbol).toBeDefined()
    expect(classSymbol!.name).toBe('Calculator')
  })

  it('extracts methods from a class', () => {
    const source = `class Calculator {
  add(a: number, b: number): number {
    return a + b
  }

  subtract(a: number, b: number): number {
    return a - b
  }
}`
    const symbols = extractSymbols(source, 'typescript')
    const methods = symbols.filter(s => s.kind === 'method')
    const names = methods.map(s => s.name)
    expect(names).toContain('add')
    expect(names).toContain('subtract')
  })

  it('extracts async functions', () => {
    const source = `async function fetchData(url: string) {
  const res = await fetch(url)
  return res.json()
}`
    const symbols = extractSymbols(source, 'typescript')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('fetchData')
    expect(symbols[0].kind).toBe('function')
  })

  it('extracts export default function', () => {
    const source = `export default function main() {
  console.log('hello')
}`
    const symbols = extractSymbols(source, 'typescript')
    expect(symbols.find(s => s.name === 'main')).toBeDefined()
  })

  it('returns empty array for empty source', () => {
    expect(extractSymbols('', 'typescript')).toEqual([])
  })

  it('includes body text for each symbol', () => {
    const source = `function hello() {
  return 'world'
}`
    const symbols = extractSymbols(source, 'typescript')
    expect(symbols[0].body).toContain("return 'world'")
  })

  it('works with javascript language too', () => {
    const source = `function test() { return 1 }`
    const symbols = extractSymbols(source, 'javascript')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('test')
  })
})
