import { Container, Graphics, Text } from 'pixi.js'
import type { GraphCommit } from '../../../../main/git/types'
import type { GitDiff } from '../../../../main/git/types'
import { BranchGraph } from '../panels/BranchGraph'
import { FileMapPanel, type TreemapInput } from '../panels/FileMap'
import { fileTileColor } from '../components/FileTile'
import { friendlyTime } from '../components/CommitNode'

const DETAIL_WIDTH_RATIO = 0.45
const HEADER_HEIGHT = 24
const DETAIL_TEXT_HEIGHT = 80
const FILEMAP_PADDING = 8

type CommitSelectHandler = (hash: string) => void

export class HistoryZone extends Container {
  readonly branchGraph: BranchGraph
  readonly detailPanel: Container
  private headerText: Text
  private detailText: Text
  private fileMap: FileMapPanel
  private zoneWidth: number
  private zoneHeight: number
  private commits: GraphCommit[] = []
  private _selectedIndex = -1
  private onCommitSelect?: CommitSelectHandler
  private _graphVisible = true

  private bg: Graphics

  constructor(width: number, height: number) {
    super()
    this.zoneWidth = width
    this.zoneHeight = height

    // Background
    this.bg = new Graphics()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x141428 })
    this.addChild(this.bg)

    // Header
    this.headerText = new Text({
      text: 'Saved Snapshots',
      style: { fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fill: 0xaaaaaa },
    })
    this.headerText.x = 4
    this.headerText.y = 4
    this.addChild(this.headerText)

    // Branch graph (left portion)
    const graphWidth = width * (1 - DETAIL_WIDTH_RATIO)
    const graphHeight = height - HEADER_HEIGHT
    this.branchGraph = new BranchGraph(graphWidth, graphHeight)
    this.branchGraph.y = HEADER_HEIGHT
    this.addChild(this.branchGraph)

    // Detail panel (right portion)
    const detailWidth = width * DETAIL_WIDTH_RATIO
    this.detailPanel = new Container()
    this.detailPanel.x = graphWidth
    this.detailPanel.y = HEADER_HEIGHT
    this.addChild(this.detailPanel)

    this.detailText = new Text({
      text: 'Click a snapshot to see details',
      style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: 0x888888 },
    })
    this.detailText.x = 8
    this.detailText.y = 8
    this.detailPanel.addChild(this.detailText)

    // FileMap below detail text
    const fmWidth = detailWidth - FILEMAP_PADDING * 2
    const fmHeight = graphHeight - DETAIL_TEXT_HEIGHT - FILEMAP_PADDING
    this.fileMap = new FileMapPanel(Math.max(fmWidth, 10), Math.max(fmHeight, 10))
    this.fileMap.x = FILEMAP_PADDING
    this.fileMap.y = DETAIL_TEXT_HEIGHT
    this.detailPanel.addChild(this.fileMap)
  }

  setOnCommitSelect(handler: CommitSelectHandler): void {
    this.onCommitSelect = handler
  }

  get graphVisible(): boolean {
    return this._graphVisible
  }

  toggleGraph(): void {
    this._graphVisible = !this._graphVisible
    this.branchGraph.visible = this._graphVisible
    this.relayout()
  }

  private relayout(): void {
    const graphWidth = this._graphVisible ? this.zoneWidth * (1 - DETAIL_WIDTH_RATIO) : 0
    const detailWidth = this.zoneWidth - graphWidth
    const graphHeight = this.zoneHeight - HEADER_HEIGHT

    if (this._graphVisible) {
      this.branchGraph.resize(graphWidth, graphHeight)
    }
    this.detailPanel.x = graphWidth
    const fmWidth = detailWidth - FILEMAP_PADDING * 2
    const fmHeight = graphHeight - DETAIL_TEXT_HEIGHT - FILEMAP_PADDING
    this.fileMap.resize(Math.max(fmWidth, 10), Math.max(fmHeight, 10))
  }

  update(commits: GraphCommit[], currentBranch: string): void {
    this.commits = commits
    this.branchGraph.update(commits, currentBranch)
    this._selectedIndex = -1
    this.detailText.text = commits.length > 0 ? 'Click a snapshot to see details' : 'No snapshots yet'
    this.fileMap.update([])
  }

  selectCommit(index: number): void {
    const commit = this.branchGraph.getCommitAtIndex(index)
    if (!commit) return

    this._selectedIndex = index
    const timeAgo = friendlyTime(commit.date)
    this.detailText.text = [
      commit.message,
      `Saved ${timeAgo} by ${commit.author}`,
      commit.refs.length > 0 ? `On: ${commit.refs.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    // Request diff data from parent
    this.onCommitSelect?.(commit.hash)
  }

  /** Called by parent after fetching diff for the selected commit */
  showCommitDiff(diffs: GitDiff[]): void {
    const files: TreemapInput[] = diffs.map(d => ({
      path: d.path,
      weight: Math.max(1, d.stats.additions + d.stats.deletions),
      color: fileTileColor(d.status),
    }))
    this.fileMap.update(files)
  }

  get selectedCommitHash(): string | null {
    if (this._selectedIndex < 0) return null
    return this.commits[this._selectedIndex]?.hash ?? null
  }

  resize(width: number, height: number): void {
    this.zoneWidth = width
    this.zoneHeight = height
    this.bg.clear()
    this.bg.rect(0, 0, width, height)
    this.bg.fill({ color: 0x141428 })
    this.branchGraph.y = HEADER_HEIGHT
    this.detailPanel.y = HEADER_HEIGHT
    this.relayout()
  }
}
