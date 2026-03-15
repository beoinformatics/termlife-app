import { Application, Container, Graphics, Text, TextStyle, Filter, GlProgram } from 'pixi.js'
import { Snowfall } from './Snowfall'
import { BubbleRise } from './BubbleRise'

/**
 * CrazyEffects — a collection of wild GPU-powered visual effects
 * that overlay the terminal while still letting you work (with a quirk).
 *
 * Each effect implements the CrazyEffect interface and is chosen at random
 * when the user clicks the Crazy button.
 */

export interface CrazyEffect {
  readonly name: string
  /** Add visuals to stage / set up filters */
  activate(app: Application, stage: Container): void
  /** Remove visuals and filters */
  deactivate(app: Application, stage: Container): void
  /** Per-frame update */
  update(dt: number): void
  /** Handle window resize */
  handleResize(app: Application): void
}

// ─── 1. Lifted Edges ────────────────────────────────────────────────
// The viewport edges curl upward, like a page lifting at the borders,
// while the center (and importantly the bottom) stays readable.

const SAGGY_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`

const SAGGY_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uLiftAmount;

void main(void) {
    vec2 uv = vTextureCoord;

    // Lift is strongest at edges, zero at center
    float centerDist = abs(uv.x - 0.5) * 2.0; // 0 at center, 1 at edges
    float edgeCurve = centerDist * centerDist; // 0 at center, 1 at edges
    float lift = edgeCurve * uLiftAmount * (0.9 + 0.1 * sin(uTime * 0.5));

    // Gentle wave for organic feel
    lift += sin(uv.x * 6.28 + uTime * 0.3) * uLiftAmount * 0.1;

    uv.y += lift;

    // Clamp to avoid sampling outside
    if (uv.y < 0.0 || uv.y > 1.0) {
        finalColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        finalColor = texture(uTexture, uv);
    }
}
`

class LiftedEdgesEffect implements CrazyEffect {
  readonly name = 'Lifted Edges'
  private filter: Filter | null = null
  private time = 0
  private readonly maxLift = 0.025
  private readonly breatheSpeed = 0.15 // Much slower - full cycle ~40s

  activate(app: Application, stage: Container) {
    const glProgram = GlProgram.from({ vertex: SAGGY_VERTEX, fragment: SAGGY_FRAGMENT })
    this.filter = new Filter({
      glProgram,
      resources: {
        saggyUniforms: {
          uTime: { value: 0, type: 'f32' },
          uLiftAmount: { value: 0, type: 'f32' },
        },
      },
    })
    stage.filters = [...(stage.filters || []), this.filter]
    this.time = 0
  }

  deactivate(_app: Application, stage: Container) {
    if (this.filter) {
      stage.filters = (stage.filters || []).filter(f => f !== this.filter)
      this.filter = null
    }
  }

  update(dt: number) {
    if (!this.filter) return
    this.time += dt / 60
    // Much slower breathe
    const breathe = (Math.sin(this.time * this.breatheSpeed) + 1.0) * 0.5
    this.filter.resources.saggyUniforms.uniforms.uLiftAmount = breathe * this.maxLift
    this.filter.resources.saggyUniforms.uniforms.uTime = this.time
  }

  handleResize() {}
}

// ─── 2. Spider Drop ─────────────────────────────────────────────────
// Spiders descend from the top on silk threads, pause, then climb back.
// Only in top 25% of screen.

class SpiderDropEffect implements CrazyEffect {
  readonly name = 'Spider Drop'
  private spiderContainer: Container | null = null
  private spiders: SpiderEntity[] = []
  private app: Application | null = null
  private spawnTimer = 0

  activate(app: Application, _stage: Container) {
    this.app = app
    this.spiderContainer = new Container()
    app.stage.addChild(this.spiderContainer)
    this.spiders = []
    // Long initial delay before first spider - very rare
    this.spawnTimer = 400 + Math.random() * 400
  }

  deactivate(app: Application, _stage: Container) {
    if (this.spiderContainer) {
      app.stage.removeChild(this.spiderContainer)
      this.spiderContainer.destroy({ children: true })
      this.spiderContainer = null
    }
    this.spiders = []
  }

