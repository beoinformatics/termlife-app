import { describe, it, expect } from 'vitest'
import { parseStatus, parseLog, parseDiff, parseBranches, parseStashList } from '../gitParser'

describe('parseStatus', () => {
  it('parses branch name from header', () => {
    const output = '# branch.oid abc123\n# branch.head main\n'
    const result = parseStatus(output)
    expect(result.branch).toBe('main')
  })

  it('parses upstream tracking info', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.upstream).toBe('origin/main')
    expect(result.ahead).toBe(2)
    expect(result.behind).toBe(1)
  })

  it('parses no upstream as null', () => {
    const output = '# branch.oid abc123\n# branch.head main\n'
    const result = parseStatus(output)
    expect(result.upstream).toBeNull()
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })

  it('parses detached HEAD', () => {
    const output = '# branch.oid abc123\n# branch.head (detached)\n'
    const result = parseStatus(output)
    expect(result.detached).toBe(true)
    expect(result.branch).toBe('(detached)')
  })

  it('parses modified file in working tree', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 .M N... 100644 100644 100644 abc123 def456 src/main.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('src/main.ts')
    expect(result.files[0].index).toBe('unmodified')
    expect(result.files[0].workingTree).toBe('modified')
  })

  it('parses staged file in index', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 M. N... 100644 100644 100644 abc123 def456 src/main.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].index).toBe('modified')
    expect(result.files[0].workingTree).toBe('unmodified')
  })

  it('parses added file in index', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 A. N... 000000 100644 100644 0000000 abc123 newfile.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files[0].index).toBe('added')
    expect(result.files[0].workingTree).toBe('unmodified')
  })

  it('parses deleted file', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 D. N... 100644 000000 000000 abc123 0000000 removed.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files[0].index).toBe('deleted')
  })

  it('parses untracked file', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '? newfile.txt',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('newfile.txt')
    expect(result.files[0].index).toBe('untracked')
    expect(result.files[0].workingTree).toBe('untracked')
  })

  it('parses renamed file with original path', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '2 R. N... 100644 100644 100644 abc123 def456 R100 new.ts\told.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('new.ts')
    expect(result.files[0].index).toBe('renamed')
    expect(result.files[0].renamed).toBe('old.ts')
  })

  it('parses conflicted file (both modified)', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      'u UU N... 100644 100644 100644 100644 abc123 def456 ghi789 conflict.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(1)
    expect(result.files[0].path).toBe('conflict.ts')
    expect(result.files[0].index).toBe('conflicted')
    expect(result.files[0].workingTree).toBe('conflicted')
  })

  it('parses file modified in both index and working tree', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 MM N... 100644 100644 100644 abc123 def456 both.ts',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files[0].index).toBe('modified')
    expect(result.files[0].workingTree).toBe('modified')
  })

  it('handles empty repo (no commits)', () => {
    const output = '# branch.oid (initial)\n# branch.head main\n'
    const result = parseStatus(output)
    expect(result.branch).toBe('main')
    expect(result.files).toHaveLength(0)
  })

  it('handles multiple files with mixed states', () => {
    const output = [
      '# branch.oid abc123',
      '# branch.head main',
      '1 M. N... 100644 100644 100644 abc123 def456 staged.ts',
      '1 .M N... 100644 100644 100644 abc123 def456 modified.ts',
      '? untracked.txt',
    ].join('\n')
    const result = parseStatus(output)
    expect(result.files).toHaveLength(3)
  })

  it('detects merging state', () => {
    // merging/rebasing are set externally by gitManager checking for MERGE_HEAD/rebase-merge
    // parseStatus just parses porcelain output — merging/rebasing default to false
    const output = '# branch.oid abc123\n# branch.head main\n'
    const result = parseStatus(output)
    expect(result.merging).toBe(false)
    expect(result.rebasing).toBe(false)
  })
})

