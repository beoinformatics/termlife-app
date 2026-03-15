import type { LogOptions, DiffOptions, GraphOptions } from './types'

// Field separator for structured output parsing
const SEP = '%x00'
const RECORD_SEP = '%x01'

// git log format: hash, shortHash, author, email, date, message, body, refs, parents
const LOG_FORMAT = `--format=${[
  '%H', '%h', '%an', '%ae', '%aI', '%s', '%b', '%D', '%P',
].join(SEP)}${RECORD_SEP}`

// git branch format: current marker, name, hash, upstream, ahead, behind, date
const BRANCH_LOCAL_FORMAT = `--format=%(if)%(HEAD)%(then)*%(else)%(end)${SEP}%(refname:short)${SEP}%(objectname:short)${SEP}%(upstream:short)${SEP}%(upstream:track,nobracket)${SEP}%(creatordate:short)`

// git branch -r format: name, hash, date
const BRANCH_REMOTE_FORMAT = `--format=%(refname:short)${SEP}%(objectname:short)${SEP}%(creatordate:short)`

// git stash list format: index, message, date, branch
const STASH_FORMAT = `--format=%gd${SEP}%gs${SEP}%aI${SEP}%gD`

export function statusArgs(): string[] {
  return ['status', '--porcelain=v2', '--branch']
}

export function logArgs(options?: LogOptions): string[] {
  const args = ['log', LOG_FORMAT, '-n', String(options?.maxCount ?? 50)]
  if (options?.all) args.push('--all')
  if (options?.branch) args.push(options.branch)
  return args
}

export function diffArgs(options?: DiffOptions): string[] {
  const args = ['diff']
  if (options?.staged) args.push('--cached')
  if (options?.commit) args.push(options.commit)
  if (options?.file) {
    args.push('--', options.file)
  }
  return args
}

export function branchLocalArgs(): string[] {
  return ['branch', BRANCH_LOCAL_FORMAT]
}

export function branchRemoteArgs(): string[] {
  return ['branch', '-r', BRANCH_REMOTE_FORMAT]
}

export function stashListArgs(): string[] {
  return ['stash', 'list', STASH_FORMAT]
}

export function stageArgs(paths: string[]): string[] {
  return ['add', '--', ...paths]
}

export function unstageArgs(paths: string[]): string[] {
  return ['restore', '--staged', '--', ...paths]
}

export function commitArgs(message: string): string[] {
  return ['commit', '-m', message]
}

export function pushArgs(): string[] {
  return ['push']
}

export function restoreArgs(paths: string[]): string[] {
  return ['restore', '--', ...paths]
}

export function blameArgs(file: string, options?: { rev?: string }): string[] {
  const args = ['blame', '--porcelain']
  if (options?.rev) args.push(options.rev)
  args.push('--', file)
  return args
}

// Graph format: hash, shortHash, author, date, message, refs, parents (compact for graph)
const GRAPH_FORMAT = `--format=${[
  '%H', '%h', '%an', '%aI', '%s', '%D', '%P',
].join(SEP)}${RECORD_SEP}`

export function graphArgs(options?: GraphOptions): string[] {
  const args = ['log', GRAPH_FORMAT, '-n', String(options?.maxCount ?? 100)]
  if (options?.all !== false) args.push('--all')
  return args
}
