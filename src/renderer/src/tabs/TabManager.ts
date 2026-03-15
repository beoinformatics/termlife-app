import { Application, Container } from 'pixi.js'
import { CELL_WIDTH, CELL_HEIGHT } from '../terminal/CellGrid'
import { AttentionScorer, type AttentionScore } from './AttentionScorer'
import { SplitPane, type SplitLayout } from './SplitPane'
import { TabDeathAnimation } from '../effects/TabDeathAnimation'
import type { TerminalState } from '../terminal/TerminalStateMachine'
import { TabHistory } from '../history/TabHistory'

export type TabState = TerminalState

// Number words for tab naming
const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

export interface Tab {
  id: string
  title: string
  state: TabState
  hasBell: boolean
  splitPane: SplitPane
  layout: SplitLayout
  isDying: boolean // Track if tab is in death animation
  color: number // Random color for tab boundary
  history: TabHistory
}

// Generate a random color from the full 24-bit color space
function generateTabColor(): number {
  return Math.floor(Math.random() * 0xFFFFFF)
}

export class TabManager {
  readonly container: Container
  readonly deathAnimation: TabDeathAnimation
  private app: Application
  private tabs: Tab[] = []
  private activeIndex = -1
  private tabBarHeight: number
  private _bottomBarHeight = 0
  private nextId = 1
  private dyingTabs = new Set<string>() // Track tabs currently in death animation
  readonly attentionScorer = new AttentionScorer()

  constructor(app: Application, tabBarHeight: number) {
    this.app = app
    this.tabBarHeight = tabBarHeight
    this.container = new Container()
    this.deathAnimation = new TabDeathAnimation(app)
  }

  get activeTabs(): ReadonlyArray<Tab> {
    return this.tabs
  }

  get activeTab(): Tab | null {
    return this.tabs[this.activeIndex] ?? null
  }

  get activeTabIndex(): number {
    return this.activeIndex
  }

  set bottomBarHeight(h: number) {
    this._bottomBarHeight = h
    for (const tab of this.tabs) {
      tab.splitPane.bottomBarHeight = h
    }
  }

  private getNextTabTitle(): string {
    const usedTitles = new Set(this.tabs.map(t => t.title))
    for (const word of NUMBER_WORDS) {
      if (!usedTitles.has(word)) {
        return word
      }
    }
    return `Tab ${this.tabs.length + 1}`
  }

  private computeSize(): { cols: number; rows: number } {
    const cols = Math.floor(this.app.screen.width / CELL_WIDTH)
    const rows = Math.floor((this.app.screen.height - this.tabBarHeight) / CELL_HEIGHT)
    return { cols: Math.max(cols, 10), rows: Math.max(rows, 5) }
  }

  createTab(layout: SplitLayout = 'single', cwd?: string): Tab | null {
    // Enforce max tabs limit
    if (this.tabs.length >= 10) {
      return null
    }
    const id = `tab-${this.nextId++}`
    const splitPane = new SplitPane(this.app, this.tabBarHeight, id)
    splitPane.bottomBarHeight = this._bottomBarHeight

    const tab: Tab = {
      id,
      title: this.getNextTabTitle(),
      state: 'idle-ready',
      hasBell: false,
      splitPane,
      layout,
      color: generateTabColor(),
      history: new TabHistory(),
    }

    // Record initial working directory as first history entry for replay
    if (cwd) {
      tab.history.addShell(`cd ${cwd}`)
    }

    // If no explicit cwd, capture the first OSC7 working directory report
    splitPane.onFirstCwd = (firstCwd: string) => {
      if (!cwd && tab.history.length === 0) {
        tab.history.addShell(`cd ${firstCwd}`)
      }
    }

    // Wire shell command capture to tab history (must be before setLayout which creates panes)
    splitPane.onShellCommand = (command: string) => {
      tab.history.addShell(command)
    }

    // Insert after current tab (Mac Terminal behavior), or append if no active tab
    const insertIndex = this.activeIndex >= 0 ? this.activeIndex + 1 : this.tabs.length
    this.tabs.splice(insertIndex, 0, tab)
    this.container.addChild(splitPane.container)

    // Initialize split layout (creates panes)
    splitPane.setLayout(layout, cwd)

    // Now setup state listeners (panes exist after setLayout)
    this.setupStateListeners(tab)
    this.ensureScoringActive()

    // Hide initially (will be shown by switchToTab)
    splitPane.container.visible = false

    // Switch to new tab (adjust activeIndex since we inserted before the switch)
    this.switchToTab(insertIndex)

    // Notify listeners that a new tab was created
    const event = new CustomEvent('tab-created', { detail: { tabId: id } })
    window.dispatchEvent(event)

    return tab
  }

