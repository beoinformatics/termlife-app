import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import { TabManager, type TabState } from './TabManager'
import { themeManager } from '../themes/ThemeManager'
import { commandRegistry } from '../history/CommandRegistry'
import type { HistoryEntry } from '../history/TabHistory'

/**
 * Four-state terminal state icons:
 * - idle-ready: Shell at prompt, ready for command (neutral)
 * - idle-error: Shell at prompt, last command failed (needs attention)
 * - running: Process running, CPU busy (working)
 * - running-input: Process waiting for user input (interactive)
 */
const STATE_EMOJI: Record<TabState, string> = {
  'idle-ready': '🥱',      // Idle, shell ready (yawning)
  'idle-error': '❌',      // Idle, last command failed
  'running': '🏃',         // Running, not waiting for input (jogger)
  'running-input': '💬',   // Running, waiting for user input (callout bubble)
}

const STATE_COLOR: Record<TabState, number> = {
  'idle-ready': 0x9ca3af,   // Soft gray-blue - idle
  'idle-error': 0xff3366,   // Vibrant pink-red - error (attention!)
  'running': 0x22d3d3,      // Bright cyan - working
  'running-input': 0xffd700, // Golden yellow - needs input
}

const TAB_WIDTH = 120
const TAB_PADDING = 8
const MAX_TABS = 10

// Control buttons are rendered in the title bar row above tabs

export class TabBar {
  readonly container: Container
  private app: Application
  private tabManager: TabManager
  private height: number
  private bg: Graphics
  private tabItems: Container[] = []
  private onDashboardToggle: () => void
  private onFileBrowserToggle: () => void
  private onCrazyToggle: () => void
  private onNormalView: () => void
  private onHistoryToggle: () => void
  private onAutoSwitchToggle: () => void
  private onGitToggle: () => void
  private crazyActive: () => boolean
  private historyActive: () => boolean
  private autoSwitchActive: () => boolean
  private gitActive: () => boolean
  private titleBar: Container
  private titleBarHeight: number
  private tooltipContainer: Container | null = null
  private buttonTooltipContainer: Container | null = null
  private readonly MAX_HISTORY_PREVIEW = 5

  // Tab rename state
  private _renameActive = false
  private _renameIndex = -1
  private _renameBuffer = ''

  // Double-click tracking (persists across refresh)
  private _lastClickTime = 0
  private _lastClickIndex = -1

  // Tab drag state
  private _dragIndex = -1
  private _dragStartX = 0
  private _dragCurrentX = 0
  private _isDragging = false
  private _dragGhost: Container | null = null
  private _dragThreshold = 10 // pixels to start drag

  // Command input field in title bar
  private _commandActive = false
  private _commandBuffer = ''
  private commandInputContainer: Container
  private commandInputBg: Graphics
  private commandInputText: Text
  private commandInputCursor: Graphics
  private cursorBlink = 0
  private autoSwitchPulse = 0
  private autoSwitchGlow: Graphics | null = null
  private autoSwitchGlowX = 0

