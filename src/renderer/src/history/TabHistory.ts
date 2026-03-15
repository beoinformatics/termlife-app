export interface HistoryEntry {
  timestamp: number          // Date.now()
  type: 'shell' | 'app'     // Distinguishes the two kinds
  command: string            // Plain text for shell, bracketed for app e.g. "[crt:toggle]"
}

export class TabHistory {
  private entries: HistoryEntry[] = []

  // Add a shell command to history
  addShell(command: string): void {
    // Trim, skip empty
    const trimmed = command.trim()
    if (!trimmed) return
    this.entries.push({
      timestamp: Date.now(),
      type: 'shell',
      command: trimmed,
    })
  }

  // Add an app command to history (already in TCL bracket format)
  addApp(command: string): void {
    this.entries.push({
      timestamp: Date.now(),
      type: 'app',
      command,
    })
  }

  // Get all entries (read-only)
  getEntries(): readonly HistoryEntry[] {
    return this.entries
  }

  // Export as replay file format
  toReplayFormat(): string {
    // Format: one command per line
    // Shell commands as plain text
    // App commands in bracket syntax
    // Prepend with a comment header
    const lines = [
      `# TermLife session replay`,
      `# Saved: ${new Date().toISOString()}`,
      '',
    ]
    for (const entry of this.entries) {
      lines.push(entry.command)
    }
    return lines.join('\n')
  }

  // Clear all history
  clear(): void {
    this.entries = []
  }

  // Get entry count
  get length(): number {
    return this.entries.length
  }

  // Get the first n entries (oldest first, for preview)
  getFirstN(count: number): HistoryEntry[] {
    return this.entries.slice(0, count)
  }

  // Get the last n entries (most recent first)
  getLastN(count: number): HistoryEntry[] {
    return this.entries.slice(-count)
  }
}
