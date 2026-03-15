/**
 * FocusModeWidget — Shows current focus context.
 *
 * Displays a short label like "Deep Work" or "Admin" that you set
 * to remind yourself what you're supposed to be doing.
 */

import { Container, Text, TextStyle, Graphics } from 'pixi.js'
import { themeManager } from '../themes/ThemeManager'

const FOCUS_MODES = ['Deep Work', 'Admin', 'Review', 'Learning', 'Planning'] as const
export type FocusMode = (typeof FOCUS_MODES)[number]

const MODE_COLORS: Record<FocusMode, number> = {
  'Deep Work': 0x44ff44,
  'Admin': 0xffaa00,
  'Review': 0x44aaff,
  'Learning': 0xaa44ff,
  'Planning': 0xff44aa,
}

export class FocusModeWidget {
  readonly container: Container
  private label: Text
  private bg: Graphics
  private _mode: FocusMode = 'Deep Work'
  private _modeIndex = 0
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

    // Click to cycle modes
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.on('pointertap', () => this.cycleMode())

    this.updateDisplay()
  }

  get mode(): FocusMode {
    return this._mode
  }

  setMode(mode: FocusMode): void {
    this._mode = mode
    this._modeIndex = FOCUS_MODES.indexOf(mode)
    this.updateDisplay()
  }

  private cycleMode(): void {
    this._modeIndex = (this._modeIndex + 1) % FOCUS_MODES.length
    this._mode = FOCUS_MODES[this._modeIndex]
    this.updateDisplay()
    window.dispatchEvent(new CustomEvent('focus-mode:changed', { detail: { mode: this._mode } }))
  }

  private updateDisplay(): void {
    const color = MODE_COLORS[this._mode]
    this.label.text = `◉ ${this._mode}`
    this.label.style.fill = color

    this.bg.clear()
    this.bg.roundRect(2, 2, this.width - 4, this.height - 4, 4)
    this.bg.fill({ color, alpha: 0.15 })
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
