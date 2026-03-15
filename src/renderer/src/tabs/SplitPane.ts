import { Application, Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js'
import { TerminalEngine } from '../terminal/TerminalEngine'
import { FileBrowser, type PaneMode } from '../filebrowser/FileBrowser'
import { CELL_WIDTH, CELL_HEIGHT } from '../terminal/CellGrid'
import { themeManager } from '../themes/ThemeManager'

export type SplitLayout = 'single' | 'vertical' | 'horizontal' | 'quad'

interface Pane {
  id: string
  engine: TerminalEngine
  fileBrowser: FileBrowser | null
  container: Container
  contentContainer: Container
  border: Graphics
  x: number
  y: number
  width: number
  height: number
  cols: number
  rows: number
  mode: PaneMode
}

export class SplitPane {
  readonly container: Container
  private app: Application
  private panes: Pane[] = []
  private _layout: SplitLayout = 'single'
  private tabBarHeight: number
  private _bottomBarHeight = 0
  private tabId: string
  private nextPaneId = 1
  private dividers: Graphics[] = []
  private focusedPaneIndex = 0
  private waitingForTmuxPrefix = false
  private _onShellCommand?: (command: string) => void
  private _onFirstCwd?: (cwd: string) => void

  constructor(app: Application, tabBarHeight: number, tabId: string) {
    this.app = app
    this.tabBarHeight = tabBarHeight
    this.tabId = tabId
    this.container = new Container()
  }

  set onShellCommand(callback: ((command: string) => void) | undefined) {
    this._onShellCommand = callback
  }

  set onFirstCwd(callback: ((cwd: string) => void) | undefined) {
    this._onFirstCwd = callback
  }

  set bottomBarHeight(h: number) { this._bottomBarHeight = h }
  get bottomBarHeight(): number { return this._bottomBarHeight }

  /** Use window dimensions directly to avoid PixiJS resolution/autoDensity mismatches */
  private get screenW(): number { return window.innerWidth }
  private get screenH(): number { return window.innerHeight }

  /** Available content height (total screen minus top header and bottom bar) */
  private get contentH(): number { return this.screenH - this.tabBarHeight - this._bottomBarHeight }

  get layout(): SplitLayout {
    return this._layout
  }

  get activePanes(): ReadonlyArray<Pane> {
    return this.panes
  }

  get focusedPane(): Pane | null {
    // Ensure focusedPaneIndex is valid
    if (this.focusedPaneIndex < 0 || this.focusedPaneIndex >= this.panes.length) {
      if (this.panes.length > 0) {
        this.focusedPaneIndex = 0
        return this.panes[0]
      }
      return null
    }
    return this.panes[this.focusedPaneIndex]
  }

  private createPane(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    cols: number,
    rows: number,
    paneIndex: number,
    cwd?: string
  ): Pane {
    const engine = new TerminalEngine(id, cols, rows, 0, cwd, (cmd: string) => {
      this._onShellCommand?.(cmd)
    })
    engine.onFirstCwd = (firstCwd: string) => {
      this._onFirstCwd?.(firstCwd)
    }

    // Main container for the pane
    const container = new Container()
    container.x = x
    container.y = y
    container.width = width
    container.height = height

    // Content container (terminal or filebrowser)
    const contentContainer = new Container()
    contentContainer.addChild(engine.container)
    container.addChild(contentContainer)

    // Clip to pane bounds - mask must be in scene for PixiJS v8
    const mask = new Graphics()
    mask.rect(0, 0, width, height)
    mask.fill(0xffffff)
    container.mask = mask
    container.addChild(mask)

    // Border for focus indication
    const border = new Graphics()
    container.addChild(border)

    const pane: Pane = {
      id,
      engine,
      fileBrowser: null,
      container,
      contentContainer,
      border,
      x,
      y,
      width,
      height,
      cols,
      rows,
      mode: 'terminal',
    }

    // Click to focus
    container.eventMode = 'static'
    container.cursor = 'text'
    container.on('pointertap', () => {
      this.focusPane(paneIndex)
    })

    return pane
  }

  toggleFocusedPaneMode() {
    const pane = this.focusedPane
    if (pane) {
      this.togglePaneMode(pane)
    }
  }

  isFocusedPaneFileBrowser(): boolean {
    return this.focusedPane?.mode === 'filebrowser'
  }

  isFocusedPaneHistory(): boolean {
    return this.focusedPane?.mode === 'history'
  }

  toggleHistoryMode() {
    const pane = this.focusedPane
    if (!pane) return

    if (pane.mode === 'history') {
      // Restore previous mode (always terminal)
      pane.mode = 'terminal'
      pane.engine.container.visible = true
      // Scroll back to bottom to show live terminal
      pane.engine.scrollbackManager.scrollToBottom()
    } else {
      // Store any non-history mode and switch to history
      // First close filebrowser if open
      if (pane.mode === 'filebrowser' && pane.fileBrowser) {
        pane.fileBrowser.container.visible = false
      }
      pane.mode = 'history'
      // Keep terminal container visible (we're viewing its scrollback)
      pane.engine.container.visible = true
      // Scroll to top to start reviewing from the beginning
      pane.engine.scrollbackManager.scrollToTop()
    }
  }

  private togglePaneMode(pane: Pane) {
    if (pane.mode === 'terminal') {
      // Switch to filebrowser
      pane.mode = 'filebrowser'
      pane.engine.container.visible = false

      if (!pane.fileBrowser) {
        pane.fileBrowser = new FileBrowser(this.app, pane.width, pane.height)
        pane.fileBrowser.container.visible = false
        pane.contentContainer.addChild(pane.fileBrowser.container)

        // Handle navigation
        pane.fileBrowser.onCd = (newPath) => {
          // Sync with terminal
          pane.engine.setWorkingDirectory(newPath)
        }

        pane.fileBrowser.onOpenFile = async (path) => {
          // cd to the file's directory, switch to terminal, leave filename on command line
          const dir = path.substring(0, path.lastIndexOf('/')) || '/'
          const filename = path.substring(path.lastIndexOf('/') + 1)
          this.togglePaneMode(pane)
          await pane.engine.sendInput(`cd "${dir}"\r`)
          // Small delay to let cd complete before placing filename
          setTimeout(() => {
            pane.engine.sendInput(`"${filename}" `)
          }, 100)
        }
      }

      // Always sync with current working directory
      const cwd = pane.engine.getWorkingDirectory()
      if (cwd) {
        pane.fileBrowser.setPath(cwd)
      } else {
        pane.fileBrowser.refresh()
      }

      pane.fileBrowser.container.visible = true
    } else {
      // Switch to terminal
      pane.mode = 'terminal'
      if (pane.fileBrowser) {
        pane.fileBrowser.container.visible = false
      }
      pane.engine.container.visible = true

      // Sync terminal CWD
      if (pane.fileBrowser) {
        const newPath = pane.fileBrowser.getPath()
        pane.engine.setWorkingDirectory(newPath)
      }
    }

  }

  private focusPane(index: number) {
    if (index < 0 || index >= this.panes.length) return
    this.focusedPaneIndex = index
    this.updateFocusBorders()
  }

  focusFirstPane() {
    if (this.panes.length > 0) {
      this.focusedPaneIndex = 0
      this.updateFocusBorders()
      // Ensure container can receive events
      this.container.eventMode = 'static'
      // Ensure each pane container can receive events
      for (const pane of this.panes) {
        pane.container.eventMode = 'static'
        pane.container.visible = true
      }
    }
  }

  private updateFocusBorders() {
    for (let i = 0; i < this.panes.length; i++) {
      const pane = this.panes[i]
      const isFocused = i === this.focusedPaneIndex
      pane.border.clear()
      if (isFocused) {
        // Green border for focused pane
        pane.border.stroke({ width: 2, color: themeManager.theme.focusBorder })
        pane.border.rect(0, 0, pane.width, pane.height)
      }
      // Cursor color update
      pane.engine.cursorRenderer.setFocused(isFocused)
    }
  }

  private clearDividers() {
    for (const divider of this.dividers) {
      divider.destroy()
    }
    this.dividers = []
  }

  private drawDividers() {
    this.clearDividers()

    if (this._layout === 'single') return

    // Divider styling - bright color for visibility
    const DIVIDER_COLOR = themeManager.theme.dividerColor
    const DIVIDER_WIDTH = 2

    const bottomEdge = this.screenH - this._bottomBarHeight

    if (this._layout === 'vertical') {
      const midX = this.screenW / 2

      const divider = new Graphics()
      divider.moveTo(midX, this.tabBarHeight)
      divider.lineTo(midX, bottomEdge)
      divider.stroke({ width: DIVIDER_WIDTH, color: DIVIDER_COLOR, alpha: 0.8 })
      this.container.addChild(divider)
      this.dividers.push(divider)
    } else if (this._layout === 'horizontal') {
      const midY = (this.tabBarHeight + bottomEdge) / 2

      const divider = new Graphics()
      divider.moveTo(0, midY)
      divider.lineTo(this.screenW, midY)
      divider.stroke({ width: DIVIDER_WIDTH, color: DIVIDER_COLOR, alpha: 0.8 })
      this.container.addChild(divider)
      this.dividers.push(divider)
    } else if (this._layout === 'quad') {
      const midX = this.screenW / 2
      const midY = (this.tabBarHeight + bottomEdge) / 2

      // Vertical divider
      const dividerV = new Graphics()
      dividerV.moveTo(midX, this.tabBarHeight)
      dividerV.lineTo(midX, bottomEdge)
      dividerV.stroke({ width: DIVIDER_WIDTH, color: DIVIDER_COLOR, alpha: 0.8 })
      this.container.addChild(dividerV)
      this.dividers.push(dividerV)

      // Horizontal divider
      const dividerH = new Graphics()
      dividerH.moveTo(0, midY)
      dividerH.lineTo(this.screenW, midY)
      dividerH.stroke({ width: DIVIDER_WIDTH, color: DIVIDER_COLOR, alpha: 0.8 })
      this.container.addChild(dividerH)
      this.dividers.push(dividerH)
    }
  }

  setLayout(layout: SplitLayout, cwd?: string) {
    if (this._layout === layout && this.panes.length > 0) return

    // Kill existing panes
    for (const pane of this.panes) {
      pane.engine.destroy()
      pane.container.destroy()
    }
    this.panes = []
    this.container.removeChildren()
    this.clearDividers()
    this.focusedPaneIndex = 0

    this._layout = layout
    const screenW = this.screenW
    const contentH = this.contentH

    if (layout === 'single') {
      const cols = Math.floor(screenW / CELL_WIDTH)
      const rows = Math.floor(contentH / CELL_HEIGHT)
      const pane = this.createPane(
        `${this.tabId}-pane-${this.nextPaneId++}`,
        0,
        this.tabBarHeight,
        screenW,
        contentH,
        Math.max(cols, 10),
        Math.max(rows, 5),
        0,
        cwd
      )
      this.panes.push(pane)
      this.container.addChild(pane.container)
      pane.engine.spawn()
      this.updateFocusBorders()
    } else if (layout === 'vertical') {
      const paneW = screenW / 2
      const cols = Math.floor(paneW / CELL_WIDTH)
      const rows = Math.floor(contentH / CELL_HEIGHT)
      for (let i = 0; i < 2; i++) {
        const pane = this.createPane(
          `${this.tabId}-pane-${this.nextPaneId++}`,
          i * paneW,
          this.tabBarHeight,
          paneW,
          contentH,
          Math.max(cols, 5),
          Math.max(rows, 5),
          i,
          i === 0 ? cwd : undefined
        )
        this.panes.push(pane)
        this.container.addChild(pane.container)
        pane.engine.spawn()
      }
      this.updateFocusBorders()
      this.drawDividers()
    } else if (layout === 'horizontal') {
      const paneH = contentH / 2
      const cols = Math.floor(screenW / CELL_WIDTH)
      const rows = Math.floor(paneH / CELL_HEIGHT)
      for (let i = 0; i < 2; i++) {
        const pane = this.createPane(
          `${this.tabId}-pane-${this.nextPaneId++}`,
          0,
          this.tabBarHeight + i * paneH,
          screenW,
          paneH,
          Math.max(cols, 10),
          Math.max(rows, 3),
          i,
          i === 0 ? cwd : undefined
        )
        this.panes.push(pane)
        this.container.addChild(pane.container)
        pane.engine.spawn()
      }
      this.updateFocusBorders()
      this.drawDividers()
    } else if (layout === 'quad') {
      const paneW = screenW / 2
      const paneH = contentH / 2
      const cols = Math.floor(paneW / CELL_WIDTH)
      const rows = Math.floor(paneH / CELL_HEIGHT)
      let paneIndex = 0
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          const pane = this.createPane(
            `${this.tabId}-pane-${this.nextPaneId++}`,
            col * paneW,
            this.tabBarHeight + row * paneH,
            paneW,
            paneH,
            Math.max(cols, 5),
            Math.max(rows, 3),
            paneIndex++,
            row === 0 && col === 0 ? cwd : undefined
          )
          this.panes.push(pane)
          this.container.addChild(pane.container)
          pane.engine.spawn()
        }
      }
      this.updateFocusBorders()
      this.drawDividers()
    }
  }

  handleKeyDown(e: KeyboardEvent) {
    // Check if focused pane is in filebrowser mode
    const pane = this.focusedPane
    if (pane && pane.mode === 'filebrowser' && pane.fileBrowser) {
      const handled = pane.fileBrowser.handleKeyDown(e)
      if (handled) return
    }

    // History mode: only allow scrolling keys, block all PTY input
    if (pane && pane.mode === 'history') {
      if (e.key === 'ArrowUp' || (e.shiftKey && e.key === 'PageUp')) {
        e.preventDefault()
        pane.engine.scrollbackManager.scroll(e.key === 'ArrowUp' ? -1 : -5)
        return
      }
      if (e.key === 'ArrowDown' || (e.shiftKey && e.key === 'PageDown')) {
        e.preventDefault()
        pane.engine.scrollbackManager.scroll(e.key === 'ArrowDown' ? 1 : 5)
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        pane.engine.scrollbackManager.scrollToTop()
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        pane.engine.scrollbackManager.scrollToBottom()
        return
      }
      // Block all other input in history mode
      return
    }

    // Tmux prefix handling: Ctrl+B
    if (e.ctrlKey && e.key === 'b' && !this.waitingForTmuxPrefix) {
      e.preventDefault()
      this.waitingForTmuxPrefix = true
      return
    }

    // If waiting for prefix, handle navigation
    if (this.waitingForTmuxPrefix) {
      this.waitingForTmuxPrefix = false
      e.preventDefault()

      if (this.panes.length <= 1) {
        // In single pane mode, just send Ctrl+B to the shell
        const pane = this.focusedPane
        if (pane) {
          // Send Ctrl+B as escape sequence
          pane.engine.handleKeyDown(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }))
        }
        return
      }

      // Navigate based on arrow keys
      switch (e.key) {
        case 'ArrowLeft':
          if (this._layout === 'vertical') {
            this.focusPane(0) // Left pane
          } else if (this._layout === 'quad') {
            // Move left within quad
            if (this.focusedPaneIndex === 1) this.focusPane(0)
            else if (this.focusedPaneIndex === 3) this.focusPane(2)
          }
          return
        case 'ArrowRight':
          if (this._layout === 'vertical') {
            this.focusPane(1) // Right pane
          } else if (this._layout === 'quad') {
            // Move right within quad
            if (this.focusedPaneIndex === 0) this.focusPane(1)
            else if (this.focusedPaneIndex === 2) this.focusPane(3)
          }
          return
        case 'ArrowUp':
          if (this._layout === 'horizontal') {
            this.focusPane(0) // Top pane
          } else if (this._layout === 'quad') {
            // Move up within quad
            if (this.focusedPaneIndex === 2) this.focusPane(0)
            else if (this.focusedPaneIndex === 3) this.focusPane(1)
          }
          return
        case 'ArrowDown':
          if (this._layout === 'horizontal') {
            this.focusPane(1) // Bottom pane
          } else if (this._layout === 'quad') {
            // Move down within quad
            if (this.focusedPaneIndex === 0) this.focusPane(2)
            else if (this.focusedPaneIndex === 1) this.focusPane(3)
          }
          return
        default:
          // Not a navigation key, send Ctrl+B + key to focused pane
          const pane = this.focusedPane
          if (pane) {
            pane.engine.handleKeyDown(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }))
            pane.engine.handleKeyDown(e)
          }
          return
      }
    }

    // Normal key handling - only send to focused pane
    const focusedPane = this.focusedPane
    if (focusedPane) {
      focusedPane.engine.handleKeyDown(e)
    } else {
      console.warn('SplitPane: No focused pane available, key ignored:', e.key)
    }
  }

  handleResize() {
    if (this.panes.length === 0) return

    const screenW = this.screenW
    const contentH = this.contentH

    if (this._layout === 'single') {
      const pane = this.panes[0]
      const cols = Math.floor(screenW / CELL_WIDTH)
      const rows = Math.floor(contentH / CELL_HEIGHT)
      this.resizePane(pane, 0, this.tabBarHeight, screenW, contentH, cols, rows)
    } else if (this._layout === 'vertical') {
      const paneW = screenW / 2
      const cols = Math.floor(paneW / CELL_WIDTH)
      const rows = Math.floor(contentH / CELL_HEIGHT)
      for (let i = 0; i < this.panes.length; i++) {
        const pane = this.panes[i]
        this.resizePane(pane, i * paneW, this.tabBarHeight, paneW, contentH, cols, rows)
      }
    } else if (this._layout === 'horizontal') {
      const paneH = contentH / 2
      const cols = Math.floor(screenW / CELL_WIDTH)
      const rows = Math.floor(paneH / CELL_HEIGHT)
      for (let i = 0; i < this.panes.length; i++) {
        const pane = this.panes[i]
        this.resizePane(pane, 0, this.tabBarHeight + i * paneH, screenW, paneH, cols, rows)
      }
    } else if (this._layout === 'quad') {
      const paneW = screenW / 2
      const paneH = contentH / 2
      const cols = Math.floor(paneW / CELL_WIDTH)
      const rows = Math.floor(paneH / CELL_HEIGHT)
      for (let i = 0; i < this.panes.length; i++) {
        const row = Math.floor(i / 2)
        const col = i % 2
        const pane = this.panes[i]
        this.resizePane(
          pane,
          col * paneW,
          this.tabBarHeight + row * paneH,
          paneW,
          paneH,
          cols,
          rows
        )
      }
    }

    this.updateFocusBorders()
    this.drawDividers()
  }

  private resizePane(
    pane: Pane,
    x: number,
    y: number,
    width: number,
    height: number,
    cols: number,
    rows: number
  ) {
    pane.x = x
    pane.y = y
    pane.width = width
    pane.height = height
    pane.cols = cols
    pane.rows = rows
    pane.container.x = x
    pane.container.y = y

    if (pane.container.mask) {
      const mask = pane.container.mask as Graphics
      mask.clear()
      mask.rect(0, 0, width, height)
      mask.fill(0xffffff)
    }

    pane.engine.resize(cols, rows, 0)

    // Resize filebrowser if active
    if (pane.fileBrowser) {
      pane.fileBrowser.resize(width, height)
    }

    // Update mode button position
  }

  update(dt: number) {
    for (const pane of this.panes) {
      pane.engine.update(dt)
    }
  }

  /** Lightweight tick: only update state machines, no rendering. For background tabs. */
  updateStateMachineOnly(dt: number) {
    for (const pane of this.panes) {
      pane.engine.updateStateMachineOnly(dt)
    }
  }

  /** Mark all panes as background — defers xterm writes until foregrounded. */
  setBackground(): void {
    for (const pane of this.panes) {
      pane.engine.setBackground()
    }
  }

  /** Mark all panes as foreground — flushes accumulated data. */
  setForeground(): void {
    for (const pane of this.panes) {
      pane.engine.setForeground()
    }
  }

  async copySelection(): Promise<boolean> {
    const pane = this.focusedPane
    if (pane) {
      return pane.engine.copySelection()
    }
    return false
  }

  async paste(): Promise<boolean> {
    const pane = this.focusedPane
    if (pane) {
      // Block paste in history mode (read-only)
      if (pane.mode === 'history') return false
      return pane.engine.paste()
    }
    return false
  }

  clearSelection(): void {
    for (const pane of this.panes) {
      pane.engine.clearSelection()
    }
  }

  hasSelection(): boolean {
    const pane = this.focusedPane
    return pane ? pane.engine.hasSelection() : false
  }

  // Scrollback methods
  scrollUp(lines: number = 5): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scroll(-lines)
    }
  }

  scrollDown(lines: number = 5): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scroll(lines)
    }
  }

  scrollToTop(): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scrollToTop()
    }
  }

  scrollToBottom(): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scrollToBottom()
    }
  }

  scrollToPrevPrompt(): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scrollToPrevPrompt()
    }
  }

  scrollToNextPrompt(): void {
    const pane = this.focusedPane
    if (pane) {
      pane.engine.scrollbackManager.scrollToNextPrompt()
    }
  }

  /**
   * Capture a screenshot of all panes in this split layout.
   * Returns a Texture that can be used as a Sprite.
   */
  captureScreenshot(): Texture | null {
    if (this.panes.length === 0) return null

    // Get the bounds of the content area
    const screenW = this.screenW
    const contentH = this.contentH

    // Create a temporary container to composite all panes
    const composite = new Container()

    // Render each pane's content using the CellGrid's renderToGraphics
    for (const pane of this.panes) {
      // Create a graphics to draw the pane background
      const bg = new Graphics()
      bg.rect(0, 0, pane.width, pane.height)
      bg.fill(themeManager.theme.background)
      bg.x = pane.x
      bg.y = pane.y - this.tabBarHeight // Offset by tab bar
      composite.addChild(bg)

      // Use CellGrid's renderToGraphics to get the text content
      const textGraphics = pane.engine.cellGrid.renderToGraphics(
        pane.x,
        pane.y - this.tabBarHeight
      )
      composite.addChild(textGraphics)
    }

    // Add to stage temporarily for rendering
    composite.visible = true
    composite.renderable = true
    this.app.stage.addChild(composite)

    // Force render to update
    this.app.render()

    try {
      // Use extract to get a canvas, then create texture from it
      const canvas = this.app.renderer.extract.canvas(composite)
      if (!canvas) return null

      // Create texture from the canvas at reduced resolution
      const texture = Texture.from(canvas, {
        resolution: 0.5,
      })

      return texture
    } finally {
      // Clean up the temporary container
      this.app.stage.removeChild(composite)
      composite.destroy({ children: true, texture: false, baseTexture: false })
    }
  }

  /**
   * Capture a screenshot and return it as a Sprite for display.
   * The sprite will be sized to fit the target dimensions while maintaining aspect ratio.
   */
  captureScreenshotAsSprite(targetWidth: number, targetHeight: number): Sprite | null {
    const texture = this.captureScreenshot()
    if (!texture) return null

    const sprite = new Sprite(texture)

    // Calculate scale to fit within target dimensions while maintaining aspect ratio
    const scaleX = targetWidth / texture.width
    const scaleY = targetHeight / texture.height
    const scale = Math.min(scaleX, scaleY)

    sprite.scale.set(scale)

    // Center the sprite
    sprite.x = (targetWidth - texture.width * scale) / 2
    sprite.y = (targetHeight - texture.height * scale) / 2

    return sprite
  }

  destroy() {
    for (const pane of this.panes) {
      if (pane.fileBrowser) {
        pane.fileBrowser.destroy()
      }
      pane.engine.destroy()
      pane.container.destroy()
    }
    this.panes = []
    this.clearDividers()
    this.container.destroy()
  }
}
