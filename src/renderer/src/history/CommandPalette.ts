import { Container, Graphics, Text, TextStyle } from 'pixi.js'
import { commandRegistry, type CommandDef } from './CommandRegistry'

export class CommandPalette {
  readonly container: Container
  private bg: Graphics
  private inputText: Text
  private inputCursor: Graphics
  private resultItems: Container[] = []
  private _visible = false
  private query = ''
  private selectedIndex = 0
  private cursorBlink = 0

  // Dimensions
  private readonly WIDTH = 400
  private readonly INPUT_HEIGHT = 32
  private readonly ITEM_HEIGHT = 28
  private readonly MAX_VISIBLE = 10
  private readonly PADDING = 8

  constructor() {
    this.container = new Container()
    this.container.visible = false
    this.container.zIndex = 1000 // Always on top

    this.bg = new Graphics()
    this.container.addChild(this.bg)

    // Input text
    this.inputText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xffffff,
      }),
    })
    this.inputText.x = this.PADDING
    this.inputText.y = this.PADDING
    this.container.addChild(this.inputText)

    // Blinking cursor
    this.inputCursor = new Graphics()
    this.container.addChild(this.inputCursor)
  }

  get visible(): boolean {
    return this._visible
  }

  show(): void {
    this._visible = true
    this.container.visible = true
    this.query = ''
    this.selectedIndex = 0
    this.render()
  }

  hide(): void {
    this._visible = false
    this.container.visible = false
    this.query = ''
    this.selectedIndex = 0
    this.clearResults()
  }

  toggle(): void {
    if (this._visible) this.hide()
    else this.show()
  }

  // Handle keyboard input while palette is open.
  // Returns true if the event was consumed.
  handleKeyDown(e: KeyboardEvent): boolean {
    if (!this._visible) return false

    e.preventDefault()
    e.stopPropagation()

    if (e.key === 'Escape') {
      this.hide()
      return true
    }

    if (e.key === 'Enter') {
      this.executeSelected()
      return true
    }

    if (e.key === 'ArrowUp') {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1)
      this.render()
      return true
    }

    if (e.key === 'ArrowDown') {
      const results = commandRegistry.search(this.query)
      this.selectedIndex = Math.min(results.length - 1, this.selectedIndex + 1)
      this.render()
      return true
    }

    if (e.key === 'Backspace') {
      this.query = this.query.slice(0, -1)
      this.selectedIndex = 0
      this.render()
      return true
    }

    // Printable character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      this.query += e.key
      this.selectedIndex = 0
      this.render()
      return true
    }

    return true
  }

  private executeSelected(): void {
    // Check if query is a direct TCL command
    const trimmed = this.query.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      commandRegistry.executeCommand(trimmed)
      this.hide()
      return
    }

    const results = commandRegistry.search(this.query)
    if (results.length > 0 && this.selectedIndex < results.length) {
      commandRegistry.executeById(results[this.selectedIndex].id)
      this.hide()
    }
  }

  private clearResults(): void {
    for (const item of this.resultItems) {
      item.destroy({ children: true })
    }
    this.resultItems = []
  }

  // Call this to position the palette (centered at top of screen)
  handleResize(screenWidth: number): void {
    this.container.x = Math.floor((screenWidth - this.WIDTH) / 2)
    this.container.y = 70 // Below tab bar
  }

  // Call from ticker for cursor blink
  update(dt: number): void {
    if (!this._visible) return
    this.cursorBlink += dt
    const show = Math.floor(this.cursorBlink / 30) % 2 === 0
    this.inputCursor.visible = show
  }

  private render(): void {
    this.clearResults()

    const results = commandRegistry.search(this.query)
    const visibleResults = results.slice(0, this.MAX_VISIBLE)
    const totalHeight =
      this.INPUT_HEIGHT + visibleResults.length * this.ITEM_HEIGHT + this.PADDING * 2

    // Background
    this.bg.clear()
    this.bg.roundRect(0, 0, this.WIDTH, totalHeight, 8)
    this.bg.fill({ color: 0x1e1e1e, alpha: 0.95 })
    this.bg.roundRect(0, 0, this.WIDTH, totalHeight, 8)
    this.bg.stroke({ width: 1, color: 0x555555 })

    // Input text
    this.inputText.text = this.query || ''

    // Input cursor position
    this.inputCursor.clear()
    const cursorX = this.PADDING + this.inputText.width + 2
    this.inputCursor.rect(cursorX, this.PADDING, 2, 16)
    this.inputCursor.fill({ color: 0xffffff })

    // Input underline
    const underline = new Graphics()
    underline.rect(this.PADDING, this.INPUT_HEIGHT, this.WIDTH - this.PADDING * 2, 1)
    underline.fill({ color: 0x444444 })
    this.container.addChild(underline)
    this.resultItems.push(underline as unknown as Container) // Track for cleanup

    // Result items
    for (let i = 0; i < visibleResults.length; i++) {
      const cmd: CommandDef = visibleResults[i]
      const isSelected = i === this.selectedIndex
      const itemY = this.INPUT_HEIGHT + this.PADDING + i * this.ITEM_HEIGHT

      const itemContainer = new Container()

      if (isSelected) {
        const highlight = new Graphics()
        highlight.rect(this.PADDING / 2, itemY, this.WIDTH - this.PADDING, this.ITEM_HEIGHT)
        highlight.fill({ color: 0x264f78 })
        itemContainer.addChild(highlight)
      }

      // Command label
      const label = new Text({
        text: cmd.label,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 13,
          fill: isSelected ? 0xffffff : 0xcccccc,
        }),
      })
      label.x = this.PADDING
      label.y = itemY + 4
      itemContainer.addChild(label)

      // Shortcut hint (right-aligned)
      if (cmd.shortcut) {
        const shortcut = new Text({
          text: cmd.shortcut,
          style: new TextStyle({
            fontFamily: 'monospace',
            fontSize: 11,
            fill: 0x888888,
          }),
        })
        shortcut.x = this.WIDTH - this.PADDING - shortcut.width
        shortcut.y = itemY + 6
        itemContainer.addChild(shortcut)
      }

      // Click handler
      itemContainer.eventMode = 'static'
      itemContainer.cursor = 'pointer'
      itemContainer.on('pointertap', () => {
        commandRegistry.executeById(cmd.id)
        this.hide()
      })

      this.container.addChild(itemContainer)
      this.resultItems.push(itemContainer)
    }
  }
}
