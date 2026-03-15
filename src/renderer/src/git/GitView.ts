import { Container, Graphics, Text } from 'pixi.js'
import type { GitDiff } from '../../../main/git/types'
import type { GitDataService } from './GitDataService'
import { WorkingZone } from './zones/WorkingZone'
import { StagingZone } from './zones/StagingZone'
import { HistoryZone } from './zones/HistoryZone'
import { SafetyShieldView } from './components/SafetyShield'
import { DiffPanel } from './panels/DiffPanel'
import { assignLanes } from './panels/laneAssigner'

const ZONE_RATIOS = [0.5, 0.5, 0] // Working, Staging (History hidden)
const BOTTOM_BAR_HEIGHT = 32

export class GitView {
  readonly container: Container
  private _visible = false
  private dataService: GitDataService
  private workingZone: WorkingZone
  private stagingZone: StagingZone
  private historyZone: HistoryZone
  private safetyShield: SafetyShieldView
  private diffPanel: DiffPanel
  private errorText: Text
  private viewWidth = 800
  private viewHeight = 600
  private headerHeight = 68
  private selectedFilePath: string | null = null
  private selectedFileSource: 'working' | 'staging' | null = null

  constructor(dataService: GitDataService) {
    this.dataService = dataService
    this.container = new Container()
    this.container.visible = false
    this.container.sortableChildren = true

    // Initial zone sizes (will be updated on resize)
    const zw = this.viewWidth * ZONE_RATIOS[0]
    const hz = this.viewWidth * ZONE_RATIOS[2]
    const zh = this.viewHeight - this.headerHeight - BOTTOM_BAR_HEIGHT

    this.workingZone = new WorkingZone(zw, zh)
    this.workingZone.x = 0
    this.workingZone.y = 0
    this.container.addChild(this.workingZone)

    this.stagingZone = new StagingZone(zw, zh)
    this.stagingZone.x = zw
    this.stagingZone.y = 0
    this.container.addChild(this.stagingZone)

    // History zone (hidden — kept for internal wiring)
    this.historyZone = new HistoryZone(1, zh)
    this.historyZone.visible = false

    // Safety shield
    this.safetyShield = new SafetyShieldView()
    this.safetyShield.y = zh
    this.safetyShield.setPushHandler(() => this.onPush())
    this.container.addChild(this.safetyShield)

    // Diff panel (hidden with history)
    this.diffPanel = new DiffPanel(1, zh)
    this.diffPanel.visible = false

    // Error text (hidden by default)
    this.errorText = new Text({
      text: '',
      style: { fontSize: 16, fontFamily: 'JetBrains Mono, monospace', fill: 0xef4444 },
    })
    this.errorText.visible = false
    this.container.addChild(this.errorText)

    // Wire zone handlers
    this.workingZone.setHandlers(
      (path) => this.onFileSelect(path, 'working'),
      (path) => this.onStageFile(path),
      () => this.onStageAll(),
    )
    this.stagingZone.setHandlers(
      (path) => this.onFileSelect(path, 'staging'),
      (path) => this.onUnstageFile(path),
      (msg) => this.onCommit(msg),
      () => this.onUnstageAll(),
    )

    // Wire history zone commit selection → fetch diff → show FileMap
    this.historyZone.setOnCommitSelect((hash) => this.onCommitSelect(hash))

    // Listen for status changes
    this.dataService.on('status-changed', (status) => {
      if (this._visible && status) {
        this.workingZone.update(status)
        this.stagingZone.update(status)
        this.safetyShield.update(status)
      }
    })
  }

  get isVisible(): boolean {
    return this._visible
  }

  toggle(): void {
    if (this._visible) {
      this.hide()
    } else {
      this.show()
    }
  }

  show(): void {
    this._visible = true
    this.container.visible = true
    this.errorText.visible = false
    // Ensure layout is correct for current window size
    this.handleResize(window.innerWidth, window.innerHeight, this.headerHeight)
    this.fetchAndRender()
  }

  hide(): void {
    this._visible = false
    this.container.visible = false
  }

