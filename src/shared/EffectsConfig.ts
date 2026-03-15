/**
 * EffectsConfig — central configuration for all visual effects.
 *
 * Persisted to ~/.config/termlife/effects.json by the main process.
 * The renderer reads/writes via IPC through window.ptyAPI.effects.
 */

// ─── Option types ──────────────────────────────────────────────────

export type TypingEffect = 'none' | 'fire-trail' | 'platform-game' | 'random'

export type DeleteEffect = 'none' | 'snow-shovel' | 'gravity-drop' | 'thanos-snap' | 'shredder' | 'random'

export type ErrorEffect = 'none' | 'explosion' | 'shockwave' | 'shake-sparks' | 'shatter' | 'shockwave-shake' | 'random'

export type ErrorIntensity = 'fixed' | 'scale-with-severity'

export type TabTransition = 'none' | 'instant' | 'page-flip' | 'dissolve-burn' | 'glitch' | 'matrix-style' | 'portal' | 'shatter' | 'random'

export type AmbientEffect = 'none' | 'snowflakes' | 'bubble-rise' | 'water-fill' | 'gravity-mode' | 'magnetism' | 'random'

export type ParticleDensity = 'low' | 'medium' | 'high'

// ─── Config interface ──────────────────────────────────────────────

export interface EffectsConfig {
  // Master switch
  effectsEnabled: boolean

  // Existing effects
  crt: boolean
  matrixRain: boolean

  // Typing
  typingEffect: TypingEffect

  // Deletion
  deleteEffect: DeleteEffect

  // Errors
  errorEffect: ErrorEffect
  errorIntensity: ErrorIntensity

  // Tab transitions
  tabTransition: TabTransition
  tabTransitionDuration: number // ms

  // Physics / ambient
  ambientEffect: AmbientEffect

  // Command-aware
  dangerCommandShake: boolean
  successCelebration: boolean

  // Performance
  particleDensity: ParticleDensity
}

// ─── Defaults ──────────────────────────────────────────────────────

export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = {
  effectsEnabled: true,
  crt: false,
  matrixRain: false,
  typingEffect: 'none',
  deleteEffect: 'none',
  errorEffect: 'none',
  errorIntensity: 'fixed',
  tabTransition: 'none',
  tabTransitionDuration: 300,
  ambientEffect: 'none',
  dangerCommandShake: false,
  successCelebration: false,
  particleDensity: 'medium',
}

// ─── Validation ────────────────────────────────────────────────────

const VALID_VALUES: Record<string, readonly string[]> = {
  typingEffect: ['none', 'fire-trail', 'platform-game', 'random'],
  deleteEffect: ['none', 'snow-shovel', 'gravity-drop', 'thanos-snap', 'shredder', 'random'],
  errorEffect: ['none', 'explosion', 'shockwave', 'shake-sparks', 'shatter', 'shockwave-shake', 'random'],
  errorIntensity: ['fixed', 'scale-with-severity'],
  tabTransition: ['none', 'instant', 'page-flip', 'dissolve-burn', 'glitch', 'matrix-style', 'portal', 'shatter', 'random'],
  ambientEffect: ['none', 'snowflakes', 'bubble-rise', 'water-fill', 'gravity-mode', 'magnetism', 'random'],
  particleDensity: ['low', 'medium', 'high'],
}

/**
 * Merge a partial (possibly stale/invalid) config from disk with defaults.
 * Unknown keys are dropped, invalid enum values fall back to defaults.
 */
export function sanitizeConfig(raw: Partial<Record<string, unknown>>): EffectsConfig {
  const config = { ...DEFAULT_EFFECTS_CONFIG }

  for (const key of Object.keys(DEFAULT_EFFECTS_CONFIG) as (keyof EffectsConfig)[]) {
    if (!(key in raw)) continue
    const val = raw[key]
    const defaultVal = DEFAULT_EFFECTS_CONFIG[key]

    if (typeof defaultVal === 'boolean') {
      if (typeof val === 'boolean') (config as Record<string, unknown>)[key] = val
    } else if (typeof defaultVal === 'number') {
      if (typeof val === 'number' && isFinite(val) && val > 0) (config as Record<string, unknown>)[key] = val
    } else if (typeof defaultVal === 'string') {
      const allowed = VALID_VALUES[key]
      if (allowed && typeof val === 'string' && allowed.includes(val)) {
        (config as Record<string, unknown>)[key] = val
      }
    }
  }

  return config
}
