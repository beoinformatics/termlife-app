import { describe, it, expect, vi } from 'vitest'
import { fileTileColor, fileTileLabel } from '../components/FileTile'

describe('fileTileColor', () => {
  it('returns green for added', () => {
    expect(fileTileColor('added')).toBe(0x22c55e)
  })

  it('returns red for deleted', () => {
    expect(fileTileColor('deleted')).toBe(0xef4444)
  })

  it('returns yellow for modified', () => {
    expect(fileTileColor('modified')).toBe(0xeab308)
  })

  it('returns orange for conflicted', () => {
    expect(fileTileColor('conflicted')).toBe(0xf97316)
  })

  it('returns blue for renamed', () => {
    expect(fileTileColor('renamed')).toBe(0x3b82f6)
  })

  it('returns gray for untracked', () => {
    expect(fileTileColor('untracked')).toBe(0x9ca3af)
  })

  it('returns gray for unmodified', () => {
    expect(fileTileColor('unmodified')).toBe(0x6b7280)
  })
})

describe('fileTileLabel', () => {
  it('returns basename for simple path', () => {
    expect(fileTileLabel('src/renderer/main.ts')).toBe('main.ts')
  })

  it('returns filename for root file', () => {
    expect(fileTileLabel('README.md')).toBe('README.md')
  })

  it('truncates long filenames', () => {
    const long = 'a'.repeat(50) + '.ts'
    const label = fileTileLabel(long)
    expect(label.length).toBeLessThanOrEqual(35)
    expect(label.endsWith('...')).toBe(true)
  })
})
