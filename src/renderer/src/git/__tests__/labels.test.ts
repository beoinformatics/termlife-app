import { describe, it, expect } from 'vitest'
import { getLabel, toggleMode, getLabelMode, setLabelMode, LABEL_MAPPINGS } from '../labels'

describe('LABEL_MAPPINGS', () => {
  it('has friendly and git terms for common operations', () => {
    expect(LABEL_MAPPINGS.stage.friendly).toBeDefined()
    expect(LABEL_MAPPINGS.stage.git).toBeDefined()
    expect(LABEL_MAPPINGS.unstage.friendly).toBeDefined()
    expect(LABEL_MAPPINGS.unstage.git).toBeDefined()
    expect(LABEL_MAPPINGS.commit.friendly).toBeDefined()
    expect(LABEL_MAPPINGS.commit.git).toBeDefined()
  })
})

describe('getLabel', () => {
  it('returns friendly label by default', () => {
    setLabelMode('friendly')
    expect(getLabel('stage')).toBe(LABEL_MAPPINGS.stage.friendly)
  })

  it('returns git label when mode is git', () => {
    setLabelMode('git')
    expect(getLabel('stage')).toBe(LABEL_MAPPINGS.stage.git)
  })

  it('returns key as fallback for unknown labels', () => {
    setLabelMode('friendly')
    expect(getLabel('nonexistent' as any)).toBe('nonexistent')
  })
})

describe('toggleMode', () => {
  it('toggles from friendly to git', () => {
    setLabelMode('friendly')
    toggleMode()
    expect(getLabelMode()).toBe('git')
  })

  it('toggles from git to friendly', () => {
    setLabelMode('git')
    toggleMode()
    expect(getLabelMode()).toBe('friendly')
  })
})

describe('getLabelMode / setLabelMode', () => {
  it('defaults to friendly', () => {
    setLabelMode('friendly')
    expect(getLabelMode()).toBe('friendly')
  })

  it('persists mode changes', () => {
    setLabelMode('git')
    expect(getLabelMode()).toBe('git')
    setLabelMode('friendly')
    expect(getLabelMode()).toBe('friendly')
  })
})