  update(dt: number) {
    if (!this.spiderContainer || !this.app) return

    this.spawnTimer += dt
    // Spiders are VERY rare - much longer spawn interval, fewer max
    if (this.spawnTimer > 800 && this.spiders.length < 2) {
      this.spawnSpider()
      this.spawnTimer = 0
    }

    const maxY = this.app.screen.height * 0.20

    for (let i = this.spiders.length - 1; i >= 0; i--) {
      const s = this.spiders[i]
      s.timer += dt

      if (s.state === 'descending') {
        // Much slower descent
        s.y += s.speed * 0.4 * dt
        if (s.y >= s.targetY) {
          s.y = s.targetY
          s.state = 'eating'
          s.timer = 0
        }
      } else if (s.state === 'eating') {
        // Wiggle while eating - slower wiggle
        s.sprite.rotation = Math.sin(s.timer * 0.15) * 0.1
        // Stay eating longer
        if (s.timer > 200) {
          s.state = 'ascending'
        }
      } else if (s.state === 'ascending') {
        // Slower ascent
        s.y -= s.speed * 0.6 * dt
        s.sprite.rotation = 0
        if (s.y <= -30) {
          s.sprite.destroy({ children: true })
          s.thread.destroy()
          this.spiders.splice(i, 1)
          continue
        }
      }

      // Update positions
      s.sprite.y = s.y
      // Draw thread from top to spider
      s.thread.clear()
      s.thread.moveTo(s.x + 8, 0)
      s.thread.lineTo(s.x + 8, s.y)
      s.thread.stroke({ width: 1, color: 0x888888, alpha: 0.6 })
    }
  }

  handleResize() {}

  private spawnSpider() {
    if (!this.app || !this.spiderContainer) return
    const x = 30 + Math.random() * (this.app.screen.width - 60)
    const maxY = this.app.screen.height * 0.25
    const targetY = 40 + Math.random() * (maxY - 60)

    const thread = new Graphics()
    this.spiderContainer.addChild(thread)

    // Draw spider body with text
    const sprite = new Container()
    const body = new Text({
      text: '🕷️',
      style: new TextStyle({ fontSize: 18 }),
    })
    sprite.addChild(body)
    sprite.x = x
    sprite.y = -20
    sprite.pivot.set(8, 8)
    this.spiderContainer.addChild(sprite)

    this.spiders.push({
      x,
      y: -20,
      targetY,
      speed: 0.5 + Math.random() * 0.8,
      state: 'descending',
      sprite,
      thread,
      timer: 0,
    })
  }
}

interface SpiderEntity {
  x: number
  y: number
  targetY: number
  speed: number
  state: 'descending' | 'eating' | 'ascending'
  sprite: Container
  thread: Graphics
  timer: number
}

// ─── 3. Emoji Rain ──────────────────────────────────────────────────
// Random emoji fall from the top like rain (semi-transparent).

const RAIN_SETS = [
  ['🐱', '🐶', '🐟', '🐸', '🦊'],   // animals
  ['🔥', '💥', '⚡', '✨', '💫'],      // energy
  ['🌧️', '💧', '❄️', '🌊', '☔'],      // water
  ['🍕', '🌮', '🍔', '🍩', '🍺'],    // food
  ['💀', '👻', '🎃', '🦇', '🕸️'],    // spooky
  ['💎', '💰', '🪙', '👑', '🏆'],     // treasure
]

class EmojiRainEffect implements CrazyEffect {
  readonly name = 'Emoji Rain'
  private rainContainer: Container | null = null
  private drops: EmojiDrop[] = []
  private app: Application | null = null
  private emojis: string[] = []

  activate(app: Application, _stage: Container) {
    this.app = app
    this.rainContainer = new Container()
    this.rainContainer.alpha = 0.25
    app.stage.addChild(this.rainContainer)
    this.drops = []
    this.emojis = RAIN_SETS[Math.floor(Math.random() * RAIN_SETS.length)]
  }

