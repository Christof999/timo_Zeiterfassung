import { describe, expect, it } from 'vitest'
import { cleanManualEntryNotes } from './manualEntryNotes'

describe('Bereinigung alter Nachtragnotizen', () => {
  it.each([
    ['Nachtrag durch Administrator', ''],
    ['Fliesen verlegt | Nachtrag durch Administrator', 'Fliesen verlegt'],
    ['Fliesen verlegt | Nachtrag durch Administrator | Fugen geprüft', 'Fliesen verlegt | Fugen geprüft'],
    ['Nachtrag durch Administrator | Nachtrag durch Administrator', ''],
    ['  Nachtrag durch Administrator  ', ''],
    ['Grund: Nachtrag durch Administrator wegen fehlender Stempelung', 'Grund: Nachtrag durch Administrator wegen fehlender Stempelung'],
    ['  Fliesen verlegt\nFugen geprüft  ', '  Fliesen verlegt\nFugen geprüft  '],
    ['Eine Notiz | zweite Notiz', 'Eine Notiz | zweite Notiz']
  ])('bereinigt %s ohne eigene Kommentare zu löschen', (notes, expected) => {
    expect(cleanManualEntryNotes({ notes })).toBe(expected)
  })
  it('bereinigt andere Namen nur bei bestätigten Nachträgen', () => {
    const entry = { notes: 'Arbeit | Nachtrag durch Max', manualTimeEntry: true, manualTimeEntryAddedByDisplayName: 'Max' }
    expect(cleanManualEntryNotes(entry)).toBe('Arbeit')
    expect(cleanManualEntryNotes({ ...entry, manualTimeEntry: false })).toBe(entry.notes)
  })
  it('ist wiederholbar und verändert keine Audit-Metadaten', () => {
    const entry = { notes: 'Arbeit | Nachtrag durch Administrator', manualTimeEntry: true, manualTimeEntryAddedByDisplayName: 'Administrator' }
    const copy = { ...entry }
    const notes = cleanManualEntryNotes(entry)
    expect(cleanManualEntryNotes({ ...entry, notes })).toBe(notes)
    expect(entry).toEqual(copy)
  })
})
