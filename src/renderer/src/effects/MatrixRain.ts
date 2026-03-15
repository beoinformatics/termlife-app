import { Application, Container, Text, TextStyle } from 'pixi.js'

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'
const COLUMN_WIDTH = 14
const DROP_SPEED_MIN = 2.0
const DROP_SPEED_MAX = 5.0

interface RainDrop {
  x: number
  y: number
  speed: number
  length: number
  chars: Text[]
}

export class MatrixRain {
  readonly container: Container
  private app: Application
  private drops: RainDrop[] = []
  private enabled = false
  private columns = 0

  constructor(app: Application) {
    this.app = app
    this.container = new Container()
    this.container.visible = false
    this.columns = Math.ceil(app.screen.width / COLUMN_WIDTH)
  }

  setEnabled(on: boolean) {
    this.enabled = on
    this.container.visible = on
    if (on) {
      this.initDrops()
    } else {
      this.clearDrops()
    }
  }

  handleResize() {
    this.columns = Math.ceil(this.app.screen.width / COLUMN_WIDTH)
    if (this.enabled) {
      this.clearDrops()
      this.initDrops()
    }
  }

  private initDrops() {
    this.clearDrops()
    for (let i = 0; i < this.columns; i++) {
      if (Math.random() > 0.5) {
        this.spawnDrop(i)
      }
    }
  }

  private spawnDrop(col: number) {
    const length = 8 + Math.floor(Math.random() * 20)
    const speed = DROP_SPEED_MIN + Math.random() * (DROP_SPEED_MAX - DROP_SPEED_MIN)
    const chars: Text[] = []

    for (let i = 0; i < length; i++) {
      const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
      const alpha = i === 0 ? 1.0 : Math.max(0.1, 1.0 - (i / length))
      const color = i === 0 ? 0xffffff : 0x00ff00

      const text = new Text({
        text: glyph,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 14,
          fill: color,
        }),
      })
      text.alpha = alpha
      text.x = col * COLUMN_WIDTH
      text.y = -i * 18
      this.container.addChild(text)
      chars.push(text)
    }

    this.drops.push({
      x: col * COLUMN_WIDTH,
      y: -(length * 18),
      speed,
      length,
      chars,
    })
  }

  private clearDrops() {
    for (const drop of this.drops) {
      for (const char of drop.chars) {
        char.destroy()
      }
    }
    this.drops = []
  }

  update(dt: number) {
    if (!this.enabled) return

    const screenH = this.app.screen.height

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i]
      drop.y += drop.speed * dt

      // Update char positions
      for (let j = 0; j < drop.chars.length; j++) {
        drop.chars[j].y = drop.y - j * 18
        // Randomize glyphs occasionally
        if (Math.random() < 0.02) {
          drop.chars[j].text = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        }
      }

      // Remove if off screen
      if (drop.y - drop.length * 18 > screenH) {
        for (const char of drop.chars) {
          char.destroy()
        }
        this.drops.splice(i, 1)
      }
    }

    // Spawn new drops randomly
    if (Math.random() < 0.14 * dt) {
      const col = Math.floor(Math.random() * this.columns)
      this.spawnDrop(col)
    }
  }
}
