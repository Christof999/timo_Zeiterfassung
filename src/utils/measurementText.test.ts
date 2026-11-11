import { describe, expect, it } from 'vitest'
import { deriveMeasurementPositions, evaluateMeasurement, measurementOfferLines } from './measurementText'

const example = `Aufmaß Franken,wohnheim, Oster Howser Straße 7, erstes OG links

Bad Wand und Voranstrich
(0,9 + 3,58)× 2,01‎ = 9,0048
1,38 × 2,01‎ = 2,774
-1,06 × 1,19‎ = -1,261
1,06 × 0,18‎ = 0,191
1,19 × 0,18 ‎ = 0,214
0,25 × 0,75‎ = 0,188
0,75 × 2,00‎ = 1,5
0,24 × 0,57‎ = 0,137
0,23 × 0,75‎ = 0,173
0,56 × 2,01‎ = 1,126
0,11 × 2,01‎ = 0,221
(0,78 + 1,57)× 2,32‎ = 5,452
0,60 × 0,09‎ = 0,054
0,47 × 0,09 ‎ = 0,0423
0,53 × 2,01‎ = 1,0653
0,10 × 0,10‎ = 0,01
0,97 × 2,01 ‎ = 1,95
0,24 × 2,01‎ = 0,482

Kunststoffschienen 0,09 + 3,58 + 1,07 + 1,20 + 0,18 + 0,57 + 0,59 + 0,26 + 0,20 + 0,57 + 2,01 + 0,57+ 0,75 + 2,32 + 0,14 + 0,10 + 0,09 + 0,47 + 0,60 + 0,55 + 2,01 + 0,81 + 0,10 + 0,17 + 0,14 + 2,01‎ = 21,15

Kunststoff Außenecke 5x
Edelstahlschiene Winkel 0,78

Abdichtung Wand
(0,80 +0,80 ) × 2,32‎ = 3,712

Abdichtung Boden
1,07 × 0,99‎ = 1,0593
1,61 × 2,45‎ = 3,945

Dicht Band
3,40 + 1,38 + 0,75 + 0,56 + 0,13 + 0,80 + 1,56 + 0,73 + 0,88 + 0,45+ 0,81 + 0,10 + 0,17 + 0,15 + 2,32‎ = 14,19

Dichtmanschettenwand
2x

Innen Außen Ecken
17x

Vormauerumgen
Duschwanne einmauern
Spülkasten Ablagen

KÜCHE WAND und BODEN

Küche, Wand, Fliesen und voranstrich
(0,60 + 3,40 + 0,30)× 0,60‎ = 2,58

Kunststoffschiene weiß 0,60
Bodenfliesen + voranstrich  3,40 × 2,32‎ = 7,888

Sockel
0,66 + 3,40 + 2,31 + 0,10 + 3,26 + 0,77‎ = 10,5

Edelstahlschiene
0,90`

describe('Aufmaß aus Freitext', () => {
  it('leitet das vollständige Kundenbeispiel mit ungerundeten Rechensummen ab', () => {
    const { positions, notices } = deriveMeasurementPositions(example)
    expect(positions, JSON.stringify(positions.map((p) => p.shortText))).toHaveLength(17)
    const quantities = Object.fromEntries(positions.map((p) => [p.shortText, p.quantity]))
    expect(quantities).toMatchObject({
      'Bad Wand und Voranstrich': 23.3214,
      Kunststoffschienen: 21.15,
      'Kunststoff Außenecke': 5,
      'Edelstahlschiene Winkel': 0.78,
      'Abdichtung Wand': 3.712,
      'Abdichtung Boden': 5.0038,
      'Dicht Band': 14.19,
      Dichtmanschettenwand: 2,
      'Innen Außen Ecken': 17,
      Vormauerumgen: null,
      'Duschwanne einmauern': null,
      'Spülkasten Ablagen': null,
      'Küche, Wand, Fliesen und voranstrich': 2.58,
      'Kunststoffschiene weiß': 0.6,
      'Bodenfliesen + voranstrich': 7.888,
      Sockel: 10.5,
      Edelstahlschiene: 0.9
    })
    expect(notices).toEqual([])
    expect(positions.find((p) => p.shortText === 'Sockel')).toMatchObject({ group: 'KÜCHE WAND und BODEN', unit: 'lfm' })
    expect(positions[0].longText).toContain('-1,06 × 1,19')
  })
  it('rechnet Punkt vor Strich, Klammern, Dezimalkomma und negative Abzüge', () => {
    expect(evaluateMeasurement('(0,9 + 3,58) × 2,01')).toBe(9.0048)
    expect(evaluateMeasurement('10 - 2 × 3')).toBe(4)
    expect(evaluateMeasurement('−1,06 × 1,19')).toBe(-1.2614)
    expect(evaluateMeasurement('(2 + 1) / 2')).toBe(1.5)
  })
  it.each(['1/0', '2 ** 3', 'alert(1)', '2;3', '(2+3', '2+'])('weist ungültige Ausdrücke zurück: %s', (input) => {
    expect(() => evaluateMeasurement(input)).toThrow()
  })
  it('zeigt falsche eingetippte Ergebnisse und unlesbare Rechenwege an', () => {
    const result = deriveMeasurementPositions('Bad Wand\n2 × 3 = 9\n\nSockel\n2 + ?\n3')
    expect(result.positions[0].quantity).toBe(6)
    expect(result.positions[1].quantity).toBeNull()
    expect(result.notices).toHaveLength(2)
  })
  it('erfindet für fehlende Mengen keine Angebotsmengen oder Preise', () => {
    const { positions } = deriveMeasurementPositions('Duschwanne einmauern')
    expect(() => measurementOfferLines(positions)).toThrow()
    const lines = measurementOfferLines([{ ...positions[0], quantity: 1, unit: 'pauschal' }])
    expect(lines[0]).toMatchObject({ quantity: 1, unit: 'pauschal', unitPriceNet: 0, totalPriceNet: 0, articleId: '' })
  })
})