  deactivate(app: Application, _stage: Container) {
    if (this.rainContainer) {
      app.stage.removeChild(this.rainContainer)
      this.rainContainer.destroy({ children: true })
      this.rainContainer = null
    }
    this.drops = []
  }

  update(dt: number) {
    if (!this.rainContainer || !this.app) return

    // Spawn new drops - MUCH fewer items, much slower spawn rate
    if (Math.random() < 0.015 * dt && this.drops.length < 6) {
      const emoji = this.emojis[Math.floor(Math.random() * this.emojis.length)]
      const text = new Text({
        text: emoji,
        style: new TextStyle({ fontSize: 14 + Math.random() * 10 }),
      })
      const x = Math.random() * this.app.screen.width
      text.x = x
      text.y = -30
      text.rotation = Math.random() * 0.3 - 0.15
      this.rainContainer.addChild(text)
      this.drops.push({
        text,
        // Very slow fall speed
        speed: 0.3 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.01 + Math.random() * 0.02,
      })
    }

    const screenH = this.app.screen.height
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      // Very slow fall
      d.text.y += d.speed * dt * 0.6
      d.wobble += d.wobbleSpeed * dt
      d.text.x += Math.sin(d.wobble) * 0.15

      if (d.text.y > screenH + 30) {
        d.text.destroy()
        this.drops.splice(i, 1)
      }
    }
  }

  handleResize() {}
}

interface EmojiDrop {
  text: Text
  speed: number
  wobble: number
  wobbleSpeed: number
}

// ─── 4. Earthquake ──────────────────────────────────────────────────
// Screen shakes randomly with varying intensity.

class EarthquakeEffect implements CrazyEffect {
  readonly name = 'Earthquake'
  private originalX = 0
  private originalY = 0
  private stage: Container | null = null
  private time = 0
  private quakeIntensity = 0
  private nextQuakeIn = 0

  activate(_app: Application, stage: Container) {
    this.stage = stage
    this.originalX = stage.x
    this.originalY = stage.y
    this.time = 0
    this.quakeIntensity = 0
    // Much longer delay between quakes
    this.nextQuakeIn = 300 + Math.random() * 400
  }

  deactivate(_app: Application, stage: Container) {
    stage.x = this.originalX
    stage.y = this.originalY
    this.stage = null
  }

  update(dt: number) {
    if (!this.stage) return
    this.time += dt

    this.nextQuakeIn -= dt
    if (this.nextQuakeIn <= 0) {
      // Much less intense quakes
      this.quakeIntensity = 0.8 + Math.random() * 1.2
      this.nextQuakeIn = 500 + Math.random() * 600
    }

    if (this.quakeIntensity > 0) {
      this.stage.x = this.originalX + (Math.random() - 0.5) * this.quakeIntensity * 2
      this.stage.y = this.originalY + (Math.random() - 0.5) * this.quakeIntensity * 2
      this.quakeIntensity *= 0.96 // slower decay
      if (this.quakeIntensity < 0.1) {
        this.quakeIntensity = 0
        this.stage.x = this.originalX
        this.stage.y = this.originalY
      }
    }
  }

  handleResize() {}
}

// ─── 5. Heat Haze ───────────────────────────────────────────────────
// Wavy heat distortion rising from the bottom like hot asphalt.

const HAZE_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uIntensity;

