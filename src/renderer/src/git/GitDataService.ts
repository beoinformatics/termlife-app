import type {
  GitStatus,
  GitCommit,
  GitDiff,
  GitBranches,
  GraphCommit,
  DiffOptions,
  LogOptions,
  GraphOptions,
} from '../../../main/git/types'

type EventHandler = (...args: any[]) => void

export class GitDataService {
  private cwd: string
  private cache: {
    status: GitStatus | null
    log: GitCommit[] | null
    branches: GitBranches | null
    graph: GraphCommit[] | null
  }
  private listeners: Map<string, Set<EventHandler>>

  private watching = false

  constructor(cwd: string) {
    this.cwd = cwd
    this.cache = { status: null, log: null, branches: null, graph: null }
    this.listeners = new Map()
  }

  // --- Event emitter ---

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

  // --- Queries (cached) ---

  async getStatus(): Promise<GitStatus> {
    if (!this.cache.status) {
      this.cache.status = await (window as any).gitAPI.status(this.cwd)
    }
    return this.cache.status!
  }

  async getLog(options?: LogOptions): Promise<GitCommit[]> {
    if (!this.cache.log) {
      this.cache.log = await (window as any).gitAPI.log(this.cwd, options)
    }
    return this.cache.log!
  }

  async getBranches(): Promise<GitBranches> {
    if (!this.cache.branches) {
      this.cache.branches = await (window as any).gitAPI.branches(this.cwd)
    }
    return this.cache.branches!
  }

  async getGraph(options?: GraphOptions): Promise<GraphCommit[]> {
    if (!this.cache.graph) {
      this.cache.graph = await (window as any).gitAPI.graph(this.cwd, options)
    }
    return this.cache.graph!
  }

  async getDiff(options?: DiffOptions): Promise<GitDiff[]> {
    // Never cached — always fresh
    return (window as any).gitAPI.diff(this.cwd, options)
  }

  // --- Mutations (auto-refresh after) ---

  async stage(paths: string[]): Promise<void> {
    await (window as any).gitAPI.stage(this.cwd, paths)
    await this.refresh()
  }

  async unstage(paths: string[]): Promise<void> {
    await (window as any).gitAPI.unstage(this.cwd, paths)
    await this.refresh()
  }

  async commit(message: string): Promise<string> {
    const hash = await (window as any).gitAPI.commit(this.cwd, message)
    await this.refresh()
    return hash
  }

  async push(): Promise<string> {
    const result = await (window as any).gitAPI.push(this.cwd)
    await this.refresh()
    return result
  }

  // --- Cache management ---

  async refresh(): Promise<void> {
    this.invalidateCache()
    await this.getStatus()
    this.emit('status-changed', this.cache.status)
  }

  setCwd(cwd: string): void {
    this.cwd = cwd
    this.invalidateCache()
  }

  private invalidateCache(): void {
    this.cache.status = null
    this.cache.log = null
    this.cache.branches = null
    this.cache.graph = null
  }

  startWatching(): void {
    if (this.watching) return
    this.watching = true
    ;(window as any).gitAPI.onStateChanged(this.cwd, () => this.refresh())
  }

  stopWatching(): void {
    if (!this.watching) return
    this.watching = false
    ;(window as any).gitAPI.offStateChanged(this.cwd)
  }

  destroy(): void {
    this.stopWatching()
    this.listeners.clear()
    this.invalidateCache()
  }
}
