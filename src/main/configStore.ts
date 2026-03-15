/**
 * ConfigStore — persists AppConfig to ~/.config/termlife/config.json
 */

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { DEFAULT_APP_CONFIG, sanitizeAppConfig, type AppConfig } from '../shared/AppConfig'

export class ConfigStore {
  private configDir: string
  private configPath: string
  private _config: AppConfig = { ...DEFAULT_APP_CONFIG }

  constructor() {
    this.configDir = join(app.getPath('home'), '.config', 'termlife')
    this.configPath = join(this.configDir, 'config.json')
  }

  get config(): AppConfig {
    return this._config
  }

  async load(): Promise<AppConfig> {
    try {
      if (existsSync(this.configPath)) {
        const raw = JSON.parse(await readFile(this.configPath, 'utf-8'))
        this._config = sanitizeAppConfig(raw)
      }
    } catch (err) {
      console.warn('Failed to load config, using defaults:', err)
      this._config = { ...DEFAULT_APP_CONFIG }
    }
    return this._config
  }

  async save(): Promise<void> {
    try {
      if (!existsSync(this.configDir)) {
        await mkdir(this.configDir, { recursive: true })
      }
      await writeFile(this.configPath, JSON.stringify(this._config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }

  async update(partial: Record<string, unknown>): Promise<AppConfig> {
    // Deep merge one level: top-level objects get merged, not replaced
    const merged: Record<string, unknown> = {}
    for (const key of Object.keys(DEFAULT_APP_CONFIG)) {
      const current = (this._config as Record<string, unknown>)[key]
      const incoming = partial[key]
      if (incoming !== undefined && typeof current === 'object' && current !== null && typeof incoming === 'object' && incoming !== null) {
        merged[key] = { ...(current as Record<string, unknown>), ...(incoming as Record<string, unknown>) }
      } else if (incoming !== undefined) {
        merged[key] = incoming
      } else {
        merged[key] = current
      }
    }
    this._config = sanitizeAppConfig(merged)
    await this.save()
    return this._config
  }
}
