import { describe, it, expect } from 'vitest'
import { parseBlame, BlameEntry, computeChurn } from '../blameParser'

// Example `git blame --porcelain` output
const sampleBlameOutput = `abc1234567890abc1234567890abc1234567890a 1 1 3
author Alice
author-mail <alice@example.com>
author-time 1700000000
author-tz +0000
committer Alice
committer-mail <alice@example.com>
committer-time 1700000000
committer-tz +0000
summary Initial commit
filename src/main.ts
\tfunction main() {
abc1234567890abc1234567890abc1234567890a 2 2
\t  console.log('hello')
abc1234567890abc1234567890abc1234567890a 3 3
\t}
def5678901234def5678901234def5678901234d 4 4 2
author Bob
author-mail <bob@example.com>
author-time 1700100000
author-tz +0000
committer Bob
committer-mail <bob@example.com>
committer-time 1700100000
committer-tz +0000
summary Add helper
filename src/main.ts
\tfunction helper() {
def5678901234def5678901234def5678901234d 5 5
\t  return 42
`

describe('parseBlame', () => {
  it('parses blame --porcelain output into entries', () => {
    const entries = parseBlame(sampleBlameOutput)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('extracts author for each line', () => {
    const entries = parseBlame(sampleBlameOutput)
    // Lines 1-3 are by Alice
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1).toBeDefined()
    expect(line1!.author).toBe('Alice')

    // Lines 4-5 are by Bob
    const line4 = entries.find(e => e.lineNumber === 4)
    expect(line4).toBeDefined()
    expect(line4!.author).toBe('Bob')
  })

  it('extracts commit hash per line', () => {
    const entries = parseBlame(sampleBlameOutput)
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1!.hash).toBe('abc1234567890abc1234567890abc1234567890a')

    const line4 = entries.find(e => e.lineNumber === 4)
    expect(line4!.hash).toBe('def5678901234def5678901234def5678901234d')
  })

  it('extracts author email', () => {
    const entries = parseBlame(sampleBlameOutput)
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1!.authorEmail).toBe('alice@example.com')
  })

  it('extracts timestamp', () => {
    const entries = parseBlame(sampleBlameOutput)
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1!.timestamp).toBe(1700000000)
  })

  it('extracts summary', () => {
    const entries = parseBlame(sampleBlameOutput)
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1!.summary).toBe('Initial commit')
  })

  it('extracts line content', () => {
    const entries = parseBlame(sampleBlameOutput)
    const line1 = entries.find(e => e.lineNumber === 1)
    expect(line1!.content).toBe('function main() {')
  })

  it('handles empty output', () => {
    expect(parseBlame('')).toEqual([])
  })
})

describe('computeChurn', () => {
  it('counts unique commits per line range', () => {
    const entries: BlameEntry[] = [
      { lineNumber: 1, hash: 'aaa', author: 'Alice', authorEmail: 'a@a.com', timestamp: 100, summary: 'c1', content: 'a' },
      { lineNumber: 2, hash: 'aaa', author: 'Alice', authorEmail: 'a@a.com', timestamp: 100, summary: 'c1', content: 'b' },
      { lineNumber: 3, hash: 'bbb', author: 'Bob', authorEmail: 'b@b.com', timestamp: 200, summary: 'c2', content: 'c' },
      { lineNumber: 4, hash: 'ccc', author: 'Alice', authorEmail: 'a@a.com', timestamp: 300, summary: 'c3', content: 'd' },
      { lineNumber: 5, hash: 'aaa', author: 'Alice', authorEmail: 'a@a.com', timestamp: 100, summary: 'c1', content: 'e' },
    ]
    // For lines 1-5: 3 unique commits
    const churn = computeChurn(entries, 1, 5)
    expect(churn).toBe(3)
  })

  it('returns 0 for empty entries', () => {
    expect(computeChurn([], 1, 10)).toBe(0)
  })

  it('counts churn for a subset of lines', () => {
    const entries: BlameEntry[] = [
      { lineNumber: 1, hash: 'aaa', author: 'A', authorEmail: '', timestamp: 0, summary: '', content: '' },
      { lineNumber: 2, hash: 'bbb', author: 'B', authorEmail: '', timestamp: 0, summary: '', content: '' },
      { lineNumber: 3, hash: 'aaa', author: 'A', authorEmail: '', timestamp: 0, summary: '', content: '' },
    ]
    // Lines 1-2: 2 unique commits
    expect(computeChurn(entries, 1, 2)).toBe(2)
    // Line 1 only: 1 unique commit
    expect(computeChurn(entries, 1, 1)).toBe(1)
  })
})
