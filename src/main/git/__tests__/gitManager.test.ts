import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitManager } from '../gitManager'

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

import { execFile } from 'child_process'

const mockExecFile = vi.mocked(execFile)

function mockGitOutput(stdout: string, stderr = ''): void {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
    if (typeof _opts === 'function') {
      callback = _opts
    }
    callback(null, stdout, stderr)
    return {} as any
  })
}

function mockGitError(message: string, code = 128): void {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
    if (typeof _opts === 'function') {
      callback = _opts
    }
    const err = new Error(message) as any
    err.code = code
    callback(err, '', message)
    return {} as any
  })
}

describe('GitManager', () => {
  let gm: GitManager

  beforeEach(() => {
    vi.clearAllMocks()
    gm = new GitManager()
  })

  describe('status', () => {
    it('calls git status with correct args and returns parsed result', async () => {
      const output = [
        '# branch.oid abc123',
        '# branch.head main',
        '1 .M N... 100644 100644 100644 abc123 def456 src/file.ts',
      ].join('\n')
      mockGitOutput(output)

      const result = await gm.status('/repo')
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['status', '--porcelain=v2', '--branch']),
        expect.objectContaining({ cwd: '/repo' }),
        expect.any(Function),
      )
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(1)
      expect(result.files[0].path).toBe('src/file.ts')
    })

    it('detects merging state from MERGE_HEAD existence', async () => {
      // GitManager checks for MERGE_HEAD file; we test via the status output only
      const output = '# branch.oid abc123\n# branch.head main\n'
      mockGitOutput(output)

      const result = await gm.status('/repo')
      // Default is false (MERGE_HEAD check is separate)
      expect(result.merging).toBe(false)
    })
  })

  describe('log', () => {
    it('calls git log and returns parsed commits', async () => {
      const SEP = '\x00'
      const RECORD_SEP = '\x01'
      const output = [
        'abc1234567890', 'abc1234', 'Alice', 'alice@test.com',
        '2026-01-15T10:30:00+00:00', 'Initial commit', '', '', '',
      ].join(SEP) + RECORD_SEP
      mockGitOutput(output)

      const result = await gm.log('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].author).toBe('Alice')
    })

    it('passes options to git log', async () => {
      mockGitOutput('')
      await gm.log('/repo', { maxCount: 10, all: true })
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('--all')
      expect(args).toContain('10')
    })
  })

  describe('diff', () => {
    it('calls git diff and returns parsed result', async () => {
      const output = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,1 +1,1 @@',
        '-old',
        '+new',
      ].join('\n')
      mockGitOutput(output)

      const result = await gm.diff('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('file.ts')
    })

    it('passes staged option', async () => {
      mockGitOutput('')
      await gm.diff('/repo', { staged: true })
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('--cached')
    })
  })

  describe('branches', () => {
    it('calls git branch and returns parsed result', async () => {
      const SEP = '\x00'
      const localOutput = `*${SEP}main${SEP}abc1234${SEP}origin/main${SEP}0${SEP}0${SEP}2026-01-15`
      // Two calls: local then remote
      mockExecFile
        .mockImplementationOnce((_cmd, _args, _opts, cb: any) => {
          if (typeof _opts === 'function') cb = _opts
          cb(null, localOutput, '')
          return {} as any
        })
        .mockImplementationOnce((_cmd, _args, _opts, cb: any) => {
          if (typeof _opts === 'function') cb = _opts
          cb(null, '', '')
          return {} as any
        })

      const result = await gm.branches('/repo')
      expect(result.current).toBe('main')
      expect(result.local).toHaveLength(1)
    })
  })

  describe('stashList', () => {
    it('calls git stash list and returns parsed result', async () => {
      const SEP = '\x00'
      const output = `0${SEP}WIP on main${SEP}2026-01-15T10:00:00+00:00${SEP}main`
      mockGitOutput(output)

      const result = await gm.stashList('/repo')
      expect(result).toHaveLength(1)
      expect(result[0].message).toBe('WIP on main')
    })
  })

  describe('stage', () => {
    it('calls git add with correct paths', async () => {
      mockGitOutput('')
      await gm.stage('/repo', ['file1.ts', 'file2.ts'])
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('add')
      expect(args).toContain('file1.ts')
      expect(args).toContain('file2.ts')
    })
  })

  describe('unstage', () => {
    it('calls git restore --staged with correct paths', async () => {
      mockGitOutput('')
      await gm.unstage('/repo', ['file.ts'])
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('restore')
      expect(args).toContain('--staged')
      expect(args).toContain('file.ts')
    })
  })

  describe('commit', () => {
    it('calls git commit and returns hash', async () => {
      mockGitOutput('[main abc1234] fix bug\n 1 file changed')
      const hash = await gm.commit('/repo', 'fix bug')
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('commit')
      expect(args).toContain('-m')
      expect(args).toContain('fix bug')
      expect(hash).toBe('abc1234')
    })
  })

  describe('restore', () => {
    it('calls git restore with correct paths', async () => {
      mockGitOutput('')
      await gm.restore('/repo', ['file.ts'])
      const args = mockExecFile.mock.calls[0][1] as string[]
      expect(args).toContain('restore')
      expect(args).toContain('file.ts')
    })
  })

  describe('error handling', () => {
    it('throws on git not found', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, cb: any) => {
        if (typeof _opts === 'function') cb = _opts
        const err = new Error('ENOENT') as any
        err.code = 'ENOENT'
        cb(err, '', '')
        return {} as any
      })

      await expect(gm.status('/repo')).rejects.toThrow()
    })

    it('throws on not a git repo', async () => {
      mockGitError('fatal: not a git repository')
      await expect(gm.status('/repo')).rejects.toThrow()
    })

    it('throws on command failure with stderr', async () => {
      mockGitError('fatal: some error')
      await expect(gm.log('/repo')).rejects.toThrow('fatal: some error')
    })
  })
})
