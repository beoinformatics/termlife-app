/**
 * ProductivityBar — Optional bottom bar hosting productivity widgets.
 *
 * Toggle with Ctrl+Shift+B. Sits at the bottom of the window.
 * Terminal grid resizes to accommodate it when visible.
 */

import { Container, Graphics } from 'pixi.js'
import { themeManager } from '../themes/ThemeManager'
import { PomodoroWidget } from './PomodoroWidget'
import { ClockWidget } from './ClockWidget'
import { FocusModeWidget } from './FocusModeWidget'

export const PRODUCTIVITY_BAR_HEIGHT = 28

export class ProductivityBar {
  readonly container: Container
  private bg: Graphics
  private separator: Graphics
  private _visible = false
  private screenWidth: number
  private screenHeight: number

  readonly pomodoro: PomodoroWidget
  readonly clock: ClockWidget
  readonly focusMode: FocusModeWidget

  constructor() {
    this.screenWidth = window.innerWidth
    this.screenHeight = window.innerHeight
    this.container = new Container()
    this.container.visible = false

    // Background
    this.bg = new Graphics()
    this.container.addChild(this.bg)

    // Top separator line
    this.separator = new Graphics()
    this.container.addChild(this.separator)

    // Widgets — laid out left to right with spacing
    const widgetH = PRODUCTIVITY_BAR_HEIGHT - 4 // 2px padding top/bottom
    const pomodoroW = 120
    const focusModeW = 110
    const clockW = 60

    this.pomodoro = new PomodoroWidget(pomodoroW, widgetH)
    this.focusMode = new FocusModeWidget(focusModeW, widgetH)
    this.clock = new ClockWidget(clockW, widgetH)

    this.container.addChild(this.pomodoro.container)
    this.container.addChild(this.focusMode.container)
    this.container.addChild(this.clock.container)

    this.layout()
  }

  get visible(): boolean {
    return this._visible
  }

  /** Returns bar height if visible, 0 if hidden */
  get activeHeight(): number {
    return this._visible ? PRODUCTIVITY_BAR_HEIGHT : 0
  }

  toggle(): void {
    this._visible = !this._visible
    this.container.visible = this._visible
    if (this._visible) {
      this.layout()
    }
  }

  show(): void {
    this._visible = true
    this.container.visible = true
    this.layout()
  }

  hide(): void {
    this._visible = false
    this.container.visible = false
  }

  update(dt: number): void {
    if (!this._visible) return
    this.pomodoro.update(dt)
    this.clock.update(dt)
  }

  handleResize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    if (this._visible) {
      this.layout()
    }
  }

  private layout(): void {
    const y = this.screenHeight - PRODUCTIVITY_BAR_HEIGHT
    this.container.y = y

    // Background
    const theme = themeManager.theme
    this.bg.clear()
    this.bg.rect(0, 0, this.screenWidth, PRODUCTIVITY_BAR_HEIGHT)
    this.bg.fill(theme.tabBarBg)

    // Top separator
    this.separator.clear()
    this.separator.moveTo(0, 0)
    this.separator.lineTo(this.screenWidth, 0)
    this.separator.stroke({ color: theme.separatorColor, width: 1 })

    // Position widgets: [Pomodoro] [FocusMode] ... [Clock]
    const padding = 8
    const widgetY = 2

    // Left-aligned widgets
    this.pomodoro.container.x = padding
    this.pomodoro.container.y = widgetY

    this.focusMode.container.x = padding + 128
    this.focusMode.container.y = widgetY

    // Right-aligned clock
    this.clock.container.x = this.screenWidth - 68 - padding
    this.clock.container.y = widgetY
  }

  refreshTheme(): void {
    this.pomodoro.refreshTheme()
    this.clock.refreshTheme()
    this.focusMode.refreshTheme()
    if (this._visible) {
      this.layout()
    }
  }
}
