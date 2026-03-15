import { Terminal } from '@xterm/headless'
import { CellGrid, CELL_WIDTH, CELL_HEIGHT } from './CellGrid'
import { CursorRenderer } from './CursorRenderer'
import { InputHandler } from './InputHandler'
import { SelectionManager } from './SelectionManager'
import { ScrollbackManager } from './ScrollbackManager'
import { MarkdownStyler } from './MarkdownStyler'
import { Container, Text, TextStyle } from 'pixi.js'
import { TerminalStateMachine, type TerminalState } from './TerminalStateMachine'

export interface TerminalSize {
  cols: number
  rows: number
}

export class TerminalEngine {
  readonly id: string
  readonly container: Container
  readonly terminal: Terminal
  readonly cellGrid: CellGrid
  readonly cursorRenderer: CursorRenderer
  readonly inputHandler: InputHandler
  readonly selectionManager: SelectionManager
  readonly scrollbackManager: ScrollbackManager
  readonly stateMachine: TerminalStateMachine
  readonly markdownStyler: MarkdownStyler

  private _size: TerminalSize
  private _workingDirectory: string = ''
  private _cursorHidden: boolean = false
  private _initialCwd: string | undefined
  private _firstCwdReported = false
  onFirstCwd?: (cwd: string) => void
  onOutput?: (byteCount: number) => void

  // Renderer-side backpressure: coalesce IPC data before writing to xterm
  private _pendingData: string[] = []
  private _pendingHasChildren: boolean = false
  private _flushScheduled = false
  // Lazy catch-up: background tabs defer xterm writes until activated
  private _isBackground = false

  /**
   * Lightweight state machine tick for background tabs.
   * Updates cursor position, bottom lines, and runs state machine heuristics
   * without doing any rendering work.
   */
  updateStateMachineOnly(dt: number): void {
    try {
      const buffer = this.terminal.buffer.active
      const baseY = buffer.baseY || 0
      const cursorX = Math.max(0, Math.min(buffer.cursorX, this._size.cols - 1))
      const cursorScreenY = buffer.cursorY
      const absCursorY = baseY + buffer.cursorY

      this.stateMachine.updateCursor(cursorX, cursorScreenY, absCursorY)

      // Capture lines around cursor for prompt detection
      const cursorLines: string[] = []
      const startY = Math.max(0, absCursorY - 1)
      const endY = Math.min(absCursorY + 2, baseY + this._size.rows)
      for (let y = startY; y < endY; y++) {
        const line = buffer.getLine(y)
        if (line) {
          let lineText = ''
          for (let x = 0; x < this._size.cols; x++) {
            const cell = line.getCell(x)
            lineText += cell?.getChars() || ' '
          }
          cursorLines.push(lineText.trimEnd())
        }
      }
      this.stateMachine.updateBottomLines(cursorLines, startY)
      this.stateMachine.update(dt)
    } catch {
      // Ignore errors in background tick
    }
  }

  // Timestamp overlay
  private timestampContainer: Container
  private timestampPool: Text[] = []
  private timestampStyle: TextStyle
  private lastTimestampCheck = 0

