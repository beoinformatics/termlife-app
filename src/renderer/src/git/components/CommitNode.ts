import { Container, Graphics, Text } from 'pixi.js'
import type { GraphCommit } from '../../../../main/git/types'

/**
 * Deterministic color from author string (hash-based).
 */
export function commitNodeColor(author: string): number {
  let hash = 0
  for (let i = 0; i < author.length; i++) {
    hash = ((hash << 5) - hash + author.charCodeAt(i)) | 0
  }
  // Generate a bright-ish color by keeping channels in 80-220 range
  const r = 80 + Math.abs(hash % 140)
  const g = 80 + Math.abs((hash >> 8) % 140)
  const b = 80 + Math.abs((hash >> 16) % 140)
  return (r << 16) | (g << 8) | b
}

/**
 * Node size: 8px standard, 12px if commit has refs (branch/tag).
 */
export function commitNodeSize(refs: string[]): number {
  return refs.length > 0 ? 12 : 8
}

/**
 * Format an ISO date string as a friendly relative time.
 */
export function friendlyTime(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  const now = Date.now()
  const diffMs = now - then
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (weeks < 5) return `${weeks}w ago`
  return `${months}mo ago`
}

export class CommitNode extends Container {
  readonly commit: GraphCommit
  private dot: Graphics
  private label: Text
  private timeLabel: Text

  constructor(commit: GraphCommit) {
    super()
    this.commit = commit
    this.eventMode = 'static'
    this.cursor = 'pointer'

    const color = commitNodeColor(commit.author)
    const size = commitNodeSize(commit.refs)

    this.dot = new Graphics()
    this.dot.circle(0, 0, size / 2)
    this.dot.fill(color)
    this.addChild(this.dot)

    // Show message only (no hash) — beginners don't need commit hashes
    const labelText = commit.message.slice(0, 48)
    this.label = new Text({
      text: labelText,
      style: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fill: 0xcccccc },
    })
    this.label.x = size / 2 + 6
    this.label.y = -12
    this.addChild(this.label)

    // Friendly relative time + author
    this.timeLabel = new Text({
      text: `${friendlyTime(commit.date)} by ${commit.author}`,
      style: { fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fill: 0x777777 },
    })
    this.timeLabel.x = size / 2 + 6
    this.timeLabel.y = 2
    this.addChild(this.timeLabel)
  }
}
