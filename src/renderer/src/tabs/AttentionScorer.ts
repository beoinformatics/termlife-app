import type { TerminalState, StateChangeEvent } from '../terminal/TerminalStateMachine'

/**
 * Score weights for attention signals.
 * Higher weight = higher priority for auto-switching.
 */
export interface ScoreWeights {
  runningInput: number
  idleError: number
  bell: number
  longCommandComplete: number
  outputBurst: number
  commandComplete: number
  highErrorRate: number
  inactivity: number
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  runningInput: 100,
  idleError: 80,
  bell: 70,
  longCommandComplete: 50,
  outputBurst: 40,
  commandComplete: 30,
  highErrorRate: 20,
  inactivity: 10,
}

export interface AttentionScore {
  tabId: string
  score: number
  reasons: string[]
  priority: 'low' | 'medium' | 'high' | 'critical'
}

interface TabAttention {
  /** Current accumulated attention score */
  score: number
  /** Individual signal contributions (for debugging/display) */
  signals: Map<string, number>
  /** Timestamp when this tab was last viewed (switched to) */
  lastViewedAt: number
  /** Terminal state for this tab */
  state: TerminalState
  /** Whether bell is active */
  hasBell: boolean
  /** Command start time (for measuring duration on completion) */
  commandStartTime: number
  /** Command count and error count for error rate */
  commandCount: number
  errorCount: number
  /** Output velocity tracking */
  outputBytes5s: number
  wasSilent: boolean
  lastBurstTime: number
}

export class AttentionScorer {
  private tabs = new Map<string, TabAttention>()
  private weights: ScoreWeights = { ...DEFAULT_WEIGHTS }
  private minimumThreshold = 20

  /** Get or create attention tracking for a tab */
  private getTab(tabId: string): TabAttention {
    let tab = this.tabs.get(tabId)
    if (!tab) {
      tab = {
        score: 0,
        signals: new Map(),
        lastViewedAt: Date.now(),
        state: 'idle-ready',
        hasBell: false,
        commandStartTime: 0,
        commandCount: 0,
        errorCount: 0,
        outputBytes5s: 0,
        wasSilent: true,
        lastBurstTime: 0,
      }
      this.tabs.set(tabId, tab)
    }
    return tab
  }

  /** Remove a tab from tracking */
  removeTab(tabId: string): void {
    this.tabs.delete(tabId)
  }

  /**
   * Event-driven: called when a tab's terminal state changes.
   * Immediately pushes score contributions based on the transition.
   */
  onStateChange(tabId: string, event: StateChangeEvent): void {
    const tab = this.getTab(tabId)
    const oldState = tab.state
    tab.state = event.newState

    // Clear signals that no longer apply
    if (event.newState !== 'running-input' && event.newState !== 'running-input-alert') {
      tab.signals.delete('runningInput')
    }
    if (event.newState !== 'idle-error') {
      tab.signals.delete('idleError')
    }

    // running-input: tab needs user input
    if (event.newState === 'running-input' || event.newState === 'running-input-alert') {
      tab.signals.set('runningInput', this.weights.runningInput)
    }

    // idle-error: command failed
    if (event.newState === 'idle-error') {
      tab.signals.set('idleError', this.weights.idleError)
    }

    // Command completed (running → idle-ready)
    if ((oldState === 'running' || oldState === 'running-input' || oldState === 'running-input-alert') &&
        event.newState === 'idle-ready') {
      const duration = tab.commandStartTime > 0 ? Date.now() - tab.commandStartTime : 0
      if (duration > 30_000) {
        tab.signals.set('longCommandComplete', this.weights.longCommandComplete)
      } else {
        tab.signals.set('commandComplete', this.weights.commandComplete)
      }
      tab.commandStartTime = 0
    }

    // Track command start
    if (event.newState === 'running' && (oldState === 'idle-ready' || oldState === 'idle-error')) {
      tab.commandStartTime = Date.now()
      // Clear completion signals from previous command
      tab.signals.delete('commandComplete')
      tab.signals.delete('longCommandComplete')
    }

    this.recalculate(tabId)
  }

  /** Called when bell is received on a tab */
  onBell(tabId: string): void {
    const tab = this.getTab(tabId)
    tab.hasBell = true
    tab.signals.set('bell', this.weights.bell)
    this.recalculate(tabId)
  }

  /** Called when bell is cleared (user interacted with tab) */
  clearBell(tabId: string): void {
    const tab = this.getTab(tabId)
    tab.hasBell = false
    tab.signals.delete('bell')
    this.recalculate(tabId)
  }

  /**
   * Called with PTY output data for output velocity tracking.
   * Tracks bytes received in a rolling 5s window.
   */
  onOutput(tabId: string, byteCount: number): void {
    const tab = this.getTab(tabId)
    tab.outputBytes5s += byteCount
  }

  /**
   * Called every ~1s to process output velocity windows.
   * Detects "burst after silence" pattern.
   */
  tickVelocity(): void {
    const now = Date.now()
    this.tabs.forEach((tab, tabId) => {
      if (tab.outputBytes5s > 256 && tab.wasSilent) {
        // Burst after silence detected
        tab.signals.set('outputBurst', this.weights.outputBurst)
        tab.lastBurstTime = now
        this.recalculate(tabId)
      } else if (tab.lastBurstTime > 0 && now - tab.lastBurstTime > 10_000) {
        // Clear burst signal after 10s
        tab.signals.delete('outputBurst')
        this.recalculate(tabId)
      }

      tab.wasSilent = tab.outputBytes5s < 10
      tab.outputBytes5s = 0
    })
  }