  constructor(id: string, cols: number, rows: number, yOffset: number, cwd?: string, onShellCommand?: (command: string) => void) {
    this.id = id
    this._size = { cols, rows }
    this._initialCwd = cwd

    this.terminal = new Terminal({
      cols,
      rows,
      allowProposedApi: true,
      scrollback: 10000, // 10,000 lines of scrollback history
    })
    this.container = new Container()
    this.container.eventMode = 'static'

    this.cellGrid = new CellGrid(cols, rows, yOffset)
    this.container.addChild(this.cellGrid.container)

    this.cursorRenderer = new CursorRenderer(this.cellGrid, yOffset)
    this.container.addChild(this.cursorRenderer.graphics)

    this.markdownStyler = new MarkdownStyler()

    // Initialize state machine first (needed for input callback)
    this.stateMachine = new TerminalStateMachine()
    this.stateMachine.ptyId = id
    this.stateMachine.resize(cols, rows)

    // Create input handler with callback to notify state machine and reset scroll
    this.inputHandler = new InputHandler(id, (data) => {
      this.stateMachine.onInput(data)
      this.scrollbackManager.scrollToBottom()
    }, onShellCommand)

    this.scrollbackManager = new ScrollbackManager(this.terminal, cols, rows, yOffset)
    this.container.addChild(this.scrollbackManager.container)

    // Timestamp overlay (above terminal content, below selection)
    this.timestampStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 11,
      fill: 0x00cccc,
    })
    this.timestampContainer = new Container()
    this.container.addChild(this.timestampContainer)

    this.selectionManager = new SelectionManager(cols, rows, yOffset)
    this.selectionManager.setCellGrid(this.cellGrid)
    this.container.addChild(this.selectionManager.container)

    // Auto-scroll when dragging selection to top/bottom edges
    this.selectionManager.onScrollRequest = (lines: number) => {
      this.scrollbackManager.scroll(lines)
    }

    // Forward wheel events from selection overlay to scrollback manager
    // Natural scrolling: trackpad down (deltaY > 0) scrolls toward recent content (negative)
    this.selectionManager.container.on('wheel', (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -3 : 3
      this.scrollbackManager.scroll(delta)
    })

    // Wire xterm responses (e.g. DSR/CPR cursor position reports) back to PTY
    this.terminal.onData((data: string) => {
      window.ptyAPI.write(this.id, data)
    })

    // Wire PTY data listener for this terminal (using terminal-specific ID)
    // hasChildren is piggybacked from main process (cached, updated every 200ms)
    // Data is batched renderer-side and flushed once per animation frame to avoid
    // overwhelming xterm and the PixiJS render loop with per-chunk writes.
    // Background tabs accumulate data but defer xterm writes until activated.
    window.ptyAPI.onData(this.id, (ptyId: string, data: string, hasChildren: boolean) => {
      if (ptyId === this.id) {
        this._pendingData.push(data)
        this._pendingHasChildren = hasChildren
        if (!this._isBackground && !this._flushScheduled) {
          this._flushScheduled = true
          requestAnimationFrame(() => this._flushPendingData())
        }
      }
    })

    window.ptyAPI.onExit(this.id, (ptyId: string, exitCode: number) => {
      if (ptyId === this.id) {
        this.terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`)
        this.stateMachine.onProcessExit(exitCode)
      }
    })
  }

  /**
   * Flush all pending PTY data in a single batch write to xterm.
   * Called once per animation frame to coalesce multiple IPC messages.
   */
  private _flushPendingData(): void {
    this._flushScheduled = false
    if (this._pendingData.length === 0) return

    // Concatenate all buffered chunks into one write
    const combined = this._pendingData.join('')
    this._pendingData.length = 0
    const hasChildren = this._pendingHasChildren

    // Single write to xterm instead of N individual writes
    this.terminal.write(combined)

    // Track DECTCEM cursor visibility: \e[?25l = hide, \e[?25h = show
    if (combined.includes('\x1b[?25l')) this._cursorHidden = true
    if (combined.includes('\x1b[?25h')) this._cursorHidden = false

    this.stateMachine.updateChildProcessStatus(hasChildren)
    this.inputHandler.setHasChildren(hasChildren)
    this.stateMachine.onData(combined)
    this.onOutput?.(combined.length)
    this.parseOSC7(combined)

    // Auto-scroll to bottom on new output if not manually scrolled
    if (!this.scrollbackManager.isScrolledAwayFromBottom()) {
      this.scrollbackManager.scrollToBottom()
    }
  }

  /**
   * Mark this engine as background — pending data accumulates but
   * xterm writes are deferred until setForeground() is called.
   */
  setBackground(): void {
    this._isBackground = true
  }

  /**
   * Mark this engine as foreground — flush all accumulated data immediately.
   */
  setForeground(): void {
    this._isBackground = false
    if (this._pendingData.length > 0) {
      this._flushPendingData()
    }
  }

  async spawn(): Promise<void> {
    const result = await window.ptyAPI.create(this.id, undefined, this._initialCwd)
    if (!result.success) {
      console.error('Failed to spawn PTY:', result.error)
    }
    // Request initial resize
    await window.ptyAPI.resize(this.id, this._size.cols, this._size.rows)
  }

  get size(): TerminalSize {
    return this._size
  }

  resize(cols: number, rows: number, yOffset: number): void {
    this._size = { cols, rows }
    this.terminal.resize(cols, rows)
    this.cellGrid.resize(cols, rows, yOffset)
    this.cursorRenderer.setYOffset(yOffset)
    this.selectionManager.resize(cols, rows, yOffset)
    this.scrollbackManager.resize(cols, rows, yOffset)
    this.stateMachine.resize(cols, rows)
    window.ptyAPI.resize(this.id, cols, rows)
  }

  update(_dt: number): void {
    try {
      // Sync xterm headless buffer → CellGrid
      const buffer = this.terminal.buffer.active
      if (!buffer) return

      const viewportY = this.scrollbackManager.getViewportY()
      for (let y = 0; y < this._size.rows; y++) {
        const line = buffer.getLine(y + viewportY)
        if (!line) continue
        for (let x = 0; x < this._size.cols; x++) {
          const cell = line.getCell(x)
          if (!cell) continue
          const char = cell.getChars() || ' '
          const fg = cell.getFgColor()
          const bg = cell.getBgColor()
          const fgMode = cell.isFgRGB() ? 'rgb' as const
            : cell.isFgPalette() ? 'palette' as const
            : 'default' as const
          const bgMode = cell.isBgRGB() ? 'rgb' as const
            : cell.isBgPalette() ? 'palette' as const
            : 'default' as const
          // Resolve colors, then swap if inverse (SGR 7)
          let resolvedFg = this.cellGrid.resolveColor(fg, fgMode, this.cellGrid.defaultFg)
          let resolvedBg = this.cellGrid.resolveColor(bg, bgMode, this.cellGrid.defaultBg)
          if (cell.isInverse()) {
            ;[resolvedFg, resolvedBg] = [resolvedBg, resolvedFg]
          }
          this.cellGrid.setCellResolved(x, y, char, resolvedFg, resolvedBg, cell.isBold() ? 1 : 0, cell.isItalic() ? 1 : 0)
          this.selectionManager.setCellText(x, y, char)
        }
      }

      // Apply semi-markdown styling (Phase 1: inline + Phase 2: row scaling)
      // Pre-scan lines above viewport for fence state when scrolled back
      if (this.markdownStyler.enabled && viewportY > 0) {
        const linesAbove: string[] = []
        for (let y = 0; y < viewportY; y++) {
          const line = buffer.getLine(y)
          if (!line) continue
          let text = ''
          for (let x = 0; x < this._size.cols; x++) {
            const cell = line.getCell(x)
            text += cell?.getChars() || ' '
          }
          // Only need to check for fence markers
          if (text.trimEnd().startsWith('```')) {
            linesAbove.push(text.trimEnd())
          }
        }
        this.markdownStyler.prescanFenceState(linesAbove)
        this.markdownStyler.apply(this.cellGrid, true)
      } else {
        this.markdownStyler.apply(this.cellGrid)
      }

      this.cellGrid.flush()

      // Phase 3: draw row decorations (HR lines, code borders, H1 underlines)
      if (this.markdownStyler.enabled) {
        this.cellGrid.drawDecorations((y) => this.markdownStyler.getDecoration(y))
      } else {
        this.cellGrid.drawDecorations(() => null)
      }

      // Update cursor position
      const baseY = buffer.baseY || 0
      const cursorX = Math.max(0, Math.min(buffer.cursorX, this._size.cols - 1))
      const cursorScreenY = buffer.cursorY + baseY - viewportY
      const cursorY = Math.max(0, Math.min(cursorScreenY, this._size.rows - 1))

