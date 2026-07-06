import { describe, it, expect } from 'vitest'
import { sanitizeTimeEntryForRead } from './sanitizeTimeEntry'
import type { TimeEntry } from '../types'

const bigJpegBase64 = '/9j/' + 'A'.repeat(600)
const bigDataUrl = 'data:image/png;base64,' + 'B'.repeat(600)

const baseEntry = {
  id: 'entry-1',
  employeeId: 'emp-1',
  projectId: 'proj-1'
} as unknown as TimeEntry

describe('sanitizeTimeEntryForRead', () => {
  it('entfernt base64-Felder aus Foto-Objekten, behält IDs und URLs', () => {
    const entry = {
      ...baseEntry,
      sitePhotos: [
        { id: 'file-1', url: 'https://example.com/a.jpg', base64Data: bigJpegBase64 }
      ]
    } as unknown as TimeEntry

    const clean = sanitizeTimeEntryForRead(entry)
    const photo = (clean.sitePhotos as Record<string, unknown>[])[0]
    expect(photo.id).toBe('file-1')
    expect(photo.url).toBe('https://example.com/a.jpg')
    expect(photo.base64Data).toBeUndefined()
  })

  it('entfernt lange Base64-/data:-Strings aus String-Arrays', () => {
    const entry = {
      ...baseEntry,
      photos: [bigDataUrl, 'file-id-123']
    } as unknown as TimeEntry

    const clean = sanitizeTimeEntryForRead(entry)
    expect((clean.photos as unknown[])[0]).toBeUndefined()
    expect((clean.photos as unknown[])[1]).toBe('file-id-123')
  })

  it('bereinigt Bilder in liveDocumentation-Blöcken, Notizen bleiben erhalten', () => {
    const entry = {
      ...baseEntry,
      liveDocumentation: [
        {
          notes: 'Fliesen verlegt',
          images: [{ id: 'img-1', base64: bigJpegBase64 }],
          documents: [{ id: 'doc-1', data: bigDataUrl }]
        }
      ]
    } as unknown as TimeEntry

    const clean = sanitizeTimeEntryForRead(entry)
    const block = (clean.liveDocumentation as Record<string, unknown>[])[0]
    expect(block.notes).toBe('Fliesen verlegt')
    const img = (block.images as Record<string, unknown>[])[0]
    expect(img.id).toBe('img-1')
    expect(img.base64).toBeUndefined()
    const doc = (block.documents as Record<string, unknown>[])[0]
    expect(doc.id).toBe('doc-1')
    expect(doc.data).toBeUndefined()
  })

  it('lässt Einträge ohne Medien unverändert', () => {
    const clean = sanitizeTimeEntryForRead({ ...baseEntry })
    expect(clean.id).toBe('entry-1')
    expect(clean.sitePhotos).toBeUndefined()
  })
})
