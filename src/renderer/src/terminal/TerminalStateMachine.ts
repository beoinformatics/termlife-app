/**
 * Terminal State Machine
 *
 * Tracks the four states of a terminal pane:
 * - idle-ready: Shell at prompt, no process running, ready for input
 * - idle-error: Shell at prompt, last command exited with error code
 * - running: Process running, not waiting for user input (CPU busy)
 * - running-input: Process running and waiting for user text input (interactive)
 *
 * Detection strategy (layered, strongest signal wins):
 * 1. OSC 133 shell integration — exact prompt/command boundaries when available
 * 2. Process tree monitoring — if shell has child processes, we're NOT at a prompt
 * 3. Heuristics — cursor position, output patterns, time since last output (fallback)
 */

export type TerminalState = 'idle-ready' | 'idle-error' | 'idle-alert' | 'running' | 'running-input' | 'running-input-alert'

export interface StateChangeEvent {
  previousState: TerminalState
  newState: TerminalState
  exitCode?: number
  reason: string
}

type StateChangeListener = (event: StateChangeEvent) => void

interface StateContext {
  hasRunningProcess: boolean
  hasActiveCommand: boolean  // True from Enter press until prompt returns
  lastExitCode: number | null
  lastOutputTime: number
  lastInputTime: number
  cursorX: number
  cursorY: number        // Viewport-relative cursor Y (0 to rows-1)
  absCursorY: number     // Absolute buffer cursor Y
  cursorStableSince: number
  rows: number
  cols: number
  bottomLines: string[]
  bottomLinesStartY: number  // Absolute Y of first line in bottomLines
  lastCommandHadError: boolean
  recentOutput: string
  commandStartTime: number
  // Process tree: pushed from main process with each pty-data event
  hasChildProcesses: boolean
  // OSC 133 shell integration state
  osc133Active: boolean
  osc133PromptActive: boolean
  osc133ExitCode: number | null
  // Bell character detected (alert)
  bellReceived: boolean
  bellReceivedTime: number
}

export class TerminalStateMachine {
  private _state: TerminalState = 'idle-ready'
  private _lastDebugLog = 0
  private listeners: StateChangeListener[] = []
  private context: StateContext = {
    hasRunningProcess: false,
    hasActiveCommand: false,
    lastExitCode: null,
    lastOutputTime: Date.now(),
    lastInputTime: Date.now(),
    cursorX: 0,
    cursorY: 0,
    absCursorY: 0,
    cursorStableSince: Date.now(),
    rows: 24,
    cols: 80,
    bottomLines: [],
    bottomLinesStartY: 0,
    lastCommandHadError: false,
    recentOutput: '',
    commandStartTime: 0,
    hasChildProcesses: false,
    osc133Active: false,
    osc133PromptActive: false,
    osc133ExitCode: null,
    bellReceived: false,
    bellReceivedTime: 0,
  }

  // PTY ID (informational only, child check comes via push)
  ptyId: string = ''

  // After output stops, wait this long before considering running-input
  private static INPUT_WAIT_THRESHOLD = 500

  // After output stops with child process + stable cursor, assume running-input
  // (catches TUI programs like claude CLI that don't emit recognizable prompts)
  private static TUI_INPUT_THRESHOLD = 2000

  // After output stops, wait this long before allowing idle transition (prevents premature idle)
  private static IDLE_QUIET_PERIOD = 1500

  // Error patterns to detect in output (shell command failures)
  // Must be at START of line or have shell prefix to avoid matching normal output
  private static ERROR_PATTERNS = [
    /^(?:zsh|bash|sh):.*command not found/i,
    /: command not found/i,
    /No such file or directory/i,
    /Permission denied/i,
    /^(?:\[?ERROR\]?|error):/i,
    /^(?:\[?FATAL\]?|fatal):/i,
    /^(?:\[?FAILED\]?|failed):/i,
    /returned non-zero exit status/i,
    /exit status 1/i,
    /exit code 1/i,
  ]