  constructor(app: Application, tabManager: TabManager, height: number, titleBarHeight: number, onDashboardToggle: () => void, onFileBrowserToggle: () => void, onCrazyToggle?: () => void, crazyActive?: () => boolean, onNormalView?: () => void, onHistoryToggle?: () => void, historyActive?: () => boolean, onAutoSwitchToggle?: () => void, autoSwitchActive?: () => boolean, onGitToggle?: () => void, gitActive?: () => boolean) {
    this.app = app
    this.tabManager = tabManager
    this.height = height
    this.onDashboardToggle = onDashboardToggle
    this.onFileBrowserToggle = onFileBrowserToggle
    this.onCrazyToggle = onCrazyToggle || (() => {})
    this.crazyActive = crazyActive || (() => false)
    this.onNormalView = onNormalView || (() => {})
    this.onHistoryToggle = onHistoryToggle || (() => {})
    this.onAutoSwitchToggle = onAutoSwitchToggle || (() => {})
    this.historyActive = historyActive || (() => false)
    this.autoSwitchActive = autoSwitchActive || (() => false)
    this.onGitToggle = onGitToggle || (() => {})
    this.gitActive = gitActive || (() => false)
    this.container = new Container()
    this.titleBarHeight = titleBarHeight

    this.bg = new Graphics()
    this.container.addChild(this.bg)

    // Create title bar container (above tabs)
    this.titleBar = new Container()
    this.container.addChild(this.titleBar)

    // Create persistent command input (lives outside refresh cycle)
    this.commandInputContainer = new Container()
    this.commandInputContainer.zIndex = 100
    this.commandInputBg = new Graphics()
    this.commandInputContainer.addChild(this.commandInputBg)

    this.commandInputText = new Text({
      text: ':',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 12,
        fill: 0x888888,
      }),
    })
    this.commandInputText.y = 4
    this.commandInputText.x = 6
    this.commandInputContainer.addChild(this.commandInputText)

    this.commandInputCursor = new Graphics()
    this.commandInputContainer.addChild(this.commandInputCursor)

    this.container.addChild(this.commandInputContainer)
  }

  get commandActive(): boolean {
    return this._commandActive
  }

  activateCommand(): void {
    this._commandActive = true
    this._commandBuffer = ''
    this.cursorBlink = 0
    this.renderCommandInput()
  }

  deactivateCommand(): void {
    this._commandActive = false
    this._commandBuffer = ''
    this.renderCommandInput()
  }

  get renameActive(): boolean {
    return this._renameActive
  }

  activateRename(index: number): void {
    const tab = this.tabManager.activeTabs[index]
    if (!tab) return
    this._renameActive = true
    this._renameIndex = index
    this._renameBuffer = tab.title
    this.refresh()
  }

  private commitRename(): void {
    if (this._renameActive && this._renameBuffer.trim().length > 0) {
      this.tabManager.renameTab(this._renameIndex, this._renameBuffer)
    }
    this._renameActive = false
    this._renameIndex = -1
    this._renameBuffer = ''
    this.refresh()
  }

  private cancelRename(): void {
    this._renameActive = false
    this._renameIndex = -1
    this._renameBuffer = ''
    this.refresh()
  }

  handleRenameKey(e: KeyboardEvent): boolean {
    if (!this._renameActive) return false

    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      this.cancelRename()
      return true
    }

    if (e.key === 'Enter') {
      this.commitRename()
      return true
    }

    if (e.key === 'Backspace') {
      this._renameBuffer = this._renameBuffer.slice(0, -1)
      this.refresh()
      return true
    }

    // Ctrl+U: kill line
    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      this._renameBuffer = ''
      this.refresh()
      return true
    }

    // Ctrl+A: select all (clear and start fresh)
    if (e.ctrlKey && e.key.toLowerCase() === 'a') {
      this._renameBuffer = ''
      this.refresh()
      return true
    }

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      this._renameBuffer += e.key
      this.refresh()
      return true
    }

    return true
  }

  // Returns true if the event was consumed
  handleCommandKey(e: KeyboardEvent): boolean {
    if (!this._commandActive) return false

    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      this.deactivateCommand()
      return true
    }

    if (e.key === 'Enter') {
      const cmd = this._commandBuffer.trim()
      this.deactivateCommand()
      if (cmd) {
        // Try as TCL command first
        const asTcl = cmd.startsWith('[') ? cmd : `[${cmd}]`
        if (!commandRegistry.executeCommand(asTcl)) {
          // Try fuzzy search
          const results = commandRegistry.search(cmd)
          if (results.length > 0) {
            results[0].execute()
          }
        }
      }
      return true
    }

    if (e.key === 'Backspace') {
      this._commandBuffer = this._commandBuffer.slice(0, -1)
      this.renderCommandInput()
      return true
    }

    // Ctrl+U: kill line
    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      this._commandBuffer = ''
      this.renderCommandInput()
      return true
    }

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      this._commandBuffer += e.key
      this.renderCommandInput()
      return true
    }

    return true
  }

  updateCommandCursor(dt: number): void {
    if (!this._commandActive) return
    this.cursorBlink += dt
    const show = Math.floor(this.cursorBlink / 30) % 2 === 0
    this.commandInputCursor.visible = show
  }

  updateAutoSwitchPulse(dt: number): void {
    if (!this.autoSwitchGlow) return
    this.autoSwitchPulse += dt * 0.05
    // Smooth sine wave pulse: alpha oscillates between 0.1 and 0.8
    const alpha = 0.1 + 0.7 * (0.5 + 0.5 * Math.sin(this.autoSwitchPulse))
    // Color shifts between green and cyan
    const t = 0.5 + 0.5 * Math.sin(this.autoSwitchPulse * 0.7)
    const r = Math.floor(0x2a + (0x00 - 0x2a) * t)
    const g = Math.floor(0xaa + (0xdd - 0xaa) * t)
    const b = Math.floor(0x2a + (0xaa - 0x2a) * t)
    const color = (r << 16) | (g << 8) | b

    const x = this.autoSwitchGlowX
    const h = this.titleBarHeight
    this.autoSwitchGlow.clear()
    this.autoSwitchGlow.roundRect(x - 1, 1, 34, h - 2, 3)
    this.autoSwitchGlow.stroke({ width: 2, color, alpha })
  }

  private renderCommandInput(): void {
    const inputHeight = this.titleBarHeight - 6

    this.commandInputContainer.removeAllListeners()
    this.commandInputBg.clear()
    this.commandInputCursor.clear()

    if (this._commandActive) {
      // Expanded: full-width text input field
      const leftEdge = 140 // after split buttons
      const rightEdge = window.innerWidth - 330 // before rightmost title bar buttons
      const inputWidth = Math.max(100, rightEdge - leftEdge)

      this.commandInputContainer.x = leftEdge
      this.commandInputContainer.y = 3

      this.commandInputBg.roundRect(0, 0, inputWidth, inputHeight, 4)
      this.commandInputBg.fill({ color: 0x1a1a2e, alpha: 0.95 })
      this.commandInputBg.roundRect(0, 0, inputWidth, inputHeight, 4)
      this.commandInputBg.stroke({ width: 1, color: 0x4488aa })

      this.commandInputText.text = `: ${this._commandBuffer}`
      this.commandInputText.style.fill = 0xffffff
      this.commandInputText.visible = true

      const cursorX = this.commandInputText.x + this.commandInputText.width + 2
      this.commandInputCursor.rect(cursorX, 4, 1, inputHeight - 6)
      this.commandInputCursor.fill({ color: 0xffffff })

      this.commandInputContainer.eventMode = 'static'
      this.commandInputContainer.cursor = 'text'
    } else {
      // Collapsed: small button with ":" icon
      const btnX = 140
      const btnWidth = 28

      this.commandInputContainer.x = btnX
      this.commandInputContainer.y = 3

      this.commandInputBg.roundRect(0, 0, btnWidth, inputHeight, 4)
      this.commandInputBg.fill({ color: 0x000000, alpha: 0.2 })

      this.commandInputText.text = ':'
      this.commandInputText.style.fill = 0x888888
      this.commandInputText.visible = true

      this.commandInputContainer.eventMode = 'static'
      this.commandInputContainer.cursor = 'pointer'
      this.commandInputContainer.on('pointerover', () => {
        this.commandInputBg.clear()
        this.commandInputBg.roundRect(0, 0, btnWidth, inputHeight, 4)
        this.commandInputBg.fill({ color: 0x1a1a2e, alpha: 0.6 })
      })
      this.commandInputContainer.on('pointerout', () => {
        this.commandInputBg.clear()
        this.commandInputBg.roundRect(0, 0, btnWidth, inputHeight, 4)
        this.commandInputBg.fill({ color: 0x000000, alpha: 0.2 })
      })
      this.commandInputContainer.on('pointertap', () => {
        this.activateCommand()
      })
    }
  }

  private tooltipTimeout: number | null = null
  private pendingTooltip: { tabIndex: number; x: number; y: number } | null = null

  private showHistoryTooltip(tabIndex: number, x: number, y: number) {
    // Clear any existing timeout
    if (this.tooltipTimeout !== null) {
      window.clearTimeout(this.tooltipTimeout)
      this.tooltipTimeout = null
    }

    // Store pending tooltip info
    this.pendingTooltip = { tabIndex, x, y }

    // Delay tooltip display by 3 seconds (3000ms)
    this.tooltipTimeout = window.setTimeout(() => {
      if (this.pendingTooltip?.tabIndex === tabIndex) {
        this.renderTooltip(tabIndex, x, y)
      }
    }, 3000)
  }

  private renderTooltip(tabIndex: number, x: number, y: number) {
    // Remove any existing tooltip
    this.hideHistoryTooltip()

    const tab = this.tabManager.activeTabs[tabIndex]
    if (!tab) return

    const entries = tab.history.getFirstN(this.MAX_HISTORY_PREVIEW)
    if (entries.length === 0) return

    this.tooltipContainer = new Container()

    const padding = 8
    const lineHeight = 14
    const maxWidth = 300

    // Format history entries
    const lines: string[] = []
    for (const entry of entries) {
      const prefix = entry.type === 'shell' ? '$' : '['
      const text = entry.type === 'shell'
        ? `${prefix} ${entry.command.slice(0, 50)}`
        : `${entry.command.slice(0, 50)}`
      lines.push(text.length > 50 ? text.slice(0, 47) + '...' : text)
    }

    // Calculate dimensions
    const tempText = new Text({
      text: lines.join('\n'),
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: themeManager.theme.tabActiveText,
      }),
    })
    const textWidth = Math.min(tempText.width, maxWidth - padding * 2)
    const textHeight = lines.length * lineHeight
    tempText.destroy()

    const tooltipWidth = textWidth + padding * 2
    const tooltipHeight = textHeight + padding * 2

    // Tooltip background - 90% opaque (10% transparent)
    const bg = new Graphics()
    bg.roundRect(0, 0, tooltipWidth, tooltipHeight, 6)
    bg.fill({ color: themeManager.theme.tabActiveBg, alpha: 1.0 })
    bg.stroke({ width: 1, color: themeManager.theme.tabBorder })
    this.tooltipContainer.addChild(bg)

    // History entries text
    const tooltipText = new Text({
      text: lines.join('\n'),
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11,
        fill: themeManager.theme.tabActiveText,
        lineHeight: lineHeight,
      }),
    })
    tooltipText.x = padding
    tooltipText.y = padding
    this.tooltipContainer.addChild(tooltipText)

    // Position tooltip BELOW the tab, centered horizontally
    let tooltipX = x + (120 / 2) - (tooltipWidth / 2) // centered on tab
    let tooltipY = y + this.height + 8 // BELOW the tab (was: y - tooltipHeight - 4)

    // Clamp to screen bounds
    tooltipX = Math.max(4, Math.min(tooltipX, window.innerWidth - tooltipWidth - 4))
    // Ensure it doesn't go below screen
    const maxY = window.innerHeight - tooltipHeight - 4
    tooltipY = Math.min(tooltipY, maxY)

    this.tooltipContainer.x = tooltipX
    this.tooltipContainer.y = tooltipY

    this.container.addChild(this.tooltipContainer)
  }

  private hideHistoryTooltip() {
    // Clear any pending timeout
    if (this.tooltipTimeout !== null) {
      window.clearTimeout(this.tooltipTimeout)
      this.tooltipTimeout = null
    }
    this.pendingTooltip = null

    if (this.tooltipContainer) {
      this.tooltipContainer.destroy()
      this.tooltipContainer = null
    }
  }

  // Button tooltip methods (simple, immediate display)
  private showButtonTooltip(text: string, x: number, y: number): void {
    this.hideButtonTooltip()

    this.buttonTooltipContainer = new Container()

    const padding = 6
    const fontSize = 11

    // Create text first to measure it
    const tooltipText = new Text({
      text: text,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: fontSize,
        fill: themeManager.theme.tabActiveText,
      }),
    })

    const textWidth = tooltipText.width
    const textHeight = tooltipText.height
    const tooltipWidth = textWidth + padding * 2
    const tooltipHeight = textHeight + padding * 2

    // Tooltip background
    const bg = new Graphics()
    bg.roundRect(0, 0, tooltipWidth, tooltipHeight, 4)
    bg.fill({ color: themeManager.theme.tabActiveBg, alpha: 0.95 })
    bg.stroke({ width: 1, color: themeManager.theme.tabBorder })
    this.buttonTooltipContainer.addChild(bg)

    // Position text
    tooltipText.x = padding
    tooltipText.y = padding
    this.buttonTooltipContainer.addChild(tooltipText)

    // Position tooltip BELOW the button, centered
    let tooltipX = x - tooltipWidth / 2
    let tooltipY = y + this.titleBarHeight - 2

    // Clamp to screen bounds
    tooltipX = Math.max(4, Math.min(tooltipX, window.innerWidth - tooltipWidth - 4))
    tooltipY = Math.min(tooltipY, window.innerHeight - tooltipHeight - 4)

    this.buttonTooltipContainer.x = tooltipX
    this.buttonTooltipContainer.y = tooltipY

    this.container.addChild(this.buttonTooltipContainer)
  }

  private hideButtonTooltip(): void {
    if (this.buttonTooltipContainer) {
      this.buttonTooltipContainer.destroy()
      this.buttonTooltipContainer = null
    }
  }

  // Drag handlers
  private onDragMove = (e: any) => {
    if (this._dragIndex === -1) return

    const x = e.global.x
    this._dragCurrentX = x

    const dx = x - this._dragStartX

    // Check if we've moved enough to start dragging
    if (!this._isDragging && Math.abs(dx) > this._dragThreshold) {
      this._isDragging = true
      this.hideHistoryTooltip()
    }

    if (this._isDragging) {
      // Calculate which tab position we're over
      const tabWidth = this.tabManager.activeTabs.length > 0
        ? Math.min(TAB_WIDTH, Math.floor(window.innerWidth / this.tabManager.activeTabs.length))
        : TAB_WIDTH

      // Calculate the target index based on drag position
      // Account for the drag offset within the tab
      const dragOffset = this._dragStartX - (this._dragIndex * tabWidth)
      const targetX = x - dragOffset
      let targetIndex = Math.round(targetX / tabWidth)

      // Clamp to valid range
      targetIndex = Math.max(0, Math.min(targetIndex, this.tabManager.activeTabs.length - 1))

      // If we've moved to a new position, reorder tabs
      if (targetIndex !== this._dragIndex) {
        this.tabManager.moveTab(this._dragIndex, targetIndex)
        // Update drag index to match new position
        this._dragIndex = targetIndex
        this._dragStartX = x
        // Refresh to show new order
        this.refresh()
      }
    }
  }

  private onDragEnd = () => {
    // Clean up drag state
    this._isDragging = false
    this._dragIndex = -1
    this._dragStartX = 0
    this._dragCurrentX = 0

    // Remove stage listeners
    this.app.stage.off('pointermove', this.onDragMove)
    this.app.stage.off('pointerup', this.onDragEnd)
    this.app.stage.off('pointerupoutside', this.onDragEnd)
  }

  refresh() {
    // Clear old tab items
    for (const item of this.tabItems) {
      item.destroy({ children: true })
    }
    this.tabItems = []

    // Draw background for entire tab bar area (tabs + title bar)
    this.bg.clear()
    this.bg.rect(0, 0, window.innerWidth, this.height + this.titleBarHeight)
    this.bg.fill({ color: themeManager.theme.tabBarBg })

    this.titleBar.removeChildren()

    const tabs = this.tabManager.activeTabs
    const activeIdx = this.tabManager.activeTabIndex

    // Start tabs below the title bar
    const tabOffsetY = this.titleBarHeight

    // Tabs use full window width (controls are in title bar row above)
    const availableWidth = window.innerWidth
    // Each tab gets equal width, but never more than TAB_WIDTH
    const actualTabWidth = tabs.length > 0 ? Math.min(TAB_WIDTH, Math.floor(availableWidth / tabs.length)) : TAB_WIDTH

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      const isActive = i === activeIdx
      const tabContainer = new Container()
      tabContainer.y = tabOffsetY
      const x = i * actualTabWidth

      // Tab background
      const tabBg = new Graphics()
      tabBg.rect(x + 1, 1, actualTabWidth - 2, this.height - 2)
      tabBg.fill({ color: isActive ? themeManager.theme.tabActiveBg : themeManager.theme.tabInactiveBg })
      tabContainer.addChild(tabBg)

      // Color boundary - all 4 sides
      const colorBoundary = new Graphics()
      colorBoundary.rect(x + 1, 1, 3, this.height - 2)               // left
      colorBoundary.rect(x + 1, 1, actualTabWidth - 2, 3)             // top
      colorBoundary.rect(x + actualTabWidth - 4, 1, 3, this.height - 2) // right
      colorBoundary.rect(x + 1, this.height - 4, actualTabWidth - 2, 3) // bottom
      colorBoundary.fill({ color: tab.color })
      tabContainer.addChild(colorBoundary)

      // Active indicator - downward arrow from title bar pointing to tab
      if (isActive) {
        const indicator = new Graphics()
        const arrowWidth = 12
        const arrowHeight = 8
        const centerX = x + actualTabWidth / 2
        // Arrow starts in title bar area and points down to touch tab's top border
        const tipY = 4   // tip penetrates slightly into tab (touches the colored top border)
        const baseY = tipY - arrowHeight - 2  // base sits above in title bar area

        // Draw downward pointing triangle
        indicator.moveTo(centerX - arrowWidth / 2, baseY) // left base (in title bar)
        indicator.lineTo(centerX + arrowWidth / 2, baseY) // right base (in title bar)
        indicator.lineTo(centerX, tipY)                   // tip (touching tab top)
        indicator.closePath()
        indicator.fill({ color: themeManager.theme.tabActiveIndicator })
        tabContainer.addChild(indicator)
      }

      // === Top row: status dot, emoji, optional bell, close button ===
      const topRowY = 4
      const bottomRowY = 22
      const iconFontSize = 10

      // State indicator dot (colored circle)
      const stateColor = STATE_COLOR[tab.state] || 0x888888
      const stateDot = new Graphics()
      stateDot.circle(x + TAB_PADDING + 4, topRowY + 6, 3)
      stateDot.fill({ color: stateColor })
      tabContainer.addChild(stateDot)

      // State emoji
      const emoji = STATE_EMOJI[tab.state] || '⬤'
      const emojiLabel = new Text({
        text: emoji,
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: iconFontSize,
        }),
      })
      emojiLabel.x = x + TAB_PADDING + 12
      emojiLabel.y = topRowY
      tabContainer.addChild(emojiLabel)

      // Bell indicator (🔔) - shown when bell character received, in top row
      if (tab.hasBell) {
        const bellIndicator = new Text({
          text: '🔔',
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: iconFontSize,
            fill: 0xffaa00,
          }),
        })
        bellIndicator.x = emojiLabel.x + emojiLabel.width + 3
        bellIndicator.y = topRowY
        tabContainer.addChild(bellIndicator)
      }

      // Close button (×) - top-right corner
      const closeBtn = new Text({
        text: '×',
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 13,
          fill: isActive ? themeManager.theme.tabInactiveText : themeManager.theme.buttonIcon,
          fontWeight: 'bold',
        }),
      })
      closeBtn.x = x + actualTabWidth - TAB_PADDING - closeBtn.width
      closeBtn.y = topRowY - 1
      tabContainer.addChild(closeBtn)

      // === Bottom row: shell name (or rename input) ===
      const maxTextWidth = actualTabWidth - TAB_PADDING * 2 - 6
      const isRenaming = this._renameActive && this._renameIndex === i

      if (isRenaming) {
        // Render inline rename input
        const renameBg = new Graphics()
        renameBg.rect(x + TAB_PADDING + 2, bottomRowY - 2, maxTextWidth + 4, 16)
        renameBg.fill({ color: 0x1a1a2e, alpha: 0.95 })
        renameBg.rect(x + TAB_PADDING + 2, bottomRowY - 2, maxTextWidth + 4, 16)
        renameBg.stroke({ width: 1, color: 0x4488aa })
        tabContainer.addChild(renameBg)

        const renameLabel = new Text({
          text: this._renameBuffer,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            fill: 0xffffff,
          }),
        })
        renameLabel.x = x + TAB_PADDING + 4
        renameLabel.y = bottomRowY
        tabContainer.addChild(renameLabel)

        // Blinking cursor
        const renameCursor = new Graphics()
        const cursorX = renameLabel.x + renameLabel.width + 1
        renameCursor.rect(cursorX, bottomRowY, 1, 12)
        renameCursor.fill({ color: 0xffffff })
        tabContainer.addChild(renameCursor)
      } else {
        let displayTitle = tab.title

        // Truncate title to fit (show rightmost characters)
        const tempLabel = new Text({
          text: displayTitle,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            fill: isActive ? themeManager.theme.tabActiveText : themeManager.theme.tabInactiveText,
          }),
        })

        if (tempLabel.width > maxTextWidth && displayTitle.length > 3) {
          let truncated = displayTitle
          while (truncated.length > 3) {
            tempLabel.text = `…${truncated.slice(1)}`
            if (tempLabel.width <= maxTextWidth) {
              displayTitle = `…${truncated.slice(1)}`
              break
            }
            truncated = truncated.slice(1)
          }
          if (truncated.length <= 3) {
            displayTitle = truncated
          }
        }
        tempLabel.destroy()

        const label = new Text({
          text: displayTitle,
          style: new TextStyle({
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            fill: isActive ? themeManager.theme.tabActiveText : themeManager.theme.tabInactiveText,
          }),
        })
        label.x = x + TAB_PADDING + 4
        label.y = bottomRowY
        tabContainer.addChild(label)
      }

      // Attention score bar — thin colored bar at bottom of tab
      if (this.tabManager.autoSwitchEnabled && !isActive) {
        const score = this.tabManager.attentionScorer.getTabScore(tab.id)
        if (score > 0) {
          const maxScore = 150 // clamp for display
          const ratio = Math.min(score / maxScore, 1.0)
          const barWidth = Math.max(2, (actualTabWidth - 10) * ratio)

          // Vibrant neon gradient: cyan → purple → hot pink → red
          let barColor: number
          if (score < 30) {
            barColor = 0x22d3d3 // electric cyan
          } else if (score < 60) {
            barColor = 0xa855f7 // vivid purple
          } else if (score < 100) {
            barColor = 0xff6b9d // hot pink
          } else {
            barColor = 0xff3366 // vibrant red
          }

          const scoreBar = new Graphics()
          scoreBar.roundRect(x + 5, this.height - 5, barWidth, 3, 1)
          scoreBar.fill({ color: barColor, alpha: 0.9 })
          tabContainer.addChild(scoreBar)
        }
      }

      // Tab interaction handlers (click, drag, double-click)
      tabContainer.eventMode = 'static'
      tabContainer.cursor = 'pointer'

      // Drag handlers
      tabContainer.on('pointerdown', (e: any) => {
        if (this._renameActive) return
        e.stopPropagation?.()

        // Start potential drag
        this._dragIndex = i
        this._dragStartX = e.global.x
        this._dragCurrentX = e.global.x
        this._isDragging = false

        // Listen for drag move/up on the stage
        this.app.stage.eventMode = 'static'
        this.app.stage.on('pointermove', this.onDragMove)
        this.app.stage.on('pointerup', this.onDragEnd)
        this.app.stage.on('pointerupoutside', this.onDragEnd)
      })

      // Keep existing click handler but check for drag
      tabContainer.on('pointertap', (e: any) => {
        if (this._isDragging) {
          // Was a drag, not a click
          return
        }
        e.stopPropagation?.()
        const now = Date.now()
        if (now - this._lastClickTime < 400 && i === this._lastClickIndex && i === this.tabManager.activeTabIndex) {
          // Double-click on active tab — rename
          this.activateRename(i)
        } else {
          this.tabManager.switchToTab(i)
          this.refresh()
        }
        this._lastClickTime = now
        this._lastClickIndex = i
      })

      // Hover handlers for history tooltip
      tabContainer.on('pointerover', () => {
        if (!this._isDragging) {
          this.showHistoryTooltip(i, x, tabOffsetY)
        }
      })
      tabContainer.on('pointerout', () => {
        this.hideHistoryTooltip()
      })

      // Close button click handler
      closeBtn.eventMode = 'static'
      closeBtn.cursor = 'pointer'
      closeBtn.on('pointertap', (e: any) => {
        e.stopPropagation()
        this.tabManager.closeTab(i)
        this.refresh()
      })

      // Hover effects
      closeBtn.on('pointerover', () => {
        closeBtn.style.fill = themeManager.theme.tabCloseHover
      })
      closeBtn.on('pointerout', () => {
        closeBtn.style.fill = isActive ? themeManager.theme.tabInactiveText : themeManager.theme.buttonIcon
      })

      this.container.addChild(tabContainer)
      this.tabItems.push(tabContainer)
    }

    // Split buttons container - rendered in title bar row above tabs
    const splitBtnX = 4
    const ctrlHeight = this.titleBarHeight
    const splitButtons = [
      { layout: 'single' as const, tooltip: 'New tab', draw: (g: Graphics, x: number, y: number, w: number, h: number) => {
        // Single: one rectangle
        g.rect(x + w*0.25, y + h*0.2, w*0.5, h*0.6)
        g.fill({ color: themeManager.theme.buttonIcon })
      }},
      { layout: 'vertical' as const, tooltip: 'New tab (split vertically)', draw: (g: Graphics, x: number, y: number, w: number, h: number) => {
        // Vertical: two side-by-side rectangles
        g.rect(x + w*0.15, y + h*0.2, w*0.32, h*0.6)
        g.rect(x + w*0.53, y + h*0.2, w*0.32, h*0.6)
        g.fill({ color: themeManager.theme.buttonIcon })
      }},
      { layout: 'horizontal' as const, tooltip: 'New tab (split horizontal)', draw: (g: Graphics, x: number, y: number, w: number, h: number) => {
        // Horizontal: two stacked rectangles
        g.rect(x + w*0.25, y + h*0.15, w*0.5, h*0.32)
        g.rect(x + w*0.25, y + h*0.53, w*0.5, h*0.32)
        g.fill({ color: themeManager.theme.buttonIcon })
      }},
      { layout: 'quad' as const, tooltip: 'New tab (split quad)', draw: (g: Graphics, x: number, y: number, w: number, h: number) => {
        // Quad: 2x2 grid
        const gap = 1
        const rw = (w*0.7 - gap) / 2
        const rh = (h*0.7 - gap) / 2
        const sx = x + w*0.15
        const sy = y + h*0.15
        g.rect(sx, sy, rw, rh)
        g.rect(sx + rw + gap, sy, rw, rh)
        g.rect(sx, sy + rh + gap, rw, rh)
        g.rect(sx + rw + gap, sy + rh + gap, rw, rh)
        g.fill({ color: themeManager.theme.buttonIcon })
      }},
    ]

    for (let i = 0; i < splitButtons.length; i++) {
      const btn = splitButtons[i]
      const btnContainer = new Container()
      const btnX = splitBtnX + i * 32

      const btnBg = new Graphics()
      btnBg.rect(btnX, 2, 28, ctrlHeight - 4)
      btnBg.fill({ color: themeManager.theme.buttonBg })
      btnContainer.addChild(btnBg)

      // Draw layout icon
      const iconGraphics = new Graphics()
      btn.draw(iconGraphics, btnX, 2, 28, ctrlHeight - 4)
      btnContainer.addChild(iconGraphics)

      btnContainer.eventMode = 'static'
      btnContainer.cursor = 'pointer'
      btnContainer.on('pointertap', () => {
        // Only create tab if under the limit
        if (this.tabManager.activeTabs.length < MAX_TABS) {
          this.tabManager.createTab(btn.layout)
          this.refresh()
        }
      })

      // Hover effect
      btnContainer.on('pointerover', () => {
        btnBg.clear()
        btnBg.rect(btnX, 2, 28, ctrlHeight - 4)
        btnBg.fill({ color: themeManager.theme.buttonHoverBg })
        iconGraphics.clear()
        iconGraphics.fillStyle = { color: themeManager.theme.buttonIconHover }
        btn.draw(iconGraphics, btnX, 2, 28, ctrlHeight - 4)
        this.showButtonTooltip(btn.tooltip, btnX + 14, 0)
      })
      btnContainer.on('pointerout', () => {
        btnBg.clear()
        btnBg.rect(btnX, 2, 28, ctrlHeight - 4)
        btnBg.fill({ color: themeManager.theme.buttonBg })
        iconGraphics.clear()
        iconGraphics.fillStyle = { color: themeManager.theme.buttonIcon }
        btn.draw(iconGraphics, btnX, 2, 28, ctrlHeight - 4)
        this.hideButtonTooltip()
      })

      this.titleBar.addChild(btnContainer)
      this.tabItems.push(btnContainer)
    }

    // Auto-switch button - jump to most important tab
    const autoSwitchBtnContainer = new Container()
    const autoSwitchX = window.innerWidth - 280

    const autoSwitchBg = new Graphics()
    autoSwitchBg.rect(autoSwitchX, 2, 32, ctrlHeight - 4)
    autoSwitchBg.fill({ color: themeManager.theme.buttonBg })
    autoSwitchBtnContainer.addChild(autoSwitchBg)

    const autoSwitchIcon = new Text({
      text: '⚡',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fill: 0xffd700, // gold star
      }),
    })
    autoSwitchIcon.x = autoSwitchX + 8
    autoSwitchIcon.y = (ctrlHeight - autoSwitchIcon.height) / 2
    autoSwitchBtnContainer.addChild(autoSwitchIcon)

    // Pulsing glow when a tab has high attention score
    const bestScore = this.tabManager.attentionScorer.getMostNeedsAttention()
    const hasHighScore = bestScore && bestScore.score >= 60
    const autoSwitchGlow = new Graphics()
    autoSwitchBtnContainer.addChild(autoSwitchGlow)
    this.autoSwitchGlow = hasHighScore ? autoSwitchGlow : null
    this.autoSwitchGlowX = autoSwitchX

    autoSwitchBtnContainer.eventMode = 'static'
    autoSwitchBtnContainer.cursor = 'pointer'
    autoSwitchBtnContainer.on('pointertap', () => {
      this.onAutoSwitchToggle()
    })

    autoSwitchBtnContainer.on('pointerover', () => {
      autoSwitchBg.clear()
      autoSwitchBg.rect(autoSwitchX, 2, 32, ctrlHeight - 4)
      autoSwitchBg.fill({ color: 0x4a1a4a }) // vibrant purple hover
      this.showButtonTooltip('Jump to important tab (Ctrl+Shift+J)', autoSwitchX + 16, 2)
    })
    autoSwitchBtnContainer.on('pointerout', () => {
      autoSwitchBg.clear()
      autoSwitchBg.rect(autoSwitchX, 2, 32, ctrlHeight - 4)
      autoSwitchBg.fill({ color: themeManager.theme.buttonBg })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(autoSwitchBtnContainer)
    this.tabItems.push(autoSwitchBtnContainer)

    // Markdown toggle button - in title bar row, right-side group
    const mdBtnContainer = new Container()
    const mdX = window.innerWidth - 240
    const isMdActive = this.tabManager.activeTab
      ? this.tabManager.activeTab.splitPane.activePanes.some(p => p.engine.markdownStyler.enabled)
      : false

    const mdBg = new Graphics()
    mdBg.rect(mdX, 2, 32, ctrlHeight - 4)
    // Vibrant cyan when active, normal when inactive
    mdBg.fill({ color: isMdActive ? 0xFFB347 : themeManager.theme.buttonBg })
    mdBtnContainer.addChild(mdBg)

    const mdIcon = new Text({
      text: 'Ⓜ',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fill: isMdActive ? 0x2a1a0a : 0xFFB347,  // dark brown when active, orange when inactive for visibility
        fontWeight: 'bold',
      }),
    })
    mdIcon.x = mdX + 8
    mdIcon.y = (ctrlHeight - mdIcon.height) / 2
    mdBtnContainer.addChild(mdIcon)

    mdBtnContainer.eventMode = 'static'
    mdBtnContainer.cursor = 'pointer'
    mdBtnContainer.on('pointertap', () => {
      commandRegistry.executeById('markdown:toggle')
      this.refresh()
    })

    mdBtnContainer.on('pointerover', () => {
      mdBg.clear()
      mdBg.rect(mdX, 2, 32, ctrlHeight - 4)
      mdBg.fill({ color: isMdActive ? 0x22eeff : themeManager.theme.buttonHoverBg }) // brighter cyan on hover
      this.showButtonTooltip('Semi-Markdown (Ctrl+Shift+K)', mdX + 16, 2)
    })
    mdBtnContainer.on('pointerout', () => {
      mdBg.clear()
      mdBg.rect(mdX, 2, 32, ctrlHeight - 4)
      mdBg.fill({ color: isMdActive ? 0xFFB347 : themeManager.theme.buttonBg })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(mdBtnContainer)
    this.tabItems.push(mdBtnContainer)

    // Normal terminal button - in title bar row, right-side group
    const normalBtnContainer = new Container()
    const normalX = window.innerWidth - 320

    const normalBg = new Graphics()
    normalBg.rect(normalX, 2, 32, ctrlHeight - 4)
    normalBg.fill({ color: themeManager.theme.buttonBg })
    normalBtnContainer.addChild(normalBg)

    // Terminal icon - ">_" prompt shape
    const normalIcon = new Graphics()
    const nIx = normalX + 6
    const nIy = (ctrlHeight - 12) / 2
    // Draw ">" chevron
    normalIcon.moveTo(nIx, nIy)
    normalIcon.lineTo(nIx + 7, nIy + 6)
    normalIcon.lineTo(nIx, nIy + 12)
    normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIcon })
    // Draw "_" underscore
    normalIcon.moveTo(nIx + 10, nIy + 12)
    normalIcon.lineTo(nIx + 18, nIy + 12)
    normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIcon })
    normalBtnContainer.addChild(normalIcon)

    normalBtnContainer.eventMode = 'static'
    normalBtnContainer.cursor = 'pointer'
    normalBtnContainer.on('pointertap', () => {
      this.onNormalView()
      this.refresh()
    })

    normalBtnContainer.on('pointerover', () => {
      normalBg.clear()
      normalBg.rect(normalX, 2, 32, ctrlHeight - 4)
      normalBg.fill({ color: themeManager.theme.buttonHoverBg })
      normalIcon.clear()
      normalIcon.moveTo(nIx, nIy)
      normalIcon.lineTo(nIx + 7, nIy + 6)
      normalIcon.lineTo(nIx, nIy + 12)
      normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIconHover })
      normalIcon.moveTo(nIx + 10, nIy + 12)
      normalIcon.lineTo(nIx + 18, nIy + 12)
      normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIconHover })
      this.showButtonTooltip('Terminal view (Ctrl+Shift+0)', normalX + 16, 2)
    })
    normalBtnContainer.on('pointerout', () => {
      normalBg.clear()
      normalBg.rect(normalX, 2, 32, ctrlHeight - 4)
      normalBg.fill({ color: themeManager.theme.buttonBg })
      normalIcon.clear()
      normalIcon.moveTo(nIx, nIy)
      normalIcon.lineTo(nIx + 7, nIy + 6)
      normalIcon.lineTo(nIx, nIy + 12)
      normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIcon })
      normalIcon.moveTo(nIx + 10, nIy + 12)
      normalIcon.lineTo(nIx + 18, nIy + 12)
      normalIcon.stroke({ width: 2, color: themeManager.theme.buttonIcon })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(normalBtnContainer)
    this.tabItems.push(normalBtnContainer)

    // History view button - in title bar row
    const historyBtnContainer = new Container()
    const historyX = window.innerWidth - 80
    const isHistoryActive = this.historyActive()

    const historyBg = new Graphics()
    historyBg.rect(historyX, 2, 32, ctrlHeight - 4)
    historyBg.fill({ color: isHistoryActive ? 0x2a4a6a : themeManager.theme.buttonBg })
    historyBtnContainer.addChild(historyBg)

    // History icon - clock face
    const historyIcon = new Graphics()
    const hIx = historyX + 8
    const hIy = (ctrlHeight - 14) / 2
    const clockColor = isHistoryActive ? 0xaaddff : 0x000000
    // Clock circle (white fill, black stroke)
    historyIcon.circle(hIx + 7, hIy + 7, 6)
    historyIcon.fill({ color: 0xffffff })
    historyIcon.stroke({ width: 1.5, color: clockColor })
    // Hour hand (pointing to 9)
    historyIcon.moveTo(hIx + 7, hIy + 7)
    historyIcon.lineTo(hIx + 4, hIy + 7)
    historyIcon.stroke({ width: 1.5, color: clockColor })
    // Minute hand (pointing to 12)
    historyIcon.moveTo(hIx + 7, hIy + 7)
    historyIcon.lineTo(hIx + 7, hIy + 3)
    historyIcon.stroke({ width: 1.5, color: clockColor })
    // Center dot
    historyIcon.circle(hIx + 7, hIy + 7, 1)
    historyIcon.fill({ color: clockColor })
    historyBtnContainer.addChild(historyIcon)

    historyBtnContainer.eventMode = 'static'
    historyBtnContainer.cursor = 'pointer'
    historyBtnContainer.on('pointertap', () => {
      this.onHistoryToggle()
      this.refresh()
    })

    historyBtnContainer.on('pointerover', () => {
      historyBg.clear()
      historyBg.rect(historyX, 2, 32, ctrlHeight - 4)
      historyBg.fill({ color: isHistoryActive ? 0x3a5a7a : themeManager.theme.buttonHoverBg })
      this.showButtonTooltip('History view (Ctrl+Shift+H)', historyX + 16, 2)
    })
    historyBtnContainer.on('pointerout', () => {
      historyBg.clear()
      historyBg.rect(historyX, 2, 32, ctrlHeight - 4)
      historyBg.fill({ color: isHistoryActive ? 0x2a4a6a : themeManager.theme.buttonBg })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(historyBtnContainer)
    this.tabItems.push(historyBtnContainer)

    // Crazy button - in title bar row
    const crazyBtnContainer = new Container()
    const crazyX = window.innerWidth - 40
    const isCrazyActive = this.crazyActive()

    const crazyBg = new Graphics()
    crazyBg.rect(crazyX, 2, 32, ctrlHeight - 4)
    crazyBg.fill({ color: isCrazyActive ? 0x663399 : themeManager.theme.buttonBg })
    crazyBtnContainer.addChild(crazyBg)

    const crazyIcon = new Text({
      text: isCrazyActive ? '🤪' : '🎪',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
      }),
    })
    crazyIcon.x = crazyX + 8
    crazyIcon.y = (ctrlHeight - crazyIcon.height) / 2
    crazyBtnContainer.addChild(crazyIcon)

    crazyBtnContainer.eventMode = 'static'
    crazyBtnContainer.cursor = 'pointer'
    crazyBtnContainer.on('pointertap', () => {
      this.onCrazyToggle()
      this.refresh()
    })

    crazyBtnContainer.on('pointerover', () => {
      crazyBg.clear()
      crazyBg.rect(crazyX, 2, 32, ctrlHeight - 4)
      crazyBg.fill({ color: isCrazyActive ? 0x7744aa : themeManager.theme.buttonHoverBg })
      this.showButtonTooltip('Crazy effects', crazyX + 16, 2)
    })
    crazyBtnContainer.on('pointerout', () => {
      crazyBg.clear()
      crazyBg.rect(crazyX, 2, 32, ctrlHeight - 4)
      crazyBg.fill({ color: isCrazyActive ? 0x663399 : themeManager.theme.buttonBg })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(crazyBtnContainer)
    this.tabItems.push(crazyBtnContainer)

    // File browser button - in title bar row
    const fileBrowserBtnContainer = new Container()
    const fileBrowserX = window.innerWidth - 160

    const fileBrowserBg = new Graphics()
    fileBrowserBg.rect(fileBrowserX, 2, 32, ctrlHeight - 4)
    fileBrowserBg.fill({ color: themeManager.theme.buttonBg })
    fileBrowserBtnContainer.addChild(fileBrowserBg)

    // File browser icon - folder shape
    const fileBrowserIcon = new Graphics()
    const fbIx = fileBrowserX + 8
    const fbIy = (ctrlHeight - 12) / 2
    // Draw folder shape
    fileBrowserIcon.moveTo(fbIx, fbIy + 3)
    fileBrowserIcon.lineTo(fbIx, fbIy + 12)
    fileBrowserIcon.lineTo(fbIx + 16, fbIy + 12)
    fileBrowserIcon.lineTo(fbIx + 16, fbIy + 3)
    fileBrowserIcon.lineTo(fbIx + 9, fbIy + 3)
    fileBrowserIcon.lineTo(fbIx + 7, fbIy)
    fileBrowserIcon.lineTo(fbIx + 3, fbIy)
    fileBrowserIcon.lineTo(fbIx, fbIy + 3)
    fileBrowserIcon.closePath()
    fileBrowserIcon.fill({ color: themeManager.theme.fileBrowserIcon })
    fileBrowserBtnContainer.addChild(fileBrowserIcon)

    fileBrowserBtnContainer.eventMode = 'static'
    fileBrowserBtnContainer.cursor = 'pointer'
    fileBrowserBtnContainer.on('pointertap', () => {
      this.onFileBrowserToggle()
    })

    fileBrowserBtnContainer.on('pointerover', () => {
      fileBrowserBg.clear()
      fileBrowserBg.rect(fileBrowserX, 2, 32, ctrlHeight - 4)
      fileBrowserBg.fill({ color: themeManager.theme.buttonHoverBg })
      fileBrowserIcon.clear()
      fileBrowserIcon.moveTo(fbIx, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx, fbIy + 12)
      fileBrowserIcon.lineTo(fbIx + 16, fbIy + 12)
      fileBrowserIcon.lineTo(fbIx + 16, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx + 9, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx + 7, fbIy)
      fileBrowserIcon.lineTo(fbIx + 3, fbIy)
      fileBrowserIcon.lineTo(fbIx, fbIy + 3)
      fileBrowserIcon.closePath()
      fileBrowserIcon.fill({ color: themeManager.theme.fileBrowserIconHover })
      this.showButtonTooltip('File browser (Ctrl+Shift+F)', fileBrowserX + 16, 2)
    })
    fileBrowserBtnContainer.on('pointerout', () => {
      fileBrowserBg.clear()
      fileBrowserBg.rect(fileBrowserX, 2, 32, ctrlHeight - 4)
      fileBrowserBg.fill({ color: themeManager.theme.buttonBg })
      fileBrowserIcon.clear()
      fileBrowserIcon.moveTo(fbIx, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx, fbIy + 12)
      fileBrowserIcon.lineTo(fbIx + 16, fbIy + 12)
      fileBrowserIcon.lineTo(fbIx + 16, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx + 9, fbIy + 3)
      fileBrowserIcon.lineTo(fbIx + 7, fbIy)
      fileBrowserIcon.lineTo(fbIx + 3, fbIy)
      fileBrowserIcon.lineTo(fbIx, fbIy + 3)
      fileBrowserIcon.closePath()
      fileBrowserIcon.fill({ color: themeManager.theme.fileBrowserIcon })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(fileBrowserBtnContainer)
    this.tabItems.push(fileBrowserBtnContainer)

    // Dashboard button - in title bar row, far right with separation
    const dashboardBtnContainer = new Container()
    const dashboardX = window.innerWidth - 200

    // Visual separator line
    const separator = new Graphics()
    separator.rect(dashboardX - 12, 6, 1, ctrlHeight - 12)
    separator.fill({ color: themeManager.theme.separatorColor })
    dashboardBtnContainer.addChild(separator)

    // Dashboard button background
    const dashboardBg = new Graphics()
    dashboardBg.rect(dashboardX, 2, 32, ctrlHeight - 4)
    dashboardBg.fill({ color: themeManager.theme.buttonBg })
    dashboardBtnContainer.addChild(dashboardBg)

    // Dashboard icon - 2x2 grid with rounded corners look
    const dashboardIcon = new Graphics()
    const iconSize = 14
    const gap = 2
    const cellSize = (iconSize - gap) / 2
    const ix = dashboardX + 16 - iconSize / 2
    const iy = (ctrlHeight - iconSize) / 2
    // Four cells representing tabs in dashboard view
    dashboardIcon.rect(ix, iy, cellSize, cellSize)
    dashboardIcon.rect(ix + cellSize + gap, iy, cellSize, cellSize)
    dashboardIcon.rect(ix, iy + cellSize + gap, cellSize, cellSize)
    dashboardIcon.rect(ix + cellSize + gap, iy + cellSize + gap, cellSize, cellSize)
    dashboardIcon.fill({ color: themeManager.theme.dashboardIcon })
    dashboardBtnContainer.addChild(dashboardIcon)

    dashboardBtnContainer.eventMode = 'static'
    dashboardBtnContainer.cursor = 'pointer'
    dashboardBtnContainer.on('pointertap', () => {
      this.onDashboardToggle()
    })

    // Hover effect
    dashboardBtnContainer.on('pointerover', () => {
      dashboardBg.clear()
      dashboardBg.rect(dashboardX, 2, 32, ctrlHeight - 4)
      dashboardBg.fill({ color: themeManager.theme.buttonHoverBg })
      dashboardIcon.clear()
      dashboardIcon.rect(ix, iy, cellSize, cellSize)
      dashboardIcon.rect(ix + cellSize + gap, iy, cellSize, cellSize)
      dashboardIcon.rect(ix, iy + cellSize + gap, cellSize, cellSize)
      dashboardIcon.rect(ix + cellSize + gap, iy + cellSize + gap, cellSize, cellSize)
      dashboardIcon.fill({ color: themeManager.theme.dashboardIconHover })
      this.showButtonTooltip('Dashboard (Ctrl+Shift+D)', dashboardX + 16, 2)
    })
    dashboardBtnContainer.on('pointerout', () => {
      dashboardBg.clear()
      dashboardBg.rect(dashboardX, 2, 32, ctrlHeight - 4)
      dashboardBg.fill({ color: themeManager.theme.buttonBg })
      dashboardIcon.clear()
      dashboardIcon.rect(ix, iy, cellSize, cellSize)
      dashboardIcon.rect(ix + cellSize + gap, iy, cellSize, cellSize)
      dashboardIcon.rect(ix, iy + cellSize + gap, cellSize, cellSize)
      dashboardIcon.rect(ix + cellSize + gap, iy + cellSize + gap, cellSize, cellSize)
      dashboardIcon.fill({ color: themeManager.theme.dashboardIcon })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(dashboardBtnContainer)
    this.tabItems.push(dashboardBtnContainer)

    // Git version control button - in title bar row
    const gitBtnContainer = new Container()
    const gitX = window.innerWidth - 120
    const isGitActive = this.gitActive()

    const gitBg = new Graphics()
    gitBg.rect(gitX, 2, 32, ctrlHeight - 4)
    gitBg.fill({ color: isGitActive ? 0x2a4a2a : themeManager.theme.buttonBg })
    gitBtnContainer.addChild(gitBg)

    // Git icon - branch/fork symbol
    const gitIcon = new Graphics()
    const gIx = gitX + 10
    const gIy = (ctrlHeight - 14) / 2
    const gitColor = isGitActive ? 0x66dd66 : themeManager.theme.dashboardIcon
    // Main branch line (vertical)
    gitIcon.circle(gIx + 3, gIy + 2, 2)
    gitIcon.fill({ color: gitColor })
    gitIcon.circle(gIx + 3, gIy + 12, 2)
    gitIcon.fill({ color: gitColor })
    gitIcon.moveTo(gIx + 3, gIy + 4)
    gitIcon.lineTo(gIx + 3, gIy + 10)
    gitIcon.stroke({ width: 1.5, color: gitColor })
    // Branch line
    gitIcon.circle(gIx + 10, gIy + 5, 2)
    gitIcon.fill({ color: gitColor })
    gitIcon.moveTo(gIx + 10, gIy + 7)
    gitIcon.lineTo(gIx + 10, gIy + 9)
    gitIcon.lineTo(gIx + 3, gIy + 9)
    gitIcon.stroke({ width: 1.5, color: gitColor })
    gitBtnContainer.addChild(gitIcon)

    gitBtnContainer.eventMode = 'static'
    gitBtnContainer.cursor = 'pointer'
    gitBtnContainer.on('pointertap', () => {
      this.onGitToggle()
      this.refresh()
    })

    gitBtnContainer.on('pointerover', () => {
      gitBg.clear()
      gitBg.rect(gitX, 2, 32, ctrlHeight - 4)
      gitBg.fill({ color: isGitActive ? 0x3a5a3a : themeManager.theme.buttonHoverBg })
      this.showButtonTooltip('Git view (Ctrl+Shift+G)', gitX + 16, 2)
    })
    gitBtnContainer.on('pointerout', () => {
      gitBg.clear()
      gitBg.rect(gitX, 2, 32, ctrlHeight - 4)
      gitBg.fill({ color: isGitActive ? 0x2a4a2a : themeManager.theme.buttonBg })
      this.hideButtonTooltip()
    })

    this.titleBar.addChild(gitBtnContainer)
    this.tabItems.push(gitBtnContainer)

    // Update command input position
    this.renderCommandInput()
  }
}
