import { Container, Graphics, Text, TextStyle, Rectangle } from 'pixi.js'
import type { GitStatus } from '../../../../main/git/types'
import { filterStagedFiles } from './zoneFilters'
import { FileTile, TILE_HEIGHT } from '../components/FileTile'

const HEADER_HEIGHT = 52
const TILE_GAP = 2
const SCROLL_SPEED = 20
const COMMIT_AREA_HEIGHT = 72

type FileEventHandler = (path: string) => void
type CommitHandler = (message: string) => void

export class StagingZone extends Container {
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
  private unstageAllBtn: Container
  private commitInputBg: Graphics
  private commitInputText: Text
  private commitBtnBg: Graphics
  private commitBtnLabel: Text
  private commitBuffer = ''
  private _commitInputActive = false
  private onSelect?: FileEventHandler
  private onUnstage?: FileEventHandler
  private onUnstageAll?: () => void
  private onCommit?: CommitHandler
  private hasStagedFiles = false

  constructor(width: number, height: number) {
    super()
    this.zoneWidth = width
    this.zoneHeight = height

    this.bg = new Graphics()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x1a2e1a })
    this.addChild(this.bg)

    this.header = new Text({
      text: 'Ready to Commit (0)',
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

    // Scrollbar
    this.scrollbar = new Graphics()
    this.scrollbar.visible = false
    this.addChild(this.scrollbar)

    this.emptyText = new Text({
      text: 'Nothing staged',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0x666666 },
    })
    this.emptyText.x = 8
    this.emptyText.y = HEADER_HEIGHT + 8
    this.emptyText.visible = true
    this.addChild(this.emptyText)

    // "← Unstage All" button below header
    this.unstageAllBtn = new Container()
    this.unstageAllBtn.eventMode = 'static'
    this.unstageAllBtn.cursor = 'pointer'
    this.unstageAllBtn.visible = false
    const unstageAllBg = new Graphics()
    unstageAllBg.roundRect(0, 0, 86, 22, 4)
    unstageAllBg.fill({ color: 0xeab308, alpha: 0.7 })
    this.unstageAllBtn.addChild(unstageAllBg)
    const unstageAllLabel = new Text({
      text: '← Unstage All',
      style: { fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff },
    })
    unstageAllLabel.x = 6
    unstageAllLabel.y = 4
    this.unstageAllBtn.addChild(unstageAllLabel)
    this.unstageAllBtn.x = 8
    this.unstageAllBtn.y = 26
    this.unstageAllBtn.on('pointertap', () => this.onUnstageAll?.())
    this.addChild(this.unstageAllBtn)

    // Commit input background (drawn directly on this container at the bottom)
    this.commitInputBg = new Graphics()
    this.addChild(this.commitInputBg)

    this.commitInputText = new Text({
      text: 'Enter commit message...',
      style: new TextStyle({
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        fill: 0x666666,
      }),
    })
    this.addChild(this.commitInputText)

    // Commit button background and label (drawn directly)
    this.commitBtnBg = new Graphics()
    this.addChild(this.commitBtnBg)

    this.commitBtnLabel = new Text({
      text: 'Commit',
      style: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff, fontWeight: 'bold' },
    })
    this.addChild(this.commitBtnLabel)

    // Enable scroll events on the zone
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, width, height)
    this.on('wheel', (e: any) => this.onWheel(e))

    // Single pointertap handler on the zone — delegate by y position
    this.on('pointertap', (e: any) => this.onZoneTap(e))

    this.renderCommitArea()
  }

  private onZoneTap(e: any): void {
    if (!this.hasStagedFiles) return
    const local = e.getLocalPosition(this)
    const commitY = this.zoneHeight - COMMIT_AREA_HEIGHT

    // Check if tap is in commit input area (top 32px of commit area)
    if (local.y >= commitY && local.y < commitY + 32) {
      this._commitInputActive = true
      this.renderCommitArea()
      return
    }

    // Check if tap is on commit button area (y = commitY+38, height 24)
    if (local.y >= commitY + 38 && local.y < commitY + 62) {
      this.doCommit()
      return
    }
  }

  setHandlers(onSelect: FileEventHandler, onUnstage: FileEventHandler, onCommit: CommitHandler, onUnstageAll?: () => void): void {
    this.onSelect = onSelect
    this.onUnstage = onUnstage
    this.onCommit = onCommit
    this.onUnstageAll = onUnstageAll
  }

  update(status: GitStatus): void {
    const files = filterStagedFiles(status.files)
    this.hasStagedFiles = files.length > 0
    this.unstageAllBtn.visible = files.length > 0
    this.header.text = `Ready to Commit (${files.length})`

    this.tilesContainer.removeChildren()
    this.emptyText.visible = files.length === 0
    this.scrollOffset = 0

    const tileWidth = this.zoneWidth - 8

    files.forEach((file, i) => {
      const tile = new FileTile(file, tileWidth, file.index)
      tile.x = 4
      tile.y = i * (TILE_HEIGHT + TILE_GAP)
      tile.on('pointertap', () => this.onSelect?.(file.path))
      tile.on('dblclick', () => this.onUnstage?.(file.path))
      tile.addActionButton('←', 0xeab308, () => this.onUnstage?.(file.path))
      this.tilesContainer.addChild(tile)
    })

    this.contentHeight = files.length * (TILE_HEIGHT + TILE_GAP)
    this.updateScroll()
    this.renderCommitArea()
  }

  get canCommit(): boolean {
    return this.hasStagedFiles
  }

  resize(width: number, height: number): void {
    this.zoneWidth = width
    this.zoneHeight = height
    this.bg.clear()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x1a2e1a })
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
    this.renderCommitArea()
  }

  get commitInputActive(): boolean {
    return this._commitInputActive
  }

  deactivateCommitInput(): void {
    this._commitInputActive = false
    this.renderCommitArea()
  }

  handleCommitKey(e: KeyboardEvent): boolean {
    if (!this._commitInputActive) return false

    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      this._commitInputActive = false
      this.renderCommitArea()
      return true
    }

    if (e.key === 'Enter') {
      // Enter does nothing — use the Commit button instead
      return true
    }

    if (e.key === 'Backspace') {
      this.commitBuffer = this.commitBuffer.slice(0, -1)
      this.renderCommitArea()
      return true
    }

    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      this.commitBuffer = ''
      this.renderCommitArea()
      return true
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      this.commitBuffer += e.key
      this.renderCommitArea()
      return true
    }

    return true
  }

  private doCommit(): void {
    const msg = this.commitBuffer.trim()
    if (msg && this.onCommit) {
      this.onCommit(msg)
      this.commitBuffer = ''
      this._commitInputActive = false
      this.renderCommitArea()
    }
  }

  private renderCommitArea(): void {
    const show = this.hasStagedFiles
    this.commitInputBg.visible = show
    this.commitInputText.visible = show
    this.commitBtnBg.visible = show
    this.commitBtnLabel.visible = show
    if (!show) return

    const commitY = this.zoneHeight - COMMIT_AREA_HEIGHT
    const fullWidth = this.zoneWidth
    const btnWidth = fullWidth - 16

    // Input background
    this.commitInputBg.clear()
    this.commitInputBg.roundRect(4, commitY, fullWidth - 8, 32, 4)
    if (this._commitInputActive) {
      this.commitInputBg.fill({ color: 0x1a1a2e, alpha: 0.95 })
      this.commitInputBg.roundRect(4, commitY, fullWidth - 8, 32, 4)
      this.commitInputBg.stroke({ width: 1, color: 0x4488aa })
    } else {
      this.commitInputBg.fill({ color: 0x0d0d1a, alpha: 0.8 })
      this.commitInputBg.roundRect(4, commitY, fullWidth - 8, 32, 4)
      this.commitInputBg.stroke({ width: 1, color: 0x333344 })
    }

    // Input text
    this.commitInputText.x = 12
    this.commitInputText.y = commitY + 8
    if (this._commitInputActive || this.commitBuffer) {
      this.commitInputText.text = this.commitBuffer || ''
      this.commitInputText.style.fill = 0xffffff
    } else {
      this.commitInputText.text = 'Enter commit message...'
      this.commitInputText.style.fill = 0x666666
    }

    // Commit button
    const btnY = commitY + 38
    this.commitBtnBg.clear()
    this.commitBtnBg.roundRect(8, btnY, btnWidth, 24, 4)
    this.commitBtnBg.fill({ color: 0x22aa44, alpha: this.commitBuffer.trim() ? 1.0 : 0.3 })

    this.commitBtnLabel.x = 8 + btnWidth / 2 - 20
    this.commitBtnLabel.y = btnY + 5
    this.commitBtnLabel.alpha = this.commitBuffer.trim() ? 1.0 : 0.4
  }

  private onWheel(e: any): void {
    const delta = e.deltaY ?? 0
    this.scrollOffset += delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED
    this.updateScroll()
  }

  private updateScroll(): void {
    const commitReserve = this.hasStagedFiles ? COMMIT_AREA_HEIGHT : 0
    const viewableHeight = this.zoneHeight - HEADER_HEIGHT - commitReserve
    const maxScroll = Math.max(0, this.contentHeight - viewableHeight)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))
    this.tilesContainer.y = HEADER_HEIGHT - this.scrollOffset

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
    const commitReserve = this.hasStagedFiles ? COMMIT_AREA_HEIGHT : 0
    this.scrollMask.clear()
    this.scrollMask.rect(0, HEADER_HEIGHT, this.zoneWidth, this.zoneHeight - HEADER_HEIGHT - commitReserve)
    this.scrollMask.fill({ color: 0xffffff })
  }
}
