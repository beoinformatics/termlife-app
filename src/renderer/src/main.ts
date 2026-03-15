import { Application, Text, TextStyle } from 'pixi.js'

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modified: Date
  isHidden: boolean
}

declare global {
  interface Window {
    ptyAPI: {
      create: (id: string, shell?: string, cwd?: string) => Promise<{ success: boolean; pid?: number; error?: string }>
      write: (id: string, data: string) => Promise<{ success: boolean; error?: string }>
      resize: (id: string, cols: number, rows: number) => Promise<{ success: boolean; error?: string }>
      kill: (id: string) => Promise<{ success: boolean; error?: string }>
      onData: (id: string, callback: (id: string, data: string, hasChildren: boolean) => void) => void
      offData: (id: string) => void
      onExit: (id: string, callback: (id: string, exitCode: number) => void) => void
      offExit: (id: string) => void
      removeAllListeners: () => void
      fs: {
        readdir: (path: string) => Promise<FileEntry[]>
      }
      hasChildren: (id: string) => Promise<{ success: boolean; hasChildren?: boolean; error?: string }>
      getReplayContent: () => Promise<string | null>
      homedir: () => string
      lowGpu: () => boolean
      notifyThemeChanged: (themeId: string) => void
      config: {
        get: () => Promise<import('../../shared/AppConfig').AppConfig>
        update: (partial: Record<string, unknown>) => Promise<import('../../shared/AppConfig').AppConfig>
      }
    }
  }
}

import { TabManager } from './tabs/TabManager'
import { TabBar } from './tabs/TabBar'
import { Dashboard } from './tabs/Dashboard'
import { CRTFilter } from './effects/CRTFilter'
import { MatrixRain } from './effects/MatrixRain'
import { CrazyEffectManager } from './effects/CrazyEffects'
import { Snowfall } from './effects/Snowfall'
import { BubbleRise } from './effects/BubbleRise'
import { themeManager, THEMES } from './themes/ThemeManager'
import { rebuildPalette } from './terminal/CellGrid'
import { ConfigManager } from './config/ConfigManager'
import { commandRegistry } from './history/CommandRegistry'
import { HistoryView } from './history/HistoryView'
import { ReplayEngine } from './history/ReplayEngine'
import { ProductivityBar } from './productivity/ProductivityBar'
import { GitView } from './git/GitView'
import { GitDataService } from './git/GitDataService'