void main(void) {
    vec2 uv = vTextureCoord;

    // Stronger distortion near bottom
    float bottomFactor = uv.y * uv.y;
    float wave = sin(uv.y * 30.0 + uTime * 2.0) * uIntensity * bottomFactor;
    wave += sin(uv.y * 50.0 - uTime * 3.0) * uIntensity * 0.5 * bottomFactor;

    uv.x += wave;

    finalColor = texture(uTexture, uv);
}
`

class HeatHazeEffect implements CrazyEffect {
  readonly name = 'Heat Haze'
  private filter: Filter | null = null
  private time = 0

  activate(_app: Application, stage: Container) {
    const glProgram = GlProgram.from({ vertex: SAGGY_VERTEX, fragment: HAZE_FRAGMENT })
    this.filter = new Filter({
      glProgram,
      resources: {
        hazeUniforms: {
          uTime: { value: 0, type: 'f32' },
          uIntensity: { value: 0.001, type: 'f32' },
        },
      },
    })
    stage.filters = [...(stage.filters || []), this.filter]
    this.time = 0
  }

  deactivate(_app: Application, stage: Container) {
    if (this.filter) {
      stage.filters = (stage.filters || []).filter(f => f !== this.filter)
      this.filter = null
    }
  }

  update(dt: number) {
    if (!this.filter) return
    // Much slower time progression
    this.time += dt / 120
    this.filter.resources.hazeUniforms.uniforms.uTime = this.time
  }

  handleResize() {}
}

// ─── 6. Funhouse Mirror ─────────────────────────────────────────────
// Wavy funhouse mirror distortion that shifts over time.

const FUNHOUSE_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;

void main(void) {
    vec2 uv = vTextureCoord;

    uv.x += sin(uv.y * 10.0 + uTime * 0.5) * 0.0015;
    uv.y += cos(uv.x * 8.0 + uTime * 0.4) * 0.0015;
    uv.x += sin(uv.y * 25.0 - uTime * 0.3) * 0.0008;

    finalColor = texture(uTexture, clamp(uv, 0.0, 1.0));
}
`

class FunhouseMirrorEffect implements CrazyEffect {
  readonly name = 'Funhouse Mirror'
  private filter: Filter | null = null
  private time = 0

  activate(_app: Application, stage: Container) {
    const glProgram = GlProgram.from({ vertex: SAGGY_VERTEX, fragment: FUNHOUSE_FRAGMENT })
    this.filter = new Filter({
      glProgram,
      resources: {
        funhouseUniforms: {
          uTime: { value: 0, type: 'f32' },
        },
      },
    })
    stage.filters = [...(stage.filters || []), this.filter]
    this.time = 0
  }

  deactivate(_app: Application, stage: Container) {
    if (this.filter) {
      stage.filters = (stage.filters || []).filter(f => f !== this.filter)
      this.filter = null
    }
  }

  update(dt: number) {
    if (!this.filter) return
    // Much slower time progression
    this.time += dt / 120
    this.filter.resources.funhouseUniforms.uniforms.uTime = this.time
  }

  handleResize() {}
}

// ─── 7. Bubble Rise ─────────────────────────────────────────────────
// Translucent bubbles float upward from the bottom.

class BubbleRiseEffect implements CrazyEffect {
  readonly name = 'Bubble Rise'
  private bubbleContainer: Container | null = null
  private bubbles: BubbleEntity[] = []
  private app: Application | null = null

  activate(app: Application, _stage: Container) {
    this.app = app
    this.bubbleContainer = new Container()
    this.bubbleContainer.alpha = 0.3
    app.stage.addChild(this.bubbleContainer)
    this.bubbles = []
  }

  deactivate(app: Application, _stage: Container) {
    if (this.bubbleContainer) {
      app.stage.removeChild(this.bubbleContainer)
      this.bubbleContainer.destroy({ children: true })
      this.bubbleContainer = null
    }
    this.bubbles = []
  }

  update(dt: number) {
    if (!this.bubbleContainer || !this.app) return

    // Spawn - MUCH less frequent, fewer max bubbles
    if (Math.random() < 0.02 * dt && this.bubbles.length < 8) {
      const radius = 6 + Math.random() * 18
      const g = new Graphics()
      const x = Math.random() * this.app.screen.width
      g.circle(0, 0, radius)
      g.fill({ color: 0x66aaff, alpha: 0.12 })
      g.circle(0, 0, radius)
      g.stroke({ width: 1, color: 0x88ccff, alpha: 0.35 })
      // Highlight
      g.circle(-radius * 0.25, -radius * 0.25, radius * 0.2)
      g.fill({ color: 0xffffff, alpha: 0.25 })

      g.x = x
      g.y = this.app.screen.height + radius
      this.bubbleContainer.addChild(g)
      this.bubbles.push({
        graphic: g,
        radius,
        speed: 0.2 + Math.random() * 0.4,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.005 + Math.random() * 0.015,
        wobbleAmp: 0.2 + Math.random() * 0.5,
      })
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]
      // Much slower rise
      b.graphic.y -= b.speed * dt * 0.7
      b.wobble += b.wobbleSpeed * dt
      b.graphic.x += Math.sin(b.wobble) * b.wobbleAmp * 0.5

      if (b.graphic.y < -b.radius * 2) {
        b.graphic.destroy()
        this.bubbles.splice(i, 1)
      }
    }
  }

  handleResize() {}
}

