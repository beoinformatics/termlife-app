import { ipcMain, BrowserWindow } from 'electron'
import { GitManager } from './gitManager'
import { GitWatcher } from './gitWatcher'
import type { LogOptions, DiffOptions, GraphOptions } from './types'

const gitManager = new GitManager()
const watchers = new Map<string, GitWatcher>()

export function registerGitIpc(): void {
  ipcMain.handle('git-status', (_event, cwd: string) =>
    gitManager.status(cwd))

  ipcMain.handle('git-log', (_event, cwd: string, options?: LogOptions) =>
    gitManager.log(cwd, options))

  ipcMain.handle('git-diff', (_event, cwd: string, options?: DiffOptions) =>
    gitManager.diff(cwd, options))

  ipcMain.handle('git-branches', (_event, cwd: string) =>
    gitManager.branches(cwd))

  ipcMain.handle('git-stash-list', (_event, cwd: string) =>
    gitManager.stashList(cwd))

  ipcMain.handle('git-stage', (_event, cwd: string, paths: string[]) =>
    gitManager.stage(cwd, paths))

  ipcMain.handle('git-unstage', (_event, cwd: string, paths: string[]) =>
    gitManager.unstage(cwd, paths))

  ipcMain.handle('git-commit', (_event, cwd: string, message: string) =>
    gitManager.commit(cwd, message))

  ipcMain.handle('git-push', (_event, cwd: string) =>
    gitManager.push(cwd))

  ipcMain.handle('git-restore', (_event, cwd: string, paths: string[]) =>
    gitManager.restore(cwd, paths))

  ipcMain.handle('git-graph', (_event, cwd: string, options?: GraphOptions) =>
    gitManager.graph(cwd, options))

  ipcMain.handle('git-blame', (_event, cwd: string, file: string, options?: { rev?: string }) =>
    gitManager.blame(cwd, file, options))

  ipcMain.handle('git-watch-start', (event, cwd: string) => {
    const key = cwd
    if (watchers.has(key)) return

    const watcher = new GitWatcher(cwd)
    watcher.on('changed', () => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('git-state-changed', cwd)
      }
    })
    watcher.start()
    watchers.set(key, watcher)
  })

  ipcMain.handle('git-watch-stop', (_event, cwd: string) => {
    const watcher = watchers.get(cwd)
    if (watcher) {
      watcher.destroy()
      watchers.delete(cwd)
    }
  })
}
