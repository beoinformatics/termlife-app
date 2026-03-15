/**
 * ConfigManager — renderer-side reactive app config.
 *
 * Usage:
 *   const config = await ConfigManager.create()
 *   config.onChange((cfg) => applySettings(cfg))
 *   config.set('theme', 'dracula')
 *   config.setSection('effects', { errorEffect: 'shockwave-shake' })
 */

import { DEFAULT_APP_CONFIG, type AppConfig, type EffectsConfig } from '../../../shared/AppConfig'

type Listener = (config: AppConfig) => void

export class ConfigManager {
  private _config: AppConfig = { ...DEFAULT_APP_CONFIG }
  private _listeners: Listener[] = []

  private constructor() {}

  static async create(): Promise<ConfigManager> {
    const mgr = new ConfigManager()
    try {
      const loaded = await window.ptyAPI.config.get()
      if (loaded) mgr._config = loaded
    } catch (err) {
      console.warn('Failed to load config:', err)
    }

    // Listen for changes pushed from main (multi-window sync)
    window.addEventListener('config:changed', ((e: CustomEvent) => {
      if (e.detail) {
        mgr._config = e.detail as AppConfig
        mgr._notify()
      }
    }) as EventListener)

    return mgr
  }

  get config(): AppConfig {
    return this._config
  }

  /** Shorthand for effects section */
  get effects(): EffectsConfig {
    return this._config.effects
  }

  /** Update a top-level key (for primitives like theme) */
  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this._config = { ...this._config, [key]: value }
    this._notify()
    try {
      const updated = await window.ptyAPI.config.update({ [key]: value })
      if (updated) this._config = updated
    } catch (err) {
      console.error('Failed to persist config:', err)
    }
  }

  /** Partially update a nested section (e.g. effects, font, terminal) */
  async setSection<K extends keyof AppConfig>(
    section: K,
    partial: AppConfig[K] extends object ? Partial<AppConfig[K]> : never
  ): Promise<void> {
    const current = this._config[section]
    if (typeof current === 'object' && current !== null) {
      this._config = {
        ...this._config,
        [section]: { ...(current as Record<string, unknown>), ...(partial as Record<string, unknown>) },
      }
    }
    this._notify()
    try {
      const updated = await window.ptyAPI.config.update({
        [section]: { ...(current as Record<string, unknown>), ...(partial as Record<string, unknown>) },
      })
      if (updated) this._config = updated
    } catch (err) {
      console.error('Failed to persist config:', err)
    }
  }

  /** Subscribe to config changes. Returns unsubscribe function. */
  onChange(listener: Listener): () => void {
    this._listeners.push(listener)
    return () => {
      this._listeners = this._listeners.filter(l => l !== listener)
    }
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this._config)
    }
  }
}
