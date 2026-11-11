import { beforeEach, expect, it, vi } from 'vitest'
const images = vi.hoisted(() => ({ downscaleImage: vi.fn(), blobToDataUrl: vi.fn() }))
vi.mock('./imageFile', () => images)
import { prepareEmployeePhoto } from './employeePhoto'

beforeEach(() => { vi.resetAllMocks(); images.downscaleImage.mockResolvedValue(new Blob()); images.blobToDataUrl.mockResolvedValue('data:image/jpeg;base64,YmlsZA==') })

it('speichert nur die komprimierte Vorschau des Fotos', async () => {
  const file = new File(['Original'], 'portrait.png', { type: 'image/png' })
  await expect(prepareEmployeePhoto(file)).resolves.toBe('data:image/jpeg;base64,YmlsZA==')
  expect(images.downscaleImage).toHaveBeenCalledWith(file, 256, 0.8)
})

it('weist andere Dateiformate und zu große Originale ab', async () => {
  await expect(prepareEmployeePhoto(new File(['svg'], 'bild.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPG')
  await expect(prepareEmployeePhoto(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'bild.jpg', { type: 'image/jpeg' }))).rejects.toThrow('10 MB')
  expect(images.downscaleImage).not.toHaveBeenCalled()
})

it('weist fehlgeschlagene Komprimierung ab, statt Originalbilder in Firestore zu speichern', async () => {
  const file = new File(['png'], 'bild.png', { type: 'image/png' })
  for (const result of ['data:image/png;base64,abc', 'data:image/jpeg;base64,' + 'a'.repeat(80000)]) {
    images.blobToDataUrl.mockResolvedValueOnce(result)
    await expect(prepareEmployeePhoto(file)).rejects.toThrow('verkleinert')
  }
  images.downscaleImage.mockResolvedValueOnce(file)
  await expect(prepareEmployeePhoto(file)).rejects.toThrow('verkleinert')
})