interface BubbleEntity {
  graphic: Graphics
  radius: number
  speed: number
  wobble: number
  wobbleSpeed: number
  wobbleAmp: number
}

// ─── 8. Drunk Mode ──────────────────────────────────────────────────
// Slow sinusoidal rotation and scale oscillation of the whole stage.

class DrunkModeEffect implements CrazyEffect {
  readonly name = 'Drunk Mode'
  private stage: Container | null = null
  private time = 0
  private app: Application | null = null

  activate(app: Application, stage: Container) {
    this.stage = stage
    this.app = app
    this.time = 0
    // Set pivot to center for rotation
    stage.pivot.set(app.screen.width / 2, app.screen.height / 2)
    stage.position.set(app.screen.width / 2, app.screen.height / 2)
  }

  deactivate(app: Application, stage: Container) {
    stage.rotation = 0
    stage.scale.set(1, 1)
    stage.pivot.set(0, 0)
    stage.position.set(0, 0)
    this.stage = null
  }

  update(dt: number) {
    if (!this.stage || !this.app) return
    // Much slower time progression
    this.time += dt / 120
    // Very subtle rotation
    this.stage.rotation = Math.sin(this.time * 0.3) * 0.004 + Math.sin(this.time * 0.5) * 0.003
    const s = 1.0 + Math.sin(this.time * 0.2) * 0.005
    this.stage.scale.set(s, s)
  }

  handleResize(app: Application) {
    if (this.stage) {
      this.stage.pivot.set(app.screen.width / 2, app.screen.height / 2)
      this.stage.position.set(app.screen.width / 2, app.screen.height / 2)
    }
  }
}

// ─── 9. Stalagmites ─────────────────────────────────────────────────
// Characters spawn droplets that grow slowly from below, then drop with physics.

const DRIP_CHARS = '|¦│┃╎╏!:;.,`\''
const GROW_CHAR = '│'

// Callback type to get visible character positions from the terminal
export type CharacterSourceCallback = () => { char: string; x: number; y: number; fg: number; bg: number }[]

class StalagmitesEffect implements CrazyEffect {
  readonly name = 'Stalagmites'
  private dripContainer: Container | null = null
  private drips: DripEntity[] = []
  private app: Application | null = null
  private spawnTimer = 0
  private getCharacterSource: CharacterSourceCallback | null = null

  constructor(getCharacterSource?: CharacterSourceCallback) {
    this.getCharacterSource = getCharacterSource ?? null
  }

  setCharacterSource(callback: CharacterSourceCallback | null) {
    this.getCharacterSource = callback
  }

  activate(app: Application, _stage: Container) {
    this.app = app
    this.dripContainer = new Container()
    this.dripContainer.alpha = 0.6
    app.stage.addChild(this.dripContainer)
    this.drips = []
    // Much slower spawn - start with longer initial delay
    this.spawnTimer = 100 + Math.random() * 200
  }

  deactivate(app: Application, _stage: Container) {
    if (this.dripContainer) {
      app.stage.removeChild(this.dripContainer)
      this.dripContainer.destroy({ children: true })
      this.dripContainer = null
    }
    this.drips = []
  }

