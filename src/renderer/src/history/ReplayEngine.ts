import { commandRegistry } from './CommandRegistry'

export class ReplayEngine {
  private ptyWrite: (sessionId: string, data: string) => Promise<any>
  private getActiveSessionId: () => string | null
  private checkHasChildren: (sessionId: string) => Promise<boolean>

  constructor(
    ptyWrite: (sessionId: string, data: string) => Promise<any>,
    getActiveSessionId: () => string | null,
    checkHasChildren: (sessionId: string) => Promise<boolean>
  ) {
    this.ptyWrite = ptyWrite
    this.getActiveSessionId = getActiveSessionId
    this.checkHasChildren = checkHasChildren
  }

  async replay(content: string): Promise<void> {
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // App command - execute immediately
        commandRegistry.executeCommand(trimmed)
        // Small delay for UI to settle
        await this.delay(100)
      } else {
        // Shell command - send to PTY
        const sessionId = this.getActiveSessionId()
        if (!sessionId) continue

        await this.ptyWrite(sessionId, trimmed + '\r')
        // Wait for command to complete (shell becomes idle)
        await this.waitForIdle(sessionId)
        // Extra small delay between commands
        await this.delay(100)
      }
    }
  }

  private async waitForIdle(sessionId: string, timeoutMs: number = 30000): Promise<void> {
    const start = Date.now()
    // Give the command a moment to start
    await this.delay(200)

    while (Date.now() - start < timeoutMs) {
      const hasChildren = await this.checkHasChildren(sessionId)
      if (!hasChildren) return
      await this.delay(200)
    }
    // Timeout - continue anyway
    console.warn('[ReplayEngine] Timeout waiting for idle, continuing...')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
