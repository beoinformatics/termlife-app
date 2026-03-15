import { Container, Graphics, Text } from 'pixi.js'

export interface TreemapInput {
  path: string
  weight: number
  color: number
}

export interface TreemapRect {
  path: string
  color: number
  x: number
  y: number
  w: number
  h: number
}

/**
 * Simple slice-and-dice treemap layout.
 * Sorts by weight descending, alternates horizontal/vertical slicing.
 */
export function computeTreemap(files: TreemapInput[], width: number, height: number): TreemapRect[] {
  if (files.length === 0) return []

  const sorted = [...files].sort((a, b) => b.weight - a.weight)
  const totalWeight = sorted.reduce((sum, f) => sum + f.weight, 0)

  const rects: TreemapRect[] = []
  layoutSlice(sorted, 0, 0, width, height, totalWeight, true, rects)
  return rects
}

function layoutSlice(
  items: TreemapInput[],
  x: number, y: number, w: number, h: number,
  totalWeight: number, horizontal: boolean,
  out: TreemapRect[],
): void {
  if (items.length === 0) return

  if (items.length === 1) {
    out.push({ path: items[0].path, color: items[0].color, x, y, w, h })
    return
  }

  // Split items into two groups trying to balance weights
  let bestSplit = 1
  let bestDiff = Infinity
  let runningWeight = 0

  for (let i = 0; i < items.length - 1; i++) {
    runningWeight += items[i].weight
    const remaining = totalWeight - runningWeight
    const diff = Math.abs(runningWeight - remaining)
    if (diff < bestDiff) {
      bestDiff = diff
      bestSplit = i + 1
    }
  }

  const leftItems = items.slice(0, bestSplit)
  const rightItems = items.slice(bestSplit)
  const leftWeight = leftItems.reduce((s, f) => s + f.weight, 0)
  const rightWeight = rightItems.reduce((s, f) => s + f.weight, 0)
  const ratio = leftWeight / totalWeight

  if (horizontal) {
    const splitW = w * ratio
    layoutSlice(leftItems, x, y, splitW, h, leftWeight, !horizontal, out)
    layoutSlice(rightItems, x + splitW, y, w - splitW, h, rightWeight, !horizontal, out)
  } else {
    const splitH = h * ratio
    layoutSlice(leftItems, x, y, w, splitH, leftWeight, !horizontal, out)
    layoutSlice(rightItems, x, y + splitH, w, h - splitH, rightWeight, !horizontal, out)
  }
}

export class FileMapPanel extends Container {
  private panelWidth: number
  private panelHeight: number

  constructor(width: number, height: number) {
    super()
    this.panelWidth = width
    this.panelHeight = height
  }

  update(files: TreemapInput[]): void {
    this.removeChildren()

    const rects = computeTreemap(files, this.panelWidth, this.panelHeight)

    for (const rect of rects) {
      const g = new Graphics()
      g.rect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2)
      g.fill({ color: rect.color })
      this.addChild(g)

      if (rect.w > 40 && rect.h > 16) {
        const parts = rect.path.split('/')
        const name = parts[parts.length - 1]
        const label = new Text({
          text: name.slice(0, Math.floor(rect.w / 7)),
          style: { fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: 0xffffff },
        })
        label.x = rect.x + 4
        label.y = rect.y + 4
        this.addChild(label)
      }
    }
  }

  resize(width: number, height: number): void {
    this.panelWidth = width
    this.panelHeight = height
  }
}
