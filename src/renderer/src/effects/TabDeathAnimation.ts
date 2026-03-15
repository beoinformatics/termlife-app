import { Application, Container, Text, TextStyle } from 'pixi.js'

interface FallingChar {
  x: number
  y: number
  char: string
  speed: number
  rotation: number
  rotationSpeed: number
  alpha: number
  fadeRate: number
  text: Text
  trail: Text[]
}

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'
const TRAIL_LENGTH = 8
const FALL_DURATION = 5000 // 5 seconds

export class TabDeathAnimation {
  readonly container: Container
  private app: Application
  private chars: FallingChar[] = []
  private isAnimating = false
  private onCompleteCallback: (() => void) | null = null
  private startTime = 0

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    this.container.visible = false
    this.container.zIndex = 1000
    this.container.eventMode = 'none' // Don't block events
    this.container.sortableChildren = true
  }

  /**
   * Start the death animation with the captured terminal content.
   * @param capture The captured terminal image/text as Pixi Text objects or canvas
   * @param bounds The screen bounds where the terminal was rendered
   * @param onComplete Called when animation finishes
   */
  start(
    textGrid: { char: string; x: number; y: number; fg?: number; bg?: number }[],
    bounds: { x: number; y: number; width: number; height: number },
    onComplete: () => void
  ): void {
    this.isAnimating = true
    this.startTime = Date.now()
    this.onCompleteCallback = onComplete
    this.container.visible = true
    this.container.removeChildren()
    this.chars = []

    // Create falling characters from the text grid
    for (const cell of textGrid) {
      if (cell.char.trim() === '') continue // Skip empty cells

      const globalX = bounds.x + cell.x
      const globalY = bounds.y + cell.y

      // Random speed for each character (faster = heavier feel)
      const speed = 2 + Math.random() * 4

      // Create the main character text
      const text = new Text({
        text: cell.char,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 14,
          fill: cell.fg ?? 0x00ff41, // Default to terminal green
        }),
      })
      text.x = globalX
      text.y = globalY
      text.alpha = 1

      // Create trail characters (Matrix style)
      const trail: Text[] = []
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const trailChar = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        const trailText = new Text({
          text: trailChar,
          style: new TextStyle({
            fontFamily: 'monospace',
            fontSize: 14,
            fill: 0x00ff00,
          }),
        })
        trailText.x = globalX
        trailText.y = globalY - (i + 1) * 16
        trailText.alpha = 0.3 - i * 0.03 // Fade trail
        this.container.addChild(trailText)
        trail.push(trailText)
      }

      this.container.addChild(text)

      this.chars.push({
        x: globalX,
        y: globalY,
        char: cell.char,
        speed,
        rotation: (Math.random() - 0.5) * 0.2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        alpha: 1,
        fadeRate: 0.005 + Math.random() * 0.005,
        text,
        trail,
      })
    }
  }

  update(dt: number): void {
    if (!this.isAnimating) return

    const elapsed = Date.now() - this.startTime
    const screenH = this.app.screen.height

    // Check if animation duration has passed and all chars are off-screen
    let allOffScreen = true

    for (const fc of this.chars) {
      // Update position
      fc.y += fc.speed * dt
      fc.rotation += fc.rotationSpeed * dt
      fc.speed += 0.05 * dt // Acceleration (gravity)

      // Update main character
      fc.text.y = fc.y
      fc.text.rotation = fc.rotation

      // Fade out near the end
      if (elapsed > FALL_DURATION - 1000) {
        fc.alpha -= fc.fadeRate * dt
        fc.text.alpha = Math.max(0, fc.alpha)
      }

      // Update trail
      for (let i = 0; i < fc.trail.length; i++) {
        const trailY = fc.y - (i + 1) * 16 * (1 + fc.speed * 0.05)
        fc.trail[i].y = trailY
        fc.trail[i].alpha = Math.max(0, fc.alpha * (0.3 - i * 0.03))

        // Randomly change trail glyphs occasionally
        if (Math.random() < 0.02) {
          fc.trail[i].text = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        }
      }

      // Check if still on screen
      if (fc.y < screenH + 50 && fc.alpha > 0) {
        allOffScreen = false
      }
    }

    // Complete animation after duration and when all chars have fallen
    if (elapsed >= FALL_DURATION && allOffScreen) {
      this.complete()
    }
  }

  private complete(): void {
    this.isAnimating = false
    this.container.visible = false
    this.container.removeChildren()
    this.chars = []

    if (this.onCompleteCallback) {
      this.onCompleteCallback()
      this.onCompleteCallback = null
    }
  }

  stop(): void {
    this.isAnimating = false
    this.container.visible = false
    this.container.removeChildren()
    this.chars = []
    this.onCompleteCallback = null
  }

  get isRunning(): boolean {
    return this.isAnimating
  }
}
