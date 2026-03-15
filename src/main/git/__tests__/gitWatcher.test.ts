import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Track all watch calls and existsSync behavior
const mockWatchers: Array<{ path: string; watcher: EventEmitter & { close: ReturnType<typeof vi.fn> } }> = []
let existsSyncResult = true

vi.mock('fs', () => ({
  watch: vi.fn((path: string, _opts: any, cb: Function) => {
    const emitter = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> }
    emitter.close = vi.fn()
    emitter.on('_trigger', () => cb('change', 'file'))
    mockWatchers.push({ path, watcher: emitter })
    return emitter
  }),
  existsSync: vi.fn(() => existsSyncResult),
}))

import { GitWatcher } from '../gitWatcher'

function triggerChange(pathSubstring: string) {
  for (const entry of mockWatchers) {
    if (entry.path.includes(pathSubstring)) {
      entry.watcher.emit('_trigger')
    }
  }
}

describe('GitWatcher', () => {
  let watcher: GitWatcher

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWatchers.length = 0
    existsSyncResult = true
  })

  afterEach(() => {
    watcher?.destroy()
    vi.useRealTimers()
  })

  it('watches .git/HEAD, .git/index, and .git/refs/', () => {
    watcher = new GitWatcher('/repo')
    watcher.start()

    const watchedPaths = mockWatchers.map(w => w.path)
    expect(watchedPaths).toContain('/repo/.git/HEAD')
    expect(watchedPaths).toContain('/repo/.git/index')
    expect(watchedPaths).toContain('/repo/.git/refs')
  })

  it('debounces rapid changes (300ms)', () => {
    watcher = new GitWatcher('/repo')
    const handler = vi.fn()
    watcher.on('changed', handler)
    watcher.start()

    // Trigger 5 rapid changes
    for (let i = 0; i < 5; i++) {
      triggerChange('HEAD')
    }

    // Not yet fired
    expect(handler).not.toHaveBeenCalled()

    // After debounce period
    vi.advanceTimersByTime(300)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits single event for batched changes', () => {
    watcher = new GitWatcher('/repo')
    const handler = vi.fn()
    watcher.on('changed', handler)
    watcher.start()

    // Changes to different files within debounce window
    triggerChange('HEAD')
    triggerChange('index')

    vi.advanceTimersByTime(300)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('cleans up watchers on destroy', () => {
    watcher = new GitWatcher('/repo')
    watcher.start()

    expect(mockWatchers.length).toBeGreaterThan(0)
    const closeSpies = mockWatchers.map(w => w.watcher.close)

    watcher.destroy()
    closeSpies.forEach(spy => expect(spy).toHaveBeenCalled())
  })

  it('handles missing .git directory gracefully', () => {
    existsSyncResult = false

    watcher = new GitWatcher('/not-a-repo')
    expect(() => watcher.start()).not.toThrow()
    // No watchers created
    expect(mockWatchers).toHaveLength(0)
  })

  it('handles watcher errors without crashing', () => {
    watcher = new GitWatcher('/repo')
    watcher.start()

    const headEntry = mockWatchers.find(w => w.path.includes('HEAD'))
    expect(() => headEntry?.watcher.emit('error', new Error('EACCES'))).not.toThrow()
  })

  it('does not emit after destroy', () => {
    watcher = new GitWatcher('/repo')
    const handler = vi.fn()
    watcher.on('changed', handler)
    watcher.start()

    watcher.destroy()

    // Try to trigger — should not fire
    triggerChange('HEAD')
    vi.advanceTimersByTime(300)
    expect(handler).not.toHaveBeenCalled()
  })
})