describe('parseLog', () => {
  // Format: hash\x00shortHash\x00author\x00email\x00date\x00message\x00body\x00refs\x00parents
  const SEP = '\x00'
  const RECORD_SEP = '\x01'

  it('parses single commit', () => {
    const output = [
      'abc1234567890',
      'abc1234',
      'Alice',
      'alice@test.com',
      '2026-01-15T10:30:00+00:00',
      'Initial commit',
      '',
      '',
      '',
    ].join(SEP)
    const result = parseLog(output)
    expect(result).toHaveLength(1)
    expect(result[0].hash).toBe('abc1234567890')
    expect(result[0].shortHash).toBe('abc1234')
    expect(result[0].author).toBe('Alice')
    expect(result[0].authorEmail).toBe('alice@test.com')
    expect(result[0].date).toBe('2026-01-15T10:30:00+00:00')
    expect(result[0].message).toBe('Initial commit')
    expect(result[0].body).toBe('')
    expect(result[0].refs).toEqual([])
    expect(result[0].parents).toEqual([])
  })

  it('parses multiple commits', () => {
    const commit1 = [
      'abc1234567890', 'abc1234', 'Alice', 'alice@test.com',
      '2026-01-15T10:30:00+00:00', 'Second commit', '', '', 'def456',
    ].join(SEP)
    const commit2 = [
      'def4567890123', 'def4567', 'Bob', 'bob@test.com',
      '2026-01-14T09:00:00+00:00', 'First commit', '', '', '',
    ].join(SEP)
    const output = commit1 + RECORD_SEP + commit2
    const result = parseLog(output)
    expect(result).toHaveLength(2)
    expect(result[0].author).toBe('Alice')
    expect(result[1].author).toBe('Bob')
  })

  it('parses merge commit with two parents', () => {
    const output = [
      'abc123', 'abc1234', 'Alice', 'alice@test.com',
      '2026-01-15T10:30:00+00:00', 'Merge branch feature', '', '',
      'parent1 parent2',
    ].join(SEP)
    const result = parseLog(output)
    expect(result[0].parents).toEqual(['parent1', 'parent2'])
  })

  it('parses commit with refs (branch, tag)', () => {
    const output = [
      'abc123', 'abc1234', 'Alice', 'alice@test.com',
      '2026-01-15T10:30:00+00:00', 'Tagged release', '', 'HEAD -> main, tag: v1.0',
      'parent1',
    ].join(SEP)
    const result = parseLog(output)
    expect(result[0].refs).toEqual(['HEAD -> main', 'tag: v1.0'])
  })

  it('parses commit with multi-line body', () => {
    const output = [
      'abc123', 'abc1234', 'Alice', 'alice@test.com',
      '2026-01-15T10:30:00+00:00', 'Summary line',
      'Detailed description\nwith multiple lines', '', '',
    ].join(SEP)
    const result = parseLog(output)
    expect(result[0].message).toBe('Summary line')
    expect(result[0].body).toBe('Detailed description\nwith multiple lines')
  })

  it('returns empty array for empty log', () => {
    const result = parseLog('')
    expect(result).toEqual([])
  })
})

