import { spawn } from 'node-pty'
import { execFile } from 'child_process'

type DataCallback = (id: string, data: string, hasChildren: boolean) => void
type ExitCallback = (id: string, exitCode: number) => void

// Backpressure tuning: batch PTY output to reduce IPC message volume
const FLUSH_INTERVAL_MS = 8    // ~120Hz max flush rate (every other vsync)
const FLUSH_SIZE_BYTES = 64 * 1024  // flush immediately if buffer exceeds 64KB

interface PtySession {
  id: string
  pty: ReturnType<typeof spawn>
  // Cached child process status, updated by a periodic timer
  hasChildren: boolean
  // Debounce counter: require N consecutive "no children" checks before flipping to false
  noChildrenCount: number
  childCheckTimer: ReturnType<typeof setInterval> | null
  // Backpressure: accumulate PTY output and flush in batches
  dataBuffer: string
  flushTimer: ReturnType<typeof setTimeout> | null
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()

  create(
    id: string,
    shell: string | undefined,
    cwd: string | undefined,
    onData: DataCallback,
    onExit: ExitCallback
  ): { success: boolean; pid?: number; error?: string } {
    const defaultShell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const shellToUse = shell || defaultShell
    const cwdToUse = cwd || process.env.TERMLIFE_CWD || process.cwd()

    try {
      const pty = spawn(shellToUse, [], {
        name: 'xterm-256color',
        cwd: cwdToUse,
        env: process.env as Record<string, string>,
      })

      const session: PtySession = { id, pty, hasChildren: false, noChildrenCount: 0, childCheckTimer: null, dataBuffer: '', flushTimer: null }
      this.sessions.set(id, session)

      // Start periodic child process check (every 5000ms, async to avoid blocking event loop)
      // Debounce: require 2 consecutive "no children" checks (~10s) before flipping to false
      // This prevents transient pgrep timeouts from causing false "command finished" transitions
      const DEBOUNCE_COUNT = 2
      session.childCheckTimer = setInterval(() => {
        this.checkChildProcesses(pty.pid).then((detected) => {
          if (detected) {
            session.noChildrenCount = 0
            session.hasChildren = true
          } else {
            session.noChildrenCount++
            if (session.noChildrenCount >= DEBOUNCE_COUNT) {
              session.hasChildren = false
            }
          }
        })
      }, 5000)

      // Flush buffered data to renderer via IPC
      const flushBuffer = (): void => {
        if (session.dataBuffer.length > 0) {
          onData(id, session.dataBuffer, session.hasChildren)
          session.dataBuffer = ''
        }
        session.flushTimer = null
      }

      // Batch PTY output: accumulate chunks, flush on timer or size threshold
      pty.onData((data: string) => {
        session.dataBuffer += data
        if (session.dataBuffer.length >= FLUSH_SIZE_BYTES) {
          // Large burst — flush immediately to avoid unbounded memory growth
          if (session.flushTimer) {
            clearTimeout(session.flushTimer)
          }
          flushBuffer()
        } else if (!session.flushTimer) {
          // Schedule a flush on the next interval tick
          session.flushTimer = setTimeout(flushBuffer, FLUSH_INTERVAL_MS)
        }
      })

      pty.onExit(({ exitCode }: { exitCode: number }) => {
        if (session.childCheckTimer) clearInterval(session.childCheckTimer)
        // Flush any remaining buffered data before reporting exit
        if (session.flushTimer) clearTimeout(session.flushTimer)
        if (session.dataBuffer.length > 0) {
          onData(id, session.dataBuffer, session.hasChildren)
          session.dataBuffer = ''
        }
        onExit(id, exitCode)
        this.sessions.delete(id)
      })

      return { success: true, pid: pty.pid }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  /**
   * Check if a process has child processes. Non-blocking async.
   * Uses pgrep -P for direct children (works on macOS and Linux).
   */
  private checkChildProcesses(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
      execFile('pgrep', ['-P', String(pid)], { timeout: 2000 }, (error, stdout) => {
        if (error) {
          // Exit code 1 = no children (normal), timeout/error = also treat as no children
          resolve(false)
        } else {
          resolve(stdout.trim().length > 0)
        }
      })
    })
  }

  /**
   * Query current child process status for a session.
   */
  hasChildProcess(id: string): { success: boolean; hasChildren?: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { success: false, error: 'Session not found' }
    return { success: true, hasChildren: session.hasChildren }
  }

  write(id: string, data: string): { success: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { success: false, error: 'Session not found' }
    session.pty.write(data)
    return { success: true }
  }

  resize(id: string, cols: number, rows: number): { success: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { success: false, error: 'Session not found' }
    session.pty.resize(cols, rows)
    return { success: true }
  }

  kill(id: string): { success: boolean; error?: string } {
    const session = this.sessions.get(id)
    if (!session) return { success: false, error: 'Session not found' }
    if (session.childCheckTimer) clearInterval(session.childCheckTimer)
    if (session.flushTimer) clearTimeout(session.flushTimer)
    session.pty.kill()
    this.sessions.delete(id)
    return { success: true }
  }

  killAll() {
    this.sessions.forEach(session => {
      if (session.childCheckTimer) clearInterval(session.childCheckTimer)
      if (session.flushTimer) clearTimeout(session.flushTimer)
      session.pty.kill()
    })
    this.sessions.clear()
  }
}
