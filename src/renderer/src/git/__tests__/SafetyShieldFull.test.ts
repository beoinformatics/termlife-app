import { describe, it, expect, vi } from 'vitest'
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

describe('shieldState — full states', () => {
  it('returns clean when no changed files', () => {
    expect(shieldState(makeStatus())).toBe('clean')
  })

  it('returns dirty when uncommitted changes exist', () => {
    expect(shieldState(makeStatus({
      files: [{ path: 'f.ts', index: 'modified', workingTree: 'unmodified' }],
    }))).toBe('dirty')
  })

  it('returns detached when HEAD is detached', () => {
    expect(shieldState(makeStatus({ detached: true }))).toBe('detached')
  })

  it('returns detached with dirty files when detached', () => {
    expect(shieldState(makeStatus({
      detached: true,
      files: [{ path: 'f.ts', index: 'unmodified', workingTree: 'modified' }],
    }))).toBe('detached')
  })

  it('returns merging when mid-merge', () => {
    expect(shieldState(makeStatus({ merging: true }))).toBe('merging')
  })

  it('returns rebasing when mid-rebase', () => {
    expect(shieldState(makeStatus({ rebasing: true }))).toBe('rebasing')
  })

  it('merging takes priority over detached', () => {
    expect(shieldState(makeStatus({ merging: true, detached: true }))).toBe('merging')
  })

  it('rebasing takes priority over detached', () => {
    expect(shieldState(makeStatus({ rebasing: true, detached: true }))).toBe('rebasing')
  })
})

describe('shieldColor — full states', () => {
  it('green for clean', () => {
    expect(shieldColor('clean')).toBe(0x22c55e)
  })

  it('yellow for dirty', () => {
    expect(shieldColor('dirty')).toBe(0xeab308)
  })

  it('orange for detached', () => {
    expect(shieldColor('detached')).toBe(0xf97316)
  })

  it('red for merging', () => {
    expect(shieldColor('merging')).toBe(0xef4444)
  })

  it('red for rebasing', () => {
    expect(shieldColor('rebasing')).toBe(0xef4444)
  })
})

describe('shieldLabel — full states', () => {
  it('"All saved" for clean', () => {
    expect(shieldLabel('clean')).toBe('All saved')
  })

  it('"Unsaved work" for dirty', () => {
    expect(shieldLabel('dirty')).toBe('Unsaved work')
  })

  it('"Detached HEAD" for detached', () => {
    expect(shieldLabel('detached')).toBe('Detached HEAD')
  })

  it('"Merge in progress" for merging', () => {
    expect(shieldLabel('merging')).toBe('Merge in progress')
  })

  it('"Rebase in progress" for rebasing', () => {
    expect(shieldLabel('rebasing')).toBe('Rebase in progress')
  })
})

describe('shieldActions — full states', () => {
  // Import the new shieldActions function
  let shieldActions: (state: any) => string[]

  it('no actions for clean', async () => {
    const mod = await import('../components/SafetyShield')
    shieldActions = mod.shieldActions
    expect(shieldActions('clean')).toEqual([])
  })

  it('no actions for dirty', () => {
    expect(shieldActions('dirty')).toEqual([])
  })

  it('"Create Branch" action for detached', () => {
    expect(shieldActions('detached')).toContain('Create Branch')
  })

  it('"Abort Merge" action for merging', () => {
    expect(shieldActions('merging')).toContain('Abort Merge')
  })

  it('"Abort Rebase" action for rebasing', () => {
    expect(shieldActions('rebasing')).toContain('Abort Rebase')
  })
})
