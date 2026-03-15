import { Application, Container, Graphics, Text, TextStyle, Sprite } from 'pixi.js'
import { TabManager, type Tab, type TabState } from './TabManager'
import { themeManager } from '../themes/ThemeManager'

const STATE_EMOJI: Record<TabState, string> = {
  'idle-ready': '🥱',      // Idle, shell ready (yawning)
  'running': '🏃',         // Running, not waiting for input (jogger)
  'running-input': '💬',   // Running, waiting for user input (callout text bubble)
  'idle-error': '❌',      // Idle, last command failed
}

// Color for idle/waiting state - highlighted to encourage minimizing idle sessions
const WAITING_COLOR = 0xffdd00  // Yellow - idle sessions should be minimized!

const STATE_COLOR: Record<TabState, number> = {
  'idle-ready': WAITING_COLOR, // Highlighted - minimize idle sessions
  'running': 0x00aaff,         // Blue - busy running
  'running-input': WAITING_COLOR,   // Orange - interactive, needs attention
  'idle-error': 0xff4444,      // Red - error occurred
}

const STATE_LABEL: Record<TabState, string> = {
  'idle-ready': 'Waiting',
  'running': 'Running',
  'running-input': 'awaits input',
  'idle-error': 'Error',
}

interface TabCard {
  container: Container
  tabId: string
  titleText: Text
  emojiText: Text
  stateLabel: Text
  previewContainer: Container
  screenshotSprite: Sprite | null
  closeBtn: Text
  bg: Graphics
  indicator: Graphics
  baseTint: number
}

// Preview area dimensions (now computed per-card from dynamic card size)

export class Dashboard extends Container {
  private app: Application
  private tabManager: TabManager
  private tabBarHeight: number
  private bg: Graphics
  private cards: TabCard[] = []
  private cardsContainer: Container
  private titleText: Text
  private _visible = false

  // Card sizing — computed dynamically per refresh
  private cardWidth = 320
  private cardHeight = 200
  private readonly CARD_PADDING = 16
  private readonly CARD_ASPECT = 320 / 200 // width:height ratio preserved
  private cols = 1
  private rows = 1