  update(dt: number) {
    if (!this.dripContainer || !this.app) return

    this.spawnTimer -= dt
    // Very rare spawn - only if we have few drips
    if (this.spawnTimer <= 0 && this.drips.length < 8) {
      this.spawnDrip()
      // Next spawn in 3-8 seconds
      this.spawnTimer = 180 + Math.random() * 300
    }

    const screenH = this.app.screen.height

    for (let i = this.drips.length - 1; i >= 0; i--) {
      const d = this.drips[i]
      d.timer += dt

      if (d.state === 'growing') {
        // Slowly grow the stalagmite down from the character
        d.growTimer -= dt
        if (d.growTimer <= 0) {
          // Add a new segment
          const segment = new Text({
            text: GROW_CHAR,
            style: new TextStyle({
              fontSize: d.fontSize,
              fill: d.color,
            }),
          })
          // Position directly below the previous segment
          const segmentY = d.originY + 10 + (d.segments.length * 8)
          segment.x = d.x
          segment.y = segmentY
          segment.alpha = 0.7 - (d.segments.length * 0.08)
          this.dripContainer.addChild(segment)
          d.segments.push(segment)

          // Randomly decide to start dropping (more likely as it gets longer)
          const dropChance = 0.1 + (d.segments.length * 0.05)
          if (d.segments.length >= 3 && Math.random() < dropChance) {
            d.state = 'forming'
            d.formTimer = 30 + Math.random() * 60
            // Create the drop at the tip
            const tipY = d.originY + 10 + (d.segments.length * 8)
            const dropChar = DRIP_CHARS[Math.floor(Math.random() * DRIP_CHARS.length)]
            d.drop = new Text({
              text: dropChar,
              style: new TextStyle({
                fontSize: d.fontSize + 2,
                fill: d.color,
              }),
            })
            d.drop.x = d.x
            d.drop.y = tipY
            this.dripContainer.addChild(d.drop)
          } else if (d.segments.length >= 8) {
            // Max length - start dropping
            d.state = 'forming'
            d.formTimer = 30 + Math.random() * 60
            const tipY = d.originY + 10 + (d.segments.length * 8)
            const dropChar = DRIP_CHARS[Math.floor(Math.random() * DRIP_CHARS.length)]
            d.drop = new Text({
              text: dropChar,
              style: new TextStyle({
                fontSize: d.fontSize + 2,
                fill: d.color,
              }),
            })
            d.drop.x = d.x
            d.drop.y = tipY
            this.dripContainer.addChild(d.drop)
          } else {
            // Continue growing
            d.growTimer = 20 + Math.random() * 40
          }
        }
      } else if (d.state === 'forming') {
        // The drop hangs at the tip before falling
        d.formTimer -= dt
        // Slight wobble while forming
        if (d.drop) {
          d.drop.x = d.x + Math.sin(d.timer * 0.1) * 1
        }
        if (d.formTimer <= 0) {
          d.state = 'falling'
          d.speed = 0.5 // Initial slow speed
          d.dropY = 0
        }
      } else if (d.state === 'falling') {
        // Physics-based acceleration
        d.speed += 0.08 * dt // gravity acceleration
        d.dropY += d.speed * dt

        // Update drop position
        if (d.drop) {
          const tipY = d.originY + 10 + (d.segments.length * 8)
          d.drop.y = tipY + d.dropY
        }

        // Leave a fading trail
        if (d.timer > d.nextTrailAt) {
          const trail = new Text({
            text: d.drop?.text || '·',
            style: new TextStyle({
              fontSize: d.fontSize,
              fill: d.color,
            }),
          })
          const tipY = d.originY + 10 + (d.segments.length * 8)
          trail.x = d.x
          trail.y = tipY + d.dropY - 5
          trail.alpha = 0.5
          this.dripContainer.addChild(trail)
          d.trails.push({ text: trail, life: 25 })
          d.nextTrailAt = d.timer + 2 + Math.random() * 3
        }

        // Check if drop hit bottom
        const tipY = d.originY + 10 + (d.segments.length * 8)
        if (tipY + d.dropY >= screenH - 5) {
          d.state = 'splash'
          d.splashStart = d.timer
          // Create splash particles
          for (let j = 0; j < 4; j++) {
            const splash = new Text({
              text: '·',
              style: new TextStyle({ fontSize: 8 + Math.random() * 4, fill: d.color }),
            })
            splash.x = d.x + (Math.random() - 0.5) * 16
            splash.y = screenH - 4
            splash.alpha = 0.8
            this.dripContainer.addChild(splash)
            d.trails.push({ text: splash, life: 25, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 3 })
          }
          // Remove the main drop
          if (d.drop) {
            d.drop.destroy()
            d.drop = null
          }
        }
      } else if (d.state === 'splash') {
        // Animate splash particles with simple physics
        for (const t of d.trails) {
          if ('vx' in t) {
            t.text.x += (t as SplashTrail).vx * 0.5
            t.text.y += (t as SplashTrail).vy * 0.5
            ;(t as SplashTrail).vy += 0.15 // gravity
          }
        }

        // Brief splash then remove
        if (d.timer - d.splashStart > 30) {
          this.removeDrip(i)
          continue
        }
      }

      // Fade out trails
      for (let t = d.trails.length - 1; t >= 0; t--) {
        d.trails[t].life -= dt
        d.trails[t].text.alpha = Math.max(0, d.trails[t].life / 25) * 0.5
        if (d.trails[t].life <= 0) {
          d.trails[t].text.destroy()
          d.trails.splice(t, 1)
        }
      }
    }
  }

