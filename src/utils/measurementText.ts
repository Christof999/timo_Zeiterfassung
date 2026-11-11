import type { LvPosition } from '../types/inspection'

const round = (n: number): number => Math.round(n * 10000) / 10000
const clean = (text: string): string => text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u00a0\u2009\u202f]/g, ' ')

/** Kleiner Rechenparser für Aufmaß-Ausdrücke, ohne eval oder ausführbaren Code. */
export function evaluateMeasurement(expression: string): number {
  const normalized = clean(expression).replace(/,/g, '.').replace(/[×xX·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+*/-]/g) || []
  if (tokens.join('') !== normalized.replace(/\s/g, '') || tokens.length > 500) throw new Error('Rechenzeile nicht erkannt')
  let i = 0
  function atom(): number {
    const token = tokens[i++]
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom()
    if (token === '(') {
      const result = sum()
      if (tokens[i++] !== ')') throw new Error('Schließende Klammer fehlt')
      return result
    }
    if (!token || !/^\d/.test(token)) throw new Error('Zahl fehlt')
    return Number(token)
  }
  function product(): number {
    let result = atom()
    while (tokens[i] === '*' || tokens[i] === '/') {
      const op = tokens[i++]
      const right = atom()
      if (op === '/' && right === 0) throw new Error('Division durch null')
      result = op === '*' ? result * right : result / right
    }
    return result
  }
  function sum(): number {
    let result = product()
    while (tokens[i] === '+' || tokens[i] === '-') {
      const op = tokens[i++]
      result += (op === '+' ? 1 : -1) * product()
    }
    return result
  }
  const result = sum()
  if (i !== tokens.length || !Number.isFinite(result)) throw new Error('Ungültiger Ausdruck')
  return round(result)
}

const inferUnit = (name: string): string => {
  if (/manschett|ecken?\b/i.test(name)) return 'Stück'
  if (/schiene|sockel|dicht\s*band/i.test(name)) return 'lfm'
  if (/wand|boden|fliesen|voranstrich|abdichtung/i.test(name)) return 'm²'
  return ''
}

export function deriveMeasurementPositions(text: string): { positions: LvPosition[]; notices: string[] } {
  const positions: LvPosition[] = []
  const notices: string[] = []
  let current: LvPosition | null = null
  let group = ''
  const invalid = new Set<string>()
  const heading = (name: string) => {
    const position: LvPosition = { id: `aufmass-${positions.length + 1}`, shortText: name, quantity: null, unit: inferUnit(name), longText: '', ...(group ? { group } : {}) }
    positions.push(position)
    current = position
  }
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = clean(original).trim()
    if (!line || /^aufma(?:ß|ss)(?:\s|$)/i.test(line)) continue
    const section = line.replace(/\bund\b/g, '').trim()
    if (/[A-ZÄÖÜ]/.test(section) && /^[A-ZÄÖÜ\s,/-]+$/.test(section)) { group = line; current = null; continue }
    const start = line.search(/(?:^|\s)(?=[(\d]|[−–+-]\s*[\d(])/)
    if (start < 0) { heading(line); continue }
    const name = line.slice(0, start).trim()
    if (name) heading(name)
    if (!current) heading('Nicht zugeordnete Maße')
    // Die Position wird von heading gesetzt; kein Zustandswechsel beim Berechnen.
    const position = positions[positions.length - 1]
    const formula = line.slice(start).trim()
    position.longText = [position.longText, original.trim()].filter(Boolean).join('\n')
    const count = /^(\d+(?:[,.]\d+)?)\s*(?:x|stück|stk\.?)$/i.exec(formula)
    try {
      const left = count ? count[1] : formula.split('=')[0].trim()
      const quantity = evaluateMeasurement(left)
      if (count) position.unit = 'Stück'
      if (!invalid.has(position.id)) position.quantity = round((position.quantity || 0) + quantity)
      if (formula.includes('=')) {
        const right = formula.split('=').slice(1).join('=').trim()
        const entered = evaluateMeasurement(right)
        const decimals = /[,.](\d+)/.exec(right)?.[1].length || 0
        if (Math.abs(entered - quantity) > Math.max(0.00006, 0.5 * 10 ** -decimals + 0.00001)) {
          notices.push(`Zeile ${index + 1}: Eingetragenes Ergebnis ${right} weicht ab. Berechnet: ${quantity.toLocaleString('de-DE')}.`)
        }
      }
    } catch {
      position.quantity = null
      invalid.add(position.id)
      notices.push(`Zeile ${index + 1}: „${formula}“ bitte prüfen und Menge manuell ergänzen.`)
    }
  }
  return { positions, notices }
}

export function measurementOfferLines(positions: LvPosition[]) {
  if (!positions.length || positions.some((p) => !p.shortText.trim() || p.quantity === null || !Number.isFinite(p.quantity) || p.quantity <= 0 || !p.unit.trim())) {
    throw new Error('Bitte für jede Position eine Bezeichnung, positive Menge und Einheit ergänzen.')
  }
  return positions.map((p) => ({
    id: p.id, lineKind: 'article', articleId: '',
    description: [p.group, p.shortText, p.longText].filter(Boolean).join('\n'),
    quantity: p.quantity, unit: p.unit, unitPriceNet: 0, unitPriceGross: 0,
    totalPriceNet: 0, totalPriceGross: 0, taxRate: 19
  }))
}
