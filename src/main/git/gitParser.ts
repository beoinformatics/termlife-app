import type {
  GitStatus,
  GitFileStatus,
  FileState,
  GitCommit,
  GitDiff,
  DiffHunk,
  DiffLine,
  GitBranches,
  BranchInfo,
  StashEntry,
  GraphCommit,
} from './types'

// --- Status parsing (git status --porcelain=v2 --branch) ---

function parseFileStateChar(ch: string): FileState {
  switch (ch) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case '.': return 'unmodified'
    default:  return 'unmodified'
  }
}

export function parseStatus(output: string): GitStatus {
  const lines = output.split('\n').filter(l => l.length > 0)
  const result: GitStatus = {
    branch: '',
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    merging: false,
    rebasing: false,
    files: [],
  }

  for (const line of lines) {
    if (line.startsWith('# branch.head ')) {
      result.branch = line.slice('# branch.head '.length)
      if (result.branch === '(detached)') {
        result.detached = true
      }
    } else if (line.startsWith('# branch.upstream ')) {
      result.upstream = line.slice('# branch.upstream '.length)
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/)
      if (match) {
        result.ahead = parseInt(match[1], 10)
        result.behind = parseInt(match[2], 10)
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      const file = parseTrackedEntry(line)
      if (file) result.files.push(file)
    } else if (line.startsWith('? ')) {
      result.files.push({
        path: line.slice(2),
        index: 'untracked',
        workingTree: 'untracked',
      })
    } else if (line.startsWith('u ')) {
      const file = parseUnmergedEntry(line)
      if (file) result.files.push(file)
    }
  }

  return result
}

function parseTrackedEntry(line: string): GitFileStatus | null {
  // Type 1: "1 XY sub mH mI mW hH hI path"
  // Type 2: "2 XY sub mH mI mW hH hI Xscore path\torigPath"
  const isRenamed = line.startsWith('2 ')
  const parts = line.split(' ')
  if (parts.length < 9) return null

  const xy = parts[1]
  const indexState = parseFileStateChar(xy[0])
  const workingTreeState = parseFileStateChar(xy[1])

  if (isRenamed) {
    // For type 2, the rest after field 8 is "Xscore path\torigPath"
    const rest = parts.slice(8).join(' ')
    // Skip the Xscore (e.g., R100), then split on tab
    const scoreEnd = rest.indexOf(' ')
    const pathPart = rest.slice(scoreEnd + 1)
    const [newPath, oldPath] = pathPart.split('\t')
    return {
      path: newPath,
      index: indexState === 'unmodified' ? 'renamed' : indexState,
      workingTree: workingTreeState,
      renamed: oldPath,
    }
  }

  const path = parts.slice(8).join(' ')
  return {
    path,
    index: indexState,
    workingTree: workingTreeState,
  }
}

function parseUnmergedEntry(line: string): GitFileStatus | null {
  // "u XY sub m1 m2 m3 mW h1 h2 h3 path"
  const parts = line.split(' ')
  if (parts.length < 11) return null
  const path = parts.slice(10).join(' ')
  return {
    path,
    index: 'conflicted',
    workingTree: 'conflicted',
  }
}

// --- Log parsing ---

const LOG_FIELD_SEP = '\x00'
const LOG_RECORD_SEP = '\x01'

export function parseLog(output: string): GitCommit[] {
  if (!output.trim()) return []

  const records = output.split(LOG_RECORD_SEP)
  const commits: GitCommit[] = []

  for (const record of records) {
    const trimmed = record.trim()
    if (!trimmed) continue

    const fields = trimmed.split(LOG_FIELD_SEP)
    if (fields.length < 9) continue

    commits.push({
      hash: fields[0],
      shortHash: fields[1],
      author: fields[2],
      authorEmail: fields[3],
      date: fields[4],
      message: fields[5],
      body: fields[6],
      refs: fields[7] ? fields[7].split(', ').map(r => r.trim()).filter(Boolean) : [],
      parents: fields[8] ? fields[8].split(' ').filter(Boolean) : [],
    })
  }

  return commits
}

// --- Diff parsing (unified diff format) ---

