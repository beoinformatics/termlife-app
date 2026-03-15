import type { GitFileStatus } from '../../../../main/git/types'

export function filterWorkingFiles(files: GitFileStatus[]): GitFileStatus[] {
  return files.filter(f =>
    f.workingTree !== 'unmodified' && f.workingTree !== 'ignored'
  )
}

export function filterStagedFiles(files: GitFileStatus[]): GitFileStatus[] {
  return files.filter(f =>
    f.index !== 'unmodified' && f.index !== 'untracked' && f.index !== 'ignored'
  )
}
