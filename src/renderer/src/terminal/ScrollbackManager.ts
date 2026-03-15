import { Container } from 'pixi.js'
import type { Terminal } from '@xterm/headless'

export class ScrollbackManager {
  readonly container: Container

  private terminal: Terminal
  private rows: number
  private cols: number
  private yOffset: number

  // Scroll state
  private scrollOffset: number = 0

  // Cell dimensions (needed for content height calculations)
  private cellWidth: number = 9
  private cellHeight: number = 17

  // Timestamp tracking for prompt lines (always recording, toggle controls visibility)
  private promptTimestamps = new Map<number, number>()
  private _timestampsVisible = false

  constructor(
    terminal: Terminal,
    cols: number,
    rows: number,
    yOffset: number,
    cellWidth: number = 9,
    cellHeight: number = 17
  ) {
    this.terminal = terminal
    this.rows = rows
    this.cols = cols
    this.yOffset = yOffset
    this.cellWidth = cellWidth
    this.cellHeight = cellHeight

    this.container = new Container()
    this.container.eventMode = 'passive'
  }

  resize(cols: number, rows: number, yOffset: number): void {
    this.cols = cols
    this.rows = rows
    this.yOffset = yOffset
    this.clampScrollOffset()
  }

  setCellDimensions(cellWidth: number, cellHeight: number): void {
    this.cellWidth = cellWidth
    this.cellHeight = cellHeight
  }

  scroll(lines: number): void {
    this.scrollOffset += lines
    this.clampScrollOffset()
  }

  scrollToBottom(): void {
    this.scrollOffset = 0
  }

  scrollToTop(): void {
    const buffer = this.terminal.buffer.active
    if (!buffer) return

    const totalLines = buffer.baseY + this.rows
    this.scrollOffset = totalLines - this.rows
    this.clampScrollOffset()
  }

  private clampScrollOffset(): void {
    const buffer = this.terminal.buffer.active
    if (!buffer) {
      this.scrollOffset = 0
      return
    }

    const maxScroll = Math.max(0, buffer.baseY)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))
  }

  getViewportY(): number {
    const buffer = this.terminal.buffer.active
    if (!buffer) return 0

    // Return the baseY minus the scroll offset
    // When scrollOffset is 0, we show the bottom of the buffer
    // When scrollOffset > 0, we show older content
    return Math.max(0, buffer.baseY - this.scrollOffset)
  }

  isScrolledAwayFromBottom(): boolean {
    return this.scrollOffset > 0
  }

  /**
   * Scan buffer lines for shell prompt patterns.
   * Matches common prompts: lines containing $ , % , # , > , or ❯ before the cursor area.
   */
  private static PROMPT_PATTERN = /(?:^|\s)[\$%#>❯]\s/

  private isPromptLine(lineIndex: number): boolean {
    const buffer = this.terminal.buffer.active
    if (!buffer) return false
    const line = buffer.getLine(lineIndex)
    if (!line) return false
    let text = ''
    for (let x = 0; x < this.cols; x++) {
      const cell = line.getCell(x)
      text += cell?.getChars() || ' '
    }
    text = text.trimEnd()
    if (text.length === 0) return false
    return ScrollbackManager.PROMPT_PATTERN.test(text)
  }

  /**
   * Scroll to the previous prompt in the buffer (searching upward).
   */
  scrollToPrevPrompt(): void {
    const buffer = this.terminal.buffer.active
    if (!buffer) return

    const viewportY = this.getViewportY()
    for (let y = viewportY - 1; y >= 0; y--) {
      if (this.isPromptLine(y)) {
        const newScrollOffset = buffer.baseY - y
        this.scrollOffset = Math.max(0, newScrollOffset)
        this.clampScrollOffset()
        return
      }
    }
    this.scrollToTop()
  }

  /**
   * Scroll to the next prompt in the buffer (searching downward).
   */
  scrollToNextPrompt(): void {
    const buffer = this.terminal.buffer.active
    if (!buffer) return

    const viewportY = this.getViewportY()
    const maxLine = buffer.baseY + this.rows
    for (let y = viewportY + 1; y < maxLine; y++) {
      if (this.isPromptLine(y)) {
        const newScrollOffset = buffer.baseY - y
        this.scrollOffset = Math.max(0, newScrollOffset)
        this.clampScrollOffset()
        return
      }
    }
    this.scrollToBottom()
  }

  get timestampsVisible(): boolean { return this._timestampsVisible }

  toggleTimestamps(): boolean {
    this._timestampsVisible = !this._timestampsVisible
    return this._timestampsVisible
  }

  /**
   * Record timestamps for prompt lines visible in the current viewport.
   * Called periodically (throttled) — stores absolute line index → Date.now().
   */
  recordPromptTimestamps(): void {
    const buffer = this.terminal.buffer.active
    if (!buffer) return
    const maxLine = buffer.baseY + this.rows
    for (let y = Math.max(0, maxLine - this.rows); y < maxLine; y++) {
      if (!this.promptTimestamps.has(y) && this.isPromptLine(y)) {
        this.promptTimestamps.set(y, Date.now())
      }
    }
  }

  getPromptTimestamp(absLineIndex: number): number | null {
    return this.promptTimestamps.get(absLineIndex) ?? null
  }

  /**
   * Capture the entire scrollback + viewport buffer as plain text.
   * Includes timestamp annotations at prompt lines if timestamps have been recorded.
   */
  captureFullBuffer(): string {
    const buffer = this.terminal.buffer.active
    if (!buffer) return ''

    const totalLines = buffer.baseY + this.rows
    const lines: string[] = []

    for (let y = 0; y < totalLines; y++) {
      const line = buffer.getLine(y)
      if (!line) {
        lines.push('')
        continue
      }
      let text = ''
      for (let x = 0; x < this.cols; x++) {
        const cell = line.getCell(x)
        text += cell?.getChars() || ' '
      }
      text = text.trimEnd()

      const ts = this.promptTimestamps.get(y)
      if (ts) {
        const d = new Date(ts)
        const p = (n: number): string => n.toString().padStart(2, '0')
        text += `  [${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`
      }

      lines.push(text)
    }

    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    return lines.join('\n')
  }

  handleResize(): void {
    this.clampScrollOffset()
  }

  destroy(): void {
    this.container.destroy({ children: true })
  }
}
