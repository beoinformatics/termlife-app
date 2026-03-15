import { watch, existsSync } from 'fs'
import type { FSWatcher } from 'fs'
import { join } from 'path'

type EventHandler = (...args: any[]) => void

export class GitWatcher {
  private cwd: string
  private watchers: FSWatcher[] = []
  private listeners: Map<string, Set<EventHandler>> = new Map()
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false

  constructor(cwd: string) {
    this.cwd = cwd
  }

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  private emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(h => h(...args))
  }

  start(): void {
    const gitDir = join(this.cwd, '.git')
    if (!existsSync(gitDir)) return

    const paths = [
      join(gitDir, 'HEAD'),
      join(gitDir, 'index'),
      join(gitDir, 'refs'),
    ]

    for (const p of paths) {
      try {
        const w = watch(p, { persistent: false }, () => {
          this.scheduleEmit()
        })
        w.on('error', () => {
          // Ignore watcher errors — file may be temporarily unavailable
        })
        this.watchers.push(w)
      } catch {
        // Path may not exist yet (e.g. refs/ in fresh repo)
      }
    }
  }

  private scheduleEmit(): void {
    if (this.destroyed) return
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      if (!this.destroyed) {
        this.emit('changed')
      }
    }, 300)
  }

  destroy(): void {
    this.destroyed = true
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    for (const w of this.watchers) {
      w.close()
    }
    this.watchers = []
    this.listeners.clear()
  }
}
