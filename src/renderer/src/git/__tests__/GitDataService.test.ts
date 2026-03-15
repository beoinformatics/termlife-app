import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitDataService } from '../GitDataService'

// Mock window.gitAPI
const mockGitAPI = {
  status: vi.fn(),
  log: vi.fn(),
  diff: vi.fn(),
  branches: vi.fn(),
  stashList: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  restore: vi.fn(),
  graph: vi.fn(),
}

;(globalThis as any).window = { gitAPI: mockGitAPI }

const fakeStatus = {
  branch: 'main',
  upstream: null,
  ahead: 0,
  behind: 0,
  detached: false,
  merging: false,
  rebasing: false,
  files: [{ path: 'file.ts', index: 'unmodified', workingTree: 'modified' }],
}

describe('GitDataService', () => {
  let service: GitDataService

  beforeEach(() => {
    vi.clearAllMocks()
    mockGitAPI.status.mockResolvedValue(fakeStatus)
    mockGitAPI.log.mockResolvedValue([])
    mockGitAPI.branches.mockResolvedValue({ current: 'main', local: [], remote: [] })
    mockGitAPI.diff.mockResolvedValue([])
    mockGitAPI.stage.mockResolvedValue(undefined)
    mockGitAPI.unstage.mockResolvedValue(undefined)
    mockGitAPI.commit.mockResolvedValue('abc1234')
    mockGitAPI.graph.mockResolvedValue([
      { hash: 'aaa111', shortHash: 'aaa', parents: [], author: 'Alice', date: '2025-01-01', message: 'Init', column: 0, refs: [] },
    ])
    service = new GitDataService('/repo')
  })

  describe('getStatus', () => {
    it('calls gitAPI.status and returns result', async () => {
      const result = await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledWith('/repo')
      expect(result.branch).toBe('main')
      expect(result.files).toHaveLength(1)
    })

    it('caches result on second call', async () => {
      await service.getStatus()
      await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledTimes(1)
    })
  })

  describe('getLog', () => {
    it('calls gitAPI.log and returns result', async () => {
      const result = await service.getLog()
      expect(mockGitAPI.log).toHaveBeenCalledWith('/repo', undefined)
      expect(result).toEqual([])
    })

    it('caches result on second call', async () => {
      await service.getLog()
      await service.getLog()
      expect(mockGitAPI.log).toHaveBeenCalledTimes(1)
    })
  })

  describe('getBranches', () => {
    it('calls gitAPI.branches and returns result', async () => {
      const result = await service.getBranches()
      expect(mockGitAPI.branches).toHaveBeenCalledWith('/repo')
      expect(result.current).toBe('main')
    })

    it('caches result on second call', async () => {
      await service.getBranches()
      await service.getBranches()
      expect(mockGitAPI.branches).toHaveBeenCalledTimes(1)
    })
  })

  describe('getGraph', () => {
    it('calls gitAPI.graph and returns result', async () => {
      const result = await service.getGraph()
      expect(mockGitAPI.graph).toHaveBeenCalledWith('/repo', undefined)
      expect(result).toHaveLength(1)
      expect(result[0].hash).toBe('aaa111')
    })

    it('caches result on second call', async () => {
      await service.getGraph()
      await service.getGraph()
      expect(mockGitAPI.graph).toHaveBeenCalledTimes(1)
    })

    it('invalidates cache on refresh', async () => {
      await service.getGraph()
      await service.refresh()
      await service.getGraph()
      expect(mockGitAPI.graph).toHaveBeenCalledTimes(2)
    })
  })

  describe('getDiff', () => {
    it('calls gitAPI.diff — never cached', async () => {
      await service.getDiff()
      await service.getDiff()
      expect(mockGitAPI.diff).toHaveBeenCalledTimes(2)
    })

    it('passes options through', async () => {
      await service.getDiff({ staged: true, file: 'test.ts' })
      expect(mockGitAPI.diff).toHaveBeenCalledWith('/repo', { staged: true, file: 'test.ts' })
    })
  })

  describe('refresh', () => {
    it('invalidates cache and re-fetches', async () => {
      await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledTimes(1)

      await service.refresh()
      await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledTimes(2)
    })

    it('emits status-changed event', async () => {
      const handler = vi.fn()
      service.on('status-changed', handler)
      await service.refresh()
      expect(handler).toHaveBeenCalled()
    })
  })

  describe('stage', () => {
    it('calls gitAPI.stage then auto-refreshes', async () => {
      await service.stage(['file.ts'])
      expect(mockGitAPI.stage).toHaveBeenCalledWith('/repo', ['file.ts'])
      // Auto-refresh means status was fetched
      expect(mockGitAPI.status).toHaveBeenCalled()
    })
  })

  describe('unstage', () => {
    it('calls gitAPI.unstage then auto-refreshes', async () => {
      await service.unstage(['file.ts'])
      expect(mockGitAPI.unstage).toHaveBeenCalledWith('/repo', ['file.ts'])
      expect(mockGitAPI.status).toHaveBeenCalled()
    })
  })

  describe('commit', () => {
    it('calls gitAPI.commit and auto-refreshes', async () => {
      const hash = await service.commit('fix bug')
      expect(mockGitAPI.commit).toHaveBeenCalledWith('/repo', 'fix bug')
      expect(hash).toBe('abc1234')
      expect(mockGitAPI.status).toHaveBeenCalled()
    })
  })

  describe('setCwd', () => {
    it('clears cache when directory changes', async () => {
      await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledTimes(1)

      service.setCwd('/other-repo')
      await service.getStatus()
      expect(mockGitAPI.status).toHaveBeenCalledTimes(2)
      expect(mockGitAPI.status).toHaveBeenLastCalledWith('/other-repo')
    })
  })
})
