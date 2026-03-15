// Regex-based symbol extractor for JavaScript/TypeScript
// Designed to be replaced by tree-sitter when WASM grammars are available

export interface SymbolInfo {
  name: string
  kind: 'function' | 'class' | 'method'
  startLine: number
  endLine: number
  body: string
}

/**
 * Extract function, class, and method symbols from source code.
 * Uses regex-based parsing (tree-sitter can be plugged in later).
 */
export function extractSymbols(source: string, _language: string): SymbolInfo[] {
  if (!source.trim()) return []

  const lines = source.split('\n')
  const symbols: SymbolInfo[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match class declarations
    const classMatch = line.match(/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/)
    if (classMatch) {
      const endLine = findClosingBrace(lines, i)
      const name = classMatch[1]
      const body = lines.slice(i, endLine + 1).join('\n')
      symbols.push({ name, kind: 'class', startLine: i, endLine, body })

      // Extract methods within the class
      extractMethods(lines, i + 1, endLine, symbols)
      continue
    }

    // Match function declarations (including async, export, export default)
    const funcMatch = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/
    )
    if (funcMatch) {
      const endLine = findClosingBrace(lines, i)
      const name = funcMatch[1]
      const body = lines.slice(i, endLine + 1).join('\n')
      symbols.push({ name, kind: 'function', startLine: i, endLine, body })
      continue
    }

    // Match arrow functions assigned to const/let/var
    const arrowMatch = line.match(
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>\s*\{/
    )
    if (arrowMatch) {
      const endLine = findClosingBrace(lines, i)
      const name = arrowMatch[1]
      const body = lines.slice(i, endLine + 1).join('\n')
      symbols.push({ name, kind: 'function', startLine: i, endLine, body })
      continue
    }
  }

  return symbols
}

function extractMethods(lines: string[], start: number, end: number, symbols: SymbolInfo[]): void {
  for (let i = start; i < end; i++) {
    const line = lines[i]
    // Match method declarations: "  methodName(" or "  async methodName("
    const methodMatch = line.match(
      /^\s+(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/
    )
    if (methodMatch && methodMatch[1] !== 'constructor' || methodMatch && methodMatch[1] === 'constructor') {
      if (methodMatch) {
        const name = methodMatch[1]
        const endLine = findClosingBrace(lines, i)
        if (endLine <= end) {
          const body = lines.slice(i, endLine + 1).join('\n')
          symbols.push({ name, kind: 'method', startLine: i, endLine, body })
          i = endLine // Skip past method body
        }
      }
    }
  }
}

function findClosingBrace(lines: string[], startLine: number): number {
  let depth = 0
  let foundOpen = false

  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth++
        foundOpen = true
      } else if (ch === '}') {
        depth--
        if (foundOpen && depth === 0) {
          return i
        }
      }
    }
  }

  // If no closing brace found, return last line
  return lines.length - 1
}
