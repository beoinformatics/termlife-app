import { app, BrowserWindow, ipcMain, Menu, shell, nativeImage, dialog } from 'electron'
import { join } from 'path'
import { readdir, stat, readFile } from 'fs/promises'
import { PtyManager } from './ptyManager'
import { ConfigStore } from './configStore'
import { registerGitIpc } from './git/gitIpc'
import { existsSync } from 'fs'

// Set app name (appears in menu bar on macOS)
app.name = 'TermLife'

// Set dock icon for macOS
if (process.platform === 'darwin') {
  const iconPaths = [
    join(__dirname, '../../resources/icon.png'),
    join(process.resourcesPath || '', 'icon.png'),
    join(app.getAppPath(), 'resources/icon.png'),
  ]
  for (const iconPath of iconPaths) {
    if (existsSync(iconPath)) {
      try {
        const icon = nativeImage.createFromPath(iconPath)
        if (!icon.isEmpty()) {
          app.dock?.setIcon?.(icon)
          break
        }
      } catch {
        // Try next path
      }
    }
  }
}

// Parse --cwd=<path> from CLI args (set by the termlife wrapper script)
const cwdArg = process.argv.find(a => a.startsWith('--cwd='))
if (cwdArg) {
  process.env.TERMLIFE_CWD = cwdArg.slice('--cwd='.length)
}

// Parse --low-gpu flag to simulate lower-end hardware
if (process.argv.includes('--low-gpu')) {
  process.env.TERMLIFE_LOW_GPU = '1'
}

// Parse --replay=<path> or -f <path> from CLI args
let replayContent: string | null = null
const replayArg = process.argv.find(a => a.startsWith('--replay='))
const fArgIdx = process.argv.indexOf('-f')
const replayPath = replayArg
  ? replayArg.slice('--replay='.length)
  : (fArgIdx !== -1 && process.argv[fArgIdx + 1])
    ? process.argv[fArgIdx + 1]
    : null

if (replayPath) {
  readFile(replayPath, 'utf-8').then(content => {
    replayContent = content
  }).catch(err => {
    console.error(`Failed to read replay file: ${replayPath}`, err)
  })
}

let mainWindow: BrowserWindow | null = null
const ptyManager = new PtyManager()
const configStore = new ConfigStore()

function createWindow() {
  // Determine icon path based on platform
  let iconPath: string | undefined
  if (process.platform !== 'darwin') {
    const possiblePaths = [
      join(__dirname, '../../resources/icon.png'),
      join(__dirname, '../renderer/icon.png'),
      join(process.resourcesPath || '', 'icon.png'),
    ]
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        iconPath = path
        break
      }
    }
  }

  mainWindow = new BrowserWindow({
    width: 768,
    height: 512,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for node-pty preload
    },
    titleBarStyle: 'default',
    backgroundColor: '#1e1e1e',
    show: false,
    icon: iconPath,
  })

  // electron-vite handles dev vs prod URL
  if (process.env.NODE_ENV === 'development' || process.env['ELECTRON_RENDERER_URL']) {
    const url = process.env['ELECTRON_RENDERER_URL'] || 'http://localhost:5173'
    mainWindow.loadURL(url)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    ptyManager.killAll()
    mainWindow = null
  })
}

let currentThemeId = 'retro-green'