  constructor(app: Application, tabManager: TabManager, tabBarHeight: number) {
    super()
    this.app = app
    this.tabManager = tabManager
    this.tabBarHeight = tabBarHeight

    // Background
    this.bg = new Graphics()
    this.addChild(this.bg)

    // Title
    this.titleText = new Text({
      text: '📊 Dashboard',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 24,
        fill: themeManager.theme.cardTitle,
        fontWeight: 'bold',
      }),
    })
    this.titleText.x = this.CARD_PADDING
    this.titleText.y = this.tabBarHeight + this.CARD_PADDING
    this.addChild(this.titleText)

    // Cards container
    this.cardsContainer = new Container()
    this.cardsContainer.y = this.tabBarHeight + 60
    this.addChild(this.cardsContainer)

    // Initially hidden
    this.visible = false
    this.eventMode = 'none'

    // Listen for tab changes to refresh if visible
    window.addEventListener('tab-created', () => {
      if (this._visible) {
        this.refresh()
      }
    })
    window.addEventListener('tab-closed', () => {
      if (this._visible) {
        this.refresh()
      }
    })
  }

  get isVisible(): boolean {
    return this._visible
  }

  show() {
    this._visible = true
    this.visible = true
    this.eventMode = 'static'
    this.refresh()
  }

  hide() {
    this._visible = false
    this.visible = false
    this.eventMode = 'none'
  }

  toggle() {
    if (this._visible) {
      this.hide()
    } else {
      this.show()
    }
  }

  refresh() {
    if (!this._visible) return

    this.drawBackground()
    this.createCards()
  }

  private drawBackground() {
    this.bg.clear()
    this.bg.rect(0, this.tabBarHeight, this.app.screen.width, this.app.screen.height - this.tabBarHeight)
    this.bg.fill({ color: themeManager.theme.dashboardBg })
  }

  /**
   * Compute the best grid (cols × rows) so all n cards fit without overflow.
   * Maximises card size while keeping the original aspect ratio.
   */
  private computeLayout(n: number) {
    const pad = this.CARD_PADDING
    const availW = this.app.screen.width - pad * 2
    const availH = this.app.screen.height - this.cardsContainer.y - pad

    let bestCols = 1
    let bestSize = 0

    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c)
      const maxW = (availW - pad * (c - 1)) / c
      const maxH = (availH - pad * (r - 1)) / r
      // Constrain by aspect ratio
      const w = Math.min(maxW, maxH * this.CARD_ASPECT)
      if (w > bestSize) {
        bestSize = w
        bestCols = c
      }
    }

    this.cols = bestCols
    this.rows = Math.ceil(n / bestCols)
    this.cardWidth = Math.floor(Math.max(160, bestSize))
    this.cardHeight = Math.floor(this.cardWidth / this.CARD_ASPECT)
  }

  private createCards() {
    // Clear existing cards
    for (const card of this.cards) {
      card.container.destroy({ children: true })
    }
    this.cards = []
    this.cardsContainer.removeChildren()

    const tabs = this.tabManager.activeTabs
    if (tabs.length === 0) {
      this.showEmptyState()
      return
    }

    this.computeLayout(tabs.length)

    const pad = this.CARD_PADDING
    const availW = this.app.screen.width - pad * 2
    // Centre the grid horizontally
    const gridW = this.cols * this.cardWidth + (this.cols - 1) * pad
    const startX = pad + Math.max(0, (availW - gridW) / 2)

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      const col = i % this.cols
      const row = Math.floor(i / this.cols)
      const x = startX + col * (this.cardWidth + pad)
      const y = row * (this.cardHeight + pad)

      const card = this.createCard(tab, x, y)
      this.cards.push(card)
      this.cardsContainer.addChild(card.container)
    }
  }

  private createCard(tab: Tab, x: number, y: number): TabCard {
    const container = new Container()
    container.x = x
    container.y = y

    // Card background with subtle state-based tint
    const baseColor = themeManager.theme.cardBg
    const stateColor = STATE_COLOR[tab.state]
    // Blend base color with state color for subtle background tint
    const bgTint = this.blendColors(baseColor, stateColor, 0.08)

    const bg = new Graphics()
    bg.roundRect(0, 0, this.cardWidth, this.cardHeight, 8)
    bg.fill({ color: bgTint })
    bg.stroke({ width: 2, color: themeManager.theme.cardBorder })
    container.addChild(bg)

    // State color indicator (left border) - thicker and more prominent
    const indicator = new Graphics()
    indicator.roundRect(0, 0, 6, this.cardHeight, { tl: 4, tr: 0, br: 0, bl: 4 })
    indicator.fill({ color: stateColor })
    container.addChild(indicator)

    // State label pill at top right
    const stateLabel = new Text({
      text: STATE_LABEL[tab.state],
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 10,
        fill: stateColor,
        fontWeight: 'bold',
      }),
    })
    stateLabel.x = this.cardWidth - stateLabel.width - 30
    stateLabel.y = 12
    container.addChild(stateLabel)

    // Emoji
    const emojiText = new Text({
      text: STATE_EMOJI[tab.state],
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
      }),
    })
    emojiText.x = 12
    emojiText.y = 8
    container.addChild(emojiText)

    // Title
    const titleText = new Text({
      text: tab.title,
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 14,
        fill: themeManager.theme.cardTitle,
        fontWeight: 'bold',
      }),
    })
    titleText.x = 36
    titleText.y = 10
    container.addChild(titleText)

    // Bell indicator (🔔) - shown when bell character received
    if (tab.hasBell) {
      const bellIndicator = new Text({
        text: '🔔',
        style: new TextStyle({
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          fill: 0xffaa00, // Orange bell
        }),
      })
      bellIndicator.x = titleText.x + titleText.width + 6
      bellIndicator.y = 9
      container.addChild(bellIndicator)
    }

    // Close button
    const closeBtn = new Text({
      text: '×',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 18,
        fill: themeManager.theme.cardClose,
        fontWeight: 'bold',
      }),
    })
    closeBtn.x = this.cardWidth - 24
    closeBtn.y = 6
    closeBtn.eventMode = 'static'
    closeBtn.cursor = 'pointer'
    closeBtn.on('pointertap', (e: any) => {
      e.stopPropagation()
      this.closeTab(tab.id)
    })
    closeBtn.on('pointerover', () => {
      closeBtn.style.fill = themeManager.theme.cardCloseHover
    })
    closeBtn.on('pointerout', () => {
      closeBtn.style.fill = themeManager.theme.cardClose
    })
    container.addChild(closeBtn)

    // Preview area background with border
    const previewBg = new Graphics()
    previewBg.rect(8, 36, this.cardWidth - 16, this.cardHeight - 44)
    previewBg.fill({ color: themeManager.theme.cardPreviewBg })
    previewBg.stroke({ width: 1, color: themeManager.theme.cardPreviewBorder })
    container.addChild(previewBg)

    // Preview container for screenshot
    const previewContainer = new Container()
    previewContainer.x = 8
    previewContainer.y = 36
    container.addChild(previewContainer)

    // Capture screenshot from the tab
    const previewW = this.cardWidth - 16
    const previewH = this.cardHeight - 44
    let screenshotSprite: Sprite | null = null
    try {
      screenshotSprite = tab.splitPane.captureScreenshotAsSprite(previewW, previewH)
      if (screenshotSprite) {
        previewContainer.addChild(screenshotSprite)
      }
    } catch (err) {
      console.error('Error capturing screenshot:', err)
    }

    // Click to focus
    container.eventMode = 'static'
    container.cursor = 'pointer'
    container.on('pointertap', () => {
      this.focusTab(tab.id)
    })

    // Store references for hover effect
    const baseTint = bgTint
    const stateBorderColor = stateColor

    // Hover effect
    container.on('pointerover', () => {
      const hoverTint = this.blendColors(baseTint, 0xffffff, 0.05)
      bg.clear()
      bg.roundRect(0, 0, this.cardWidth, this.cardHeight, 8)
      bg.fill({ color: hoverTint })
      bg.stroke({ width: 3, color: stateBorderColor })
    })
    container.on('pointerout', () => {
      bg.clear()
      bg.roundRect(0, 0, this.cardWidth, this.cardHeight, 8)
      bg.fill({ color: baseTint })
      bg.stroke({ width: 2, color: themeManager.theme.cardBorder })
    })

    return {
      container,
      tabId: tab.id,
      titleText,
      emojiText,
      stateLabel,
      previewContainer,
      screenshotSprite,
      closeBtn,
      bg,
      indicator,
      baseTint,
    }
  }

  private showEmptyState() {
    const emptyText = new Text({
      text: 'No tabs open\nPress Cmd/Ctrl+T to create a new tab',
      style: new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 16,
        fill: themeManager.theme.emptyStateText,
        align: 'center',
      }),
    })
    emptyText.x = (this.app.screen.width - emptyText.width) / 2
    emptyText.y = (this.app.screen.height - this.tabBarHeight) / 2
    this.cardsContainer.addChild(emptyText)
  }

  private focusTab(tabId: string) {
    const tabs = this.tabManager.activeTabs
    const index = tabs.findIndex(t => t.id === tabId)
    if (index >= 0) {
      this.tabManager.switchToTab(index)
      this.hide()
    }
  }

  private closeTab(tabId: string) {
    const tabs = this.tabManager.activeTabs
    const index = tabs.findIndex(t => t.id === tabId)
    if (index >= 0) {
      this.tabManager.closeTab(index)
      this.refresh()
    }
  }

  handleResize() {
    if (!this._visible) return
    this.refresh()
  }

  /**
   * Blend two hex colors together
   * @param color1 Base color (hex number)
   * @param color2 Color to blend in (hex number)
   * @param ratio Blend ratio (0-1), higher = more of color2
   */
  private blendColors(color1: number, color2: number, ratio: number): number {
    const r1 = (color1 >> 16) & 0xff
    const g1 = (color1 >> 8) & 0xff
    const b1 = color1 & 0xff

    const r2 = (color2 >> 16) & 0xff
    const g2 = (color2 >> 8) & 0xff
    const b2 = color2 & 0xff

    const r = Math.round(r1 * (1 - ratio) + r2 * ratio)
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio)
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio)

    return (r << 16) | (g << 8) | b
  }

  update() {
    // No per-frame work needed — previews are captured once in createCards() when dashboard is shown
  }

  private updatePreviews() {
    const tabs = this.tabManager.activeTabs

    for (const card of this.cards) {
      const tab = tabs.find(t => t.id === card.tabId)
      if (!tab) continue

      // Update emoji
      card.emojiText.text = STATE_EMOJI[tab.state]

      // Update state label text and color
      card.stateLabel.text = STATE_LABEL[tab.state]
      card.stateLabel.x = this.cardWidth - card.stateLabel.width - 30
      card.stateLabel.style.fill = STATE_COLOR[tab.state]

      // Update indicator color
      const stateColor = STATE_COLOR[tab.state]
      card.indicator.clear()
      card.indicator.roundRect(0, 0, 6, this.cardHeight, { tl: 4, tr: 0, br: 0, bl: 4 })
      card.indicator.fill({ color: stateColor })

      // Update background tint
      const newTint = this.blendColors(themeManager.theme.cardBg, stateColor, 0.08)
      card.baseTint = newTint
      card.bg.clear()
      card.bg.roundRect(0, 0, this.cardWidth, this.cardHeight, 8)
      card.bg.fill({ color: newTint })
      card.bg.stroke({ width: 2, color: 0x333355 })

      // Update screenshot - safely remove old sprite
      if (card.screenshotSprite && card.previewContainer) {
        try {
          if (!card.screenshotSprite.destroyed && card.screenshotSprite.parent === card.previewContainer) {
            card.previewContainer.removeChild(card.screenshotSprite)
          }
          if (!card.screenshotSprite.destroyed) {
            card.screenshotSprite.destroy()
          }
        } catch {
          // Sprite or container already in invalid state
        }
        card.screenshotSprite = null
      }

      let newScreenshot: Sprite | null = null
      try {
        const prevW = this.cardWidth - 16
        const prevH = this.cardHeight - 44
        newScreenshot = tab.splitPane.captureScreenshotAsSprite(prevW, prevH)
        if (newScreenshot && card.previewContainer) {
          card.previewContainer.addChild(newScreenshot)
        }
      } catch (err) {
        console.error('Error updating screenshot:', err)
      }

      // Update the card reference
      card.screenshotSprite = newScreenshot
    }
  }
}