  switchToTab(index: number) {
    if (index < 0 || index >= this.tabs.length) return
    // Hide current and mark as background (defers xterm writes)
    if (this.activeIndex >= 0 && this.activeIndex < this.tabs.length) {
      const oldTab = this.tabs[this.activeIndex]
      oldTab.splitPane.container.visible = false
      oldTab.splitPane.container.eventMode = 'none'
      oldTab.splitPane.setBackground()
    }
    this.activeIndex = index
    const tab = this.tabs[this.activeIndex]
    // Make visible, enable events, and flush accumulated data
    tab.splitPane.container.visible = true
    tab.splitPane.container.eventMode = 'static'
    tab.splitPane.setForeground()
    // Ensure the first pane is focused when switching to this tab
    tab.splitPane.focusFirstPane()
    // Notify scorer that this tab is now being viewed (decay + cooldown)
    this.attentionScorer.onTabViewed(tab.id)
  }

  nextTab() {
    if (this.tabs.length === 0) return
    const nextIndex = (this.activeIndex + 1) % this.tabs.length
    this.switchToTab(nextIndex)
  }

  previousTab() {
    if (this.tabs.length === 0) return
    const prevIndex = (this.activeIndex - 1 + this.tabs.length) % this.tabs.length
    this.switchToTab(prevIndex)
  }

  /**
   * Control-Tab: Smart tab switching based on current tab state.
   *
   * If current tab is 'idle-ready' or 'running' or 'idle-error':
   *   - Switch to lowest index tab with 'running-input' status
   *   - If none, switch to next tab with 'idle-ready' status
   *   - If none, switch to next tab with 'running' status
   *
   * If current tab is 'running-input':
   *   - Switch to next tab with 'running-input' status
   *   - If no other 'running-input' tab exists, do nothing
   */
  controlTab(): void {
    if (this.tabs.length <= 1) return

    const currentTab = this.tabs[this.activeIndex]
    const currentState = currentTab.state

    // Priority order for states
    const statePriority: TabState[] = ['running-input', 'idle-ready', 'running']

    if (currentState === 'running-input') {
      // Find next tab with 'running-input' status (cycling)
      for (let offset = 1; offset < this.tabs.length; offset++) {
        const idx = (this.activeIndex + offset) % this.tabs.length
        if (this.tabs[idx].state === 'running-input') {
          this.switchToTab(idx)
          return
        }
      }
      // No other 'running-input' tab found - do nothing
      return
    }

    // Current tab is 'idle-ready', 'running', or 'idle-error'
    // First, find lowest index tab with 'running-input'
    for (let i = 0; i < this.tabs.length; i++) {
      if (i !== this.activeIndex && this.tabs[i].state === 'running-input') {
        this.switchToTab(i)
        return
      }
    }

    // No 'running-input' tabs - find next 'idle-ready' tab
    for (let offset = 1; offset < this.tabs.length; offset++) {
      const idx = (this.activeIndex + offset) % this.tabs.length
      if (this.tabs[idx].state === 'idle-ready') {
        this.switchToTab(idx)
        return
      }
    }

    // No 'idle-ready' tabs - find next 'running' tab
    for (let offset = 1; offset < this.tabs.length; offset++) {
      const idx = (this.activeIndex + offset) % this.tabs.length
      if (this.tabs[idx].state === 'running') {
        this.switchToTab(idx)
        return
      }
    }

    // No tabs matching criteria found - do nothing
  }

