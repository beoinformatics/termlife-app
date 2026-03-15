/**
 * PomodoroWidget — Focus timer with configurable work/break cycles.
 *
 * Displays as: "🍅 24:31" during work, "☕ 4:12" during break.
 * Left-click when idle: cycles through duration presets, then starts.
 * Left-click when running: pause/unpause.
 * Right-click: reset to idle.
 * Color shift: green → yellow → red as work time runs out.
 */

import { Container, Text, TextStyle, Graphics } from 'pixi.js'
import { themeManager } from '../themes/ThemeManager'

export type PomodoroPhase = 'idle' | 'work' | 'break'

interface DurationPreset {
  label: string
  work: number  // seconds
  break: number // seconds
}

const PRESETS: DurationPreset[] = [
  { label: '25m', work: 25 * 60, break: 5 * 60 },
  { label: '15m', work: 15 * 60, break: 3 * 60 },
  { label: '50m', work: 50 * 60, break: 10 * 60 },
  { label: '90m', work: 90 * 60, break: 15 * 60 },
]

export class PomodoroWidget {
  readonly container: Container
  private label: Text
  private bg: Graphics
  private _phase: PomodoroPhase = 'idle'
  private _remaining = 0 // seconds remaining
  private _elapsed = 0 // fractional seconds accumulator
  private _completedCycles = 0
  private _paused = false
  private _presetIndex = 0
  private _idleClickState: 'selecting' | 'ready' = 'selecting'
  private _selectionTimeout: ReturnType<typeof setTimeout> | null = null
  private width: number
  private height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.container = new Container()

    this.bg = new Graphics()
    this.container.addChild(this.bg)

    this.label = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 12,
        fill: themeManager.theme.foreground,
      }),
    })
    this.label.anchor.set(0.5, 0.5)
    this.label.x = width / 2
    this.label.y = height / 2
    this.container.addChild(this.label)

    // Left-click to start/pause/cycle
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.on('pointertap', (e) => {
      // PixiJS FederatedPointerEvent: button 2 = right-click
      if (e.button === 2) {
        this.reset()
      } else {
        this.handleClick()
      }
    })
    // Right-click to reset
    this.container.on('rightclick', () => {
      this.reset()
    })

    this.drawBg(0x333333)
    this.updateDisplay()
  }

  get phase(): PomodoroPhase {
    return this._phase
  }

  get remaining(): number {
    return this._remaining
  }

  get completedCycles(): number {
    return this._completedCycles
  }

  get paused(): boolean {
    return this._paused
  }

  get currentPreset(): DurationPreset {
    return PRESETS[this._presetIndex]
  }

  private drawBg(color: number): void {
    this.bg.clear()
    this.bg.roundRect(2, 2, this.width - 4, this.height - 4, 4)
    this.bg.fill({ color, alpha: 0.3 })
  }

  private handleClick(): void {
    if (this._phase === 'idle') {
      if (this._idleClickState === 'selecting') {
        // First click or subsequent clicks within timeout: cycle preset
        this._presetIndex = (this._presetIndex + 1) % PRESETS.length
        this.updateDisplay()

        // Reset the auto-start timeout
        if (this._selectionTimeout) clearTimeout(this._selectionTimeout)
        this._selectionTimeout = setTimeout(() => {
          // After 1.5s without clicking, start the timer
          if (this._phase === 'idle') {
            this.startWork()
          }
          this._selectionTimeout = null
        }, 1500)
      }
    } else if (this._paused) {
      this._paused = false
    } else {
      this._paused = true
    }
  }

  startWork(): void {
    if (this._selectionTimeout) {
      clearTimeout(this._selectionTimeout)
      this._selectionTimeout = null
    }
    this._phase = 'work'
    this._remaining = this.currentPreset.work
    this._elapsed = 0
    this._paused = false
    this._idleClickState = 'selecting'
  }

  startBreak(): void {
    this._phase = 'break'
    this._remaining = this.currentPreset.break
    this._elapsed = 0
    this._paused = false
  }

  reset(): void {
    if (this._selectionTimeout) {
      clearTimeout(this._selectionTimeout)
      this._selectionTimeout = null
    }
    this._phase = 'idle'
    this._remaining = 0
    this._elapsed = 0
    this._paused = false
    this._completedCycles = 0
    this._idleClickState = 'selecting'
    this.updateDisplay()
  }

  /** Called each frame with deltaTime (in PixiJS ticker units, ~1 = 1/60s) */
  update(dt: number): void {
    if (this._phase === 'idle' || this._paused) return

    this._elapsed += dt / 60 // Convert ticker units to seconds
    while (this._elapsed >= 1 && this._remaining > 0) {
      this._elapsed -= 1
      this._remaining--
    }

    if (this._remaining <= 0) {
      this.onPhaseComplete()
    }

    this.updateDisplay()
  }

  private onPhaseComplete(): void {
    if (this._phase === 'work') {
      this._completedCycles++
      this.startBreak()
      window.dispatchEvent(new CustomEvent('pomodoro:break', { detail: { cycles: this._completedCycles } }))
    } else if (this._phase === 'break') {
      this.startWork()
      window.dispatchEvent(new CustomEvent('pomodoro:work', { detail: { cycles: this._completedCycles } }))
    }
  }

  private updateDisplay(): void {
    const preset = this.currentPreset

    if (this._phase === 'idle') {
      this.label.text = `🍅 ${preset.label}`
      this.label.style.fill = themeManager.theme.foreground
      this.drawBg(0x333333)
      return
    }

    const mins = Math.floor(this._remaining / 60)
    const secs = this._remaining % 60
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`
    const pauseIndicator = this._paused ? ' ⏸' : ''
    const cycleStr = this._completedCycles > 0 ? ` #${this._completedCycles}` : ''

    if (this._phase === 'work') {
      this.label.text = `🍅 ${timeStr}${pauseIndicator}${cycleStr}`

      // Color shift: green → yellow → red as time runs out
      const ratio = this._remaining / preset.work
      if (ratio > 0.5) {
        this.label.style.fill = 0x44ff44 // green
        this.drawBg(0x224422)
      } else if (ratio > 0.2) {
        this.label.style.fill = 0xffaa00 // yellow
        this.drawBg(0x443300)
      } else {
        this.label.style.fill = 0xff4444 // red
        this.drawBg(0x442222)
      }
    } else {
      this.label.text = `☕ ${timeStr}${pauseIndicator}`
      this.label.style.fill = 0x44aaff // calm blue
      this.drawBg(0x222244)
    }
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    this.label.x = width / 2
    this.label.y = height / 2
    this.updateDisplay()
  }

  refreshTheme(): void {
    this.updateDisplay()
  }
}
