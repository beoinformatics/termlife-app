import { Container, Graphics } from 'pixi.js'
import Matter from 'matter-js'
import { CELL_WIDTH, CELL_HEIGHT } from '../terminal/CellGrid'

/**
 * BubbleRise — 2D physics soap bubble effect powered by matter-js.
 *
 * Translucent bubbles spawn at the bottom and float upward with gentle
 * buoyancy. They collide with terminal characters, wobble around them,
 * and pop when they reach the top or get squeezed.
 */

type CharacterSource = () => { char: string; x: number; y: number; fg: number; bg: number }[]

const { Engine, Bodies, Body, Composite, Events } = Matter

interface BubbleData {
  body: Matter.Body
  radius: number
  hue: number        // color hue 0-360
  popTimer: number   // counts up when stuck, pops when threshold reached
  born: number       // frame counter at spawn (for fade-in)
  popping: boolean   // true during pop animation
  popFrame: number   // frame count of pop animation
}

export class BubbleRise {
  readonly container: Container
  private gfx: Graphics
  private _enabled = false
  private _width = 0
  private _height = 0
  private spawnTimer = 0
  private frameCount = 0
  private getCharacters: CharacterSource | null = null
  private charCacheTimer = 0

  // Matter.js
  private engine: Matter.Engine
  private bubbles: BubbleData[] = []
  private charBodies: Matter.Body[] = []
  private walls: Matter.Body[] = []

  // Tuning
  private readonly MAX_BUBBLES: number
  private readonly SPAWN_RATE = 0.015
  private readonly CHAR_CACHE_INTERVAL = 15
  private readonly BUBBLE_MIN_RADIUS = 4
  private readonly BUBBLE_MAX_RADIUS = 12
  private readonly POP_STUCK_THRESHOLD = 300  // frames before stuck bubble pops
  private readonly POP_ANIM_FRAMES = 8

  constructor(maxBubbles = 150) {
    this.MAX_BUBBLES = maxBubbles
    this.container = new Container()
    this.gfx = new Graphics()
    this.container.addChild(this.gfx)

    // Negative gravity = buoyancy (upward)
    this.engine = Engine.create({
      gravity: { x: 0, y: -0.012, scale: 1 },
    })
    this.engine.timing.timeScale = 0.16
  }

  setCharacterSource(source: CharacterSource | null): void {
    this.getCharacters = source
  }

  get enabled(): boolean {
    return this._enabled
  }

  setEnabled(on: boolean): void {
    this._enabled = on
    this.container.visible = on
    if (!on) {
      for (const b of this.bubbles) {
        Composite.remove(this.engine.world, b.body)
      }
      this.bubbles = []
      if (this.charBodies.length > 0) {
        Composite.remove(this.engine.world, this.charBodies)
        this.charBodies = []
      }
      this.gfx.clear()
    }
  }

  handleResize(width: number, height: number): void {
    this._width = width
    this._height = height
    this.rebuildWalls()
  }

