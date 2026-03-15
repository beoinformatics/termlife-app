export interface CommandDef {
  id: string
  label: string
  category: string
  execute: (args?: string[]) => void
  shortcut?: string
}

type HistoryLogger = (command: string) => void

class CommandRegistry {
  private commands = new Map<string, CommandDef>()
  private historyLogger: HistoryLogger | null = null

  register(cmd: CommandDef): void {
    this.commands.set(cmd.id, cmd)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  setHistoryLogger(logger: HistoryLogger): void {
    this.historyLogger = logger
  }

  getAll(): CommandDef[] {
    return Array.from(this.commands.values())
  }

  search(query: string): CommandDef[] {
    if (!query) return this.getAll()

    const q = query.toLowerCase()
    const all = this.getAll()

    type Ranked = { cmd: CommandDef; rank: number }
    const ranked: Ranked[] = []

    for (const cmd of all) {
      const id = cmd.id.toLowerCase()
      const label = cmd.label.toLowerCase()

      if (id === q || label === q) {
        ranked.push({ cmd, rank: 0 })
        continue
      }

      if (id.startsWith(q)) {
        ranked.push({ cmd, rank: 1 })
        continue
      }

      // Word start match on label: any word in label starts with query
      const labelWords = label.split(/\s+/)
      if (labelWords.some(w => w.startsWith(q))) {
        ranked.push({ cmd, rank: 2 })
        continue
      }

      if (id.includes(q) || label.includes(q)) {
        ranked.push({ cmd, rank: 3 })
        continue
      }
    }

    ranked.sort((a, b) => a.rank - b.rank)
    return ranked.map(r => r.cmd)
  }

  // Parse and execute a TCL string like "[tab:new vertical]"
  // Returns true if command was found and executed
  executeCommand(tcl: string): boolean {
    let inner = tcl.trim()
    if (inner.startsWith('[') && inner.endsWith(']')) {
      inner = inner.slice(1, -1).trim()
    }

    const colonIdx = inner.indexOf(':')
    if (colonIdx === -1) return false

    const category = inner.slice(0, colonIdx)
    const rest = inner.slice(colonIdx + 1).trim()
    const parts = rest.split(/\s+/).filter(Boolean)

    if (parts.length === 0) return false

    const action = parts[0]
    const args = parts.slice(1)
    const id = `${category}:${action}`

    return this.executeById(id, args.length > 0 ? args : undefined)
  }

  executeById(id: string, args?: string[]): boolean {
    const cmd = this.commands.get(id)
    if (!cmd) return false

    cmd.execute(args)

    // Log after execution so failed commands don't get logged
    if (this.historyLogger) {
      const tcl = args && args.length > 0 ? `[${id} ${args.join(' ')}]` : `[${id}]`
      this.historyLogger(tcl)
    }
    return true
  }
}

export const commandRegistry = new CommandRegistry()
