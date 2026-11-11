interface ManualEntryNote {
  notes?: unknown
  manualTimeEntry?: unknown
  manualTimeEntryAddedByDisplayName?: unknown
}

/** Entfernt nur eigenständige, automatisch angehängte Nachtrag-Vermerke. */
export function cleanManualEntryNotes(entry: ManualEntryNote): string {
  const note = typeof entry.notes === 'string' ? entry.notes : ''
  const markers = new Set(['Nachtrag durch Administrator'])
  if (entry.manualTimeEntry === true && typeof entry.manualTimeEntryAddedByDisplayName === 'string') {
    markers.add(`Nachtrag durch ${entry.manualTimeEntryAddedByDisplayName}`)
  }
  const parts = note.split(/\s+\|\s+/)
  const remaining = parts.filter((part) => !markers.has(part.trim()))
  return remaining.length === parts.length ? note : remaining.join(' | ').trim()
}
