// Map keyboard events to PTY-compatible escape sequences
const KEY_MAP: Record<string, string> = {
  Enter: '\r',
  Backspace: '\x7f',
  Tab: '\t',
  Escape: '\x1b',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Home: '\x1b[H',
  End: '\x1b[F',
  Delete: '\x1b[3~',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
  Insert: '\x1b[2~',
  F1: '\x1bOP',
  F2: '\x1bOQ',
  F3: '\x1bOR',
  F4: '\x1bOS',
  F5: '\x1b[15~',
  F6: '\x1b[17~',
  F7: '\x1b[18~',
  F8: '\x1b[19~',
  F9: '\x1b[20~',
  F10: '\x1b[21~',
  F11: '\x1b[23~',
  F12: '\x1b[24~',
}

export class InputHandler {
  private ptyId: string
  private onInput?: (data: string) => void
  private onShellCommand?: (command: string) => void
  private inputBuffer: string = ''
  private hasChildren: boolean = false

  constructor(
    ptyId: string,
    onInput?: (data: string) => void,
    onShellCommand?: (command: string) => void
  ) {
    this.ptyId = ptyId
    this.onInput = onInput
    this.onShellCommand = onShellCommand
  }

  setHasChildren(value: boolean): void {
    this.hasChildren = value
  }

  handleKeyDown(e: KeyboardEvent): void {
    // Skip browser-level shortcuts we handle in main.ts
    // But allow Cmd/Ctrl+Shift+P (palette) and Cmd/Ctrl+Shift+H (history) to pass through
    const isPaletteOrHistory = (e.shiftKey && (e.key === 'P' || e.key === 'H' || e.key === 'p' || e.key === 'h'))
    if (e.metaKey && !isPaletteOrHistory) return
    if ((e.ctrlKey && e.shiftKey) && isPaletteOrHistory) return

    let data: string | null = null

    // Ctrl+key combos — use e.code (e.g. 'KeyA') as primary source since
    // e.key can report the control character itself (e.g. '\x01') instead
    // of the letter on some platforms/Electron versions
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      let letter: string | null = null

      // Prefer e.code which reliably reports KeyA–KeyZ regardless of modifiers
      if (e.code && e.code.startsWith('Key') && e.code.length === 4) {
        letter = e.code[3].toLowerCase()
      } else if (e.key.length === 1) {
        const code = e.key.toLowerCase().charCodeAt(0)
        if (code >= 97 && code <= 122) { // a-z
          letter = e.key.toLowerCase()
        } else if (code >= 1 && code <= 26) {
          // e.key is already the control character
          letter = String.fromCharCode(code + 96)
        }
      }

      if (letter) {
        data = String.fromCharCode(letter.charCodeAt(0) - 96) // Ctrl+A = 0x01, etc.
        if (letter === 'c' || letter === 'u') {
          this.inputBuffer = ''
        }
      }
    } else if (e.key === 'Enter') {
      data = KEY_MAP['Enter']
      if (!this.hasChildren) {
        this.onShellCommand?.(this.inputBuffer)
      }
      this.inputBuffer = ''
    } else if (e.key === 'Backspace') {
      data = KEY_MAP['Backspace']
      this.inputBuffer = this.inputBuffer.slice(0, -1)
    } else if (KEY_MAP[e.key]) {
      data = KEY_MAP[e.key]
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      data = e.key
      this.inputBuffer += e.key
    } else if (e.altKey && e.key.length === 1) {
      data = '\x1b' + e.key // Alt+key = ESC + key
    }

    if (data !== null) {
      e.preventDefault()
      window.ptyAPI.write(this.ptyId, data)
      this.onInput?.(data)
    }
  }

}
