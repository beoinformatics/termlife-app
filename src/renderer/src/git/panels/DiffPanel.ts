import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { GitDiff, DiffLine, DiffHunk } from '../../../../main/git/types'

export type DiffDisplayMode = 'inline' | 'side-by-side'

export interface SideBySideRow {
  left: DiffLine | null
  right: DiffLine | null
}

const LINE_HEIGHT = 18
const GUTTER_WIDTH = 60
const HEADER_HEIGHT = 28
const SCROLL_SPEED = 20
const FONT = 'JetBrains Mono, monospace'
const FONT_SIZE = 12

export class DiffPanel extends Container {
  private panelWidth: number
  private panelHeight: number
  private _mode: DiffDisplayMode = 'inline'
  private currentDiff: GitDiff | null = null
  private linesContainer: Container
  private scrollMask: Graphics
  private headerText: Text
  private bg: Graphics
  private scrollOffset = 0
  private contentHeight = 0
  private renderedLineCount = 0
  private _sideBySideRows: SideBySideRow[] = []

  constructor(width: number, height: number) {
    super()
    this.panelWidth = width
    this.panelHeight = height

    this.bg = new Graphics()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x0d0d0d })
    this.addChild(this.bg)

    this.headerText = new Text({
      text: '',
      style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: 0xaaaaaa },
    })
    this.headerText.x = 8
    this.headerText.y = 6
    this.addChild(this.headerText)

    this.scrollMask = new Graphics()
    this.updateMask()
    this.addChild(this.scrollMask)

    this.linesContainer = new Container()
    this.linesContainer.y = HEADER_HEIGHT
    this.linesContainer.mask = this.scrollMask
    this.addChild(this.linesContainer)

    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, width, height)
    this.on('wheel', (e: any) => this.onWheel(e))
  }

  get mode(): DiffDisplayMode {
    return this._mode
  }

  setMode(mode: DiffDisplayMode): void {
    if (this._mode === mode) return
    this._mode = mode
    if (this.currentDiff) {
      this.render()
    }
  }

  showDiff(diff: GitDiff): void {
    this.currentDiff = diff
    this.scrollOffset = 0
    this.render()
  }

  clear(): void {
    this.currentDiff = null
    this.linesContainer.removeChildren()
    this.headerText.text = ''
    this.renderedLineCount = 0
    this._sideBySideRows = []
    this.contentHeight = 0
  }

  isEmpty(): boolean {
    return this.renderedLineCount === 0
  }

  getRenderedLineCount(): number {
    return this.renderedLineCount
  }

  getHeaderText(): string {
    return this.headerText.text
  }

  getSideBySideRows(): SideBySideRow[] {
    return this._sideBySideRows
  }

  resize(width: number, height: number): void {
    this.panelWidth = width
    this.panelHeight = height
    this.bg.clear()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x0d0d0d })
    this.hitArea = new Rectangle(0, 0, width, height)
    this.updateMask()
    if (this.currentDiff) this.render()
  }

  static lineColor(type: DiffLine['type']): number {
    switch (type) {
      case 'addition': return 0x22c55e
      case 'deletion': return 0xef4444
      case 'context':  return 0xcccccc
    }
  }

  static lineBgColor(type: DiffLine['type']): number {
    switch (type) {
      case 'addition': return 0x1a2e1a
      case 'deletion': return 0x2e1a1a
      case 'context':  return 0x000000
    }
  }

  private render(): void {
    this.linesContainer.removeChildren()
    this._sideBySideRows = []
    this.renderedLineCount = 0

    const diff = this.currentDiff
    if (!diff || diff.hunks.length === 0) {
      this.headerText.text = diff ? `${diff.path}  (no changes)` : ''
      this.contentHeight = 0
      return
    }

    // Header
    const statsStr = `+${diff.stats.additions} -${diff.stats.deletions}`
    this.headerText.text = `${diff.path}  ${statsStr}`

    if (this._mode === 'inline') {
      this.renderInline(diff)
    } else {
      this.renderSideBySide(diff)
    }

    this.contentHeight = this.renderedLineCount * LINE_HEIGHT
  }

  private renderInline(diff: GitDiff): void {
    let y = 0

    for (const hunk of diff.hunks) {
      // Hunk header
      this.addLineText(hunk.header, 0x6b7280, 0, y, 0x111111)
      y += LINE_HEIGHT
      this.renderedLineCount++

      for (const dl of hunk.lines) {
        const prefix = dl.type === 'addition' ? '+' : dl.type === 'deletion' ? '-' : ' '
        const oldNum = dl.oldLineNumber !== undefined ? String(dl.oldLineNumber).padStart(4) : '    '
        const newNum = dl.newLineNumber !== undefined ? String(dl.newLineNumber).padStart(4) : '    '
        const gutterStr = `${oldNum} ${newNum}`

        // Line background
        const lineBg = new Graphics()
        lineBg.rect(0, y, this.panelWidth, LINE_HEIGHT)
        lineBg.fill({ color: DiffPanel.lineBgColor(dl.type) })
        this.linesContainer.addChild(lineBg)

        // Gutter
        const gutter = new Text({
          text: gutterStr,
          style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: 0x555555 },
        })
        gutter.x = 4
        gutter.y = y + 1
        this.linesContainer.addChild(gutter)

        // Content
        const content = new Text({
          text: `${prefix}${dl.content}`,
          style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: DiffPanel.lineColor(dl.type) },
        })
        content.x = GUTTER_WIDTH + 4
        content.y = y + 1
        this.linesContainer.addChild(content)

        y += LINE_HEIGHT
        this.renderedLineCount++
      }
    }
  }

  private renderSideBySide(diff: GitDiff): void {
    let y = 0
    const halfWidth = (this.panelWidth - 4) / 2 // 4px divider

    for (const hunk of diff.hunks) {
      // Hunk header spans full width
      this.addLineText(hunk.header, 0x6b7280, 0, y, 0x111111)
      y += LINE_HEIGHT
      this.renderedLineCount++

      // Build paired rows
      const rows = this.pairLines(hunk.lines)
      this._sideBySideRows.push(...rows)

      for (const row of rows) {
        // Left side (old)
        if (row.left) {
          const bgColor = DiffPanel.lineBgColor(row.left.type === 'context' ? 'context' : 'deletion')
          const bg = new Graphics()
          bg.rect(0, y, halfWidth, LINE_HEIGHT)
          bg.fill({ color: bgColor })
          this.linesContainer.addChild(bg)

          const num = row.left.oldLineNumber !== undefined ? String(row.left.oldLineNumber).padStart(4) : '    '
          const gutter = new Text({
            text: num,
            style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: 0x555555 },
          })
          gutter.x = 4
          gutter.y = y + 1
          this.linesContainer.addChild(gutter)

          const text = new Text({
            text: row.left.content,
            style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: DiffPanel.lineColor(row.left.type === 'context' ? 'context' : 'deletion') },
          })
          text.x = 36
          text.y = y + 1
          this.linesContainer.addChild(text)
        }

        // Right side (new)
        const rightX = halfWidth + 4
        if (row.right) {
          const bgColor = DiffPanel.lineBgColor(row.right.type === 'context' ? 'context' : 'addition')
          const bg = new Graphics()
          bg.rect(rightX, y, halfWidth, LINE_HEIGHT)
          bg.fill({ color: bgColor })
          this.linesContainer.addChild(bg)

          const num = row.right.newLineNumber !== undefined ? String(row.right.newLineNumber).padStart(4) : '    '
          const gutter = new Text({
            text: num,
            style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: 0x555555 },
          })
          gutter.x = rightX + 4
          gutter.y = y + 1
          this.linesContainer.addChild(gutter)

          const text = new Text({
            text: row.right.content,
            style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: DiffPanel.lineColor(row.right.type === 'context' ? 'context' : 'addition') },
          })
          text.x = rightX + 36
          text.y = y + 1
          this.linesContainer.addChild(text)
        }

        y += LINE_HEIGHT
        this.renderedLineCount++
      }
    }
  }

  /** Pair deletions with additions for side-by-side display */
  private pairLines(lines: DiffLine[]): SideBySideRow[] {
    const rows: SideBySideRow[] = []
    const deletions: DiffLine[] = []
    const additions: DiffLine[] = []

    const flushPairs = (): void => {
      const max = Math.max(deletions.length, additions.length)
      for (let i = 0; i < max; i++) {
        rows.push({
          left: i < deletions.length ? deletions[i] : null,
          right: i < additions.length ? additions[i] : null,
        })
      }
      deletions.length = 0
      additions.length = 0
    }

    for (const dl of lines) {
      if (dl.type === 'context') {
        flushPairs()
        rows.push({ left: dl, right: dl })
      } else if (dl.type === 'deletion') {
        deletions.push(dl)
      } else {
        additions.push(dl)
      }
    }
    flushPairs()

    return rows
  }

  private addLineText(text: string, color: number, x: number, y: number, bgColor: number): void {
    const bg = new Graphics()
    bg.rect(x, y, this.panelWidth, LINE_HEIGHT)
    bg.fill({ color: bgColor })
    this.linesContainer.addChild(bg)

    const t = new Text({
      text,
      style: { fontSize: FONT_SIZE, fontFamily: FONT, fill: color },
    })
    t.x = x + 4
    t.y = y + 1
    this.linesContainer.addChild(t)
  }

  private onWheel(e: any): void {
    const delta = e.deltaY ?? 0
    this.scrollOffset += delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED
    this.updateScroll()
  }

  private updateScroll(): void {
    const viewable = this.panelHeight - HEADER_HEIGHT
    const maxScroll = Math.max(0, this.contentHeight - viewable)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))
    this.linesContainer.y = HEADER_HEIGHT - this.scrollOffset
  }

  private updateMask(): void {
    this.scrollMask.clear()
    this.scrollMask.rect(0, HEADER_HEIGHT, this.panelWidth, this.panelHeight - HEADER_HEIGHT)
    this.scrollMask.fill({ color: 0xffffff })
  }
}