function setThemeFromMenu(id: string): void {
  currentThemeId = id
  mainWindow?.webContents.send('set-theme', id)
  createApplicationMenu()
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            createWindow()
          }
        },
        { type: 'separator' },
        { role: 'close', label: 'Close Window' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          registerAccelerator: false,
          click: (_menuItem, browserWindow) => {
            browserWindow?.webContents.send('menu-copy')
          }
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          registerAccelerator: false,
          click: (_menuItem, browserWindow) => {
            browserWindow?.webContents.send('menu-paste')
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        {
          label: 'Themes',
          submenu: [
            {
              label: 'Dark',
              submenu: [
                { label: 'Retro Green', type: 'radio', checked: currentThemeId === 'retro-green', click: () => setThemeFromMenu('retro-green') },
                { label: 'Pure Black', type: 'radio', checked: currentThemeId === 'pure-black', click: () => setThemeFromMenu('pure-black') },
                { label: 'Dark+ (Default)', type: 'radio', checked: currentThemeId === 'dark-plus', click: () => setThemeFromMenu('dark-plus') },
                { label: 'Nord Aurora', type: 'radio', checked: currentThemeId === 'nord-aurora', click: () => setThemeFromMenu('nord-aurora') },
                { label: 'Amber CRT', type: 'radio', checked: currentThemeId === 'amber-crt', click: () => setThemeFromMenu('amber-crt') },
                { label: 'Dracula', type: 'radio', checked: currentThemeId === 'dracula', click: () => setThemeFromMenu('dracula') },
                { label: 'Cyberpunk Neon', type: 'radio', checked: currentThemeId === 'cyberpunk', click: () => setThemeFromMenu('cyberpunk') },
                { label: 'Synthwave', type: 'radio', checked: currentThemeId === 'synthwave', click: () => setThemeFromMenu('synthwave') },
                { label: 'Ocean Depths', type: 'radio', checked: currentThemeId === 'ocean-depths', click: () => setThemeFromMenu('ocean-depths') },
                { label: 'Midnight Purple', type: 'radio', checked: currentThemeId === 'midnight-purple', click: () => setThemeFromMenu('midnight-purple') },
                { label: 'Gold & Royal', type: 'radio', checked: currentThemeId === 'gold-royal', click: () => setThemeFromMenu('gold-royal') },
                { label: 'Gym Bro', type: 'radio', checked: currentThemeId === 'planet-fitness', click: () => setThemeFromMenu('planet-fitness') },
                { label: 'Magenta Carrier', type: 'radio', checked: currentThemeId === 't-mobile', click: () => setThemeFromMenu('t-mobile') },
                { label: 'Minion', type: 'radio', checked: currentThemeId === 'despicable-me', click: () => setThemeFromMenu('despicable-me') },
                { label: 'Tractor Green', type: 'radio', checked: currentThemeId === 'john-deere', click: () => setThemeFromMenu('john-deere') },
                { label: 'Brown Package', type: 'radio', checked: currentThemeId === 'ups', click: () => setThemeFromMenu('ups') },
              ]
            },
            {
              label: 'Blue',
              submenu: [
                { label: 'Flat Pack', type: 'radio', checked: currentThemeId === 'ikea', click: () => setThemeFromMenu('ikea') },
              ]
            },
            {
              label: 'Yellow',
              submenu: [
                { label: 'Hot Dog Stand', type: 'radio', checked: currentThemeId === 'hot-dog', click: () => setThemeFromMenu('hot-dog') },
              ]
            },
            {
              label: 'Light',
              submenu: [
                { label: 'Sakura', type: 'radio', checked: currentThemeId === 'sakura', click: () => setThemeFromMenu('sakura') },
                { label: 'Light+', type: 'radio', checked: currentThemeId === 'light-plus', click: () => setThemeFromMenu('light-plus') },
                { label: 'Tundra Lichen', type: 'radio', checked: currentThemeId === 'cyan-terminal', click: () => setThemeFromMenu('cyan-terminal') },
                { label: 'Vaporwave', type: 'radio', checked: currentThemeId === 'vaporwave', click: () => setThemeFromMenu('vaporwave') },
                { label: 'Pastel Auteur', type: 'radio', checked: currentThemeId === 'wes-anderson', click: () => setThemeFromMenu('wes-anderson') },
                { label: 'Ice Palace', type: 'radio', checked: currentThemeId === 'frozen', click: () => setThemeFromMenu('frozen') },
                { label: 'Bubblegum', type: 'radio', checked: currentThemeId === 'barbie', click: () => setThemeFromMenu('barbie') },
              ]
            },
          ]
        },
        { type: 'separator' },
        {
          label: 'Show/Hide Productivity Bar',
          accelerator: 'CmdOrCtrl+Shift+B',
          registerAccelerator: false,
          click: (_menuItem, browserWindow) => {
            browserWindow?.webContents.send('toggle-productivity-bar')
          }
        },
        {
          label: 'Git View',
          accelerator: 'CmdOrCtrl+Shift+G',
          registerAccelerator: false,
          click: (_menuItem, browserWindow) => {
            browserWindow?.webContents.send('toggle-git-view')
          }
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]

  // macOS specific adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: `About ${app.getName()}`,
              message: app.getName(),
              detail: `Version 0.3.0\n\nGPU-accelerated terminal with PixiJS rendering`,
              buttons: ['OK']
            })
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createWindow()
  createApplicationMenu()

  // Theme change notification from renderer (e.g. keyboard cycling)
  ipcMain.on('theme-changed', (_event, themeId: string) => {
    currentThemeId = themeId
    createApplicationMenu()
  })

  // Git IPC handlers
  registerGitIpc()

  // PTY IPC handlers
  ipcMain.handle('pty-create', async (_event, { id, shell, cwd }: { id: string; shell?: string; cwd?: string }) => {
    return ptyManager.create(id, shell, cwd, (ptyId, data, hasChildren) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-data', { id: ptyId, data, hasChildren })
      }
    }, (ptyId, exitCode) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('pty-exit', { id: ptyId, exitCode })
      }
    })
  })

  ipcMain.handle('pty-write', async (_event, { id, data }: { id: string; data: string }) => {
    return ptyManager.write(id, data)
  })

  ipcMain.handle('pty-resize', async (_event, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    return ptyManager.resize(id, cols, rows)
  })

  ipcMain.handle('pty-kill', async (_event, { id }: { id: string }) => {
    return ptyManager.kill(id)
  })

  ipcMain.handle('pty-has-children', async (_event, { id }: { id: string }) => {
    return ptyManager.hasChildProcess(id)
  })

  // File system handlers for file browser
  ipcMain.handle('fs:readdir', async (_event, dirPath: string) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(dirPath, entry.name)
          let size = 0
          let modified = new Date()
          try {
            const stats = await stat(fullPath)
            size = stats.size
            modified = stats.mtime
          } catch {
            // Some files may not be accessible
          }
          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size,
            modified,
            isHidden: entry.name.startsWith('.'),
          }
        })
      )
      return files
    } catch (err) {
      console.error('fs:readdir error:', err)
      throw err
    }
  })

  ipcMain.handle('get-replay-content', async () => {
    return replayContent
  })

  // App config IPC handlers
  configStore.load().catch(err => console.warn('Failed to load config:', err))

  ipcMain.handle('config:get', async () => {
    return configStore.config
  })

  ipcMain.handle('config:update', async (_event, partial: Record<string, unknown>) => {
    const updated = await configStore.update(partial)
    // Notify renderer of the change (for multi-window sync)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('config:changed', updated)
      }
    }
    return updated
  })

  console.log('TermLife main process ready')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
