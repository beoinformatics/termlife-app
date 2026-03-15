import { Container, Graphics, Text, Rectangle } from 'pixi.js'
import type { GitStatus } from '../../../../main/git/types'

export type ShieldState = 'clean' | 'dirty' | 'detached' | 'merging' | 'rebasing'

export function shieldState(status: GitStatus): ShieldState {
  if (status.merging) return 'merging'
  if (status.rebasing) return 'rebasing'
  if (status.detached) return 'detached'
  if (status.files.length === 0) return 'clean'
  return 'dirty'
}

export function shieldColor(state: ShieldState): number {
  switch (state) {
    case 'clean': return 0x22c55e
    case 'dirty': return 0xeab308
    case 'detached': return 0xf97316
    case 'merging': return 0xef4444
    case 'rebasing': return 0xef4444
  }
}

export function shieldLabel(state: ShieldState): string {
  switch (state) {
    case 'clean': return 'All saved'
    case 'dirty': return 'Unsaved work'
    case 'detached': return 'Detached HEAD'
    case 'merging': return 'Merge in progress'
    case 'rebasing': return 'Rebase in progress'
  }
}

export function shieldActions(state: ShieldState): string[] {
  switch (state) {
    case 'clean': return []
    case 'dirty': return []
    case 'detached': return ['Create Branch']
    case 'merging': return ['Abort Merge']
    case 'rebasing': return ['Abort Rebase']
  }
}

const SHIELD_HEIGHT = 32
const SHIELD_PADDING = 10

export class SafetyShieldView extends Container {
  private bg: Graphics
  private stateLabel: Text
  private dot: Graphics
  private branchLabel: Text
  private aheadLabel: Text
  private pushBtn: Container
  private pushBtnBg: Graphics
  private shieldWidth = 800
  private onPush?: () => void

  constructor() {
    super()

    // Make shield interactive so it captures events above zones
    this.eventMode = 'static'
    this.zIndex = 20

    this.bg = new Graphics()
    this.addChild(this.bg)

    // Left: status dot + state
    this.dot = new Graphics()
    this.addChild(this.dot)

    this.stateLabel = new Text({
      text: 'All saved',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0xcccccc },
    })
    this.stateLabel.x = SHIELD_PADDING + 16
    this.stateLabel.y = (SHIELD_HEIGHT - 14) / 2
    this.addChild(this.stateLabel)

    // Middle: branch name
    this.branchLabel = new Text({
      text: '',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0xaaaaee },
    })
    this.branchLabel.y = (SHIELD_HEIGHT - 14) / 2
    this.addChild(this.branchLabel)

    // Right: ahead/behind count + push button
    this.aheadLabel = new Text({
      text: '',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0xcccccc },
    })
    this.aheadLabel.y = (SHIELD_HEIGHT - 14) / 2
    this.addChild(this.aheadLabel)

    this.pushBtn = new Container()
    this.pushBtn.eventMode = 'static'
    this.pushBtn.cursor = 'pointer'
    this.pushBtn.visible = false
    this.pushBtnBg = new Graphics()
    this.pushBtn.addChild(this.pushBtnBg)
    const pushLabel = new Text({
      text: 'Push ↑',
      style: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff, fontWeight: 'bold' },
    })
    pushLabel.x = 8
    pushLabel.y = 4
    this.pushBtn.addChild(pushLabel)
    this.pushBtn.y = 4
    this.pushBtn.on('pointertap', (e: any) => {
      e?.stopPropagation?.()
      this.onPush?.()
    })
    this.addChild(this.pushBtn)
  }

  setPushHandler(handler: () => void): void {
    this.onPush = handler
  }

  resize(width: number): void {
    this.shieldWidth = width
    this.bg.clear()
    this.bg.rect(0, 0, width, SHIELD_HEIGHT)
    this.bg.fill({ color: 0x181828 })
    // Top border line
    this.bg.rect(0, 0, width, 1)
    this.bg.fill({ color: 0x333355 })
    this.hitArea = new Rectangle(0, 0, width, SHIELD_HEIGHT)
    this.updatePositions()
  }

  private updatePositions(): void {
    // Dot
    this.dot.clear()
    this.dot.circle(SHIELD_PADDING + 5, SHIELD_HEIGHT / 2, 5)
    this.dot.fill(0x22c55e) // will be updated in update()

    // Branch label centered
    this.branchLabel.x = (this.shieldWidth - this.branchLabel.width) / 2

    // Ahead label + push button right-aligned
    const pushBtnWidth = 64
    const pushWidth = this.pushBtn.visible ? pushBtnWidth + 8 : 0
    this.aheadLabel.x = this.shieldWidth - this.aheadLabel.width - SHIELD_PADDING - pushWidth
    this.pushBtn.x = this.shieldWidth - pushBtnWidth - SHIELD_PADDING

    this.pushBtnBg.clear()
    this.pushBtnBg.roundRect(0, 0, pushBtnWidth, 24, 4)
    this.pushBtnBg.fill({ color: 0x2266aa })
  }

  update(status: GitStatus): void {
    const state = shieldState(status)
    const color = shieldColor(state)

    this.dot.clear()
    this.dot.circle(SHIELD_PADDING + 5, SHIELD_HEIGHT / 2, 5)
    this.dot.fill(color)

    this.stateLabel.text = shieldLabel(state)
    this.branchLabel.text = status.branch

    const parts: string[] = []
    if (status.ahead > 0) parts.push(`↑${status.ahead}`)
    if (status.behind > 0) parts.push(`↓${status.behind}`)
    this.aheadLabel.text = parts.join(' ')

    this.pushBtn.visible = status.ahead > 0
    this.updatePositions()
  }
}
