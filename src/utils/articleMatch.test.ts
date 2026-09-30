import { describe, expect, it } from 'vitest'
import { bestArticleMatch, matchScore } from './articleMatch'

const catalog = [
  { id: 'a1', name: 'Verbundabdichtung Wand', unit: 'm²' },
  { id: 'a2', name: 'Bodenfliesen verlegen Dünnbett', unit: 'm²' },
  { id: 'a3', name: 'Silikonfuge', unit: 'm' },
  { id: 'a4', name: 'Baustelleneinrichtung', unit: 'Pauschal' }
]

describe('articleMatch', () => {
  it('findet den passenden Artikel auch mit Umlauten und Zusatzwörtern', () => {
    expect(bestArticleMatch('Bodenfliesen im Dünnbett fachgerecht verlegen', catalog)?.id).toBe('a2')
    expect(bestArticleMatch('Baustelleneinrichtung', catalog)?.id).toBe('a4')
    expect(bestArticleMatch('Silikonfuge an Wanne erneuern', catalog)?.id).toBe('a3')
  })

  it('schlägt nichts vor, wenn nur Allerweltswörter übereinstimmen', () => {
    expect(bestArticleMatch('Wand streichen', catalog)).toBeNull()
    expect(matchScore('Bad Wand', 'Wand')).toBe(0)
  })

  it('verlangt, dass der Großteil des Artikelnamens vorkommt', () => {
    expect(bestArticleMatch('Abdichtung Boden', catalog)).toBeNull()
  })
})