  handleResize() {}

  private spawnDrip() {
    if (!this.app || !this.dripContainer) return

    // Get character positions from the terminal if available
    const characterSources = this.getCharacterSource?.() ?? []

    let x: number
    let originY: number

    if (characterSources.length > 0) {
      // Pick a random character and spawn from below it
      const source = characterSources[Math.floor(Math.random() * characterSources.length)]
      x = source.x + 2 // Slight offset to center under character
      originY = source.y + 12 // Start just below the character baseline
    } else {
      return // Don't spawn if no characters available
    }

    const fontSize = 10 + Math.random() * 3
    const color = Math.random() < 0.5 ? 0x4488cc : 0x66aadd

    this.drips.push({
      x,
      originY,
      segments: [],
      drop: null,
      dropY: 0,
      speed: 0,
      state: 'growing',
      trails: [],
      timer: 0,
      fontSize,
      color,
      nextTrailAt: 4,
      splashStart: 0,
      growTimer: 30 + Math.random() * 50,
      formTimer: 0,
    })
  }

  private removeDrip(index: number) {
    const d = this.drips[index]
    // Remove all segments
    for (const seg of d.segments) seg.destroy()
    if (d.drop) d.drop.destroy()
    for (const t of d.trails) t.text.destroy()
    this.drips.splice(index, 1)
  }
}

interface DripEntity {
  x: number
  originY: number
  segments: Text[]
  drop: Text | null
  dropY: number
  speed: number
  state: 'growing' | 'forming' | 'falling' | 'splash'
  trails: { text: Text; life: number; vx?: number; vy?: number }[]
  timer: number
  fontSize: number
  color: number
  nextTrailAt: number
  splashStart: number
  growTimer: number
  formTimer: number
}

interface SplashTrail {
  text: Text
  life: number
  vx: number
  vy: number
}

// ─── Registry ────────────────────────────────────────────────────────

// ─── 10. Snowfall (CrazyEffect adapter) ────────────────────────────
// Wraps the Snowfall ambient effect so it can participate in the random chooser.

class SnowfallCrazyEffect implements CrazyEffect {
  readonly name = 'Snowfall'
  private snowfall: Snowfall

  constructor(getCharacterSource: CharacterSourceCallback | null) {
    this.snowfall = new Snowfall()
    this.snowfall.setCharacterSource(getCharacterSource ?? null)
  }

  activate(app: Application, stage: Container): void {
    this.snowfall.handleResize(app.screen.width, app.screen.height)
    this.snowfall.setEnabled(true)
    stage.addChild(this.snowfall.container)
  }

  deactivate(_app: Application, stage: Container): void {
    this.snowfall.setEnabled(false)
    stage.removeChild(this.snowfall.container)
  }

  update(dt: number): void {
    this.snowfall.update(dt)
  }

  handleResize(app: Application): void {
    this.snowfall.handleResize(app.screen.width, app.screen.height)
  }
}

