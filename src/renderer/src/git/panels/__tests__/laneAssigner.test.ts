import { describe, it, expect } from 'vitest'
import { assignLanes } from '../laneAssigner'
import type { GraphCommit } from '../../../../../main/git/types'

function makeCommit(hash: string, parents: string[] = [], refs: string[] = []): GraphCommit {
  return {
    hash,
    shortHash: hash.slice(0, 3),
    parents,
    author: 'Test',
    date: '2025-01-01',
    message: `Commit ${hash}`,
    column: 0,
    refs,
  }
}

describe('assignLanes', () => {
  it('returns empty array for empty input', () => {
    expect(assignLanes([])).toEqual([])
  })

  it('assigns all commits to lane 0 for linear history', () => {
    const commits = [
      makeCommit('ccc', ['bbb']),
      makeCommit('bbb', ['aaa']),
      makeCommit('aaa', []),
    ]
    const result = assignLanes(commits)
    expect(result).toHaveLength(3)
    expect(result[0].column).toBe(0)
    expect(result[1].column).toBe(0)
    expect(result[2].column).toBe(0)
  })

  it('assigns fork to lane 1', () => {
    // History: D merges B and C, both children of A
    //   D (merge B+C)
    //  / \
    // B   C
    //  \ /
    //   A
    const commits = [
      makeCommit('ddd', ['bbb', 'ccc']),  // merge
      makeCommit('bbb', ['aaa']),          // lane 0
      makeCommit('ccc', ['aaa']),          // lane 1
      makeCommit('aaa', []),               // root
    ]
    const result = assignLanes(commits)
    // First parent stays in lane 0, second parent goes to lane 1
    expect(result[0].column).toBe(0)  // merge commit
    expect(result[1].column).toBe(0)  // first parent (bbb)
    expect(result[2].column).toBe(1)  // second parent (ccc)
    expect(result[3].column).toBe(0)  // root (back to 0 after merge)
  })

  it('assigns unique lanes to multiple branches', () => {
    // E merges B, C, D — all children of A
    const commits = [
      makeCommit('eee', ['bbb', 'ccc', 'ddd']),
      makeCommit('bbb', ['aaa']),
      makeCommit('ccc', ['aaa']),
      makeCommit('ddd', ['aaa']),
      makeCommit('aaa', []),
    ]
    const result = assignLanes(commits)
    const columns = result.map(c => c.column)
    // bbb, ccc, ddd should have distinct columns
    expect(columns[1]).not.toBe(columns[2])
    expect(columns[2]).not.toBe(columns[3])
    expect(columns[1]).not.toBe(columns[3])
  })

  it('reuses lanes after merge', () => {
    // Linear after merge: F -> E(merge B+C) -> B -> C -> A
    // After E merges, lane 1 should be freed
    // Then F continues on lane 0
    const commits = [
      makeCommit('fff', ['eee']),
      makeCommit('eee', ['bbb', 'ccc']),
      makeCommit('bbb', ['aaa']),
      makeCommit('ccc', ['aaa']),
      makeCommit('aaa', []),
    ]
    const result = assignLanes(commits)
    // F should be on lane 0 (lane 1 was freed after merge completed)
    expect(result[0].column).toBe(0)
  })

  it('handles single commit', () => {
    const commits = [makeCommit('aaa', [])]
    const result = assignLanes(commits)
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe(0)
  })

  it('handles detached commits (no parents, not root)', () => {
    // Two disconnected commits
    const commits = [
      makeCommit('bbb', []),
      makeCommit('aaa', []),
    ]
    const result = assignLanes(commits)
    expect(result).toHaveLength(2)
    // Both should get valid lane assignments
    expect(result[0].column).toBeGreaterThanOrEqual(0)
    expect(result[1].column).toBeGreaterThanOrEqual(0)
  })

  it('does not mutate input commits', () => {
    const commits = [
      makeCommit('bbb', ['aaa']),
      makeCommit('aaa', []),
    ]
    const origColumn = commits[0].column
    assignLanes(commits)
    expect(commits[0].column).toBe(origColumn)
  })
})
