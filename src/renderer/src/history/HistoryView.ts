import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { HistoryEntry } from './TabHistory'

export class HistoryView {
  readonly container: Container
  private bg: Graphics
  private entries: HistoryEntry[] = []
  private _visible = false
  private scrollOffset = 0
  private contentContainer: Container
  private entryTexts: Container[] = []

  private readonly LINE_HEIGHT = 20
  private readonly PADDING = 12
  private readonly TIMESTAMP_WIDTH = 80

  private width = 0
  private height = 0

  constructor() {
    this.container = new Container()
    this.container.visible = false
    this.container.zIndex = 500

    this.bg = new Graphics()
    this.container.addChild(this.bg)

    this.contentContainer = new Container()
    this.container.addChild(this.contentContainer)
  }

  get visible(): boolean {
    return this._visible
  }

  show(entries: readonly HistoryEntry[]): void {
    this._visible = true
    this.container.visible = true
    this.entries = [...entries]
    this.scrollOffset = 0
    this.render()
  }

  hide(): void {
    this._visible = false
    this.container.visible = false
    this.clearEntries()
  }

  toggle(entries: readonly HistoryEntry[]): void {
    if (this._visible) this.hide()
    else this.show(entries)
  }

  handleResize(width: number, height: number, offsetY: number): void {
    this.width = width
    this.height = height
    this.container.y = offsetY
    if (this._visible) this.render()
  }

  // Mouse wheel scrolling
  handleWheel(deltaY: number): void {
    if (!this._visible) return
    const maxScroll = Math.max(
      0,
      this.entries.length * this.LINE_HEIGHT - this.height + this.PADDING * 2
    )
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + deltaY))
    this.render()
  }

  // Copy all history as replay-format text
  copyAll(): string {
    const lines: string[] = [
      '# TermLife session replay',
      `# Saved: ${new Date().toISOString()}`,
      '',
    ]
    for (const entry of this.entries) {
      lines.push(entry.command)
    }
    return lines.join('\n')
  }

  private clearEntries(): void {
    for (const item of this.entryTexts) {
      item.destroy({ children: true })
    }
    this.entryTexts = []
    this.contentContainer.removeChildren()
  }

  private render(): void {
    this.clearEntries()

    // Background
    this.bg.clear()
    this.bg.rect(0, 0, this.width, this.height)
    this.bg.fill({ color: 0x1a1a2e, alpha: 0.95 })

    // Title bar
    const titleBg = new Graphics()
    titleBg.rect(0, 0, this.width, 30)
    titleBg.fill({ color: 0x16213e })
    this.contentContainer.addChild(titleBg)
    this.entryTexts.push(titleBg as unknown as Container)

    const title = new Text({
      text: `History (${this.entries.length} entries)`,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 13,
        fill: 0xaaaaaa,
        fontWeight: 'bold',
      }),
    })
    title.x = this.PADDING
    title.y = 6
    this.contentContainer.addChild(title)
    this.entryTexts.push(title as unknown as Container)

    // "Copy All" button
    const copyBtn = new Text({
      text: '[Copy All]',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 12,
        fill: 0x6699cc,
      }),
    })
    copyBtn.x = this.width - this.PADDING - copyBtn.width
    copyBtn.y = 7
    copyBtn.eventMode = 'static'
    copyBtn.cursor = 'pointer'
    copyBtn.on('pointertap', () => {
      const text = this.copyAll()
      navigator.clipboard.writeText(text)
    })
    copyBtn.on('pointerover', () => {
      copyBtn.style.fill = 0x99ccff
    })
    copyBtn.on('pointerout', () => {
      copyBtn.style.fill = 0x6699cc
    })
    this.contentContainer.addChild(copyBtn)
    this.entryTexts.push(copyBtn as unknown as Container)

    // Entries
    const startY = 36
    const visibleStart = Math.floor(this.scrollOffset / this.LINE_HEIGHT)
    const visibleCount = Math.ceil(this.height / this.LINE_HEIGHT) + 1

    for (
      let i = visibleStart;
      i < Math.min(this.entries.length, visibleStart + visibleCount);
      i++
    ) {
      const entry = this.entries[i]
      const y = startY + i * this.LINE_HEIGHT - this.scrollOffset

      if (y < startY - this.LINE_HEIGHT || y > this.height) continue

      const row = new Container()

      // Timestamp
      const time = new Date(entry.timestamp)
      const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`

      const timeText = new Text({
        text: timeStr,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 12,
          fill: 0x666666,
        }),
      })
      timeText.x = this.PADDING
      timeText.y = y
      row.addChild(timeText)

      // Command text
      const isApp = entry.type === 'app'
      const cmdText = new Text({
        text: entry.command,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 12,
          fill: isApp ? 0x7799bb : 0xcccccc,
          fontStyle: isApp ? 'italic' : 'normal',
        }),
      })
      cmdText.x = this.PADDING + this.TIMESTAMP_WIDTH
      cmdText.y = y
      row.addChild(cmdText)

      this.contentContainer.addChild(row)
      this.entryTexts.push(row)
    }

    // Scrollbar indicator
    if (this.entries.length * this.LINE_HEIGHT > this.height) {
      const totalHeight = this.entries.length * this.LINE_HEIGHT
      const viewRatio = this.height / totalHeight
      const barHeight = Math.max(20, this.height * viewRatio)
      const barY = (this.scrollOffset / totalHeight) * this.height

      const scrollbar = new Graphics()
      scrollbar.rect(this.width - 6, startY + barY, 4, barHeight)
      scrollbar.fill({ color: 0x555555, alpha: 0.5 })
      this.contentContainer.addChild(scrollbar)
      this.entryTexts.push(scrollbar as unknown as Container)
    }
  }
}
