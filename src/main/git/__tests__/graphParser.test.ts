import { describe, it, expect } from 'vitest'
import { parseGraph } from '../gitParser'

describe('parseGraph', () => {
  const SEP = '\x00'
  const REC = '\x01'

  function makeRecord(
    hash: string,
    shortHash: string,
    author: string,
    date: string,
    message: string,
    refs: string,
    parents: string,
  ): string {
    return [hash, shortHash, author, date, message, refs, parents].join(SEP)
  }

  it('parses single commit with no parents (root)', () => {
    const output = makeRecord('aaa111', 'aaa', 'Alice', '2025-01-01', 'Initial', '', '')
    const result = parseGraph(output)
    expect(result).toHaveLength(1)
    expect(result[0].hash).toBe('aaa111')
    expect(result[0].shortHash).toBe('aaa')
    expect(result[0].author).toBe('Alice')
    expect(result[0].date).toBe('2025-01-01')
    expect(result[0].message).toBe('Initial')
    expect(result[0].parents).toEqual([])
    expect(result[0].refs).toEqual([])
    expect(result[0].column).toBe(0)
  })

  it('parses multiple commits with parent refs', () => {
    const output = [
      makeRecord('bbb222', 'bbb', 'Bob', '2025-01-02', 'Second', '', 'aaa111'),
      makeRecord('aaa111', 'aaa', 'Alice', '2025-01-01', 'First', '', ''),
    ].join(REC)
    const result = parseGraph(output)
    expect(result).toHaveLength(2)
    expect(result[0].parents).toEqual(['aaa111'])
    expect(result[1].parents).toEqual([])
  })

  it('parses merge commit with two parents', () => {
    const output = makeRecord('ccc333', 'ccc', 'Carol', '2025-01-03', 'Merge', '', 'aaa111 bbb222')
    const result = parseGraph(output)
    expect(result[0].parents).toEqual(['aaa111', 'bbb222'])
  })

  it('parses commit with refs (branch, tag)', () => {
    const output = makeRecord('ddd444', 'ddd', 'Dave', '2025-01-04', 'Tagged', 'HEAD -> main, tag: v1.0', 'ccc333')
    const result = parseGraph(output)
    expect(result[0].refs).toEqual(['HEAD -> main', 'tag: v1.0'])
  })

  it('returns empty array for empty output', () => {
    expect(parseGraph('')).toEqual([])
    expect(parseGraph('  \n  ')).toEqual([])
  })

  it('sets column to 0 for all commits (lane assignment is separate)', () => {
    const output = [
      makeRecord('bbb222', 'bbb', 'Bob', '2025-01-02', 'Second', '', 'aaa111'),
      makeRecord('aaa111', 'aaa', 'Alice', '2025-01-01', 'First', '', ''),
    ].join(REC)
    const result = parseGraph(output)
    expect(result[0].column).toBe(0)
    expect(result[1].column).toBe(0)
  })

  it('handles commit with empty refs field', () => {
    const output = makeRecord('eee555', 'eee', 'Eve', '2025-01-05', 'No refs', '', 'ddd444')
    const result = parseGraph(output)
    expect(result[0].refs).toEqual([])
  })
})
