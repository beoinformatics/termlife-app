import { Container, Graphics, Text } from 'pixi.js'
import type { GitFileStatus } from '../../../../main/git/types'

export interface PreviewAction {
  type: 'merge' | 'checkout' | 'rebase'
  label: string
  files: GitFileStatus[]
}

const CONFLICT_COLOR = 0xf97316
const ADDED_COLOR = 0x22c55e
const DELETED_COLOR = 0xef4444
const MODIFIED_COLOR = 0xeab308
const DEFAULT_COLOR = 0xcccccc

function fileColor(file: GitFileStatus): number {
  if (file.index === 'conflicted' || file.workingTree === 'conflicted') return CONFLICT_COLOR
  if (file.index === 'added' || file.workingTree === 'added') return ADDED_COLOR
  if (file.index === 'deleted' || file.workingTree === 'deleted') return DELETED_COLOR
  if (file.index === 'modified' || file.workingTree === 'modified') return MODIFIED_COLOR
  return DEFAULT_COLOR
}

export class PreviewOverlay extends Container {
  private bg: Graphics
  private titleText: Text
  private fileContainer: Container
  private proceedBtn: Container
  private cancelBtn: Container
  private onProceed: (() => void) | null = null
  private onCancel: (() => void) | null = null
  private _width: number
  private _height: number
  private _fileCount = 0
  private _fileColors: Record<string, number> = {}
  private _blocking = false
  private currentAction: PreviewAction | null = null

  constructor(width: number, height: number) {
    super()
    this._width = width
    this._height = height
    this.visible = false

    this.bg = new Graphics()
    this.addChild(this.bg)

    this.titleText = new Text({
      text: '',
      style: { fontSize: 14, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff },
    })
    this.titleText.x = 16
    this.titleText.y = 16
    this.addChild(this.titleText)

    this.fileContainer = new Container()
    this.fileContainer.y = 48
    this.fileContainer.x = 16
    this.addChild(this.fileContainer)

    this.proceedBtn = new Container()
    this.addChild(this.proceedBtn)

    this.cancelBtn = new Container()
    this.addChild(this.cancelBtn)
  }

  get fileCount(): number {
    return this._fileCount
  }

  get isBlocking(): boolean {
    return this._blocking
  }

  get width(): number {
    return this._width
  }

  get height(): number {
    return this._height
  }

  getFileColors(): Record<string, number> {
    return { ...this._fileColors }
  }

  setHandlers(onProceed: () => void, onCancel: () => void): void {
    this.onProceed = onProceed
    this.onCancel = onCancel
  }

  show(action: PreviewAction): void {
    this.currentAction = action
    this.visible = true
    this._blocking = true
    this.interactive = true

    this.titleText.text = action.label

    // Render file list
    this.fileContainer.removeChildren()
    this._fileColors = {}
    this._fileCount = action.files.length

    action.files.forEach((file, i) => {
      const color = fileColor(file)
      this._fileColors[file.path] = color

      const text = new Text({
        text: file.path,
        style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: color },
      })
      text.y = i * 20
      this.fileContainer.addChild(text)
    })

    this.drawBackground()
  }

  dismiss(): void {
    this.visible = false
    this._blocking = false
    this.interactive = false
    this.currentAction = null
  }

  triggerProceed(): void {
    this.onProceed?.()
  }

  triggerCancel(): void {
    this.onCancel?.()
    this.dismiss()
  }

  resize(width: number, height: number): void {
    this._width = width
    this._height = height
    if (this.visible) {
      this.drawBackground()
    }
  }

  private drawBackground(): void {
    this.bg.clear()
    this.bg.rect(0, 0, this._width, this._height)
    this.bg.fill({ color: 0x0a0a1a, alpha: 0.95 })
  }
}
