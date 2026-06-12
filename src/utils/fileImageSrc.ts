import type { FileUpload } from '../types'

/** Bild-URL für Anzeige (Firebase Storage, Base64 oder Legacy-Felder). */
export function getFileImageSrc(file: FileUpload | Record<string, unknown>): string {
  const f = file as FileUpload & { url?: string; fileUrl?: string }
  const base64 = f.base64Data || (f as any).base64 || ''
  if (base64) {
    if (String(base64).startsWith('data:')) return String(base64)
    const mime = f.mimeType || 'image/jpeg'
    return `data:${mime};base64,${base64}`
  }
  const path = f.filePath || f.fileUrl || f.url || ''
  if (path && (path.startsWith('http') || path.startsWith('https') || path.startsWith('data:'))) {
    return path
  }
  return ''
}
