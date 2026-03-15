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
  onStateChanged: vi.fn(),
  offStateChanged: vi.fn(),
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

describe('GitDataService — file watcher auto-refresh', () => {
  let service: GitDataService

  beforeEach(() => {
    vi.clearAllMocks()
    mockGitAPI.status.mockResolvedValue(fakeStatus)
    mockGitAPI.log.mockResolvedValue([])
    mockGitAPI.branches.mockResolvedValue({ current: 'main', local: [], remote: [] })
    mockGitAPI.graph.mockResolvedValue([])
    mockGitAPI.onStateChanged.mockImplementation((_cwd: string, cb: Function) => {
      // Store callback for later invocation
      ;(mockGitAPI as any)._stateChangedCb = cb
    })
    service = new GitDataService('/repo')
  })

  it('subscribes to gitAPI.onStateChanged on startWatching', () => {
    service.startWatching()
    expect(mockGitAPI.onStateChanged).toHaveBeenCalledWith('/repo', expect.any(Function))
  })

  it('auto-refreshes when watcher fires', async () => {
    service.startWatching()
    const handler = vi.fn()
    service.on('status-changed', handler)

    // Populate cache first
    await service.getStatus()
    expect(mockGitAPI.status).toHaveBeenCalledTimes(1)

    // Simulate watcher event
    const cb = (mockGitAPI as any)._stateChangedCb
    await cb()

    // Status was re-fetched
    expect(mockGitAPI.status).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalled()
  })

  it('unsubscribes on stopWatching', () => {
    service.startWatching()
    service.stopWatching()
    expect(mockGitAPI.offStateChanged).toHaveBeenCalledWith('/repo')
  })

  it('unsubscribes on destroy', () => {
    service.startWatching()
    service.destroy()
    expect(mockGitAPI.offStateChanged).toHaveBeenCalledWith('/repo')
  })
})
