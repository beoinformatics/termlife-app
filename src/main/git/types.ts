// Git View — Shared type definitions

export type FileState =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'conflicted'

export interface GitFileStatus {
  path: string
  index: FileState
  workingTree: FileState
  renamed?: string
}

export interface GitStatus {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
  merging: boolean
  rebasing: boolean
  files: GitFileStatus[]
}

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: string
  message: string
  body: string
  refs: string[]
  parents: string[]
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  header: string
  lines: DiffLine[]
}

export interface GitDiff {
  path: string
  oldPath?: string
  status: FileState
  hunks: DiffHunk[]
  stats: { additions: number; deletions: number }
}

export interface DiffOptions {
  staged?: boolean
  file?: string
  commit?: string
}

export interface LogOptions {
  maxCount?: number
  branch?: string
  all?: boolean
}

export interface BranchInfo {
  name: string
  hash: string
  upstream?: string
  ahead: number
  behind: number
  lastCommitDate: string
}

export interface GitBranches {
  current: string
  local: BranchInfo[]
  remote: BranchInfo[]
}

export interface StashEntry {
  index: number
  message: string
  date: string
  branch: string
}

export interface GraphCommit {
  hash: string
  shortHash: string
  parents: string[]
  author: string
  date: string
  message: string
  column: number
  refs: string[]
}

export interface GraphBranch {
  name: string
  head: string
  column: number
  color: number
  isCurrent: boolean
}

export interface GraphData {
  commits: GraphCommit[]
  branches: GraphBranch[]
}

export interface GraphOptions {
  maxCount?: number
  all?: boolean
}
