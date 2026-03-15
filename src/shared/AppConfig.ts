/**
 * AppConfig — single top-level configuration object for all TermLife settings.
 *
 * Persisted to ~/.config/termlife/config.json by the main process.
 * The renderer reads/writes via IPC through window.ptyAPI.config.
 *
 * EffectsConfig is nested under `effects`.
 */

import { type EffectsConfig, DEFAULT_EFFECTS_CONFIG, sanitizeConfig as sanitizeEffects } from './EffectsConfig'

// ─── Sub-config interfaces ─────────────────────────────────────────

export interface FontConfig {
  size: number          // default 14
  family: string        // default 'JetBrains Mono', ...
}

export interface TerminalConfig {
  scrollbackLines: number   // default 10_000
  scrollSpeed: number       // lines per scroll event, default 5
  cursorBlinkRate: number   // frames per blink toggle, default 30
}

export interface TabsConfig {
  maxTabs: number           // default 10
  autoSwitchDelay: number   // ms, default 10_000
}

export interface WindowConfig {
  width: number             // default 768
  height: number            // default 512
}

export interface ShellConfig {
  path: string              // default '' (uses $SHELL / platform default)
  termType: string          // default 'xterm-256color'
}

// ─── Top-level config ──────────────────────────────────────────────

export interface AppConfig {
  theme: string
  font: FontConfig
  terminal: TerminalConfig
  tabs: TabsConfig
  window: WindowConfig
  shell: ShellConfig
  effects: EffectsConfig
}

// ─── Defaults ──────────────────────────────────────────────────────

export const DEFAULT_FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Monaco, "Courier New", "Noto Sans Symbols 2", sans-serif'

export const DEFAULT_APP_CONFIG: AppConfig = {
  theme: 'retro-green',
  font: {
    size: 14,
    family: DEFAULT_FONT_FAMILY,
  },
  terminal: {
    scrollbackLines: 10_000,
    scrollSpeed: 5,
    cursorBlinkRate: 30,
  },
  tabs: {
    maxTabs: 10,
    autoSwitchDelay: 10_000,
  },
  window: {
    width: 768,
    height: 512,
  },
  shell: {
    path: '',
    termType: 'xterm-256color',
  },
  effects: DEFAULT_EFFECTS_CONFIG,
}

// ─── Validation ────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function sanitizeString(val: unknown, fallback: string, allowed?: readonly string[]): string {
  if (typeof val !== 'string') return fallback
  if (allowed && !allowed.includes(val)) return fallback
  return val
}

function sanitizeNumber(val: unknown, fallback: number, min?: number, max?: number): number {
  if (typeof val !== 'number' || !isFinite(val)) return fallback
  if (min !== undefined && val < min) return fallback
  if (max !== undefined && val > max) return fallback
  return val
}

// All valid theme IDs
const VALID_THEMES = [
  'retro-green', 'dark-plus', 'nord-aurora', 'amber-crt', 'dracula',
  'sakura', 'firewatch', 'light-plus', 'cyberpunk', 'synthwave',
  'vaporwave', 'matrix', 'hot-dog', 'ocean-depths', 'sunset',
  'tokyo-night', 'midnight-purple', 'gold-royal', 'planet-fitness',
  't-mobile', 'starbucks', 'frozen', 'despicable-me',
  'wes-anderson', 'john-deere', 'barbie', 'ups', 'ikea',
] as const

/**
 * Merge a partial (possibly stale/invalid) config from disk with defaults.
 * Handles missing keys, invalid values, and nested objects gracefully.
 */
export function sanitizeAppConfig(raw: unknown): AppConfig {
  if (!isObject(raw)) return { ...DEFAULT_APP_CONFIG }

  const font = isObject(raw.font) ? raw.font : {}
  const terminal = isObject(raw.terminal) ? raw.terminal : {}
  const tabs = isObject(raw.tabs) ? raw.tabs : {}
  const win = isObject(raw.window) ? raw.window : {}
  const shell = isObject(raw.shell) ? raw.shell : {}
  const effects = isObject(raw.effects) ? raw.effects : {}

  return {
    theme: sanitizeString(raw.theme, DEFAULT_APP_CONFIG.theme, VALID_THEMES),
    font: {
      size: sanitizeNumber(font.size, DEFAULT_APP_CONFIG.font.size, 8, 32),
      family: sanitizeString(font.family, DEFAULT_APP_CONFIG.font.family),
    },
    terminal: {
      scrollbackLines: sanitizeNumber(terminal.scrollbackLines, DEFAULT_APP_CONFIG.terminal.scrollbackLines, 100, 100_000),
      scrollSpeed: sanitizeNumber(terminal.scrollSpeed, DEFAULT_APP_CONFIG.terminal.scrollSpeed, 1, 50),
      cursorBlinkRate: sanitizeNumber(terminal.cursorBlinkRate, DEFAULT_APP_CONFIG.terminal.cursorBlinkRate, 5, 120),
    },
    tabs: {
      maxTabs: sanitizeNumber(tabs.maxTabs, DEFAULT_APP_CONFIG.tabs.maxTabs, 1, 50),
      autoSwitchDelay: sanitizeNumber(tabs.autoSwitchDelay, DEFAULT_APP_CONFIG.tabs.autoSwitchDelay, 1000, 60_000),
    },
    window: {
      width: sanitizeNumber(win.width, DEFAULT_APP_CONFIG.window.width, 400, 7680),
      height: sanitizeNumber(win.height, DEFAULT_APP_CONFIG.window.height, 300, 4320),
    },
    shell: {
      path: sanitizeString(shell.path, DEFAULT_APP_CONFIG.shell.path),
      termType: sanitizeString(shell.termType, DEFAULT_APP_CONFIG.shell.termType),
    },
    effects: sanitizeEffects(effects as Record<string, unknown>),
  }
}

// Re-export EffectsConfig types for convenience
export type { EffectsConfig } from './EffectsConfig'
export { DEFAULT_EFFECTS_CONFIG } from './EffectsConfig'
