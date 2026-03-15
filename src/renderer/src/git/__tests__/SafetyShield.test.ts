import { describe, it, expect } from 'vitest'
import { shieldState, shieldColor, shieldLabel } from '../components/SafetyShield'
import type { GitStatus } from '../../../../main/git/types'

function makeStatus(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    branch: 'main',
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    merging: false,
    rebasing: false,
    files: [],
    ...overrides,
  }
}

describe('shieldState', () => {
  it('returns green when no changed files', () => {
    expect(shieldState(makeStatus())).toBe('clean')
  })

  it('returns yellow when uncommitted changes exist', () => {
    const status = makeStatus({
      files: [{ path: 'f.ts', index: 'modified', workingTree: 'unmodified' }],
    })
    expect(shieldState(status)).toBe('dirty')
  })

  it('returns yellow for untracked files', () => {
    const status = makeStatus({
      files: [{ path: 'new.ts', index: 'untracked', workingTree: 'untracked' }],
    })
    expect(shieldState(status)).toBe('dirty')
  })
})

describe('shieldColor', () => {
  it('green for clean', () => {
    expect(shieldColor('clean')).toBe(0x22c55e)
  })

  it('yellow for dirty', () => {
    expect(shieldColor('dirty')).toBe(0xeab308)
  })
})

describe('shieldLabel', () => {
  it('shows "All saved" for clean', () => {
    expect(shieldLabel('clean')).toBe('All saved')
  })

  it('shows "Unsaved work" for dirty', () => {
    expect(shieldLabel('dirty')).toBe('Unsaved work')
  })
})
