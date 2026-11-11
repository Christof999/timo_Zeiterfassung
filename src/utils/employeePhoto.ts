import { blobToDataUrl, downscaleImage } from './imageFile'

/** Nur das kleine Vorschaubild speichern; das Original verlässt das Gerät nicht. */
export async function prepareEmployeePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild auswählen.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Das Bild darf höchstens 10 MB groß sein.')
  const preview = await downscaleImage(file, 256, 0.8)
  if (preview === file) throw new Error('Das Bild konnte nicht verkleinert werden. Bitte ein anderes Bild wählen.')
  const image = await blobToDataUrl(preview)
  if (!image.startsWith('data:image/jpeg;base64,') || image.length > 80_000) throw new Error('Das Bild konnte nicht ausreichend verkleinert werden. Bitte ein anderes Bild wählen.')
  return image
}
