/**
 * Positionen des Leistungsverzeichnisses mit dem Artikelstamm abgleichen.
 *
 * Die KI ordnet beim Erzeugen schon zu; dieser Abgleich greift für Positionen,
 * die von Hand dazukommen oder für die die KI nichts gefunden hat. Er ist
 * bewusst vorsichtig: lieber kein Vorschlag als ein falscher Artikel im Angebot.
 */

export interface CatalogArticle {
  id: string
  name: string
  unit: string
  articleNumber?: string
}

const STOPWORDS = new Set([
  'und', 'mit', 'ohne', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines',
  'inkl', 'einschl', 'einschließlich', 'incl', 'für', 'fuer', 'von', 'vom', 'zum', 'zur', 'auf', 'aus',
  'bis', 'als', 'bzw', 'oder', 'sowie', 'liefern', 'herstellen', 'fachgerecht', 'nach', 'bei'
])

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function tokens(text: string): string[] {
  return [...new Set(normalize(text).split(' ').filter((t) => t.length >= 3 && !STOPWORDS.has(t)))]
}

/** Wie gut passt ein Artikelname zum Positionstext (0…1)? */
export function matchScore(positionText: string, articleName: string): number {
  const articleTokens = tokens(articleName)
  if (articleTokens.length === 0) return 0
  const positionTokens = new Set(tokens(positionText))
  const hits = articleTokens.filter((t) => positionTokens.has(t))
  // Ein Treffer muss ein echtes Fachwort sein, nicht nur „Wand“ oder „Bad“.
  if (!hits.some((t) => t.length >= 5)) return 0
  return hits.length / articleTokens.length
}

export const MATCH_THRESHOLD = 0.6

/** Bester Artikel für einen Positionstext, oder null, wenn keiner sicher genug passt. */
export function bestArticleMatch<T extends CatalogArticle>(positionText: string, catalog: T[]): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const article of catalog) {
    const score = matchScore(positionText, article.name)
    if (score > bestScore) {
      best = article
      bestScore = score
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null
}
