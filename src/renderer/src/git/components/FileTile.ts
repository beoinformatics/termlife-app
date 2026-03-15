import { Container, Graphics, Text } from 'pixi.js'
import type { FileState, GitFileStatus } from '../../../../main/git/types'

const MAX_LABEL_LENGTH = 32

export function fileTileColor(state: FileState): number {
  switch (state) {
    case 'added':      return 0x22c55e
    case 'deleted':    return 0xef4444
    case 'modified':   return 0xeab308
    case 'conflicted': return 0xf97316
    case 'renamed':    return 0x3b82f6
    case 'copied':     return 0x3b82f6
    case 'untracked':  return 0x9ca3af
    default:           return 0x6b7280
  }
}

export function fileTileLabel(path: string): string {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  if (name.length > MAX_LABEL_LENGTH) {
    return name.slice(0, MAX_LABEL_LENGTH - 3) + '...'
  }
  return name
}

export const TILE_HEIGHT = 36
const TILE_PADDING = 4
const BORDER_WIDTH = 4

const ACTION_BTN_SIZE = 28
const ACTION_BTN_MARGIN = 4

export class FileTile extends Container {
  private bg: Graphics
  private border: Graphics
  private label: Text
  private actionBtn: Container | null = null
  readonly filePath: string
  readonly fileStatus: GitFileStatus

  constructor(file: GitFileStatus, width: number, relevantState: FileState) {
    super()
    this.filePath = file.path
    this.fileStatus = file
    this.eventMode = 'static'
    this.cursor = 'pointer'

    this.bg = new Graphics()
    this.bg.rect(0, 0, width, TILE_HEIGHT)
    this.bg.fill({ color: 0x1e1e1e })
    this.addChild(this.bg)

    this.border = new Graphics()
    this.border.rect(0, 0, BORDER_WIDTH, TILE_HEIGHT)
    this.border.fill(fileTileColor(relevantState))
    this.addChild(this.border)

    this.label = new Text({
      text: fileTileLabel(file.path),
      style: { fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fill: 0xe0e0e0 },
    })
    this.label.x = BORDER_WIDTH + TILE_PADDING
    this.label.y = (TILE_HEIGHT - 16) / 2
    this.addChild(this.label)
  }

  /**
   * Add a visible action button (e.g. "→" for stage, "←" for unstage).
   * The button emits the provided callback on click, stopping propagation
   * so the tile's own click handler is not triggered.
   */
  addActionButton(symbol: string, color: number, onClick: () => void): void {
    const btn = new Container()
    btn.eventMode = 'static'
    btn.cursor = 'pointer'

    const btnBg = new Graphics()
    btnBg.roundRect(0, 0, ACTION_BTN_SIZE, ACTION_BTN_SIZE, 4)
    btnBg.fill({ color, alpha: 0.8 })
    btn.addChild(btnBg)

    const btnLabel = new Text({
      text: symbol,
      style: { fontSize: 16, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff },
    })
    btnLabel.x = (ACTION_BTN_SIZE - 10) / 2
    btnLabel.y = (ACTION_BTN_SIZE - 18) / 2
    btn.addChild(btnLabel)

    // Position at right edge of tile
    const tileWidth = this.bg.width || 200
    btn.x = tileWidth - ACTION_BTN_SIZE - ACTION_BTN_MARGIN
    btn.y = (TILE_HEIGHT - ACTION_BTN_SIZE) / 2

    btn.on('pointertap', (e: any) => {
      e?.stopPropagation?.()
      onClick()
    })

    this.actionBtn = btn
    this.addChild(btn)
  }

  setWidth(width: number): void {
    this.bg.clear()
    this.bg.rect(0, 0, width, TILE_HEIGHT)
    this.bg.fill({ color: 0x1e1e1e })

    // Reposition action button if present
    if (this.actionBtn) {
      this.actionBtn.x = width - ACTION_BTN_SIZE - ACTION_BTN_MARGIN
    }
  }
}