  handleResize(width: number, height: number, headerHeight: number): void {
    this.viewWidth = width
    this.viewHeight = height
    this.headerHeight = headerHeight

    const availHeight = height - headerHeight - BOTTOM_BAR_HEIGHT
    const wz = width * ZONE_RATIOS[0]
    const sz = width * ZONE_RATIOS[1]
    const hz = width * ZONE_RATIOS[2]

    this.container.y = headerHeight

    this.workingZone.resize(wz, availHeight)
    this.workingZone.x = 0

    this.stagingZone.resize(sz, availHeight)
    this.stagingZone.x = wz

    this.safetyShield.y = availHeight
    this.safetyShield.resize(width)
  }

  get commitInputActive(): boolean {
    return this.stagingZone.commitInputActive
  }

  handleCommitKey(e: KeyboardEvent): boolean {
    return this.stagingZone.handleCommitKey(e)
  }

  update(_dt: number): void {
    // Animation updates will go here in later phases
  }

  destroy(): void {
    this._visible = false
    this.container.visible = false
    this.container.removeChildren()
    this.dataService.off('status-changed', () => {})
  }

  private async fetchAndRender(): Promise<void> {
    try {
      const status = await this.dataService.getStatus()
      this.workingZone.update(status)
      this.stagingZone.update(status)
      this.safetyShield.update(status)
      this.errorText.visible = false
    } catch (err: any) {
      this.errorText.text = err?.message || 'Git error'
      this.errorText.visible = true
      this.errorText.x = this.viewWidth / 2 - 100
      this.errorText.y = this.viewHeight / 3
    }
  }

  /** Dismiss the diff panel and show history zone again */
  dismissDiff(): void {
    this.diffPanel.clear()
    this.diffPanel.visible = false
    this.historyZone.visible = true
    this.selectedFilePath = null
    this.selectedFileSource = null
  }

  private showDiffPanel(diff: GitDiff): void {
    this.diffPanel.showDiff(diff)
    this.diffPanel.visible = true
    this.historyZone.visible = false
  }

  private async onFileSelect(path: string, source: 'working' | 'staging'): Promise<void> {
    // Toggle off if clicking the same file
    if (this.selectedFilePath === path && this.selectedFileSource === source && this.diffPanel.visible) {
      this.dismissDiff()
      return
    }
    this.selectedFilePath = path
    this.selectedFileSource = source
    try {
      const options = source === 'staging'
        ? { staged: true, file: path }
        : { file: path }
      const diffs = await this.dataService.getDiff(options)
      const fileDiff = diffs.find(d => d.path === path) ?? diffs[0]
      if (fileDiff) {
        this.showDiffPanel(fileDiff)
      } else {
        this.dismissDiff()
      }
    } catch {
      this.dismissDiff()
    }
  }

  private async onCommitSelect(hash: string): Promise<void> {
    try {
      const diffs = await this.dataService.getDiff({ commit: hash })
      this.historyZone.showCommitDiff(diffs)
      // Show first file's diff in DiffPanel, overlaying history
      if (diffs.length > 0) {
        this.selectedFilePath = null
        this.selectedFileSource = null
        this.showDiffPanel(diffs[0])
      }
    } catch {
      // Silently ignore diff fetch errors for commit selection
    }
  }

  private async onStageFile(path: string): Promise<void> {
    await this.dataService.stage([path])
  }

  private async onStageAll(): Promise<void> {
    const status = await this.dataService.getStatus()
    const paths = status.files
      .filter(f => f.workingTree !== 'unmodified' && f.workingTree !== 'ignored')
      .map(f => f.path)
    if (paths.length > 0) {
      await this.dataService.stage(paths)
    }
  }

  private async onUnstageFile(path: string): Promise<void> {
    await this.dataService.unstage([path])
  }

  private async onUnstageAll(): Promise<void> {
    const status = await this.dataService.getStatus()
    const paths = status.files
      .filter(f => f.index !== 'unmodified' && f.index !== 'untracked' && f.index !== 'ignored')
      .map(f => f.path)
    if (paths.length > 0) {
      await this.dataService.unstage(paths)
    }
  }

  private async onCommit(message: string): Promise<void> {
    if (message.trim()) {
      await this.dataService.commit(message)
    }
  }

  private async onPush(): Promise<void> {
    try {
      await this.dataService.push()
    } catch (err: any) {
      this.errorText.text = err?.message || 'Push failed'
      this.errorText.visible = true
      this.errorText.x = this.viewWidth / 2 - 100
      this.errorText.y = this.viewHeight / 3
    }
  }
}
