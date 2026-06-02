import type { FileUpload } from '../types'

/** Kleine Referenz für Firestore (kein Base64 — vermeidet 1-MiB-Dokumentlimit). */
export function toFileUploadRef(upload: FileUpload): {
  id: string
  fileName?: string
  fileType?: string
  filePath?: string
  imageComment?: string
} {
  return {
    id: upload.id,
    fileName: upload.fileName,
    fileType: upload.fileType,
    filePath: upload.filePath || undefined,
    imageComment: upload.imageComment || undefined
  }
}

export function stripBase64FromUploadReturn(upload: FileUpload): FileUpload {
  const { base64Data: _removed, ...rest } = upload
  return rest
}
