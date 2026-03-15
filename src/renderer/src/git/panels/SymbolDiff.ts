import { Container, Graphics, Text } from 'pixi.js'
import { extractSymbols, SymbolInfo } from './SymbolExtractor'

export interface SymbolChange {
  name: string
  type: 'added' | 'deleted' | 'modified' | 'renamed'
  kind: 'function' | 'class' | 'method'
  oldBody?: string
  newBody?: string
  oldName?: string
}

/**
 * Compare symbols between old and new source, returning a list of changes.
 * Unchanged symbols are omitted.
 */
export function diffSymbols(oldSource: string, newSource: string, language: string): SymbolChange[] {
  const oldSymbols = extractSymbols(oldSource, language)
  const newSymbols = extractSymbols(newSource, language)

  const oldMap = new Map<string, SymbolInfo>()
  for (const s of oldSymbols) oldMap.set(s.name, s)

  const newMap = new Map<string, SymbolInfo>()
  for (const s of newSymbols) newMap.set(s.name, s)

  const changes: SymbolChange[] = []

  // Check for modified and deleted symbols
  for (const [name, oldSym] of oldMap) {
    const newSym = newMap.get(name)
    if (!newSym) {
      // Check for rename: same body, different name
      const renamed = findRename(oldSym, newSymbols, oldMap)
      if (renamed) {
        changes.push({
          name: renamed.name,
          type: 'renamed',
          kind: oldSym.kind,
          oldBody: oldSym.body,
          newBody: renamed.body,
          oldName: name,
        })
        // Remove from newMap so it's not double-reported as added
        newMap.delete(renamed.name)
      } else {
        changes.push({
          name,
          type: 'deleted',
          kind: oldSym.kind,
          oldBody: oldSym.body,
        })
      }
    } else if (oldSym.body !== newSym.body) {
      changes.push({
        name,
        type: 'modified',
        kind: oldSym.kind,
        oldBody: oldSym.body,
        newBody: newSym.body,
      })
    }
    // If body is identical, skip (unchanged)
  }

  // Check for added symbols (in new but not in old, and not already handled as rename)
  for (const [name, newSym] of newMap) {
    if (!oldMap.has(name) && !changes.some(c => c.type === 'renamed' && c.name === name)) {
      changes.push({
        name,
        type: 'added',
        kind: newSym.kind,
        newBody: newSym.body,
      })
    }
  }

  return changes
}

/**
 * Try to find a renamed symbol: same body content but different name.
 */
function findRename(
  oldSym: SymbolInfo,
  newSymbols: SymbolInfo[],
  oldMap: Map<string, SymbolInfo>,
): SymbolInfo | null {
  // Normalize body by replacing the function name
  const normalizedOld = normalizeBody(oldSym)

  for (const newSym of newSymbols) {
    // Must not exist in old (it's a new name)
    if (oldMap.has(newSym.name)) continue
    // Same kind
    if (newSym.kind !== oldSym.kind) continue

    const normalizedNew = normalizeBody(newSym)
    if (normalizedOld === normalizedNew) {
      return newSym
    }
  }
  return null
}

function normalizeBody(sym: SymbolInfo): string {
  // Remove the symbol name from the body for comparison
  return sym.body.replace(new RegExp(`\\b${sym.name}\\b`), '__NAME__')
}

// --- PixiJS rendering component ---

const CHANGE_COLORS = {
  added: 0x22c55e,
  deleted: 0xef4444,
  modified: 0xeab308,
  renamed: 0x3b82f6,
}

export class SymbolDiffPanel extends Container {
  private _width: number
  private _height: number
  private content: Container

  constructor(width: number, height: number) {
    super()
    this._width = width
    this._height = height

    const bg = new Graphics()
    bg.rect(0, 0, width, height)
    bg.fill(0x0f0f1e)
    this.addChild(bg)

    this.content = new Container()
    this.content.y = 8
    this.addChild(this.content)
  }

  showChanges(changes: SymbolChange[]): void {
    this.content.removeChildren()

    changes.forEach((change, i) => {
      const color = CHANGE_COLORS[change.type]
      const prefix = change.type === 'renamed'
        ? `${change.oldName} → ${change.name}`
        : change.name

      const label = new Text({
        text: `${change.type.toUpperCase()} ${change.kind}: ${prefix}`,
        style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fill: color },
      })
      label.x = 8
      label.y = i * 24
      this.content.addChild(label)
    })
  }

  resize(width: number, height: number): void {
    this._width = width
    this._height = height
  }
}