describe('parseDiff', () => {
  it('parses single file single hunk', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '-old line',
      '+new line',
      '+added line',
      ' line3',
    ].join('\n')
    const result = parseDiff(output)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('file.ts')
    expect(result[0].hunks).toHaveLength(1)
    expect(result[0].hunks[0].oldStart).toBe(1)
    expect(result[0].hunks[0].oldLines).toBe(3)
    expect(result[0].hunks[0].newStart).toBe(1)
    expect(result[0].hunks[0].newLines).toBe(4)
    expect(result[0].hunks[0].lines).toHaveLength(5)
  })

  it('assigns correct line types', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' context',
      '-deleted',
      '+added',
      ' context2',
    ].join('\n')
    const result = parseDiff(output)
    const lines = result[0].hunks[0].lines
    expect(lines[0].type).toBe('context')
    expect(lines[1].type).toBe('deletion')
    expect(lines[2].type).toBe('addition')
    expect(lines[3].type).toBe('context')
  })

  it('assigns correct line numbers', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -10,3 +10,4 @@',
      ' context',
      '-deleted',
      '+added1',
      '+added2',
      ' context2',
    ].join('\n')
    const result = parseDiff(output)
    const lines = result[0].hunks[0].lines
    expect(lines[0].oldLineNumber).toBe(10)
    expect(lines[0].newLineNumber).toBe(10)
    expect(lines[1].oldLineNumber).toBe(11)
    expect(lines[1].newLineNumber).toBeUndefined()
    expect(lines[2].oldLineNumber).toBeUndefined()
    expect(lines[2].newLineNumber).toBe(11)
    expect(lines[3].oldLineNumber).toBeUndefined()
    expect(lines[3].newLineNumber).toBe(12)
    expect(lines[4].oldLineNumber).toBe(12)
    expect(lines[4].newLineNumber).toBe(13)
  })

  it('parses single file with multiple hunks', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,3 +1,3 @@',
      ' a',
      '-b',
      '+c',
      ' d',
      '@@ -20,3 +20,3 @@',
      ' x',
      '-y',
      '+z',
      ' w',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].hunks).toHaveLength(2)
    expect(result[0].hunks[1].oldStart).toBe(20)
  })

  it('parses multiple files', () => {
    const output = [
      'diff --git a/one.ts b/one.ts',
      'index abc123..def456 100644',
      '--- a/one.ts',
      '+++ b/one.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
      'diff --git a/two.ts b/two.ts',
      'index abc123..def456 100644',
      '--- a/two.ts',
      '+++ b/two.ts',
      '@@ -1,1 +1,1 @@',
      '-old2',
      '+new2',
    ].join('\n')
    const result = parseDiff(output)
    expect(result).toHaveLength(2)
    expect(result[0].path).toBe('one.ts')
    expect(result[1].path).toBe('two.ts')
  })

  it('parses renamed file', () => {
    const output = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 90%',
      'rename from old.ts',
      'rename to new.ts',
      'index abc123..def456 100644',
      '--- a/old.ts',
      '+++ b/new.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].path).toBe('new.ts')
    expect(result[0].oldPath).toBe('old.ts')
    expect(result[0].status).toBe('renamed')
  })

  it('handles new file (all additions)', () => {
    const output = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      'index 0000000..abc123',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,2 @@',
      '+line1',
      '+line2',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].status).toBe('added')
    expect(result[0].stats.additions).toBe(2)
    expect(result[0].stats.deletions).toBe(0)
  })

  it('handles deleted file (all deletions)', () => {
    const output = [
      'diff --git a/gone.ts b/gone.ts',
      'deleted file mode 100644',
      'index abc123..0000000',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-line1',
      '-line2',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].status).toBe('deleted')
    expect(result[0].stats.additions).toBe(0)
    expect(result[0].stats.deletions).toBe(2)
  })

  it('handles binary file (no hunks)', () => {
    const output = [
      'diff --git a/image.png b/image.png',
      'index abc123..def456 100644',
      'Binary files a/image.png and b/image.png differ',
    ].join('\n')
    const result = parseDiff(output)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('image.png')
    expect(result[0].hunks).toHaveLength(0)
  })

  it('counts stats correctly', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,4 +1,5 @@',
      ' keep',
      '-del1',
      '-del2',
      '+add1',
      '+add2',
      '+add3',
      ' keep2',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].stats.additions).toBe(3)
    expect(result[0].stats.deletions).toBe(2)
  })

  it('returns empty array for empty diff', () => {
    const result = parseDiff('')
    expect(result).toEqual([])
  })

  it('handles no-newline-at-end-of-file marker', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      '-old line',
      '\\ No newline at end of file',
      '+new line',
      '\\ No newline at end of file',
    ].join('\n')
    const result = parseDiff(output)
    expect(result).toHaveLength(1)
    // The "\ No newline" marker should not appear as a diff line
    const lines = result[0].hunks[0].lines
    expect(lines.every(l => !l.content.includes('No newline at end of file'))).toBe(true)
    expect(lines.filter(l => l.type === 'deletion')).toHaveLength(1)
    expect(lines.filter(l => l.type === 'addition')).toHaveLength(1)
  })

  it('handles permission-only changes', () => {
    const output = [
      'diff --git a/script.sh b/script.sh',
      'old mode 100644',
      'new mode 100755',
    ].join('\n')
    const result = parseDiff(output)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('script.sh')
    expect(result[0].hunks).toHaveLength(0)
    expect(result[0].stats.additions).toBe(0)
    expect(result[0].stats.deletions).toBe(0)
  })

  it('parses hunk header with function context', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -10,3 +10,4 @@ function myFunc() {',
      ' context',
      '-old',
      '+new',
      '+added',
      ' context2',
    ].join('\n')
    const result = parseDiff(output)
    expect(result[0].hunks[0].header).toContain('function myFunc()');
    expect(result[0].hunks[0].oldStart).toBe(10)
    expect(result[0].hunks[0].newStart).toBe(10)
  })

  it('handles diff with context lines surrounding changes', () => {
    const output = [
      'diff --git a/file.ts b/file.ts',
      'index abc123..def456 100644',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -5,7 +5,7 @@',
      ' ctx1',
      ' ctx2',
      ' ctx3',
      '-old',
      '+new',
      ' ctx4',
      ' ctx5',
      ' ctx6',
    ].join('\n')
    const result = parseDiff(output)
    const lines = result[0].hunks[0].lines
    expect(lines.filter(l => l.type === 'context')).toHaveLength(6)
    expect(lines.filter(l => l.type === 'deletion')).toHaveLength(1)
    expect(lines.filter(l => l.type === 'addition')).toHaveLength(1)
    // Verify context line numbers are continuous
    expect(lines[0].oldLineNumber).toBe(5)
    expect(lines[0].newLineNumber).toBe(5)
    expect(lines[7].oldLineNumber).toBe(11)
    expect(lines[7].newLineNumber).toBe(11)
  })
})