async function main() {
  const lowGpu = window.ptyAPI.lowGpu()

  const app = new Application()
  await app.init({
    background: themeManager.theme.background,
    resizeTo: window,
    antialias: false,
    resolution: lowGpu ? 1 : (window.devicePixelRatio || 1),
    autoDensity: true,
    preference: lowGpu ? 'webgl' : undefined,
  })
  document.body.appendChild(app.canvas)

  // Cap FPS in low-gpu mode to reduce GPU load
  if (lowGpu) {
    app.ticker.maxFPS = 30
    console.log('[TermLife] Low-GPU mode: resolution=1, FPS capped to 30, WebGL forced')
  }

  // Tab bar height (tabs only - title bar is additional)
  const TAB_HEIGHT = 40
  const TITLE_BAR_HEIGHT = 28
  const TOTAL_HEADER_HEIGHT = TAB_HEIGHT + TITLE_BAR_HEIGHT

  // Create tab manager, tab bar, and dashboard
  const tabManager = new TabManager(app, TOTAL_HEADER_HEIGHT)
  const dashboard = new Dashboard(app, tabManager, TOTAL_HEADER_HEIGHT)

  // Crazy effects manager
  const crazyEffects = new CrazyEffectManager(app)

  // Character source callback for stalagmites effect - gets visible characters from active terminal
  const getCharacterSource = (): { char: string; x: number; y: number; fg: number; bg: number }[] => {
    const tab = tabManager.activeTab
    if (!tab) return []

    const result: { char: string; x: number; y: number; fg: number; bg: number }[] = []

    // Get characters from all visible panes
    for (const pane of tab.splitPane.activePanes) {
      const paneContent = pane.engine.cellGrid.captureVisibleContent()
      // Adjust positions based on pane location
      const paneX = pane.container.x
      const paneY = pane.container.y
      for (const cell of paneContent) {
        result.push({
          char: cell.char,
          x: cell.x + paneX,
          y: cell.y + paneY,
          fg: cell.fg,
          bg: cell.bg,
        })
      }
    }
    return result
  }

  crazyEffects.setCharacterSource(getCharacterSource)

  // Snowfall effect (reduced particles in low-gpu mode)
  const snowfall = new Snowfall(lowGpu ? 80 : 300)
  snowfall.setCharacterSource(getCharacterSource)
  snowfall.handleResize(window.innerWidth, window.innerHeight)
  app.stage.addChild(snowfall.container)

  // Bubble rise effect (reduced particles in low-gpu mode)
  const bubbleRise = new BubbleRise(lowGpu ? 40 : 150)
  bubbleRise.setCharacterSource(getCharacterSource)
  bubbleRise.handleResize(window.innerWidth, window.innerHeight)
  app.stage.addChild(bubbleRise.container)

  // History view (created early so tab bar can reference it)
  const historyView = new HistoryView()
  historyView.handleResize(window.innerWidth, window.innerHeight - TOTAL_HEADER_HEIGHT, TOTAL_HEADER_HEIGHT)

  // Git View (created early so tab bar can reference it)
  const gitDataService = new GitDataService((window as any).ptyAPI?.homedir?.() || '/')
  const gitView = new GitView(gitDataService)

  // TabBar needs dashboard toggle callback (declare first, assign after)
  let tabBar: TabBar
  tabBar = new TabBar(app, tabManager, TAB_HEIGHT, TITLE_BAR_HEIGHT, () => {
    if (crazyEffects.isActive) crazyEffects.toggle()
    if (gitView.isVisible) gitView.hide()
    dashboard.toggle()
    tabBar.refresh()
  }, () => {
    if (crazyEffects.isActive) crazyEffects.toggle()
    if (gitView.isVisible) gitView.hide()
    const tab = tabManager.activeTab
    if (tab) {
      tab.splitPane.toggleFocusedPaneMode()
    }
  }, () => {
    // Only allow crazy effects in normal terminal mode
    const tab = tabManager.activeTab
    const inFileBrowser = tab && tab.splitPane.isFocusedPaneFileBrowser()
    if (dashboard.isVisible || inFileBrowser) return
    crazyEffects.toggle()
  }, () => crazyEffects.isActive, () => {
    // Normal view: deactivate all alternative views
    if (dashboard.isVisible) dashboard.hide()
    if (crazyEffects.isActive) crazyEffects.toggle()
    const tab = tabManager.activeTab
    if (tab && tab.splitPane.isFocusedPaneFileBrowser()) {
      tab.splitPane.toggleFocusedPaneMode()
    }
    if (historyView.visible) {
      historyView.hide()
    }
    if (gitView.isVisible) {
      gitView.hide()
    }
    tabBar.refresh()
  }, () => {
    // History view toggle — show command history overlay
    const tab = tabManager.activeTab
    if (tab) {
      historyView.toggle(tab.history.getEntries())
    }
  }, () => {
    // History active check
    return historyView.visible
  }, () => {
    // Auto-switch: jump to most important tab
    tabManager.jumpToMostImportant()
    tabBar.refresh()
  }, () => {
    // Auto-switch active check (scoring always active)
    return tabManager.autoSwitchEnabled
  }, () => {
    // Git view toggle
    commandRegistry.executeById('git:toggle')
  }, () => {
    // Git active check
    return gitView.isVisible
  })

  // App config — loads persisted settings from disk
  const appConfig = await ConfigManager.create()

  // CRT filter (toggled with Ctrl+Shift+C)
  const crtFilter = new CRTFilter()

  // Matrix rain (toggled with Ctrl+Shift+M)
  const matrixRain = new MatrixRain(app)
  app.stage.addChild(matrixRain.container)

  // Apply initial config state
  const applyEffectsConfig = (): void => {
    const fx = appConfig.effects
    app.stage.filters = fx.crt ? [crtFilter.filter] : []
    matrixRain.setEnabled(fx.matrixRain)
    snowfall.setEnabled(fx.effectsEnabled && fx.ambientEffect === 'snowflakes')
    bubbleRise.setEnabled(fx.effectsEnabled && fx.ambientEffect === 'bubble-rise')
  }
  applyEffectsConfig()

  // React to config changes (from settings UI or multi-window sync)
  appConfig.onChange(() => applyEffectsConfig())

  // Register all app commands in the command registry
  commandRegistry.register({
    id: 'crt:toggle',
    label: 'Toggle CRT Filter',
    category: 'crt',
    execute: () => {
      appConfig.setSection('effects', { crt: !appConfig.effects.crt })
    },
  })
  commandRegistry.register({
    id: 'theme:cycle',
    label: 'Cycle Color Theme',
    category: 'theme',
    shortcut: 'Ctrl+Shift+C',
    execute: () => {
      themeManager.cycleTheme()
    },
  })
  commandRegistry.register({
    id: 'matrix:toggle',
    label: 'Toggle Matrix Rain',
    category: 'matrix',
    shortcut: 'Ctrl+Shift+M',
    execute: () => {
      appConfig.setSection('effects', { matrixRain: !appConfig.effects.matrixRain })
    },
  })
  commandRegistry.register({
    id: 'dashboard:toggle',
    label: 'Toggle Dashboard',
    category: 'dashboard',
    shortcut: 'Cmd/Ctrl+Shift+D',
    execute: () => {
      dashboard.toggle()
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'view:normal',
    label: 'Default Terminal View',
    category: 'view',
    shortcut: 'Ctrl+Shift+0',
    execute: () => {
      if (dashboard.isVisible) dashboard.hide()
      if (crazyEffects.isActive) crazyEffects.toggle()
      const tab = tabManager.activeTab
      if (tab && tab.splitPane.isFocusedPaneFileBrowser()) {
        tab.splitPane.toggleFocusedPaneMode()
      }
      if (historyView.visible) {
        historyView.hide()
      }
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'filebrowser:toggle',
    label: 'Toggle File Browser',
    category: 'filebrowser',
    shortcut: 'Ctrl+Shift+F',
    execute: () => {
      const tab = tabManager.activeTab
      if (tab) {
        tab.splitPane.toggleFocusedPaneMode()
      }
    },
  })
  commandRegistry.register({
    id: 'tab:new',
    label: 'New Tab',
    category: 'tab',
    shortcut: 'Cmd/Ctrl+T',
    execute: () => {
      const currentTab = tabManager.activeTab
      const cwd = currentTab?.splitPane.focusedPane?.engine.getWorkingDirectory() || undefined
      tabManager.createTab('single', cwd)
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'tab:close',
    label: 'Close Tab',
    category: 'tab',
    shortcut: 'Cmd/Ctrl+W',
    execute: () => {
      tabManager.closeActiveTab()
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'tab:switch',
    label: 'Switch to Tab',
    category: 'tab',
    execute: (args?: string[]) => {
      if (args && args.length > 0) {
        const idx = parseInt(args[0]) - 1
        tabManager.switchToTab(idx)
        tabBar.refresh()
      }
    },
  })
  commandRegistry.register({
    id: 'tab:prev',
    label: 'Previous Tab',
    category: 'tab',
    shortcut: 'Shift+Cmd/Ctrl+[',
    execute: () => {
      const currentIdx = tabManager.activeTabIndex
      const newIdx = currentIdx > 0 ? currentIdx - 1 : tabManager.activeTabs.length - 1
      tabManager.switchToTab(newIdx)
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'tab:next',
    label: 'Next Tab',
    category: 'tab',
    shortcut: 'Shift+Cmd/Ctrl+]',
    execute: () => {
      const currentIdx = tabManager.activeTabIndex
      const newIdx = currentIdx < tabManager.activeTabs.length - 1 ? currentIdx + 1 : 0
      tabManager.switchToTab(newIdx)
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'tab:smart-switch',
    label: 'Smart Tab Switch',
    category: 'tab',
    shortcut: 'Ctrl+Tab',
    execute: () => {
      tabManager.controlTab()
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'tab:auto-switch',
    label: 'Jump to Most Important Tab',
    shortcut: 'Ctrl+Shift+J',
    category: 'tab',
    execute: () => {
      tabManager.jumpToMostImportant()
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'scroll:up',
    label: 'Scroll Up',
    category: 'scroll',
    shortcut: 'Shift+PageUp',
    execute: () => {
      tabManager.scrollUp(5)
    },
  })
  commandRegistry.register({
    id: 'scroll:down',
    label: 'Scroll Down',
    category: 'scroll',
    shortcut: 'Shift+PageDown',
    execute: () => {
      tabManager.scrollDown(5)
    },
  })
  commandRegistry.register({
    id: 'scroll:top',
    label: 'Scroll to Top',
    category: 'scroll',
    shortcut: 'Cmd/Ctrl+Home',
    execute: () => {
      tabManager.scrollToTop()
    },
  })
  commandRegistry.register({
    id: 'scroll:bottom',
    label: 'Scroll to Bottom',
    category: 'scroll',
    shortcut: 'Cmd/Ctrl+End',
    execute: () => {
      tabManager.scrollToBottom()
    },
  })
  commandRegistry.register({
    id: 'scroll:prev-prompt',
    label: 'Previous Prompt',
    category: 'scroll',
    shortcut: 'Ctrl+Shift+ArrowUp',
    execute: () => {
      tabManager.scrollToPrevPrompt()
    },
  })
  commandRegistry.register({
    id: 'scroll:next-prompt',
    label: 'Next Prompt',
    category: 'scroll',
    shortcut: 'Ctrl+Shift+ArrowDown',
    execute: () => {
      tabManager.scrollToNextPrompt()
    },
  })

  // Theme commands
  commandRegistry.register({
    id: 'theme:set',
    label: 'Set Theme',
    category: 'theme',
    execute: (args?: string[]) => {
      if (args && args.length > 0) {
        const id = args.join('-')
        if (THEMES[id]) {
          window.dispatchEvent(new CustomEvent('set-theme', { detail: id }))
        }
      }
    },
  })
  commandRegistry.register({
    id: 'theme:list',
    label: 'List Themes',
    category: 'theme',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      const pane = tab.splitPane.focusedPane
      if (!pane) return
      const ids = Object.keys(THEMES).join(', ')
      pane.engine.terminal.write(`\r\nThemes: ${ids}\r\n`)
    },
  })

  // Wire history logger: log app commands into the active tab's history
  commandRegistry.setHistoryLogger((tcl: string) => {
    const tab = tabManager.activeTab
    if (tab) {
      tab.history.addApp(tcl)
    }
  })

  // Command input (Cmd/Ctrl+Shift+P) — persistent field in title bar
  commandRegistry.register({
    id: 'palette:toggle',
    label: 'Toggle Command Input',
    category: 'palette',
    shortcut: 'Cmd/Ctrl+Shift+P',
    execute: () => {
      if (tabBar.commandActive) {
        tabBar.deactivateCommand()
      } else {
        tabBar.activateCommand()
      }
    },
  })
  // Helper to sync productivity bar height with terminal layout
  const syncProductivityBarHeight = (): void => {
    tabManager.bottomBarHeight = productivityBar.activeHeight
    tabManager.handleResize()
    productivityBar.handleResize(window.innerWidth, window.innerHeight)
  }

  commandRegistry.register({
    id: 'productivity:toggle',
    label: 'Toggle Productivity Bar',
    category: 'productivity',
    shortcut: 'Ctrl+Shift+B',
    execute: () => {
      productivityBar.toggle()
      syncProductivityBarHeight()
    },
  })
  commandRegistry.register({
    id: 'pomodoro:reset',
    label: 'Reset Pomodoro Timer',
    category: 'productivity',
    execute: () => {
      productivityBar.pomodoro.reset()
    },
  })

  commandRegistry.register({
    id: 'snapshot:save',
    label: 'Save Terminal Snapshot',
    category: 'snapshot',
    shortcut: 'Ctrl+Shift+Z',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      const pane = tab.splitPane.focusedPane
      if (!pane) return

      const content = pane.engine.scrollbackManager.captureFullBuffer()
      const now = new Date()
      const pad = (n: number): string => n.toString().padStart(2, '0')
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
      const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const filename = `termlife-${tab.title.toLowerCase().replace(/\s+/g, '-')}-${dateStr}-${timeStr}.txt`

      const header = [
        `TermLife Snapshot`,
        `Tab: ${tab.title}`,
        `Date: ${now.toLocaleString()}`,
        `Size: ${pane.engine.size.cols}\u00d7${pane.engine.size.rows}`,
        '\u2500'.repeat(60),
        '',
        '',
      ].join('\n')

      const blob = new Blob([header + content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })
  commandRegistry.register({
    id: 'timestamps:toggle',
    label: 'Toggle Prompt Timestamps',
    category: 'timestamps',
    shortcut: 'Ctrl+Shift+T',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      const pane = tab.splitPane.focusedPane
      if (!pane) return
      pane.engine.scrollbackManager.toggleTimestamps()
    },
  })

  // Semi-markdown mode commands
  commandRegistry.register({
    id: 'markdown:toggle',
    label: 'Toggle Semi-Markdown',
    category: 'markdown',
    shortcut: 'Ctrl+Shift+K',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      for (const pane of tab.splitPane.activePanes) {
        pane.engine.markdownStyler.toggle()
      }
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'markdown:on',
    label: 'Enable Semi-Markdown',
    category: 'markdown',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      for (const pane of tab.splitPane.activePanes) {
        pane.engine.markdownStyler.enable()
      }
      tabBar.refresh()
    },
  })
  commandRegistry.register({
    id: 'markdown:off',
    label: 'Disable Semi-Markdown',
    category: 'markdown',
    execute: () => {
      const tab = tabManager.activeTab
      if (!tab) return
      for (const pane of tab.splitPane.activePanes) {
        pane.engine.markdownStyler.disable()
      }
      tabBar.refresh()
    },
  })

  commandRegistry.register({
    id: 'history:toggle',
    label: 'Toggle History View',
    category: 'history',
    shortcut: 'Cmd/Ctrl+Shift+H',
    execute: () => {
      const tab = tabManager.activeTab
      if (tab) {
        historyView.toggle(tab.history.getEntries())
      }
    },
  })
  commandRegistry.register({
    id: 'history:open',
    label: 'Open History View',
    category: 'history',
    execute: () => {
      const tab = tabManager.activeTab
      if (tab) {
        historyView.show(tab.history.getEntries())
      }
    },
  })
  commandRegistry.register({
    id: 'history:close',
    label: 'Close History View',
    category: 'history',
    execute: () => {
      historyView.hide()
    },
  })

  // Productivity bar (bottom, toggled with Ctrl+Shift+B)
  const productivityBar = new ProductivityBar()

  commandRegistry.register({
    id: 'git:toggle',
    label: 'Toggle Git View',
    category: 'git',
    shortcut: 'Ctrl+Shift+G',
    execute: () => {
      if (dashboard.isVisible) dashboard.hide()
      if (historyView.visible) historyView.hide()
      if (crazyEffects.isActive) crazyEffects.toggle()
      // Update cwd from active tab's working directory
      const tab = tabManager.activeTab
      if (tab) {
        const cwd = tab.splitPane.focusedPane?.engine.getWorkingDirectory()
        if (cwd) gitDataService.setCwd(cwd)
      }
      gitView.toggle()
      tabBar.refresh()
    },
  })

  app.stage.addChild(tabBar.container)
  app.stage.addChild(tabManager.container)
  app.stage.addChild(tabManager.deathAnimation.container)
  app.stage.addChild(dashboard)
  app.stage.addChild(historyView.container)
  app.stage.addChild(productivityBar.container)
  app.stage.addChild(gitView.container)

  // Hidden textarea for macOS Emoji & Symbols picker / IME input
  const hiddenInput = document.getElementById('hiddenInput') as HTMLTextAreaElement
  if (hiddenInput) {
    hiddenInput.focus()

    // Forward emoji/symbol/IME input to the focused pane's PTY
    hiddenInput.addEventListener('input', () => {
      const text = hiddenInput.value
      if (text) {
        const tab = tabManager.activeTab
        if (tab) {
          const pane = tab.splitPane.focusedPane
          if (pane) {
            window.ptyAPI.write(pane.engine.id, text)
          }
        }
        hiddenInput.value = ''
      }
    })

    // Re-focus hidden input when canvas is clicked
    app.canvas.addEventListener('mousedown', () => {
      // Delay to let selection/click handlers run first
      requestAnimationFrame(() => hiddenInput.focus())
    })

    // Keep focus on hidden input when window regains focus
    window.addEventListener('focus', () => hiddenInput.focus())
  }

  // Prevent the hidden textarea from capturing regular keystrokes
  // (those are handled by InputHandler). Only emoji picker / IME bypass keydown.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (hiddenInput && document.activeElement === hiddenInput) {
      // Allow the key event to propagate to our handler below,
      // but prevent the textarea from inserting the character
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
      }
    }
  }, true) // capture phase, runs before our handler below

  // Keyboard shortcuts
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    // Rename input intercepts all keys while active
    if (tabBar.renameActive) {
      tabBar.handleRenameKey(e)
      return
    }

    // Command input intercepts all keys while active
    if (tabBar.commandActive) {
      tabBar.handleCommandKey(e)
      return
    }

    // Git commit input intercepts all keys while active
    if (gitView.commitInputActive) {
      gitView.handleCommitKey(e)
      return
    }

    // Git view: Escape to close
    if (gitView.isVisible && e.key === 'Escape') {
      e.preventDefault()
      gitView.toggle()
      return
    }

    // History view: Escape to close, wheel handled separately
    if (historyView.visible && e.key === 'Escape') {
      e.preventDefault()
      historyView.hide()
      return
    }

    // Cmd/Ctrl+Shift+P — toggle command palette
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault()
      commandRegistry.executeById('palette:toggle')
      return
    }
    // Cmd/Ctrl+Shift+H — toggle history view
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
      e.preventDefault()
      commandRegistry.executeById('history:toggle')
      return
    }

    // Copy - Cmd+C / Ctrl+Shift+C (when there's a selection, takes priority)
    const isCopy = (e.metaKey && e.key === 'c') || (e.ctrlKey && e.shiftKey && e.key === 'C')
    if (isCopy) {
      const tab = tabManager.activeTab
      if (tab?.splitPane.hasSelection()) {
        e.preventDefault()
        tab.splitPane.copySelection()
        return
      }
      // If no selection on macOS Cmd+C, send Ctrl+C (interrupt) to terminal
      if (e.metaKey && e.key === 'c') {
        e.preventDefault()
        tabManager.handleKeyDown(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))
        return
      }
    }

    // Paste - Cmd+V / Ctrl+Shift+V
    const isPaste = (e.metaKey && e.key === 'v') || (e.ctrlKey && e.shiftKey && e.key === 'V')
    if (isPaste) {
      e.preventDefault()
      const tab = tabManager.activeTab
      if (tab) {
        tab.splitPane.paste()
      }
      return
    }

    // Ctrl+Shift+C — cycle color theme (only when no selection)
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      themeManager.cycleTheme()
      return
    }
    // Ctrl+Shift+M — toggle Matrix rain
    if (e.ctrlKey && e.shiftKey && e.key === 'M') {
      commandRegistry.executeById('matrix:toggle')
      return
    }
    // Ctrl+Shift+Z — save terminal snapshot
    if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
      e.preventDefault()
      commandRegistry.executeById('snapshot:save')
      return
    }
    // Ctrl+Shift+T — toggle prompt timestamps
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault()
      commandRegistry.executeById('timestamps:toggle')
      return
    }
    // Ctrl+Shift+K — toggle Semi-Markdown mode
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
      e.preventDefault()
      commandRegistry.executeById('markdown:toggle')
      return
    }
    // Ctrl+Shift+J — jump to most important tab
    if (e.ctrlKey && e.shiftKey && e.key === 'J') {
      e.preventDefault()
      commandRegistry.executeById('tab:auto-switch')
      return
    }
    // Ctrl+Shift+B — toggle Productivity Bar
    if (e.ctrlKey && e.shiftKey && e.key === 'B') {
      e.preventDefault()
      commandRegistry.executeById('productivity:toggle')
      return
    }
    // Cmd/Ctrl+Shift+D — toggle Dashboard
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
      e.preventDefault()
      commandRegistry.executeById('dashboard:toggle')
      return
    }
    // Ctrl+Shift+G — toggle Git View
    if (e.ctrlKey && e.shiftKey && e.key === 'G') {
      e.preventDefault()
      commandRegistry.executeById('git:toggle')
      return
    }
    // Ctrl+Shift+0 — default terminal view (deactivate all alternative views)
    if (e.ctrlKey && e.shiftKey && e.key === ')') {
      e.preventDefault()
      commandRegistry.executeById('view:normal')
      return
    }
    // Ctrl+Shift+F — toggle FileBrowser mode on focused pane
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault()
      commandRegistry.executeById('filebrowser:toggle')
      return
    }
    // Cmd/Ctrl+T — new tab
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
      e.preventDefault()
      commandRegistry.executeById('tab:new')
      return
    }
    // Cmd/Ctrl+W — close tab
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault()
      commandRegistry.executeById('tab:close')
      return
    }
    // Cmd/Ctrl+1-9 — switch tab
    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault()
      commandRegistry.executeById('tab:switch', [e.key])
      return
    }
    // Shift+Cmd/Ctrl+[ — previous tab
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '[') {
      e.preventDefault()
      commandRegistry.executeById('tab:prev')
      return
    }
    // Shift+Cmd/Ctrl+] — next tab
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ']') {
      e.preventDefault()
      commandRegistry.executeById('tab:next')
      return
    }
    // Ctrl+Tab — smart tab switching based on state
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault()
      commandRegistry.executeById('tab:smart-switch')
      return
    }

    // Escape clears selection
    if (e.key === 'Escape') {
      const tab = tabManager.activeTab
      if (tab) {
        tab.splitPane.clearSelection()
      }
    }

    // Shift+PageUp - scroll up in scrollback buffer
    if (e.shiftKey && e.key === 'PageUp') {
      e.preventDefault()
      commandRegistry.executeById('scroll:up')
      return
    }

    // Shift+PageDown - scroll down in scrollback buffer
    if (e.shiftKey && e.key === 'PageDown') {
      e.preventDefault()
      commandRegistry.executeById('scroll:down')
      return
    }

    // Cmd/Ctrl+Home - scroll to top
    if ((e.metaKey || e.ctrlKey) && e.key === 'Home') {
      e.preventDefault()
      commandRegistry.executeById('scroll:top')
      return
    }

    // Cmd/Ctrl+End - scroll to bottom
    if ((e.metaKey || e.ctrlKey) && e.key === 'End') {
      e.preventDefault()
      commandRegistry.executeById('scroll:bottom')
      return
    }

    // Ctrl+Shift+ArrowUp - jump to previous prompt
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault()
      commandRegistry.executeById('scroll:prev-prompt')
      return
    }

    // Ctrl+Shift+ArrowDown - jump to next prompt
    if (e.ctrlKey && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault()
      commandRegistry.executeById('scroll:next-prompt')
      return
    }

    // Forward to active terminal's input handler
    tabManager.handleKeyDown(e)
  })

  // Handle Edit menu Copy/Paste (forwarded from main process via preload)
  window.addEventListener('menu-copy', () => {
    const tab = tabManager.activeTab
    if (tab?.splitPane.hasSelection()) {
      tab.splitPane.copySelection()
    }
  })
  window.addEventListener('menu-paste', () => {
    const tab = tabManager.activeTab
    if (tab) {
      tab.splitPane.paste()
    }
  })

  // Handle View menu "Show/Hide Productivity Bar"
  window.addEventListener('toggle-productivity-bar', () => {
    commandRegistry.executeById('productivity:toggle')
  })
  window.addEventListener('toggle-git-view', () => {
    commandRegistry.executeById('git:toggle')
  })

  // Listen for tab state changes to refresh tab bar
  window.addEventListener('tab-state-change', () => {
    tabBar.refresh()
  })


  // Resize handling - use rAF to ensure PixiJS has updated app.screen first
  let resizePending = false
  const onResize = () => {
    if (resizePending) return
    resizePending = true
    requestAnimationFrame(() => {
      resizePending = false
      tabManager.handleResize()
      tabBar.refresh()
      matrixRain.handleResize()
      snowfall.handleResize(window.innerWidth, window.innerHeight)
      bubbleRise.handleResize(window.innerWidth, window.innerHeight)
      crazyEffects.handleResize()
      dashboard.handleResize()
      historyView.handleResize(window.innerWidth, window.innerHeight - TOTAL_HEADER_HEIGHT, TOTAL_HEADER_HEIGHT)
      gitView.handleResize(window.innerWidth, window.innerHeight, TOTAL_HEADER_HEIGHT)
      productivityBar.handleResize(window.innerWidth, window.innerHeight)
    })
  }
  window.addEventListener('resize', onResize)

  // Ticker for animations
  app.ticker.add((ticker) => {
    if (appConfig.effects.crt) crtFilter.update(ticker.deltaTime)
    if (appConfig.effects.matrixRain) matrixRain.update(ticker.deltaTime)
    crazyEffects.update(ticker.deltaTime)
    snowfall.update(ticker.deltaTime)
    bubbleRise.update(ticker.deltaTime)
    tabManager.update(ticker.deltaTime)
    tabManager.deathAnimation.update(ticker.deltaTime)
    dashboard.update()
    gitView.update(ticker.deltaTime)
    tabBar.updateCommandCursor(ticker.deltaTime)
    tabBar.updateAutoSwitchPulse(ticker.deltaTime)
    productivityBar.update(ticker.deltaTime)
  })

  // Theme change handler — refreshes all UI on any theme change
  themeManager.onChange(() => {
    rebuildPalette()
    app.renderer.background.color = themeManager.theme.background
    tabBar.refresh()
    dashboard.handleResize()
    productivityBar.refreshTheme()
    // Notify main process so menu checkmark stays in sync
    window.ptyAPI.notifyThemeChanged(themeManager.themeId)
  })

  // Command palette set-theme event
  window.addEventListener('set-theme', ((e: CustomEvent) => {
    themeManager.setTheme(e.detail)
  }) as EventListener)

  // Mouse wheel for history view scrolling
  window.addEventListener('wheel', (e: WheelEvent) => {
    if (historyView.visible) {
      historyView.handleWheel(e.deltaY)
    }
  })

  // Create first tab
  tabManager.createTab()
  tabBar.refresh()

  // Check for replay content from CLI --replay/-f flag
  try {
    const replayContent = await window.ptyAPI.getReplayContent()
    if (replayContent) {
      const replayEngine = new ReplayEngine(
        (sessionId, data) => window.ptyAPI.write(sessionId, data),
        () => {
          const tab = tabManager.activeTab
          if (!tab) return null
          const pane = tab.splitPane.focusedPane
          return pane ? pane.engine.id : null
        },
        async (sessionId) => {
          const result = await window.ptyAPI.hasChildren(sessionId)
          return result?.hasChildren ?? false
        }
      )
      // Delay slightly to let first tab initialize
      setTimeout(() => {
        replayEngine.replay(replayContent).then(() => {
          console.log('[ReplayEngine] Replay complete')
        }).catch((err) => {
          console.error('[ReplayEngine] Replay failed:', err)
        })
      }, 500)
    }
  } catch {
    // No replay content or API not available
  }

  console.log('TermLife renderer initialized')
}

main().catch(console.error)
