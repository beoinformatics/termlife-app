export interface BlameEntry {
  lineNumber: number
  hash: string
  author: string
  authorEmail: string
  timestamp: number
  summary: string
  content: string
}

/**
 * Parse `git blame --porcelain` output into structured entries.
 *
 * Porcelain format:
 *   <hash> <orig-line> <final-line> [<num-lines>]
 *   author <name>
 *   author-mail <email>
 *   author-time <timestamp>
 *   ...
 *   summary <text>
 *   filename <path>
 *   \t<content>
 *
 * Subsequent lines from the same commit block omit the header fields.
 */
export function parseBlame(output: string): BlameEntry[] {
  if (!output.trim()) return []

  const lines = output.split('\n')
  const entries: BlameEntry[] = []

  // Track current commit metadata
  const commitMeta = new Map<string, {
    author: string
    authorEmail: string
    timestamp: number
    summary: string
  }>()

  let currentHash = ''
  let currentLine = 0
  let meta: { author: string; authorEmail: string; timestamp: number; summary: string } = {
    author: '',
    authorEmail: '',
    timestamp: 0,
    summary: '',
  }
  let isNewCommit = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Commit header line: "<hash> <orig-line> <final-line> [<num-lines>]"
    const headerMatch = line.match(/^([a-f0-9]{40})\s+(\d+)\s+(\d+)/)
    if (headerMatch) {
      currentHash = headerMatch[1]
      currentLine = parseInt(headerMatch[3], 10)

      if (commitMeta.has(currentHash)) {
        // Reuse existing metadata
        meta = { ...commitMeta.get(currentHash)! }
        isNewCommit = false
      } else {
        // New commit — metadata follows
        meta = { author: '', authorEmail: '', timestamp: 0, summary: '' }
        isNewCommit = true
      }
      continue
    }

    if (line.startsWith('author ')) {
      meta.author = line.slice('author '.length)
    } else if (line.startsWith('author-mail ')) {
      // Strip angle brackets
      meta.authorEmail = line.slice('author-mail '.length).replace(/[<>]/g, '')
    } else if (line.startsWith('author-time ')) {
      meta.timestamp = parseInt(line.slice('author-time '.length), 10)
    } else if (line.startsWith('summary ')) {
      meta.summary = line.slice('summary '.length)
    } else if (line.startsWith('filename ')) {
      // End of header block — store metadata
      if (isNewCommit) {
        commitMeta.set(currentHash, { ...meta })
      }
    } else if (line.startsWith('\t')) {
      // Content line
      entries.push({
        lineNumber: currentLine,
        hash: currentHash,
        author: meta.author,
        authorEmail: meta.authorEmail,
        timestamp: meta.timestamp,
        summary: meta.summary,
        content: line.slice(1), // Remove leading tab
      })
    }
  }

  return entries
}

/**
 * Count unique commits within a line range — a measure of code churn.
 */
export function computeChurn(entries: BlameEntry[], startLine: number, endLine: number): number {
  const hashes = new Set<string>()
  for (const entry of entries) {
    if (entry.lineNumber >= startLine && entry.lineNumber <= endLine) {
      hashes.add(entry.hash)
    }
  }
  return hashes.size
}
