import { describe, it, expect } from 'vitest'
import {
  statusArgs,
  logArgs,
  diffArgs,
  branchLocalArgs,
  branchRemoteArgs,
  stashListArgs,
  stageArgs,
  unstageArgs,
  commitArgs,
  restoreArgs,
} from '../gitCommands'

describe('statusArgs', () => {
  it('returns porcelain v2 with branch info', () => {
    const args = statusArgs()
    expect(args).toEqual(['status', '--porcelain=v2', '--branch'])
  })
})

describe('logArgs', () => {
  it('returns default args with format and max count', () => {
    const args = logArgs()
    expect(args[0]).toBe('log')
    expect(args).toContain('-n')
    expect(args).toContain('50')
    expect(args.some(a => a.startsWith('--format='))).toBe(true)
  })

  it('respects custom maxCount', () => {
    const args = logArgs({ maxCount: 100 })
    const nIndex = args.indexOf('-n')
    expect(args[nIndex + 1]).toBe('100')
  })

  it('adds --all flag when requested', () => {
    const args = logArgs({ all: true })
    expect(args).toContain('--all')
  })

  it('adds branch name when specified', () => {
    const args = logArgs({ branch: 'feature' })
    expect(args).toContain('feature')
  })

  it('does not include --all by default', () => {
    const args = logArgs()
    expect(args).not.toContain('--all')
  })
})

describe('diffArgs', () => {
  it('returns unstaged diff by default', () => {
    const args = diffArgs()
    expect(args[0]).toBe('diff')
    expect(args).not.toContain('--cached')
  })

  it('adds --cached for staged diff', () => {
    const args = diffArgs({ staged: true })
    expect(args).toContain('--cached')
  })

  it('adds file path after --', () => {
    const args = diffArgs({ file: 'src/main.ts' })
    expect(args).toContain('--')
    expect(args).toContain('src/main.ts')
  })

  it('adds commit hash when specified', () => {
    const args = diffArgs({ commit: 'abc123' })
    expect(args).toContain('abc123')
  })
})

describe('branchLocalArgs', () => {
  it('returns local branch format args', () => {
    const args = branchLocalArgs()
    expect(args[0]).toBe('branch')
    expect(args.some(a => a.startsWith('--format='))).toBe(true)
  })
})

describe('branchRemoteArgs', () => {
  it('returns remote branch format args', () => {
    const args = branchRemoteArgs()
    expect(args[0]).toBe('branch')
    expect(args).toContain('-r')
    expect(args.some(a => a.startsWith('--format='))).toBe(true)
  })
})

describe('stashListArgs', () => {
  it('returns stash list with format', () => {
    const args = stashListArgs()
    expect(args[0]).toBe('stash')
    expect(args[1]).toBe('list')
    expect(args.some(a => a.startsWith('--format='))).toBe(true)
  })
})

describe('stageArgs', () => {
  it('stages single file', () => {
    const args = stageArgs(['file.ts'])
    expect(args).toEqual(['add', '--', 'file.ts'])
  })

  it('stages multiple files', () => {
    const args = stageArgs(['a.ts', 'b.ts', 'c.ts'])
    expect(args).toEqual(['add', '--', 'a.ts', 'b.ts', 'c.ts'])
  })

  it('handles paths with spaces', () => {
    const args = stageArgs(['path with spaces/file.ts'])
    expect(args).toContain('path with spaces/file.ts')
  })
})

describe('unstageArgs', () => {
  it('unstages single file', () => {
    const args = unstageArgs(['file.ts'])
    expect(args).toEqual(['restore', '--staged', '--', 'file.ts'])
  })

  it('unstages multiple files', () => {
    const args = unstageArgs(['a.ts', 'b.ts'])
    expect(args).toEqual(['restore', '--staged', '--', 'a.ts', 'b.ts'])
  })
})

describe('commitArgs', () => {
  it('returns commit with message', () => {
    const args = commitArgs('fix bug')
    expect(args).toEqual(['commit', '-m', 'fix bug'])
  })

  it('handles multi-line messages', () => {
    const args = commitArgs('title\n\nbody text')
    expect(args[2]).toBe('title\n\nbody text')
  })
})

describe('restoreArgs', () => {
  it('restores single file', () => {
    const args = restoreArgs(['file.ts'])
    expect(args).toEqual(['restore', '--', 'file.ts'])
  })

  it('restores multiple files', () => {
    const args = restoreArgs(['a.ts', 'b.ts'])
    expect(args).toEqual(['restore', '--', 'a.ts', 'b.ts'])
  })
})
