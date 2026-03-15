export type LabelMode = 'friendly' | 'git'

export type LabelKey =
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'restore'
  | 'stash'
  | 'branch'
  | 'merge'
  | 'rebase'
  | 'checkout'
  | 'working'
  | 'staging'
  | 'history'
  | 'push'
  | 'pull'
  | 'fetch'

export const LABEL_MAPPINGS: Record<LabelKey, { friendly: string; git: string }> = {
  stage: { friendly: 'Ready to save', git: 'Stage' },
  unstage: { friendly: 'Not yet ready', git: 'Unstage' },
  commit: { friendly: 'Save snapshot', git: 'Commit' },
  restore: { friendly: 'Undo changes', git: 'Restore' },
  stash: { friendly: 'Set aside', git: 'Stash' },
  branch: { friendly: 'Timeline', git: 'Branch' },
  merge: { friendly: 'Combine timelines', git: 'Merge' },
  rebase: { friendly: 'Replay changes', git: 'Rebase' },
  checkout: { friendly: 'Switch timeline', git: 'Checkout' },
  working: { friendly: 'Current changes', git: 'Working Tree' },
  staging: { friendly: 'Ready to save', git: 'Staging Area' },
  history: { friendly: 'Timeline', git: 'History' },
  push: { friendly: 'Share', git: 'Push' },
  pull: { friendly: 'Get updates', git: 'Pull' },
  fetch: { friendly: 'Check for updates', git: 'Fetch' },
}

let currentMode: LabelMode = 'friendly'

export function getLabel(key: LabelKey | string): string {
  const mapping = LABEL_MAPPINGS[key as LabelKey]
  if (!mapping) return key
  return mapping[currentMode]
}

export function getLabelMode(): LabelMode {
  return currentMode
}

export function setLabelMode(mode: LabelMode): void {
  currentMode = mode
}

export function toggleMode(): void {
  currentMode = currentMode === 'friendly' ? 'git' : 'friendly'
}