describe('parseBranches', () => {
  // Format: name\x00hash\x00upstream\x00ahead\x00behind\x00date
  const SEP = '\x00'
  const RECORD_SEP = '\n'

  it('parses local branches with current marker', () => {
    const output = [
      `*${SEP}main${SEP}abc1234${SEP}origin/main${SEP}0${SEP}0${SEP}2026-01-15`,
      `${SEP}feature${SEP}def5678${SEP}${SEP}0${SEP}0${SEP}2026-01-14`,
    ].join(RECORD_SEP)
    const result = parseBranches(output, '')
    expect(result.current).toBe('main')
    expect(result.local).toHaveLength(2)
    expect(result.local[0].name).toBe('main')
    expect(result.local[0].upstream).toBe('origin/main')
    expect(result.local[1].name).toBe('feature')
    expect(result.local[1].upstream).toBeUndefined()
  })

  it('parses ahead/behind counts', () => {
    const output = `*${SEP}main${SEP}abc1234${SEP}origin/main${SEP}3${SEP}2${SEP}2026-01-15`
    const result = parseBranches(output, '')
    expect(result.local[0].ahead).toBe(3)
    expect(result.local[0].behind).toBe(2)
  })

  it('parses remote branches', () => {
    const remoteOutput = [
      `origin/main${SEP}abc1234${SEP}2026-01-15`,
      `origin/feature${SEP}def5678${SEP}2026-01-14`,
    ].join(RECORD_SEP)
    const result = parseBranches('', remoteOutput)
    expect(result.remote).toHaveLength(2)
    expect(result.remote[0].name).toBe('origin/main')
    expect(result.remote[1].name).toBe('origin/feature')
  })

  it('handles no branches (fresh repo)', () => {
    const result = parseBranches('', '')
    expect(result.current).toBe('')
    expect(result.local).toEqual([])
    expect(result.remote).toEqual([])
  })
})

describe('parseStashList', () => {
  // Format: index\x00message\x00date\x00branch
  const SEP = '\x00'

  it('parses multiple stash entries', () => {
    const output = [
      `0${SEP}WIP on main: abc123 some work${SEP}2026-01-15T10:00:00+00:00${SEP}main`,
      `1${SEP}On feature: save progress${SEP}2026-01-14T09:00:00+00:00${SEP}feature`,
    ].join('\n')
    const result = parseStashList(output)
    expect(result).toHaveLength(2)
    expect(result[0].index).toBe(0)
    expect(result[0].message).toBe('WIP on main: abc123 some work')
    expect(result[0].date).toBe('2026-01-15T10:00:00+00:00')
    expect(result[0].branch).toBe('main')
    expect(result[1].index).toBe(1)
  })

  it('returns empty array for empty stash', () => {
    const result = parseStashList('')
    expect(result).toEqual([])
  })
})