// ─── 11. Bubble Rise (CrazyEffect adapter) ─────────────────────────

class BubbleRiseCrazyEffect implements CrazyEffect {
  readonly name = 'Bubble Rise'
  private bubbleRise: BubbleRise

  constructor(getCharacterSource: CharacterSourceCallback | null) {
    this.bubbleRise = new BubbleRise()
    this.bubbleRise.setCharacterSource(getCharacterSource ?? null)
  }

  activate(app: Application, stage: Container): void {
    this.bubbleRise.handleResize(app.screen.width, app.screen.height)
    this.bubbleRise.setEnabled(true)
    stage.addChild(this.bubbleRise.container)
  }

  deactivate(_app: Application, stage: Container): void {
    this.bubbleRise.setEnabled(false)
    stage.removeChild(this.bubbleRise.container)
  }

  update(dt: number): void {
    this.bubbleRise.update(dt)
  }

  handleResize(app: Application): void {
    this.bubbleRise.handleResize(app.screen.width, app.screen.height)
  }
}

export class CrazyEffectManager {
  private app: Application
  private activeEffect: CrazyEffect | null = null
  private _active = false
  private stalagmitesEffect: StalagmitesEffect | null = null
  private getCharacterSource: CharacterSourceCallback | null = null

  constructor(app: Application, getCharacterSource?: CharacterSourceCallback) {
    this.app = app
    this.getCharacterSource = getCharacterSource ?? null
  }

  setCharacterSource(callback: CharacterSourceCallback | null) {
    this.getCharacterSource = callback
    // Update the stalagmites effect if it's already active
    if (this.stalagmitesEffect) {
      this.stalagmitesEffect.setCharacterSource(callback)
    }
  }

  get isActive(): boolean {
    return this._active
  }

  get effectName(): string {
    return this.activeEffect?.name || ''
  }

  /** Create a new random effect instance. */
  private createRandomEffect(): CrazyEffect {
    // Only the fantastic physics-based effects are active:
    // 0 = Stalagmites (growing drips with physics)
    // 1 = Snowfall (falling snowflakes with 2D physics)
    // 2 = Bubble Rise (rising bubbles with 2D physics)
    //
    // MEH effects (commented out for later revisit):
    // - LiftedEdgesEffect (shader distortion)
    // - SpiderDropEffect (spiders on threads)
    // - EmojiRainEffect (falling emojis)
    // - EarthquakeEffect (screen shake)
    // - HeatHazeEffect (heat distortion shader)
    // - FunhouseMirrorEffect (wavy distortion shader)
    // - BubbleRiseEffect (inline version - not the physics one)
    // - DrunkModeEffect (rotation/scale oscillation)
    const effectType = Math.floor(Math.random() * 3)
    switch (effectType) {
      case 0:
        this.stalagmitesEffect = new StalagmitesEffect(this.getCharacterSource)
        return this.stalagmitesEffect
      case 1: return new SnowfallCrazyEffect(this.getCharacterSource)
      case 2: return new BubbleRiseCrazyEffect(this.getCharacterSource)
      default:
        this.stalagmitesEffect = new StalagmitesEffect(this.getCharacterSource)
        return this.stalagmitesEffect
    }
  }

  /** Toggle: activate a random effect, or deactivate the current one. */
  toggle(): string | null {
    if (this._active && this.activeEffect) {
      this.activeEffect.deactivate(this.app, this.app.stage)
      if (this.activeEffect instanceof StalagmitesEffect) {
        this.stalagmitesEffect = null
      }
      const name = this.activeEffect.name
      this.activeEffect = null
      this._active = false
      return null
    }

    // Pick a random effect
    this.activeEffect = this.createRandomEffect()
    this.activeEffect.activate(this.app, this.app.stage)
    this._active = true
    return this.activeEffect.name
  }

  update(dt: number) {
    if (this.activeEffect) {
      this.activeEffect.update(dt)
    }
  }

  handleResize() {
    if (this.activeEffect) {
      this.activeEffect.handleResize(this.app)
    }
  }
}
