import { Container, Graphics, Rectangle } from 'pixi.js'
import type { GraphCommit } from '../../../../main/git/types'
import { CommitNode } from '../components/CommitNode'

export const LANE_WIDTH = 24
export const COMMIT_SPACING = 32
const PADDING_TOP = 8
const PADDING_LEFT = 16
const SCROLL_SPEED = 24

// Branch track colors (up to 8 lanes, cycles)
const LANE_COLORS = [
  0x3b82f6, // blue
  0x22c55e, // green
  0xeab308, // yellow
  0xf97316, // orange
  0xa855f7, // purple
  0xec4899, // pink
  0x06b6d4, // cyan
  0xef4444, // red
]

export class BranchGraph extends Container {
  private graphWidth: number
  private graphHeight: number
  private commits: GraphCommit[] = []
  private nodes: CommitNode[] = []
  private tracks: Graphics
  private content: Container
  private scrollMask: Graphics
  private scrollbar: Graphics
  private scrollOffset = 0
  private contentHeight = 0

  constructor(width: number, height: number) {
    super()
    this.graphWidth = width
    this.graphHeight = height

    // Mask for clipping
    this.scrollMask = new Graphics()
    this.updateMask()
    this.addChild(this.scrollMask)

    // Scrollable content container
    this.content = new Container()
    this.content.mask = this.scrollMask
    this.addChild(this.content)

    this.tracks = new Graphics()
    this.content.addChild(this.tracks)

    // Scrollbar
    this.scrollbar = new Graphics()
    this.scrollbar.visible = false
    this.addChild(this.scrollbar)

    // Enable scroll events
    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, width, height)
    this.on('wheel', (e: any) => this.onWheel(e))
  }

  update(commits: GraphCommit[], currentBranch: string): void {
    this.content.removeChildren()
    this.nodes = []
    this.commits = commits
    this.scrollOffset = 0

    if (commits.length === 0) {
      this.contentHeight = 0
      this.updateScroll()
      return
    }

    // Draw track lines
    this.tracks = new Graphics()
    this.content.addChild(this.tracks)

    // Build a map of hash → index for parent lookups
    const hashToIndex = new Map<string, number>()
    commits.forEach((c, i) => hashToIndex.set(c.hash, i))

    // Draw track connections
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]
      const cx = PADDING_LEFT + commit.column * LANE_WIDTH
      const cy = PADDING_TOP + i * COMMIT_SPACING

      for (const parentHash of commit.parents) {
        const pi = hashToIndex.get(parentHash)
        if (pi === undefined) continue

        const parent = commits[pi]
        const px = PADDING_LEFT + parent.column * LANE_WIDTH
        const py = PADDING_TOP + pi * COMMIT_SPACING

        const color = LANE_COLORS[commit.column % LANE_COLORS.length]
        this.tracks.setStrokeStyle({ width: 2, color })
        this.tracks.moveTo(cx, cy)

        if (commit.column === parent.column) {
          this.tracks.lineTo(px, py)
        } else {
          const midY = (cy + py) / 2
          this.tracks.quadraticCurveTo(cx, midY, px, py)
        }
        this.tracks.stroke()
      }
    }

    // Create commit nodes
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i]
      const node = new CommitNode(commit)
      node.x = PADDING_LEFT + commit.column * LANE_WIDTH
      node.y = PADDING_TOP + i * COMMIT_SPACING
      this.content.addChild(node)
      this.nodes.push(node)
    }

    this.contentHeight = PADDING_TOP + commits.length * COMMIT_SPACING
    this.updateScroll()
  }

  resize(width: number, height: number): void {
    this.graphWidth = width
    this.graphHeight = height
    this.hitArea = new Rectangle(0, 0, width, height)
    this.updateMask()
    this.updateScroll()
  }

  getCommitAtIndex(index: number): GraphCommit | undefined {
    return this.commits[index]
  }

  get commitCount(): number {
    return this.commits.length
  }

  private onWheel(e: any): void {
    const delta = e.deltaY ?? 0
    this.scrollOffset += delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED
    this.updateScroll()
  }

  private updateScroll(): void {
    const maxScroll = Math.max(0, this.contentHeight - this.graphHeight)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll))
    this.content.y = -this.scrollOffset

    if (this.contentHeight > this.graphHeight) {
      this.scrollbar.visible = true
      const barHeight = Math.max(20, (this.graphHeight / this.contentHeight) * this.graphHeight)
      const barY = maxScroll > 0
        ? (this.scrollOffset / maxScroll) * (this.graphHeight - barHeight)
        : 0
      this.scrollbar.clear()
      this.scrollbar.rect(this.graphWidth - 6, barY, 4, barHeight)
      this.scrollbar.fill({ color: 0x555555 })
    } else {
      this.scrollbar.visible = false
    }
  }

  private updateMask(): void {
    this.scrollMask.clear()
    this.scrollMask.rect(0, 0, this.graphWidth, this.graphHeight)
    this.scrollMask.fill({ color: 0xffffff })
  }
}