export function parseDiff(output: string): GitDiff[] {
  if (!output.trim()) return []

  const diffs: GitDiff[] = []
  const fileSections = output.split(/^diff --git /m).filter(Boolean)

  for (const section of fileSections) {
    const lines = section.split('\n')
    const headerLine = lines[0] // "a/file b/file"

    let path = ''
    let oldPath: string | undefined
    let status: FileState = 'modified'

    // Extract path from "a/xxx b/yyy"
    const pathMatch = headerLine.match(/a\/(.+?) b\/(.+)/)
    if (pathMatch) {
      oldPath = pathMatch[1]
      path = pathMatch[2]
    }

    // Detect status from metadata lines
    let i = 1
    for (; i < lines.length; i++) {
      if (lines[i].startsWith('new file')) {
        status = 'added'
      } else if (lines[i].startsWith('deleted file')) {
        status = 'deleted'
      } else if (lines[i].startsWith('rename from')) {
        status = 'renamed'
        oldPath = lines[i].slice('rename from '.length)
      } else if (lines[i].startsWith('rename to')) {
        path = lines[i].slice('rename to '.length)
      } else if (lines[i].startsWith('Binary files')) {
        // Binary file, no hunks
        diffs.push({
          path,
          oldPath: status === 'renamed' ? oldPath : undefined,
          status,
          hunks: [],
          stats: { additions: 0, deletions: 0 },
        })
        break
      } else if (lines[i].startsWith('@@')) {
        break
      }
    }

    // If we hit a binary file, we already pushed it
    if (i < lines.length && lines[i].startsWith('Binary')) continue

    // Parse hunks
    const hunks: DiffHunk[] = []
    let totalAdditions = 0
    let totalDeletions = 0

    while (i < lines.length) {
      if (!lines[i].startsWith('@@')) {
        i++
        continue
      }

      const hunkHeader = lines[i]
      const hunkMatch = hunkHeader.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (!hunkMatch) {
        i++
        continue
      }

      const hunk: DiffHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldLines: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newLines: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        header: hunkHeader,
        lines: [],
      }

      let oldLine = hunk.oldStart
      let newLine = hunk.newStart
      i++

      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
        const raw = lines[i]
        if (raw.startsWith('\\ ')) {
          // Skip "\ No newline at end of file" markers
          i++
          continue
        }
        if (raw.startsWith('+')) {
          const dl: DiffLine = { type: 'addition', content: raw.slice(1), newLineNumber: newLine }
          hunk.lines.push(dl)
          newLine++
          totalAdditions++
        } else if (raw.startsWith('-')) {
          const dl: DiffLine = { type: 'deletion', content: raw.slice(1), oldLineNumber: oldLine }
          hunk.lines.push(dl)
          oldLine++
          totalDeletions++
        } else if (raw.startsWith(' ')) {
          const dl: DiffLine = { type: 'context', content: raw.slice(1), oldLineNumber: oldLine, newLineNumber: newLine }
          hunk.lines.push(dl)
          oldLine++
          newLine++
        }
        i++
      }

      hunks.push(hunk)
    }

    if (!diffs.some(d => d === undefined)) {
      diffs.push({
        path,
        oldPath: status === 'renamed' ? oldPath : undefined,
        status,
        hunks,
        stats: { additions: totalAdditions, deletions: totalDeletions },
      })
    }
  }

  return diffs
}

// --- Branch parsing ---

const BRANCH_SEP = '\x00'

export function parseBranches(localOutput: string, remoteOutput: string): GitBranches {
  const result: GitBranches = {
    current: '',
    local: [],
    remote: [],
  }

  if (localOutput.trim()) {
    const lines = localOutput.trim().split('\n')
    for (const line of lines) {
      const fields = line.split(BRANCH_SEP)
      if (fields.length < 6) continue

      const isCurrent = fields[0] === '*'
      const info: BranchInfo = {
        name: fields[1],
        hash: fields[2],
        upstream: fields[3] || undefined,
        ahead: parseInt(fields[4], 10) || 0,
        behind: parseInt(fields[5], 10) || 0,
        lastCommitDate: fields[6] || '',
      }

      if (isCurrent) result.current = info.name
      result.local.push(info)
    }
  }

  if (remoteOutput.trim()) {
    const lines = remoteOutput.trim().split('\n')
    for (const line of lines) {
      const fields = line.split(BRANCH_SEP)
      if (fields.length < 3) continue

      result.remote.push({
        name: fields[0],
        hash: fields[1],
        ahead: 0,
        behind: 0,
        lastCommitDate: fields[2] || '',
      })
    }
  }

  return result
}

// --- Graph parsing (git log for branch graph visualization) ---

const GRAPH_FIELD_SEP = '\x00'
const GRAPH_RECORD_SEP = '\x01'

export function parseGraph(output: string): GraphCommit[] {
  if (!output.trim()) return []

  const records = output.split(GRAPH_RECORD_SEP)
  const commits: GraphCommit[] = []

  for (const record of records) {
    const trimmed = record.trim()
    if (!trimmed) continue

    const fields = trimmed.split(GRAPH_FIELD_SEP)
    if (fields.length < 7) continue

    commits.push({
      hash: fields[0],
      shortHash: fields[1],
      author: fields[2],
      date: fields[3],
      message: fields[4],
      refs: fields[5] ? fields[5].split(', ').map(r => r.trim()).filter(Boolean) : [],
      parents: fields[6] ? fields[6].split(' ').filter(Boolean) : [],
      column: 0,
    })
  }

  return commits
}

// --- Stash parsing ---

export function parseStashList(output: string): StashEntry[] {
  if (!output.trim()) return []

  const lines = output.trim().split('\n')
  const entries: StashEntry[] = []

  for (const line of lines) {
    const fields = line.split('\x00')
    if (fields.length < 4) continue

    entries.push({
      index: parseInt(fields[0], 10),
      message: fields[1],
      date: fields[2],
      branch: fields[3],
    })
  }

  return entries
}