  get state(): TerminalState {
    return this._state
  }

  get hasBell(): boolean {
    // Bell expires after 30 seconds if not acknowledged
    if (this.context.bellReceived && Date.now() - this.context.bellReceivedTime > 30000) {
      this.context.bellReceived = false
    }
    return this.context.bellReceived
  }

  clearBell(): void {
    this.context.bellReceived = false
  }

  get contextSnapshot(): Readonly<StateContext> {
    return { ...this.context }
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx !== -1) this.listeners.splice(idx, 1)
    }
  }

  private emitStateChange(newState: TerminalState, reason: string) {
    if (this._state === newState) return

    // Guard: never transition to running-input without child processes
    // If there's no child process, the shell itself is running — its prompt means idle, not interactive input
    if ((newState === 'running-input' || newState === 'running-input-alert') && !this.context.hasChildProcesses) {
      return
    }

    const event: StateChangeEvent = {
      previousState: this._state,
      newState,
      exitCode: this.context.lastExitCode ?? undefined,
      reason,
    }

    this._state = newState
    this.listeners.forEach((cb) => cb(event))
  }

  /**
   * Called when a command starts (Enter pressed at prompt)
   */
  onProcessStart() {
    this.context.hasActiveCommand = true
    this.context.lastExitCode = null
    this.context.lastCommandHadError = false
    this.context.recentOutput = ''
    this.context.commandStartTime = Date.now()
    this.emitStateChange('running', 'Command started')
  }

  /**
   * Called when the PTY process exits
   */
  onProcessExit(exitCode: number) {
    this.context.hasRunningProcess = false
    this.context.hasActiveCommand = false
    this.context.lastExitCode = exitCode

    if (exitCode === 0) {
      this.emitStateChange('idle-ready', `Process exited with code ${exitCode}`)
    } else {
      this.emitStateChange('idle-error', `Process exited with error code ${exitCode}`)
    }
  }

  /**
   * Push-based child process status update from main process.
   * Called with every pty-data event — no async polling needed.
   */
  updateChildProcessStatus(hasChildren: boolean) {
    const hadChildren = this.context.hasChildProcesses
    this.context.hasChildProcesses = hasChildren

    // Debug logging for child process changes
    if (hadChildren !== hasChildren) {
      console.log('[StateMachine] Child process status changed:', hadChildren, '->', hasChildren,
        'state=', this._state, 'hasActiveCommand=', this.context.hasActiveCommand)
    }

    // Detect when child processes finish and shell returns to prompt
    // This happens when a command like 'python script.py' exits
    if (hadChildren && !hasChildren) {
      if (this.context.hasActiveCommand) {
        // Child process(es) finished - command is no longer active
        this.context.hasActiveCommand = false
      }

      // If we were in running-input (awaiting input from a child program),
      // the child is gone — transition to running and let prompt detection handle idle
      if (this._state === 'running-input' || this._state === 'running-input-alert') {
        this.context.hasChildProcesses = true // temporarily allow the transition through the guard
        this.emitStateChange('running', 'Child process exited - no longer awaiting input')
        this.context.hasChildProcesses = false
      }

      // Check if we're at the shell prompt now
      if (this._state === 'running') {
        const atPrompt = this.isAtPrompt()
        if (atPrompt) {
          if (this.hasErrorInOutput()) {
            this.emitStateChange('idle-error', 'Command finished - shell prompt detected')
          } else {
            this.emitStateChange('idle-ready', 'Command finished - shell prompt detected')
          }
        }
      }
    }
  }

  /**
   * Called when data is written to the terminal (output from process).
   */
  onData(data: string) {
    // Check for OSC 133 shell integration sequences
    this.parseOSC133(data)

    // Check for standalone BEL character (\x07) - terminal bell/alert
    // Strip OSC sequences first (\x1b]....\x07) so their BEL terminators don't false-trigger
    const dataWithoutOSC = data.replace(/\x1b\][^\x07]*\x07/g, '')
    if (dataWithoutOSC.includes('\x07') && !this.context.bellReceived) {
      const timeSinceInput = Date.now() - this.context.lastInputTime
      if (timeSinceInput > 300) { // Wait 300ms after last keystroke
        this.context.bellReceived = true
        this.context.bellReceivedTime = Date.now()
        // Play audible bell sound
        this.playBellSound()
      }
    }

    this.context.lastOutputTime = Date.now()

    if (!this.context.recentOutput) {
      this.context.recentOutput = ''
    }
    this.context.recentOutput += data
    if (this.context.recentOutput.length > 2048) {
      this.context.recentOutput = this.context.recentOutput.slice(-2048)
    }

    if (this.checkForErrorPatterns(data)) {
      this.context.lastCommandHadError = true
    }

    // If we were in running-input, substantial new output means back to running
    // Skip small writes (< 64 bytes) that are likely TUI redraws (cursor blink, status bar)
    if (this._state === 'running-input' && data.length >= 64) {
      this.emitStateChange('running', 'Process produced output')
    }

    // If running and we see what looks like a prompt, check for interactive mode
    // This catches prompts that appear after input is processed
    if (this._state === 'running' && this.context.hasActiveCommand) {
      const timeSinceInput = Date.now() - this.context.lastInputTime
      // Only if user hasn't typed recently (avoids false positives during typing)
      if (timeSinceInput > 100) {
        const trimmed = data.trimEnd()
        const lines = trimmed.split('\n')
        const lastNonEmptyLine = lines.filter(l => l.trim()).pop() || ''

        // Check for explicit interactive prompt patterns
        // ? at end: "What's your name?"
        // : at end: "Enter value:"
        // > at end: "Continue?>"
        // ... at end: "Press enter to exit..."
        const hasPromptEnding = /\?\s*$/.test(lastNonEmptyLine) ||
                                /:\s*$/.test(lastNonEmptyLine) ||
                                />\s*$/.test(lastNonEmptyLine) ||
                                /\.{3,}$/.test(lastNonEmptyLine)

        // Only trigger if it's NOT a shell prompt
        const isShellPrompt = /[$#%❯➜➤›»→][\s\]]*$/.test(lastNonEmptyLine) ||
                              /[\w-]+@[\w-]+[:~]/.test(lastNonEmptyLine)

        if (hasPromptEnding && !isShellPrompt) {
          this.emitStateChange('running-input', 'Interactive prompt detected')
        }
      }
    }
  }

  /**
   * Parse OSC 133 shell integration escape sequences.
   */
  private parseOSC133(data: string) {
    const oscRegex = /\x1b\]133;([A-D])(?:;([^\x07\x1b]*))?\x07|\x1b\]133;([A-D])(?:;([^\x07\x1b]*))?\x1b\\/g
    let match: RegExpExecArray | null

    while ((match = oscRegex.exec(data)) !== null) {
      const code = match[1] || match[3]
      const params = match[2] || match[4] || ''

      this.context.osc133Active = true

      switch (code) {
        case 'A': // Prompt start
          this.context.osc133PromptActive = true
          this.context.hasActiveCommand = false

          if (this.context.osc133ExitCode !== null && this.context.osc133ExitCode !== 0) {
            this.emitStateChange('idle-error', 'OSC 133: Prompt start after error')
          } else if (this.context.lastCommandHadError) {
            this.emitStateChange('idle-error', 'OSC 133: Prompt start, error in output')
          } else {
            this.emitStateChange('idle-ready', 'OSC 133: Prompt start')
          }
          break

        case 'B': // Prompt end - shell is ready for input
          this.context.osc133PromptActive = false
          // Only transition to running-input if we have an active command
          if (this.context.hasActiveCommand) {
            this.emitStateChange('running-input', 'OSC 133: Prompt ready for input')
          }
          break

        case 'C': // Command execution starts
          this.context.osc133PromptActive = false
          this.context.hasActiveCommand = true
          this.context.lastCommandHadError = false
          this.context.recentOutput = ''
          this.context.commandStartTime = Date.now()
          this.context.osc133ExitCode = null
          this.emitStateChange('running', 'OSC 133: Command started')
          break

        case 'D': { // Command finished
          const exitCode = params ? parseInt(params, 10) : 0
          this.context.osc133ExitCode = isNaN(exitCode) ? 0 : exitCode
          this.context.hasActiveCommand = false
          break
        }
      }
    }
  }

  private checkForErrorPatterns(data: string): boolean {
    return TerminalStateMachine.ERROR_PATTERNS.some(pattern => pattern.test(data))
  }

  private hasErrorInOutput(): boolean {
    const output = this.context.recentOutput || ''
    return TerminalStateMachine.ERROR_PATTERNS.some(pattern => pattern.test(output))
  }

  /**
   * Called when user sends input to the terminal
   */
  onInput(data: string) {
    this.context.lastInputTime = Date.now()

    // Clear bell on any user input
    if (this.context.bellReceived) {
      this.context.bellReceived = false
    }

    // Clear bell on any user input (acknowledge the alert)
    if (this.context.bellReceived && data.length > 0 && !data.startsWith('\x1b')) {
      this.context.bellReceived = false
    }

    // Detect command start: Enter pressed while in idle state
    // Skip if OSC 133 is active — it handles transitions precisely
    if (!this.context.osc133Active) {
      if (data === '\r' || data === 'Enter') {
        if (this._state === 'idle-ready' || this._state === 'idle-error') {
          this.onProcessStart()
          return
        }
        // User submitted input in running-input mode -> back to running
        if (this._state === 'running-input') {
          this.emitStateChange('running', 'User submitted input')
        }
      }
    }

    // If user typed while running, likely interactive mode
    if (this._state === 'running' && this.context.hasActiveCommand) {
      if (data.length > 0 && !data.startsWith('\x1b') && data !== '\r') {
        this.emitStateChange('running-input', 'User typing while command running - interactive mode')
      }
    }
  }

  updateCursor(x: number, y: number, absY?: number) {
    if (x !== this.context.cursorX || y !== this.context.cursorY) {
      this.context.cursorStableSince = Date.now()
    }
    this.context.cursorX = x
    this.context.cursorY = y
    if (absY !== undefined) {
      this.context.absCursorY = absY
    }
  }

  resize(cols: number, rows: number) {
    this.context.cols = cols
    this.context.rows = rows
  }

  updateBottomLines(lines: string[], startY?: number) {
    this.context.bottomLines = lines
    if (startY !== undefined) {
      this.context.bottomLinesStartY = startY
    }
  }

  /**
   * Check if current buffer state suggests we're at a shell prompt.
   * GATED: returns false if shell has child processes (strongest signal).
   * GATED: returns false if output happened recently (quiet period).
   */
  private isAtPrompt(): boolean {
    // PRIMARY GUARD: child processes exist → NOT at shell prompt
    if (this.context.hasChildProcesses) {
      return false
    }

    // TIMING GUARD: require quiet period after last output before allowing idle
    const timeSinceOutput = Date.now() - this.context.lastOutputTime
    if (timeSinceOutput < TerminalStateMachine.IDLE_QUIET_PERIOD) {
      return false
    }

    const lines = this.context.bottomLines
    if (lines.length === 0) return false

    // Don't detect prompt if user recently typed
    const timeSinceInput = Date.now() - this.context.lastInputTime
    if (timeSinceInput < 1000) {
      return false
    }

    // STRICT shell prompt patterns - must be actual shell prompts
    // NOT interactive prompts like "What's your name?" or "Press enter..."
    const promptPatterns = [
      // Standard shell prompts at end of line: $ # > %
      /[$#>%]\s*$/,
      // Modern unicode prompts at end of line
      /[❯➜➤›»→]\s*$/,
      // user@host:path$ style prompts
      /[\w-]+@[\w-]+[:~][/\w]*[$#>%❯]\s*$/,
    ]

    return lines.some((line) =>
      promptPatterns.some((pattern) => pattern.test(line))
    )
  }

  /**
   * Periodic update — called from terminal render loop.
   */
  update(_dt: number): void {
    // If OSC 133 is driving state, skip heuristic idle checks
    if (this.context.osc133Active) {
      // Still detect running-input for interactive programs under OSC 133
      if (this._state === 'running' && this.context.hasChildProcesses) {
        const timeSinceOutput = Date.now() - this.context.lastOutputTime
        const cursorStableTime = Date.now() - this.context.cursorStableSince
        if (timeSinceOutput > TerminalStateMachine.INPUT_WAIT_THRESHOLD &&
            cursorStableTime > 300) {
          if (this.hasInteractivePromptPattern()) {
            this.emitStateChange('running-input', 'OSC 133 + interactive prompt detected')
          } else if (timeSinceOutput > TerminalStateMachine.TUI_INPUT_THRESHOLD &&
                     cursorStableTime > 1000 &&
                     this.context.recentOutput.trim().length > 10) {
            // TUI fallback: child process running, output quiet, cursor stable
            // Catches programs like claude CLI that use full TUI without traditional prompts
            // Requires meaningful output — silent programs (sleep, wait) should stay 'running'
            this.emitStateChange('running-input', 'TUI program idle - likely awaiting input')
          }
        }
      }
      return
    }

    // --- Heuristic mode (no OSC 133) ---

    // If no active command but we're still in running/running-input,
    // check if process has exited and we should go idle
    if (!this.context.hasActiveCommand) {
      if (this._state === 'running' || this._state === 'running-input') {
        const atPrompt = this.isAtPrompt()
        if (atPrompt) {
          if (this.hasErrorInOutput()) {
            this.emitStateChange('idle-error', 'Command completed with error output detected')
          } else {
            this.emitStateChange('idle-ready', 'Command completed - shell prompt detected')
          }
        }
      }
      return
    }

    const hasSeenOutput = this.context.lastOutputTime > this.context.commandStartTime

    if (this._state === 'running' || this._state === 'running-input') {
      const timeSinceInput = Date.now() - this.context.lastInputTime
      const justTyped = timeSinceInput < 500
      const atPrompt = this.isAtPrompt()

      // Debug logging
      const now = Date.now()
      if (!this._lastDebugLog || now - this._lastDebugLog > 1000) {
        this._lastDebugLog = now
        console.log('[StateMachine]',
          'state=' + this._state,
          'atPrompt=' + atPrompt,
          'hasChildren=' + this.context.hasChildProcesses,
          'osc133=' + this.context.osc133Active,
          'timeSinceOutput=' + (now - this.context.lastOutputTime) + 'ms',
          'cursorY=' + this.context.cursorY,
        )
      }

      if (atPrompt && hasSeenOutput && !justTyped) {
        this.context.hasActiveCommand = false

        if (this.hasErrorInOutput()) {
          this.emitStateChange('idle-error', 'Command completed with error output detected')
        } else {
          this.emitStateChange('idle-ready', 'Command completed successfully')
        }
        return
      }
    }

    // Detect running → running-input
    // Transition when we see clear evidence of an interactive prompt
    if (this._state === 'running' && this.context.hasActiveCommand) {
      const timeSinceOutput = Date.now() - this.context.lastOutputTime
      const cursorStableTime = Date.now() - this.context.cursorStableSince

      // Scenario 1: Cursor stable, no output for a while, and pattern matches
      if (cursorStableTime > 300 && timeSinceOutput > 500) {
        if (this.hasInteractivePromptPattern()) {
          this.emitStateChange('running-input', 'Interactive prompt pattern detected')
          return
        }
      }

      // Scenario 2: No output for longer period, cursor stable at end of line
      // This catches programs that clear screen and wait for input
      if (timeSinceOutput > 1000 && cursorStableTime > 500 && this.context.hasChildProcesses) {
        const lines = this.context.bottomLines
        const cursorLineIndex = this.context.absCursorY - this.context.bottomLinesStartY

        if (cursorLineIndex >= 0 && cursorLineIndex < lines.length) {
          const cursorLine = lines[cursorLineIndex]
          const beforeCursor = cursorLine.slice(0, this.context.cursorX)

          // If cursor is at end of non-empty line and no shell prompt char
          const trimmed = beforeCursor.trim()
          if (trimmed.length > 0 && !/^[\$#%❯➜➤›»→]/.test(trimmed)) {
            this.emitStateChange('running-input', 'Cursor stable at end of line - awaiting input')
          }
        }

        // Scenario 3: TUI fallback — child process running, output quiet, cursor stable
        // Catches TUI programs (claude CLI, etc.) where cursor line may be empty
        // Requires meaningful output — silent programs (sleep, wait) should stay 'running'
        if (this._state === 'running' && timeSinceOutput > TerminalStateMachine.TUI_INPUT_THRESHOLD &&
            cursorStableTime > 1000 &&
            this.context.recentOutput.trim().length > 10) {
          this.emitStateChange('running-input', 'TUI program idle - likely awaiting input')
        }
      }
    }
  }

  /**
   * Check if the current line looks like an interactive prompt.
   */
  private hasInteractivePromptPattern(): boolean {
    const lines = this.context.bottomLines
    if (lines.length === 0) return false

    // Calculate which line in the array contains the cursor
    // cursor is at absCursorY, lines start at bottomLinesStartY
    const cursorLineIndex = this.context.absCursorY - this.context.bottomLinesStartY

    if (cursorLineIndex < 0 || cursorLineIndex >= lines.length) return false

    const cursorLine = lines[cursorLineIndex]
    const beforeCursor = cursorLine.slice(0, this.context.cursorX)

    // First: reject if this looks like a shell prompt (avoid false positives)
    const shellPromptPatterns = [
      /[$#%]\s*$/,                         // Standard: $ # %
      /[❯➜➤›»→]\s*$/,                      // Unicode shell prompts
      /[\w-]+@[\w-]+[:~][/\w]*[$#>%❯]\s*$/, // user@host:path$ style
    ]
    if (shellPromptPatterns.some(pattern => pattern.test(beforeCursor))) {
      return false
    }

    // Pattern 1: Strong prompt indicators at end of line
    const strongPromptPatterns = [
      /[:\?]>?\s*$/,
      />\s*$/,
      /\(\d+\)\s*[:\?]?\s*$/,
      /[\w\s]+:\s*$/,
      /\[.*\][:>\?]?\s*$/,
      /→\s*$/,
      /›\s*$/,
      /…\s*$/,
    ]

    if (strongPromptPatterns.some(pattern => pattern.test(beforeCursor))) {
      return true
    }

    // Pattern 2: Cursor at end of non-empty line with no shell prompt char
    // This catches simple prompts like "Enter name: " where cursor is at end
    const trimmed = beforeCursor.trim()
    if (trimmed.length > 0 && trimmed.length < 60) {
      // Not a shell prompt (no $ # % > at start)
      if (!/^[\$#%❯➜➤›»→]/.test(trimmed)) {
        // Line ends with space and cursor is there (waiting for typed input)
        if (/\s$/.test(beforeCursor)) {
          return true
        }
      }
    }

    return false
  }

  forceState(newState: TerminalState, reason: string) {
    this.emitStateChange(newState, reason)
  }

  /**
   * Play audible bell sound using Web Audio API
   */
  private playBellSound() {
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioContext) return

      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      // Bell-like tone (around 800Hz with quick decay)
      osc.frequency.value = 800
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)

      // Cleanup after sound plays
      setTimeout(() => ctx.close(), 500)
    } catch {
      // Audio may be blocked by browser policy (requires user interaction first)
    }
  }
}
