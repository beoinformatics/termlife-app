import { describe, it, expect } from 'vitest'
import { filterWorkingFiles, filterStagedFiles } from '../zones/zoneFilters'
import type { GitFileStatus } from '../../../../main/git/types'

const files: GitFileStatus[] = [
  { path: 'staged.ts', index: 'modified', workingTree: 'unmodified' },
  { path: 'modified.ts', index: 'unmodified', workingTree: 'modified' },
  { path: 'both.ts', index: 'modified', workingTree: 'modified' },
  { path: 'untracked.txt', index: 'untracked', workingTree: 'untracked' },
  { path: 'clean.ts', index: 'unmodified', workingTree: 'unmodified' },
]

describe('filterWorkingFiles', () => {
  it('returns files with working tree changes', () => {
    const result = filterWorkingFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).toContain('modified.ts')
    expect(paths).toContain('both.ts')
    expect(paths).toContain('untracked.txt')
  })

  it('excludes files only staged in index', () => {
    const result = filterWorkingFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).not.toContain('staged.ts')
  })

  it('excludes clean files', () => {
    const result = filterWorkingFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).not.toContain('clean.ts')
  })

  it('returns empty for no changes', () => {
    expect(filterWorkingFiles([])).toEqual([])
  })
})

describe('filterStagedFiles', () => {
  it('returns files staged in index', () => {
    const result = filterStagedFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).toContain('staged.ts')
    expect(paths).toContain('both.ts')
  })

  it('excludes files only modified in working tree', () => {
    const result = filterStagedFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).not.toContain('modified.ts')
  })

  it('excludes untracked files', () => {
    const result = filterStagedFiles(files)
    const paths = result.map(f => f.path)
    expect(paths).not.toContain('untracked.txt')
  })

  it('returns empty for no staged files', () => {
    expect(filterStagedFiles([])).toEqual([])
  })
})
