import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Store callbacks for each event type to support multiple tabs
// Use a Map to track which callbacks belong to which terminal
const dataCallbacks = new Map<string, (id: string, data: string, hasChildren: boolean) => void>()
const exitCallbacks = new Map<string, (id: string, exitCode: number) => void>()

// Set up single listeners that broadcast to all callbacks
let dataListenerSetup = false
let exitListenerSetup = false

function setupDataListener() {
  if (dataListenerSetup) return
  dataListenerSetup = true
  ipcRenderer.on('pty-data', (_event: IpcRendererEvent, { id, data, hasChildren }: { id: string; data: string; hasChildren: boolean }) => {
    dataCallbacks.forEach(cb => cb(id, data, hasChildren))
  })
}

function setupExitListener() {
  if (exitListenerSetup) return
  exitListenerSetup = true
  ipcRenderer.on('pty-exit', (_event: IpcRendererEvent, { id, exitCode }: { id: string; exitCode: number }) => {
    exitCallbacks.forEach(cb => cb(id, exitCode))
  })
}

contextBridge.exposeInMainWorld('ptyAPI', {
  create: (id: string, shell?: string, cwd?: string) =>
    ipcRenderer.invoke('pty-create', { id, shell, cwd }),

  write: (id: string, data: string) =>
    ipcRenderer.invoke('pty-write', { id, data }),

  resize: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke('pty-resize', { id, cols, rows }),

  kill: (id: string) =>
    ipcRenderer.invoke('pty-kill', { id }),

  hasChildren: (id: string) =>
    ipcRenderer.invoke('pty-has-children', { id }),

  onData: (id: string, callback: (id: string, data: string, hasChildren: boolean) => void) => {
    setupDataListener()
    dataCallbacks.set(id, callback)
  },

  offData: (id: string) => {
    dataCallbacks.delete(id)
  },

  onExit: (id: string, callback: (id: string, exitCode: number) => void) => {
    setupExitListener()
    exitCallbacks.set(id, callback)
  },

  offExit: (id: string) => {
    exitCallbacks.delete(id)
  },

  removeAllListeners: () => {
    dataCallbacks.clear()
    exitCallbacks.clear()
    ipcRenderer.removeAllListeners('pty-data')
    ipcRenderer.removeAllListeners('pty-exit')
    dataListenerSetup = false
    exitListenerSetup = false
  },

  // File system API
  fs: {
    readdir: (path: string) => ipcRenderer.invoke('fs:readdir', path),
  },

  getReplayContent: () => ipcRenderer.invoke('get-replay-content'),

  homedir: () => process.env.HOME || '/',

  lowGpu: () => process.env.TERMLIFE_LOW_GPU === '1',

  notifyThemeChanged: (themeId: string) => ipcRenderer.send('theme-changed', themeId),

  // App config API
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (partial: Record<string, unknown>) => ipcRenderer.invoke('config:update', partial),
  },
})

// Store git state-changed callbacks per cwd
const gitStateCallbacks = new Map<string, () => void>()
let gitStateListenerSetup = false

function setupGitStateListener() {
  if (gitStateListenerSetup) return
  gitStateListenerSetup = true
  ipcRenderer.on('git-state-changed', (_event: IpcRendererEvent, cwd: string) => {
    const cb = gitStateCallbacks.get(cwd)
    if (cb) cb()
  })
}

// Git API
contextBridge.exposeInMainWorld('gitAPI', {
  status: (cwd: string) => ipcRenderer.invoke('git-status', cwd),
  log: (cwd: string, options?: Record<string, unknown>) => ipcRenderer.invoke('git-log', cwd, options),
  diff: (cwd: string, options?: Record<string, unknown>) => ipcRenderer.invoke('git-diff', cwd, options),
  branches: (cwd: string) => ipcRenderer.invoke('git-branches', cwd),
  stashList: (cwd: string) => ipcRenderer.invoke('git-stash-list', cwd),
  stage: (cwd: string, paths: string[]) => ipcRenderer.invoke('git-stage', cwd, paths),
  unstage: (cwd: string, paths: string[]) => ipcRenderer.invoke('git-unstage', cwd, paths),
  commit: (cwd: string, message: string) => ipcRenderer.invoke('git-commit', cwd, message),
  push: (cwd: string) => ipcRenderer.invoke('git-push', cwd),
  restore: (cwd: string, paths: string[]) => ipcRenderer.invoke('git-restore', cwd, paths),
  graph: (cwd: string, options?: Record<string, unknown>) => ipcRenderer.invoke('git-graph', cwd, options),
  blame: (cwd: string, file: string, options?: Record<string, unknown>) =>
    ipcRenderer.invoke('git-blame', cwd, file, options),
  onStateChanged: (cwd: string, callback: () => void) => {
    setupGitStateListener()
    gitStateCallbacks.set(cwd, callback)
    ipcRenderer.invoke('git-watch-start', cwd)
  },
  offStateChanged: (cwd: string) => {
    gitStateCallbacks.delete(cwd)
    ipcRenderer.invoke('git-watch-stop', cwd)
  },
})

// Forward menu copy/paste events to renderer as DOM custom events
ipcRenderer.on('menu-copy', () => {
  window.dispatchEvent(new CustomEvent('menu-copy'))
})
ipcRenderer.on('menu-paste', () => {
  window.dispatchEvent(new CustomEvent('menu-paste'))
})
ipcRenderer.on('set-theme', (_event: IpcRendererEvent, themeId: string) => {
  window.dispatchEvent(new CustomEvent('set-theme', { detail: themeId }))
})
ipcRenderer.on('toggle-productivity-bar', () => {
  window.dispatchEvent(new CustomEvent('toggle-productivity-bar'))
})
ipcRenderer.on('toggle-git-view', () => {
  window.dispatchEvent(new CustomEvent('toggle-git-view'))
})
ipcRenderer.on('config:changed', (_event: IpcRendererEvent, config: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent('config:changed', { detail: config }))
})

console.log('TermLife preload loaded')
