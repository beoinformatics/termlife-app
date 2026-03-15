import { Application, Container, Graphics, Text, Sprite, Texture } from 'pixi.js'
import { CELL_WIDTH, CELL_HEIGHT } from '../terminal/CellGrid'
import { themeManager } from '../themes/ThemeManager'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: Date
  isHidden: boolean
}

export type PaneMode = 'terminal' | 'filebrowser' | 'history'

export class FileBrowser {
  readonly container: Container
  private app: Application
  private currentPath: string
  private entries: FileEntry[] = []
  private selectedIndex = 0
  private scrollOffset = 0
  private cols = 0
  private rows = 0
  private width = 0
  private height = 0

  // UI Elements
  private headerText: Text
  private entryTexts: Text[] = []
  private selectionHighlight: Graphics
  private previewContainer: Container
  private background: Graphics
  private previewGraphics: Graphics

  // Callbacks
  onCd: (newPath: string) => void = () => {}
  onOpenFile: (path: string) => void = () => {}

  constructor(app: Application, width: number, height: number) {
    this.app = app
    this.width = width
    this.height = height
    this.currentPath = (window as any).ptyAPI?.homedir?.() || '/'

    this.container = new Container()
    this.container.eventMode = 'static'

    // Background
    this.background = new Graphics()
    this.container.addChild(this.background)

    // Selection highlight
    this.selectionHighlight = new Graphics()
    this.container.addChild(this.selectionHighlight)

    // Header (path display)
    this.headerText = new Text({
      text: '',
      style: {
        fontFamily: 'monospace',
        fontSize: CELL_HEIGHT * 0.9,
        fill: themeManager.theme.fileBrowserHeader,
      }
    })
    this.headerText.x = CELL_WIDTH
    this.headerText.y = CELL_HEIGHT * 0.5
    this.container.addChild(this.headerText)

    // Entry list container
    for (let i = 0; i < 50; i++) {
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: CELL_HEIGHT * 0.85,
          fill: themeManager.theme.fileBrowserFile,
        }
      })
      text.x = CELL_WIDTH * 2
      text.y = CELL_HEIGHT * (2 + i)
      this.entryTexts.push(text)
      this.container.addChild(text)
    }

    // Preview container (right side)
    this.previewContainer = new Container()
    this.previewGraphics = new Graphics()
    this.previewContainer.addChild(this.previewGraphics)
    this.container.addChild(this.previewContainer)

    this.resize(width, height)
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.cols = Math.floor(width / CELL_WIDTH)
    this.rows = Math.floor(height / CELL_HEIGHT)

    // Redraw background
    this.background.clear()
    this.background.rect(0, 0, width, height)
    this.background.fill(themeManager.theme.fileBrowserBg)

    // Position preview container
    this.previewContainer.x = width * 0.6
    this.previewContainer.y = CELL_HEIGHT * 2

    // Re-render with existing entries (don't reload directory)
    if (this.entries.length > 0) {
      this.render()
    }
  }

  async refresh() {
    await this.loadDirectory(this.currentPath)
    this.render()
  }

  private async loadDirectory(path: string) {
    try {
      const files = await window.ptyAPI.fs.readdir(path)
      this.entries = files.sort((a: FileEntry, b: FileEntry) => {
        // Directories first, then alphabetically
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      this.selectedIndex = 0
      this.scrollOffset = 0
    } catch (err) {
      console.error('Failed to read directory:', err)
      this.entries = []
    }
  }

  setPath(path: string) {
    this.currentPath = path
    this.refresh()
  }

  getPath(): string {
    return this.currentPath
  }

  private render() {
    // Update header
    const maxPathLen = this.cols - 2
    let displayPath = this.currentPath
    if (displayPath.length > maxPathLen) {
      displayPath = '...' + displayPath.slice(-(maxPathLen - 3))
    }
    this.headerText.text = `📁 ${displayPath}`

    // Calculate visible range
    const listRows = this.rows - 3
    const visibleEntries = this.entries.slice(
      this.scrollOffset,
      this.scrollOffset + listRows
    )

    // Update entry texts
    for (let i = 0; i < this.entryTexts.length; i++) {
      const text = this.entryTexts[i]
      const entryIndex = this.scrollOffset + i
      const entry = visibleEntries[i]

      if (entry) {
        const icon = entry.isDirectory ? '📂' : this.getFileIcon(entry.name)
        const name = this.truncateName(entry.name, this.cols - 6)
        text.text = `${icon} ${name}`
        text.style.fill = this.getEntryColor(entry)
        text.visible = true
      } else {
        text.visible = false
      }
    }

    // Update selection highlight
    const relativeIndex = this.selectedIndex - this.scrollOffset
    if (relativeIndex >= 0 && relativeIndex < listRows) {
      this.selectionHighlight.clear()
      this.selectionHighlight.rect(
        CELL_WIDTH,
        CELL_HEIGHT * (2 + relativeIndex),
        this.width * 0.55,
        CELL_HEIGHT
      )
      this.selectionHighlight.fill(themeManager.theme.fileBrowserSelection)
    }

    // Update preview
    this.renderPreview()
  }

  private getFileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase()
    const iconMap: Record<string, string> = {
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🎨',
      'mp4': '🎬',
      'mov': '🎬',
      'js': '📜',
      'ts': '📘',
      'py': '🐍',
      'rs': '🦀',
      'go': '🐹',
      'md': '📝',
      'json': '📋',
      'yml': '⚙️',
      'yaml': '⚙️',
      'sh': '⌨️',
      'zip': '📦',
      'tar': '📦',
    }
    return iconMap[ext || ''] || '📄'
  }

  private getEntryColor(entry: FileEntry): number {
    if (entry.isDirectory) return themeManager.theme.fileBrowserDirectory
    if (entry.name.startsWith('.')) return themeManager.theme.fileBrowserHidden
    if (entry.name.endsWith('.sh') || entry.name.endsWith('.exe')) return themeManager.theme.fileBrowserExecutable
    return themeManager.theme.fileBrowserFile
  }

  private truncateName(name: string, maxLen: number): string {
    if (name.length <= maxLen) return name
    return name.slice(0, maxLen - 3) + '...'
  }

  private renderPreview() {
    this.previewGraphics.clear()

    const selected = this.entries[this.selectedIndex]
    if (!selected) return

    const previewW = this.width * 0.35
    const previewH = this.height * 0.4

    // Draw preview box
    this.previewGraphics.rect(0, 0, previewW, previewH)
    this.previewGraphics.fill(themeManager.theme.fileBrowserPreviewBg)
    this.previewGraphics.stroke({ width: 1, color: themeManager.theme.fileBrowserPreviewBorder })

    if (selected.isDirectory) {
      // Show directory info
      const info = new Text({
        text: `📂 Directory\n${this.entries.filter(e => e.isDirectory).length} folders\n${this.entries.filter(e => !e.isDirectory).length} files`,
        style: {
          fontFamily: 'monospace',
          fontSize: CELL_HEIGHT * 0.7,
          fill: themeManager.theme.fileBrowserPreviewText,
        }
      })
      info.x = 10
      info.y = 10
      this.previewContainer.addChild(info)
    } else if (this.isImage(selected.name)) {
      // Placeholder for image thumbnail
      const placeholder = new Text({
        text: `🖼️\n${selected.name}`,
        style: {
          fontFamily: 'monospace',
          fontSize: CELL_HEIGHT * 0.7,
          fill: themeManager.theme.fileBrowserDirectory,
          align: 'center',
        }
      })
      placeholder.x = previewW / 2
      placeholder.y = previewH / 2
      placeholder.anchor.set(0.5)
      this.previewContainer.addChild(placeholder)
    } else {
      // File info
      const size = this.formatSize(selected.size)
      const info = new Text({
        text: `${this.getFileIcon(selected.name)} ${selected.name}\n\nSize: ${size}\nModified: ${selected.modified.toLocaleDateString()}`,
        style: {
          fontFamily: 'monospace',
          fontSize: CELL_HEIGHT * 0.7,
          fill: themeManager.theme.fileBrowserPreviewText,
        }
      })
      info.x = 10
      info.y = 10
      this.previewContainer.addChild(info)
    }
  }

  private isImage(name: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i.test(name)
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    const listRows = this.rows - 3

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault()
        if (this.selectedIndex < this.entries.length - 1) {
          this.selectedIndex++
          if (this.selectedIndex >= this.scrollOffset + listRows) {
            this.scrollOffset++
          }
          this.render()
        }
        return true

      case 'k':
      case 'ArrowUp':
        e.preventDefault()
        if (this.selectedIndex > 0) {
          this.selectedIndex--
          if (this.selectedIndex < this.scrollOffset) {
            this.scrollOffset--
          }
          this.render()
        }
        return true

      case 'h':
      case 'Backspace':
      case 'ArrowLeft':
        e.preventDefault()
        this.navigateUp()
        return true

      case 'l':
      case 'Enter':
        e.preventDefault()
        this.openSelected()
        return true

      case 'q':
      case 'Escape':
        e.preventDefault()
        // Signal to exit filebrowser mode
        this.onCd(this.currentPath)
        return true

      case 'Home':
        e.preventDefault()
        this.selectedIndex = 0
        this.scrollOffset = 0
        this.render()
        return true

      case 'End':
        e.preventDefault()
        this.selectedIndex = this.entries.length - 1
        this.scrollOffset = Math.max(0, this.entries.length - listRows)
        this.render()
        return true

      case 'PageDown':
        e.preventDefault()
        this.selectedIndex = Math.min(this.entries.length - 1, this.selectedIndex + listRows)
        this.scrollOffset = Math.min(this.scrollOffset + listRows, Math.max(0, this.entries.length - listRows))
        this.render()
        return true

      case 'PageUp':
        e.preventDefault()
        this.selectedIndex = Math.max(0, this.selectedIndex - listRows)
        this.scrollOffset = Math.max(0, this.scrollOffset - listRows)
        this.render()
        return true

      case '/':
        e.preventDefault()
        // TODO: fuzzy search
        return true
    }

    return false
  }

  private navigateUp() {
    const parent = this.currentPath.split('/').slice(0, -1).join('/') || '/'
    this.currentPath = parent
    this.refresh()
    this.onCd(this.currentPath)
  }

  private openSelected() {
    const selected = this.entries[this.selectedIndex]
    if (!selected) return

    if (selected.isDirectory) {
      this.currentPath = selected.path
      this.refresh()
      this.onCd(this.currentPath)
    } else {
      this.onOpenFile(selected.path)
    }
  }

  destroy() {
    this.container.destroy()
  }
}
