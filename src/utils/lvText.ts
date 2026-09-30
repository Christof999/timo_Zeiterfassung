import type { LvPosition } from '../types/inspection'

/**
 * Leistungsverzeichnis als Text, gebaut aus den Positionen.
 *
 * Normalerweise schreibt die KI eine ausformulierte Leistungsbeschreibung.
 * Fehlt sie – ältere Besichtigung, leere Antwort –, entsteht hier derselbe
 * Aufbau aus den Positionen: Überschrift, dann nummerierte Abschnitte mit den
 * Langtexten. So steht im Anschreiben des Angebots immer ein vollständiges
 * Leistungsverzeichnis. Gleiche Regeln im Rechnungsprogramm
 * (src/services/inspectionService.ts, buildLvText).
 */
export function buildLvText(title: string | undefined, positions: LvPosition[]): string {
  const items = positions.filter((p) => p.shortText.trim())
  if (items.length === 0) return ''

  const sections: { heading: string; sentences: string[] }[] = []
  for (const p of items) {
    const group = (p.group || '').trim()
    const sentence = (p.longText || '').trim() || p.shortText.trim()
    const last = sections[sections.length - 1]
    if (group && last?.heading === group) {
      last.sentences.push(sentence)
    } else {
      sections.push({ heading: group || p.shortText.trim(), sentences: [sentence] })
    }
  }

  const body = sections.map((s, i) => {
    const text = s.sentences.filter((t) => t !== s.heading).join(' ')
    return text ? `${i + 1}. ${s.heading}\n${text}` : `${i + 1}. ${s.heading}`
  })
  return [(title || 'Leistungsverzeichnis').trim(), ...body].join('\n\n')
}

/** Taugt der Text als Leistungsverzeichnis – oder ist es nur eine Überschrift? */
export function isUsableLvText(text: string | undefined): boolean {
  const trimmed = (text || '').trim()
  const sections = trimmed.split(/\r?\n/).filter((line) => /^\s*\d{1,2}\.\s+\S/.test(line)).length
  return sections >= 2
}
