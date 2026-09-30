import { describe, expect, it } from 'vitest'
import { buildLvText, isUsableLvText } from './lvText'

const pos = (shortText: string, group?: string, longText?: string) => ({
  id: shortText,
  shortText,
  group,
  longText,
  quantity: 1,
  unit: 'psch'
})

describe('buildLvText', () => {
  it('fasst Positionen eines Abschnitts zusammen und nummeriert die Abschnitte', () => {
    const text = buildLvText('Leistungsverzeichnis - Fliesenarbeiten Bad', [
      pos('Baustelleneinrichtung', 'Vorbereitung', 'Baustelle einrichten und Wohnung schützen.'),
      pos('Fliesen abbrechen', 'Vorbereitung', 'Alte Wandfliesen entfernen und entsorgen.'),
      pos('Verbundabdichtung', 'Abdichtung', 'Wand- und Bodenflächen abdichten.')
    ])
    expect(text).toBe(
      'Leistungsverzeichnis - Fliesenarbeiten Bad\n\n' +
        '1. Vorbereitung\nBaustelle einrichten und Wohnung schützen. Alte Wandfliesen entfernen und entsorgen.\n\n' +
        '2. Abdichtung\nWand- und Bodenflächen abdichten.'
    )
    expect(isUsableLvText(text)).toBe(true)
  })

  it('macht ohne Abschnitte jede Position zu einem Abschnitt', () => {
    const text = buildLvText(undefined, [pos('Silikonfugen erneuern'), pos('Reinigung', undefined, 'Baustelle besenrein übergeben.')])
    expect(text).toBe('Leistungsverzeichnis\n\n1. Silikonfugen erneuern\n\n2. Reinigung\nBaustelle besenrein übergeben.')
  })

  it('erkennt eine bloße Überschrift nicht als Leistungsverzeichnis', () => {
    expect(isUsableLvText('Leistungsverzeichnis - Bad')).toBe(false)
    expect(isUsableLvText('')).toBe(false)
  })
})
