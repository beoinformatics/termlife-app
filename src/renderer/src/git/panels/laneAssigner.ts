import type { GraphCommit } from '../../../../main/git/types'

/**
 * Assigns lane (column) positions to commits for branch graph visualization.
 * Does not mutate input — returns new array with column fields set.
 */
export function assignLanes(commits: GraphCommit[]): GraphCommit[] {
  if (commits.length === 0) return []

  // Clone commits so we don't mutate input
  const result: GraphCommit[] = commits.map(c => ({ ...c }))

  // Active lanes: each slot holds the hash of the commit expected next in that lane
  // null means the lane is free
  const lanes: (string | null)[] = []

  function findLane(hash: string): number {
    return lanes.indexOf(hash)
  }

  function allocateLane(): number {
    const free = lanes.indexOf(null)
    if (free !== -1) {
      return free
    }
    lanes.push(null)
    return lanes.length - 1
  }

  function freeLane(index: number): void {
    lanes[index] = null
  }

  for (const commit of result) {
    let lane = findLane(commit.hash)

    if (lane === -1) {
      // This commit wasn't expected in any lane — allocate a new one
      lane = allocateLane()
    }

    commit.column = lane

    // Free this lane — it's been consumed
    freeLane(lane)

    // First parent continues in the same lane
    if (commit.parents.length > 0) {
      lanes[lane] = commit.parents[0]
    }

    // Additional parents get new lanes
    for (let i = 1; i < commit.parents.length; i++) {
      const parentHash = commit.parents[i]
      // Only allocate if this parent isn't already expected somewhere
      if (findLane(parentHash) === -1) {
        const newLane = allocateLane()
        lanes[newLane] = parentHash
      }
    }
  }

  return result
}
