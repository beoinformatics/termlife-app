import { execFile } from 'child_process'
import type {
  GitStatus,
  GitCommit,
  GitDiff,
  GitBranches,
  StashEntry,
  GraphCommit,
  LogOptions,
  DiffOptions,
  GraphOptions,
} from './types'
import { parseStatus, parseLog, parseDiff, parseBranches, parseStashList, parseGraph } from './gitParser'
import { parseBlame, BlameEntry } from './blameParser'
import {
  statusArgs,
  logArgs,
  diffArgs,
  branchLocalArgs,
  branchRemoteArgs,
  stashListArgs,
  stageArgs,
  unstageArgs,
  commitArgs,
  pushArgs,
  restoreArgs,
  graphArgs,
  blameArgs,
} from './gitCommands'

const TIMEOUT = 10_000

function execGit(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: TIMEOUT, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const message = stderr?.trim() || err.message
        reject(new Error(message))
        return
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '' })
    })
  })
}

export class GitManager {
  async status(cwd: string): Promise<GitStatus> {
    const { stdout } = await execGit(statusArgs(), cwd)
    return parseStatus(stdout)
  }

  async log(cwd: string, options?: LogOptions): Promise<GitCommit[]> {
    const { stdout } = await execGit(logArgs(options), cwd)
    return parseLog(stdout)
  }

  async diff(cwd: string, options?: DiffOptions): Promise<GitDiff[]> {
    const { stdout } = await execGit(diffArgs(options), cwd)
    return parseDiff(stdout)
  }

  async branches(cwd: string): Promise<GitBranches> {
    const [local, remote] = await Promise.all([
      execGit(branchLocalArgs(), cwd),
      execGit(branchRemoteArgs(), cwd),
    ])
    return parseBranches(local.stdout, remote.stdout)
  }

  async stashList(cwd: string): Promise<StashEntry[]> {
    const { stdout } = await execGit(stashListArgs(), cwd)
    return parseStashList(stdout)
  }

  async stage(cwd: string, paths: string[]): Promise<void> {
    await execGit(stageArgs(paths), cwd)
  }

  async unstage(cwd: string, paths: string[]): Promise<void> {
    await execGit(unstageArgs(paths), cwd)
  }

  async commit(cwd: string, message: string): Promise<string> {
    const { stdout } = await execGit(commitArgs(message), cwd)
    // Extract short hash from output like "[main abc1234] message"
    const match = stdout.match(/\[.+?\s+([a-f0-9]+)\]/)
    return match?.[1] ?? ''
  }

  async push(cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = execFile('git', pushArgs(), { cwd, timeout: 60_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        // git push writes progress to stderr even on success
        if (err) {
          // Check if it's a real failure (non-zero exit) vs just stderr output
          const exitCode = (err as any).code
          if (typeof exitCode === 'number' && exitCode !== 0) {
            reject(new Error(stderr?.trim() || err.message))
            return
          }
          // String error codes (e.g. 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') are real errors
          if (typeof exitCode === 'string') {
            reject(new Error(err.message))
            return
          }
        }
        resolve(stdout || stderr || 'Push complete')
      })
      // Ensure process is not null
      void proc
    })
  }

  async restore(cwd: string, paths: string[]): Promise<void> {
    await execGit(restoreArgs(paths), cwd)
  }

  async graph(cwd: string, options?: GraphOptions): Promise<GraphCommit[]> {
    const { stdout } = await execGit(graphArgs(options), cwd)
    return parseGraph(stdout)
  }

  async blame(cwd: string, file: string, options?: { rev?: string }): Promise<BlameEntry[]> {
    const { stdout } = await execGit(blameArgs(file, options), cwd)
    return parseBlame(stdout)
  }
}