  closeTab(index: number) {
    if (this.tabs.length <= 1) return // Don't close last tab
    if (index < 0 || index >= this.tabs.length) return

    const tab = this.tabs[index]

    // Check if this tab is already dying
    if (this.dyingTabs.has(tab.id)) return

    // Mark tab as dying to prevent double-close
    this.dyingTabs.add(tab.id)

    // Capture text content from all panes
    const textGrid: { char: string; x: number; y: number; fg: number; bg: number }[] = []
    const bounds = { x: 0, y: this.tabBarHeight, width: window.innerWidth, height: window.innerHeight - this.tabBarHeight }

    for (const pane of tab.splitPane.activePanes) {
      const paneContent = pane.engine.cellGrid.captureVisibleContent()
      // Adjust positions based on pane location
      const paneX = pane.container.x
      const paneY = pane.container.y
      for (const cell of paneContent) {
        textGrid.push({
          char: cell.char,
          x: cell.x + paneX,
          y: cell.y + paneY,
          fg: cell.fg,
          bg: cell.bg,
        })
      }
    }

    // Hide the tab content immediately but keep it alive for animation
    tab.splitPane.container.visible = false
    tab.splitPane.container.eventMode = 'none'

    // Start the death animation
    this.deathAnimation.start(textGrid, bounds, () => {
      // Animation complete - actually destroy the tab
      this.dyingTabs.delete(tab.id)
      this.attentionScorer.removeTab(tab.id)
      tab.splitPane.destroy()

      const actualIndex = this.tabs.findIndex(t => t.id === tab.id)
      if (actualIndex === -1) return // Already removed

      this.tabs.splice(actualIndex, 1)

      // Adjust active index if needed
      if (actualIndex < this.activeIndex) {
        this.activeIndex--
      } else if (this.activeIndex === actualIndex) {
        // Closed the active tab, switch to nearest tab
        if (this.activeIndex >= this.tabs.length) {
          this.activeIndex = this.tabs.length - 1
        }
        this.switchToTab(this.activeIndex)
      }

      // Notify listeners that a tab was closed
      const event = new CustomEvent('tab-closed', { detail: { index: actualIndex } })
      window.dispatchEvent(event)

      // Also trigger tab-state-change to refresh the tab bar
      const refreshEvent = new CustomEvent('tab-state-change', { detail: { tabId: tab.id, removed: true } })
      window.dispatchEvent(refreshEvent)
    })
  }

  renameTab(index: number, name: string): void {
    if (index < 0 || index >= this.tabs.length) return
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    this.tabs[index].title = trimmed
    const event = new CustomEvent('tab-state-change', { detail: { tabId: this.tabs[index].id } })
    window.dispatchEvent(event)
  }

  moveTab(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.tabs.length) return
    if (toIndex < 0 || toIndex >= this.tabs.length) return
    if (fromIndex === toIndex) return

    // Remove tab from old position
    const [tab] = this.tabs.splice(fromIndex, 1)
    // Insert at new position
    this.tabs.splice(toIndex, 0, tab)

    // Adjust active index if needed
    if (this.activeIndex === fromIndex) {
      // Moving the active tab
      this.activeIndex = toIndex
    } else if (fromIndex < this.activeIndex && toIndex >= this.activeIndex) {
      // Moved a tab from before active to after or at active
      this.activeIndex--
    } else if (fromIndex > this.activeIndex && toIndex <= this.activeIndex) {
      // Moved a tab from after active to before or at active
      this.activeIndex++
    }

