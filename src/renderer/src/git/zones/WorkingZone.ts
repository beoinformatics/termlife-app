import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { GitStatus } from '../../../../main/git/types'
import { filterWorkingFiles } from './zoneFilters'
import { FileTile, TILE_HEIGHT } from '../components/FileTile'

const HEADER_HEIGHT = 52
const TILE_GAP = 2
const SCROLL_SPEED = 20

type FileEventHandler = (path: string) => void

export class WorkingZone extends Container {
  private header: Text
  private tilesContainer: Container
  private scrollMask: Graphics
  private emptyText: Text
  private bg: Graphics
  private scrollbar: Graphics
  private zoneWidth: number
  private zoneHeight: number
  private scrollOffset = 0
  private contentHeight = 0
  private stageAllBtn: Container
  private onSelect?: FileEventHandler
  private onStage?: FileEventHandler
  private onStageAll?: () => void

  constructor(width: number, height: number) {
    super()
    this.zoneWidth = width
    this.zoneHeight = height

    this.bg = new Graphics()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x1a1a2e })
    this.addChild(this.bg)

    this.header = new Text({
      text: 'Your Changes (0)',
      style: { fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff, fontWeight: 'bold' },
    })
    this.header.x = 8
    this.header.y = 4
    this.addChild(this.header)

    // Scrollable area with mask
    this.scrollMask = new Graphics()
    this.updateMask()
    this.addChild(this.scrollMask)

    this.tilesContainer = new Container()
    this.tilesContainer.y = HEADER_HEIGHT
    this.tilesContainer.mask = this.scrollMask
    this.addChild(this.tilesContainer)

    // Scrollbar track
    this.scrollbar = new Graphics()
    this.scrollbar.visible = false
    this.addChild(this.scrollbar)

    this.emptyText = new Text({
      text: 'No changes',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0x666666 },
    })
    this.emptyText.x = 8
    this.emptyText.y = HEADER_HEIGHT + 8
    this.emptyText.visible = true
    this.addChild(this.emptyText)

    // "Stage All →" button below header
    this.stageAllBtn = new Container()
    this.stageAllBtn.eventMode = 'static'
    this.stageAllBtn.cursor = 'pointer'
    this.stageAllBtn.visible = false
    const stageAllBg = new Graphics()
    stageAllBg.roundRect(0, 0, 72, 22, 4)
    stageAllBg.fill({ color: 0x22c55e, alpha: 0.7 })
    this.stageAllBtn.addChild(stageAllBg)
    const stageAllLabel = new Text({
      text: 'Stage All →',
      style: { fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff },
    })
    stageAllLabel.x = 6
    stageAllLabel.y = 4
    this.stageAllBtn.addChild(stageAllLabel)
    this.stageAllBtn.x = 8
    this.stageAllBtn.y = 26
    this.stageAllBtn.on('pointertap', () => this.onStageAll?.())
    this.addChild(this.stageAllBtn)

    // Enable scroll events
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, width, height)
    this.on('wheel', (e: any) => this.onWheel(e))
  }

  setHandlers(onSelect: FileEventHandler, onStage: FileEventHandler, onStageAll?: () => void): void {
    this.onSelect = onSelect
    this.onStage = onStage
    this.onStageAll = onStageAll
  }

  update(status: GitStatus): void {
    const files = filterWorkingFiles(status.files)
    this.header.text = `Your Changes (${files.length})`
    this.stageAllBtn.visible = files.length > 0

    this.tilesContainer.removeChildren()
    this.emptyText.visible = files.length === 0
    this.scrollOffset = 0

    const tileWidth = this.zoneWidth - 8

    files.forEach((file, i) => {
      const tile = new FileTile(file, tileWidth, file.workingTree)
      tile.x = 4
      tile.y = i * (TILE_HEIGHT + TILE_GAP)
      tile.on('pointertap', () => this.onSelect?.(file.path))
      tile.on('dblclick', () => this.onStage?.(file.path))
      // Visible stage button (→) on each tile
      tile.addActionButton('→', 0x22c55e, () => this.onStage?.(file.path))
      this.tilesContainer.addChild(tile)
    })

    this.contentHeight = files.length * (TILE_HEIGHT + TILE_GAP)
    this.updateScroll()
  }

  resize(width: number, height: number): void {
    this.zoneWidth = width
    this.zoneHeight = height
    this.bg.clear()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x1a1a2e })
    this.hitArea = new Rectangle(0, 0, width, height)
    // Update existing tile widths
    const tileWidth = width - 8
    for (const child of this.tilesContainer.children) {
      if (child instanceof FileTile) {
        child.setWidth(tileWidth)
      }
    }
    this.updateMask()
    this.updateScroll()
  }

  private onWheel(e: any): void {
    const delta = e.deltaY ?? 0
    this.scrollOffset += delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED
    this.updateScroll()
  }

  private updateScroll(): void {
    const viewableHeight = this.zoneHeight - HEADER_HEIGHT
    const maxScroll = Math.max(0, this.contentHeight - viewableHeight)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))
    this.tilesContainer.y = HEADER_HEIGHT - this.scrollOffset

    // Update scrollbar
    if (this.contentHeight > viewableHeight) {
      this.scrollbar.visible = true
      const barHeight = Math.max(20, (viewableHeight / this.contentHeight) * viewableHeight)
      const barY = HEADER_HEIGHT + (this.scrollOffset / maxScroll) * (viewableHeight - barHeight)
      this.scrollbar.clear()
      this.scrollbar.rect(this.zoneWidth - 6, barY, 4, barHeight)
      this.scrollbar.fill({ color: 0x555555 })
    } else {
      this.scrollbar.visible = false
    }
  }

  private updateMask(): void {
    this.scrollMask.clear()
    this.scrollMask.rect(0, HEADER_HEIGHT, this.zoneWidth, this.zoneHeight - HEADER_HEIGHT)
    this.scrollMask.fill({ color: 0xffffff })
  }
}
