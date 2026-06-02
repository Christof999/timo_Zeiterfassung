import type { FileUpload, TimeEntry } from '../types'

/** Sammelt alle Texte einer Stempelung (Notiz, Live-Doku, Bildkommentare). */
export function collectEntryDocumentation(
  entry: TimeEntry,
  linkedFiles: FileUpload[] = []
): string {
  const parts: string[] = []

  const mainNote = (entry.notes || '').trim()
  if (mainNote) {
    parts.push(mainNote)
  }

  const live = entry.liveDocumentation || []
  for (const block of live) {
    const liveNote = (block.notes || '').trim()
    const by = (block.addedByName || '').trim()
    if (liveNote) {
      parts.push(by ? `${by}: ${liveNote}` : liveNote)
    } else if ((block.photoCount || 0) > 0 || (block.documentCount || 0) > 0) {
      const counts = `${block.photoCount || 0} Fotos, ${block.documentCount || 0} Dok.`
      parts.push(by ? `${by}: (${counts})` : `(${counts})`)
    }
  }

  for (const file of linkedFiles) {
    const comment = (file.imageComment || file.notes || '').trim()
    if (!comment) continue
    const isDoc =
      file.fileType === 'invoice' ||
      file.fileType === 'delivery_note' ||
      file.fileType === 'document'
    const prefix = isDoc ? 'Dokument' : 'Foto'
    const name = (file.fileName || '').trim()
    parts.push(name ? `[${prefix} ${name}] ${comment}` : `[${prefix}] ${comment}`)
  }

  return parts.join('\n')
}
