/**
 * ClockWidget — Simple time display.
 *
 * Shows current time as "14:32" (24h) or with seconds toggle.
 */

import { Container, Text, TextStyle } from 'pixi.js'
import { themeManager } from '../themes/ThemeManager'

export class ClockWidget {
  readonly container: Container
  private label: Text
  private _lastMinute = -1
  private width: number
  private height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.container = new Container()

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

    this.updateDisplay()
  }

  update(_dt: number): void {
    const now = new Date()
    const minute = now.getMinutes()
    // Only update text when minute changes (performance)
    if (minute !== this._lastMinute) {
      this._lastMinute = minute
      this.updateDisplay()
    }
  }

  private updateDisplay(): void {
    const now = new Date()
    const h = now.getHours().toString().padStart(2, '0')
    const m = now.getMinutes().toString().padStart(2, '0')
    this.label.text = `${h}:${m}`
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
    this.label.x = width / 2
    this.label.y = height / 2
  }

  refreshTheme(): void {
    this.label.style.fill = themeManager.theme.foreground
  }
}