    // Notify listeners
    const event = new CustomEvent('tab-state-change', { detail: { tabId: tab.id } })
    window.dispatchEvent(event)
  }

  closeActiveTab() {
    this.closeTab(this.activeIndex)
  }

  handleKeyDown(e: KeyboardEvent) {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.handleKeyDown(e)
    }
  }

  // Scrollback methods
  scrollUp(lines: number = 5): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollUp(lines)
    }
  }

  scrollDown(lines: number = 5): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollDown(lines)
    }
  }

  scrollToTop(): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollToTop()
    }
  }

  scrollToBottom(): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollToBottom()
    }
  }

  scrollToPrevPrompt(): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollToPrevPrompt()
    }
  }

  scrollToNextPrompt(): void {
    const tab = this.activeTab
    if (tab) {
      tab.splitPane.scrollToNextPrompt()
    }
  }

  handleResize() {
    for (const tab of this.tabs) {
      tab.splitPane.handleResize()
    }
  }

  // --- Attention-based tab switching ---
  // Scoring always runs. Button click = jump to highest-scoring tab.
  // Score bars always visible under tabs.
  private _velocityInterval: number | null = null
  private _scoringActive = false

  /** Whether scoring is active (always true after first tab is created) */
  get autoSwitchEnabled(): boolean {
    return this._scoringActive
  }

  /** Start background scoring (called once, tracks output velocity) */
  private ensureScoringActive(): void {
    if (this._scoringActive) return
    this._scoringActive = true
    this._velocityInterval = window.setInterval(() => this.attentionScorer.tickVelocity(), 1_000)
  }

  /** Jump to the tab that most needs attention. Returns true if switched. */
  jumpToMostImportant(): boolean {
    if (this.tabs.length <= 1) return false

    const candidates = this.attentionScorer.calculateScores()
      .filter(s => {
        const idx = this.tabs.findIndex(t => t.id === s.tabId)
        return idx >= 0 && idx !== this.activeIndex
      })

    const best = candidates[0]
    if (!best) {
      // No scored tabs — fall back to controlTab behavior
      this.controlTab()
      return true
    }

    const targetIndex = this.tabs.findIndex(t => t.id === best.tabId)
    if (targetIndex >= 0) {
      console.log(`[AutoSwitch] Jump → "${this.tabs[targetIndex].title}" — score: ${Math.round(best.score)}, reasons: ${best.reasons.join(', ')}`)
      this.switchToTab(targetIndex)
      window.dispatchEvent(new CustomEvent('tab-state-change', { detail: { tabId: best.tabId } }))
      return true
    }
    return false
  }

  /** Legacy toggle — now just jumps to most important tab */
  toggleAutoSwitch(): void {
    this.jumpToMostImportant()
  }

  update(dt: number) {
    for (let i = 0; i < this.tabs.length; i++) {
      if (i === this.activeIndex) {
        // Active tab gets full update (rendering + state machine)
        this.tabs[i].splitPane.update(dt)
      } else {
        // Background tabs: only tick state machine (no rendering)
        this.tabs[i].splitPane.updateStateMachineOnly(dt)
      }
    }
  }

  /**
   * Aggregate state from all panes in a tab to determine the tab's overall state.
   * Priority: running-input > running > idle-error > idle-ready
   */
  private aggregateTabState(tab: Tab): void {
    const panes = tab.splitPane.activePanes
    if (panes.length === 0) return

    // Collect all pane states and bell status
    const states = panes.map((p) => p.engine.stateMachine.state)
    const hasBell = panes.some((p) => p.engine.stateMachine.hasBell)

    // Priority-based aggregation
    let newState: TabState = 'idle-ready'

    if (states.some((s) => s === 'running-input')) {
      newState = 'running-input'
    } else if (states.some((s) => s === 'running')) {
      newState = 'running'
    } else if (states.some((s) => s === 'idle-error')) {
      newState = 'idle-error'
    } else if (states.every((s) => s === 'idle-ready')) {
      newState = 'idle-ready'
    }

    const stateChanged = tab.state !== newState
    const bellChanged = tab.hasBell !== hasBell

    if (stateChanged) {
      const previousState = tab.state
      tab.state = newState
      // Feed state change into attention scorer
      this.attentionScorer.onStateChange(tab.id, {
        previousState,
        newState,
        reason: 'Tab state aggregation',
      })
      // Track command results for error rate scoring
      if ((previousState === 'running' || previousState === 'running-input') &&
          (newState === 'idle-ready' || newState === 'idle-error')) {
        this.attentionScorer.recordCommandResult(tab.id, newState === 'idle-error')
      }
    }
    if (bellChanged) {
      tab.hasBell = hasBell
      if (hasBell) {
        this.attentionScorer.onBell(tab.id)
      } else {
        this.attentionScorer.clearBell(tab.id)
      }
    }

    if (stateChanged || bellChanged) {
      // Trigger tab bar refresh
      const event = new CustomEvent('tab-state-change', { detail: { tabId: tab.id, state: newState, hasBell } })
      window.dispatchEvent(event)
    }
  }

  /**
   * Setup state change listeners for a tab's panes.
   * Call this after setLayout when panes are created.
   */
  private setupStateListeners(tab: Tab): void {
    for (const pane of tab.splitPane.activePanes) {
      pane.engine.stateMachine.onStateChange(() => {
        this.aggregateTabState(tab)
      })
      // Wire output velocity tracking to attention scorer
      pane.engine.onOutput = (byteCount: number) => {
        this.attentionScorer.onOutput(tab.id, byteCount)
      }
    }
  }
}
