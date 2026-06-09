/**
 * Cliente para upload de imágenes a Cloudinary usando "unsigned uploads".
 *
 * El frontend POSTea directo a Cloudinary — el backend no se entera ni
 * intermedia. Funciona porque el `upload_preset` está configurado en modo
 * "unsigned" en el dashboard de Cloudinary, con restricciones (tipos de
 * archivo permitidos, tamaño máximo, folder).
 *
 * Las URLs devueltas son CDN-stable y se guardan tal cual en
 * `content.posterUrl` / `content.backdropUrl`.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super('Faltan VITE_CLOUDINARY_CLOUD_NAME o VITE_CLOUDINARY_UPLOAD_PRESET en el .env.')
    this.name = 'CloudinaryNotConfiguredError'
  }
}

export class CloudinaryUploadError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
    this.name = 'CloudinaryUploadError'
  }
}

export interface UploadResult {
  secureUrl: string         // ej. https://res.cloudinary.com/ddi0npc6d/image/upload/v1717.../folder/abc.jpg
  publicId: string          // ej. reviewhub/covers/posters/abc
  width: number
  height: number
  format: string            // jpg, png, webp
  bytes: number
}

export interface UploadOptions {
  /**
   * Sub-carpeta dentro del preset (ej. 'posters' o 'backdrops'). Si el preset
   * ya define una carpeta base, esto se concatena adentro.
   */
  folder?: string
  /** Callback de progreso, 0-100. */
  onProgress?: (percent: number) => void
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET)
}

/**
 * Sube un File a Cloudinary y devuelve la URL pública. Usa XMLHttpRequest
 * (no fetch) porque fetch no expone progreso de upload — para una
 * carátula puede no importar, pero la cara del progreso es lo que hace
 * sentir al usuario que algo está pasando.
 */
export function uploadImage(file: File, opts: UploadOptions = {}): Promise<UploadResult> {
  if (!isCloudinaryConfigured()) throw new CloudinaryNotConfiguredError()

  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('upload_preset', UPLOAD_PRESET as string)
    if (opts.folder) form.append('folder', opts.folder)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = `Cloudinary HTTP ${xhr.status}`
        try {
          const body = JSON.parse(xhr.responseText) as { error?: { message?: string } }
          if (body.error?.message) msg = body.error.message
        } catch {
          /* ignore */
        }
        reject(new CloudinaryUploadError(msg, xhr.status))
        return
      }
      try {
        const body = JSON.parse(xhr.responseText) as {
          secure_url: string
          public_id: string
          width: number
          height: number
          format: string
          bytes: number
        }
        resolve({
          secureUrl: body.secure_url,
          publicId: body.public_id,
          width: body.width,
          height: body.height,
          format: body.format,
          bytes: body.bytes,
        })
      } catch (e) {
        reject(new CloudinaryUploadError('Respuesta de Cloudinary inválida'))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new CloudinaryUploadError('Error de red al subir a Cloudinary'))
    })
    xhr.addEventListener('abort', () => {
      reject(new CloudinaryUploadError('Upload cancelado'))
    })

    xhr.send(form)
  })
}

/**
 * Genera una URL "transformada" a partir de una URL original de Cloudinary.
 * Útil para pedir un tamaño específico sin que el backend lo sepa.
 *
 * Ejemplo:
 *   transform('https://res.cloudinary.com/x/image/upload/v123/path.jpg', 'w_500,h_750,c_fill')
 *   → 'https://res.cloudinary.com/x/image/upload/w_500,h_750,c_fill/v123/path.jpg'
 *
 * Si la URL no es de Cloudinary, la devuelve tal cual (no rompe nada para
 * carátulas viejas que apuntan a TMDb/weserv).
 */
export function transform(url: string, transformations: string): string {
  const marker = '/image/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  return url.slice(0, idx + marker.length) + transformations + '/' + url.slice(idx + marker.length)
}
