import type { FileUpload } from '../types'

/** Kleine Referenz für Firestore (kein Base64 — vermeidet 1-MiB-Dokumentlimit). */
export function toFileUploadRef(upload: FileUpload): {
  id: string
  fileName?: string
  fileType?: string
  filePath?: string
  imageComment?: string
} {
  // Firestore (ohne ignoreUndefinedProperties) lehnt undefined-Felder ab.
  // Daher nur tatsächlich vorhandene Felder übernehmen.
  const ref: {
    id: string
    fileName?: string
    fileType?: string
    filePath?: string
    imageComment?: string
  } = { id: upload.id }

  if (upload.fileName) ref.fileName = upload.fileName
  if (upload.fileType) ref.fileType = upload.fileType
  if (upload.filePath) ref.filePath = upload.filePath
  if (upload.imageComment) ref.imageComment = upload.imageComment

  return ref
}

export function stripBase64FromUploadReturn(upload: FileUpload): FileUpload {
  const { base64Data: _removed, ...rest } = upload
  return rest
}