  private rebuildWalls(): void {
    if (this.walls.length > 0) {
      Composite.remove(this.engine.world, this.walls)
    }

    const w = this._width
    const h = this._height
    const t = 40

    this.walls = [
      // Ceiling — bubbles collect here
      Bodies.rectangle(w / 2, -t / 2, w + t * 2, t, { isStatic: true, friction: 0.1, restitution: 0.3 }),
      // Left wall
      Bodies.rectangle(-t / 2, h / 2, t, h * 2, { isStatic: true, friction: 0.1, restitution: 0.2 }),
      // Right wall
      Bodies.rectangle(w + t / 2, h / 2, t, h * 2, { isStatic: true, friction: 0.1, restitution: 0.2 }),
      // Floor — just to keep things bounded
      Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, { isStatic: true, friction: 0.1, restitution: 0.1 }),
    ]
    Composite.add(this.engine.world, this.walls)
  }

  update(dt: number): void {
    if (!this._enabled || this._width === 0) return

    this.frameCount += dt

    // Refresh character bodies
    this.charCacheTimer += dt
    if (this.charCacheTimer >= this.CHAR_CACHE_INTERVAL) {
      this.charCacheTimer = 0
      this.refreshCharacterBodies()
    }

    // Spawn new bubbles from bottom
    this.spawnTimer += this.SPAWN_RATE * dt
    while (this.spawnTimer >= 1 && this.bubbles.length < this.MAX_BUBBLES) {
      this.spawnTimer -= 1
      this.spawnBubble()
    }

    // Clamp velocities for gentle movement
    for (const b of this.bubbles) {
      if (b.popping) continue
      const { x: vx, y: vy } = b.body.velocity
      const maxV = 0.4
      const clamped = {
        x: Math.max(-maxV, Math.min(maxV, vx)),
        y: Math.max(-maxV * 1.5, Math.min(maxV, vy)),
      }
      if (vx !== clamped.x || vy !== clamped.y) {
        Body.setVelocity(b.body, clamped)
      }
    }

    // Step physics
    Engine.update(this.engine, dt * (1000 / 60))

    // Update bubble states
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]

      // Pop animation
      if (b.popping) {
        b.popFrame += dt
        if (b.popFrame >= this.POP_ANIM_FRAMES) {
          Composite.remove(this.engine.world, b.body)
          this.bubbles.splice(i, 1)
        }
        continue
      }

      // Pop if stuck at top
      if (b.body.position.y < 15) {
        b.popTimer += dt
        if (b.popTimer > this.POP_STUCK_THRESHOLD) {
          b.popping = true
          b.popFrame = 0
          continue
        }
      } else {
        b.popTimer = Math.max(0, b.popTimer - dt * 0.5)  // slowly reset
      }

      // Remove if way off screen
      if (b.body.position.y > this._height + 60 || b.body.position.x < -60 || b.body.position.x > this._width + 60) {
        Composite.remove(this.engine.world, b.body)
        this.bubbles.splice(i, 1)
      }
    }

    this.draw()
  }

  private spawnBubble(): void {
    const radius = this.BUBBLE_MIN_RADIUS + Math.random() * (this.BUBBLE_MAX_RADIUS - this.BUBBLE_MIN_RADIUS)
    const x = 20 + Math.random() * (this._width - 40)
    const y = this._height + radius + Math.random() * 20

    const body = Bodies.circle(x, y, radius, {
      restitution: 0.4,         // bouncy
      friction: 0.05,           // slippery
      frictionAir: 0.06,        // air drag
      density: 0.00015,         // extremely light (lighter than snowflakes)
      render: { visible: false },
    })

    // Gentle upward + random drift
    Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 0.08,
      y: -(0.02 + Math.random() * 0.04),
    })

    Composite.add(this.engine.world, body)
    this.bubbles.push({
      body,
      radius,
      hue: 190 + Math.random() * 40,  // blue-cyan range
      popTimer: 0,
      born: this.frameCount,
      popping: false,
      popFrame: 0,
    })
  }

  private refreshCharacterBodies(): void {
    if (!this.getCharacters) return
    const chars = this.getCharacters()

    if (this.charBodies.length > 0) {
      Composite.remove(this.engine.world, this.charBodies)
      this.charBodies = []
    }

    // Merge adjacent cells in rows
    const rowMap = new Map<number, { minX: number; maxX: number; y: number }[]>()
    for (const c of chars) {
      const rowKey = c.y
      if (!rowMap.has(rowKey)) rowMap.set(rowKey, [])
      rowMap.get(rowKey)!.push({ minX: c.x, maxX: c.x + CELL_WIDTH, y: c.y })
    }

    for (const [, cells] of rowMap) {
      cells.sort((a, b) => a.minX - b.minX)
      let startX = cells[0].minX
      let endX = cells[0].maxX
      const y = cells[0].y

      for (let i = 1; i < cells.length; i++) {
        if (cells[i].minX <= endX + 1) {
          endX = Math.max(endX, cells[i].maxX)
        } else {
          this.addCharBody(startX, y, endX - startX)
          startX = cells[i].minX
          endX = cells[i].maxX
        }
      }
      this.addCharBody(startX, y, endX - startX)
    }

    Composite.add(this.engine.world, this.charBodies)
  }

  private addCharBody(x: number, y: number, width: number): void {
    const body = Bodies.rectangle(
      x + width / 2,
      y + CELL_HEIGHT / 2,
      width,
      CELL_HEIGHT,
      {
        isStatic: true,
        friction: 0.05,
        restitution: 0.3,
        render: { visible: false },
      }
    )
    this.charBodies.push(body)
  }

  private draw(): void {
    this.gfx.clear()

    for (const b of this.bubbles) {
      const { x, y } = b.body.position
      const age = this.frameCount - b.born
      const fadeIn = Math.min(age / 15, 1)

      if (b.popping) {
        // Pop animation — expanding ring that fades
        const t = b.popFrame / this.POP_ANIM_FRAMES
        const popRadius = b.radius * (1 + t * 1.5)
        const popAlpha = (1 - t) * 0.4

        this.gfx.circle(x, y, popRadius)
        this.gfx.stroke({ width: 1.5, color: 0xaaddff, alpha: popAlpha })
        continue
      }

      // Bubble body — translucent fill
      this.gfx.circle(x, y, b.radius)
      this.gfx.fill({ color: 0x88ccff, alpha: 0.08 * fadeIn })

      // Bubble outline
      this.gfx.circle(x, y, b.radius)
      this.gfx.stroke({ width: 1, color: 0xaaddff, alpha: 0.3 * fadeIn })

      // Highlight (specular reflection)
      const hlX = x - b.radius * 0.3
      const hlY = y - b.radius * 0.3
      const hlR = b.radius * 0.2
      this.gfx.circle(hlX, hlY, hlR)
      this.gfx.fill({ color: 0xffffff, alpha: 0.35 * fadeIn })
    }
  }

  clearBubbles(): void {
    for (const b of this.bubbles) {
      Composite.remove(this.engine.world, b.body)
    }
    this.bubbles = []
  }
}