  /**
   * Called when a tab's error rate should be updated.
   */
  recordCommandResult(tabId: string, isError: boolean): void {
    const tab = this.getTab(tabId)
    tab.commandCount++
    if (isError) tab.errorCount++

    const errorRate = tab.commandCount > 0 ? tab.errorCount / tab.commandCount : 0
    if (errorRate > 0.3 && tab.commandCount >= 3) {
      tab.signals.set('highErrorRate', this.weights.highErrorRate)
    } else {
      tab.signals.delete('highErrorRate')
    }
    this.recalculate(tabId)
  }

  /**
   * Called when user switches to a tab — apply decay and record visit time.
   */
  onTabViewed(tabId: string): void {
    const tab = this.getTab(tabId)
    // Decay: halve all signal contributions
    tab.signals.forEach((value, key) => {
      const decayed = value * 0.5
      if (decayed < 5) {
        tab.signals.delete(key)
      } else {
        tab.signals.set(key, decayed)
      }
    })
    tab.lastViewedAt = Date.now()
    // Clear transient signals on view
    tab.signals.delete('commandComplete')
    tab.signals.delete('longCommandComplete')
    tab.signals.delete('outputBurst')
    this.recalculate(tabId)
  }

  /**
   * S-curve function: smooth transition from 0 to 1.
   * midpointMs = time at which output is 0.5
   * steepness = how sharp the transition is (higher = sharper)
   */
  private scurve(elapsedMs: number, midpointMs: number, steepness: number = 6): number {
    // Normalize time to [-1, 1] range around midpoint
    const x = (elapsedMs - midpointMs) / midpointMs
    return 1 / (1 + Math.exp(-steepness * x))
  }

  /** Recalculate a tab's total score from its signals + recency */
  private recalculate(tabId: string): void {
    const tab = this.tabs.get(tabId)
    if (!tab) return

    let total = 0
    tab.signals.forEach((value) => { total += value })

    const timeSinceViewed = Date.now() - tab.lastViewedAt

    // Recency multiplier: s-curve from 0→1 over ~3 minutes
    // At 0s: ~0.0 (just viewed, fully suppressed)
    // At 30s: ~0.12
    // At 90s (midpoint): 0.5
    // At 150s: ~0.88
    // At 180s+: ~1.0 (full score restored)
    const recencyMultiplier = this.scurve(timeSinceViewed, 90_000)

    // Inactivity bonus: grows with time since last viewed (s-curve, caps at weight max)
    // Kicks in after ~30s, reaches full bonus around 5 minutes
    const inactivityBonus = this.scurve(timeSinceViewed, 150_000) * this.weights.inactivity * 3

    tab.score = total * recencyMultiplier + inactivityBonus
  }

  /**
   * Get sorted scores for all tabs.
   * Recency is handled by the s-curve multiplier (no hard cooldown).
   */
  calculateScores(): AttentionScore[] {
    const scores: AttentionScore[] = []

    this.tabs.forEach((tab, tabId) => {
      // Refresh score with current time
      this.recalculate(tabId)

      if (tab.score < this.minimumThreshold) return

      const reasons: string[] = []
      tab.signals.forEach((value, key) => {
        if (value > 0) reasons.push(`${key}(${Math.round(value)})`)
      })

      // Show recency info
      const timeSinceViewed = Date.now() - tab.lastViewedAt
      if (timeSinceViewed < 180_000) {
        reasons.push(`recency(${Math.round(timeSinceViewed / 1000)}s)`)
      }

      let priority: AttentionScore['priority'] = 'low'
      if (tab.score >= 100) priority = 'critical'
      else if (tab.score >= 60) priority = 'high'
      else if (tab.score >= 30) priority = 'medium'

      scores.push({ tabId, score: tab.score, reasons, priority })
    })

    return scores.sort((a, b) => b.score - a.score)
  }

  /** Get the tab most needing attention (excluding cooldown tabs) */
  getMostNeedsAttention(): AttentionScore | null {
    return this.calculateScores()[0] ?? null
  }

  /** Get raw score for a specific tab (even if in cooldown) */
  getTabScore(tabId: string): number {
    const tab = this.tabs.get(tabId)
    if (!tab) return 0
    this.recalculate(tabId)
    return tab.score
  }

  /**
   * Determine optimal tick interval based on highest pending score.
   * Returns milliseconds.
   */
  getOptimalTickInterval(): number {
    const scores = this.calculateScores()
    if (scores.length === 0) return 0 // paused — nothing to do
    const highest = scores[0].score
    if (highest >= 100) return 2_000
    if (highest >= 60) return 5_000
    if (highest >= 30) return 10_000
    return 15_000
  }

  /** Update score weights */
  setWeights(weights: Partial<ScoreWeights>): void {
    Object.assign(this.weights, weights)
  }

  /** Update minimum threshold */
  setMinimumThreshold(threshold: number): void {
    this.minimumThreshold = threshold
  }
}
