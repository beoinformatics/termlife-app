import { Container, Graphics } from 'pixi.js'
import Matter from 'matter-js'
import { CELL_WIDTH, CELL_HEIGHT } from '../terminal/CellGrid'

/**
 * Snowfall — 2D physics snowflake effect powered by matter-js.
 *
 * Snowflakes are dynamic circle bodies. Terminal characters are static
 * rectangle bodies. When text scrolls, flakes near characters move with them.
 */

type CharacterSource = () => { char: string; x: number; y: number; fg: number; bg: number }[]

const { Engine, Bodies, Body, Composite } = Matter

export class Snowfall {
  readonly container: Container
  private gfx: Graphics
  private _enabled = false
  private _width = 0
  private _height = 0
  private spawnTimer = 0
  private getCharacters: CharacterSource | null = null
  private charCacheTimer = 0

  // Matter.js
  private engine: Matter.Engine
  private flakeBodies: Matter.Body[] = []
  private charBodies: Matter.Body[] = []
  private walls: Matter.Body[] = []

  // Tuning — slow, floaty, gentle
  private readonly MAX_FLAKES: number
  private readonly SPAWN_RATE = 0.02        // 5x lower density
  private readonly CHAR_CACHE_INTERVAL = 12
  private readonly FLAKE_MIN_RADIUS = 1.5
  private readonly FLAKE_MAX_RADIUS = 3.0

  constructor(maxFlakes = 300) {
    this.MAX_FLAKES = maxFlakes
    this.container = new Container()
    this.gfx = new Graphics()
    this.container.addChild(this.gfx)

    this.engine = Engine.create({
      gravity: { x: 0, y: 0.016, scale: 1 },  // feather-light gravity
    })
    this.engine.timing.timeScale = 0.16  // slow motion (2x faster than ultra)
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
      if (this.flakeBodies.length > 0) {
        Composite.remove(this.engine.world, this.flakeBodies)
        this.flakeBodies = []
      }
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
      Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, { isStatic: true, friction: 0.8, restitution: 0.05 }),
      Bodies.rectangle(-t / 2, h / 2, t, h * 2, { isStatic: true, friction: 0.3, restitution: 0.05 }),
      Bodies.rectangle(w + t / 2, h / 2, t, h * 2, { isStatic: true, friction: 0.3, restitution: 0.05 }),
    ]
    Composite.add(this.engine.world, this.walls)
  }

  update(dt: number): void {
    if (!this._enabled || this._width === 0) return

    // Refresh character bodies periodically
    this.charCacheTimer += dt
    if (this.charCacheTimer >= this.CHAR_CACHE_INTERVAL) {
      this.charCacheTimer = 0
      this.refreshCharacterBodies()
    }

    // Spawn new flakes
    this.spawnTimer += this.SPAWN_RATE * dt
    while (this.spawnTimer >= 1 && this.flakeBodies.length < this.MAX_FLAKES) {
      this.spawnTimer -= 1
      this.spawnFlake()
    }

    // Clamp velocities — enforce max speed for gentle feel
    for (const body of this.flakeBodies) {
      const vx = body.velocity.x
      const vy = body.velocity.y
      const maxV = 0.5
      const clamped = {
        x: Math.max(-maxV, Math.min(maxV, vx)),
        y: Math.max(-maxV, Math.min(maxV * 1.5, vy)),  // allow slightly faster downward
      }
      if (vx !== clamped.x || vy !== clamped.y) {
        Body.setVelocity(body, clamped)
      }
    }

    // Step physics
    Engine.update(this.engine, dt * (1000 / 60))

    // Remove flakes that left the screen or settled near the bottom
    const groundThreshold = this._height - 15
    for (let i = this.flakeBodies.length - 1; i >= 0; i--) {
      const body = this.flakeBodies[i]
      // Off-screen
      if (body.position.y > this._height + 50 || body.position.x < -100 || body.position.x > this._width + 100) {
        Composite.remove(this.engine.world, body)
        this.flakeBodies.splice(i, 1)
        continue
      }
      // Near the bottom and barely moving — remove to free up budget
      if (body.position.y > groundThreshold) {
        const speed = Math.abs(body.velocity.x) + Math.abs(body.velocity.y)
        if (speed < 0.03) {
          Composite.remove(this.engine.world, body)
          this.flakeBodies.splice(i, 1)
        }
      }
    }

    this.draw()
  }

  private spawnFlake(): void {
    const radius = this.FLAKE_MIN_RADIUS + Math.random() * (this.FLAKE_MAX_RADIUS - this.FLAKE_MIN_RADIUS)
    const x = Math.random() * this._width
    const y = -2 - Math.random() * 20

    const flake = Bodies.circle(x, y, radius, {
      restitution: 0.1,         // very little bounce
      friction: 0.6,            // high friction to settle quickly
      frictionAir: 0.08,        // heavy air drag — this limits fall speed
      density: 0.0003,          // extremely light
      render: { visible: false },
    })

    Body.setVelocity(flake, {
      x: (Math.random() - 0.5) * 0.06,
      y: 0.02 + Math.random() * 0.03,
    })

    Composite.add(this.engine.world, flake)
    this.flakeBodies.push(flake)
  }

  private refreshCharacterBodies(): void {
    if (!this.getCharacters) return
    const chars = this.getCharacters()

    // Remove old character bodies
    if (this.charBodies.length > 0) {
      Composite.remove(this.engine.world, this.charBodies)
      this.charBodies = []
    }

    // Build row map and merge adjacent cells
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
        friction: 0.8,
        restitution: 0.05,
        render: { visible: false },
      }
    )
    this.charBodies.push(body)
  }

  private draw(): void {
    this.gfx.clear()

    for (const body of this.flakeBodies) {
      const { x, y } = body.position
      const radius = (body as { circleRadius?: number }).circleRadius || 2

      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
      const alpha = speed < 0.05 ? 0.9 : 0.65 + Math.min(speed * 0.08, 0.25)

      this.gfx.circle(x, y, radius)
      this.gfx.fill({ color: 0xffffff, alpha })
    }
  }

  clearSnow(): void {
    if (this.flakeBodies.length > 0) {
      Composite.remove(this.engine.world, this.flakeBodies)
      this.flakeBodies = []
    }
  }
}