this.cursorRenderer.update(cursorX, cursorY, _dt, this._cursorHidden)

      // Calculate absolute cursor position for state machine
      const absCursorY = baseY + buffer.cursorY

      // Update state machine with cursor and buffer info
      // Pass absolute cursor Y so state machine can map to bottomLines correctly
      this.stateMachine.updateCursor(cursorX, cursorScreenY, absCursorY)

      // Capture lines around cursor for prompt detection
      // Use the absolute buffer position (baseY + buffer.cursorY) to read the right lines
      const cursorLines: string[] = []
      const startY = Math.max(0, absCursorY - 1)
      const endY = Math.min(absCursorY + 2, baseY + this._size.rows)
      for (let y = startY; y < endY; y++) {
        const line = buffer.getLine(y)
        if (line) {
          let lineText = ''
          for (let x = 0; x < this._size.cols; x++) {
            const cell = line.getCell(x)
            lineText += cell?.getChars() || ' '
          }
          cursorLines.push(lineText.trimEnd())
        }
      }
      // Pass the starting absolute Y so state machine can map cursor to correct line
      this.stateMachine.updateBottomLines(cursorLines, startY)

      // Update state machine (for running-input detection)
      this.stateMachine.update(_dt)

      // Record prompt timestamps (throttled to every 500ms)
      const now = performance.now()
      if (now - this.lastTimestampCheck > 500) {
        this.lastTimestampCheck = now
        this.scrollbackManager.recordPromptTimestamps()
      }

      // Update timestamp overlay
      this.updateTimestampOverlay(viewportY)
    } catch (err) {
      console.error('TerminalEngine update error:', err)
    }
  }

  private updateTimestampOverlay(viewportY: number): void {
    if (!this.scrollbackManager.timestampsVisible) {
      this.timestampContainer.visible = false
      return
    }
    this.timestampContainer.visible = true

    let poolIdx = 0
    for (let y = 0; y < this._size.rows; y++) {
      const absY = y + viewportY
      const ts = this.scrollbackManager.getPromptTimestamp(absY)
      if (ts !== null) {
        let label: Text
        if (poolIdx < this.timestampPool.length) {
          label = this.timestampPool[poolIdx]
        } else {
          label = new Text({ text: '', style: this.timestampStyle })
          this.timestampPool.push(label)
          this.timestampContainer.addChild(label)
        }

        const d = new Date(ts)
        const p = (n: number): string => n.toString().padStart(2, '0')
        label.text = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
        label.x = this._size.cols * CELL_WIDTH - 80
        label.y = this.cellGrid.getRowYPosition(y)
        label.alpha = 0.5
        label.visible = true
        poolIdx++
      }
    }

    // Hide unused pool entries
    for (let i = poolIdx; i < this.timestampPool.length; i++) {
      this.timestampPool[i].visible = false
    }
  }

  handleKeyDown(e: KeyboardEvent): void {
    // InputHandler now notifies state machine via callback automatically
    this.inputHandler.handleKeyDown(e)
  }


  async paste(): Promise<boolean> {
    const text = await this.selectionManager.pasteFromClipboard()
    if (text) {
      await window.ptyAPI.write(this.id, text)
      // Notify state machine of pasted input
      this.stateMachine.onInput(text)
      return true
    }
    return false
  }

  async copySelection(): Promise<boolean> {
    return this.selectionManager.copyToClipboard()
  }

  clearSelection(): void {
    this.selectionManager.clearSelection()
  }

  hasSelection(): boolean {
    return this.selectionManager.hasSelection()
  }

  async destroy(): Promise<void> {
    // Flush any remaining buffered data
    this._flushPendingData()
    // Unregister callbacks before killing PTY
    window.ptyAPI.offData(this.id)
    window.ptyAPI.offExit(this.id)
    await window.ptyAPI.kill(this.id)
    this.scrollbackManager.destroy()
    this.terminal.dispose()
    this.container.destroy({ children: true })
  }

  // Send input directly to PTY
  async sendInput(text: string): Promise<void> {
    await window.ptyAPI.write(this.id, text)
    this.stateMachine.onInput(text)
  }

  private parseOSC7(data: string) {
    // OSC 7 format: \x1b]7;file://hostname/path\x07  or  \x1b]7;file://hostname/path\x1b\\
    const osc7Regex = /\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*?)(?:\x07|\x1b\\)/g
    let match: RegExpExecArray | null
    while ((match = osc7Regex.exec(data)) !== null) {
      const path = decodeURIComponent(match[1])
      if (path) {
        this._workingDirectory = path
        if (!this._firstCwdReported) {
          this._firstCwdReported = true
          this.onFirstCwd?.(path)
        }
      }
    }
  }

  getWorkingDirectory(): string | null {
    return this._workingDirectory || null
  }

  // Set working directory by sending cd command
  async setWorkingDirectory(path: string): Promise<void> {
    // Send cd command and newline to navigate
    await this.sendInput(`cd "${path}"`)
    await this.sendInput('\r')
  }
}
