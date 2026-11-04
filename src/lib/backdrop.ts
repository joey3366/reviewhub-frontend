/**
 * Punto de enfoque del backdrop (0–100 en cada eje).
 *
 * Los banners usan `background-size: cover`, que recorta según la forma
 * de la pantalla. Con `background-position: X% Y%` el navegador alinea
 * el punto X%/Y% de la imagen con el X%/Y% del contenedor, así que lo
 * importante queda dentro del recorte sea panorámico (desktop) o
 * vertical (móvil).
 *
 * Sin foco elegido (null) usamos 50% / 20%: centrado horizontal y un
 * poco arriba, porque en la mayoría de backdrops las caras están en el
 * tercio superior.
 */
export const DEFAULT_FOCUS_X = 50
export const DEFAULT_FOCUS_Y = 20

export interface BackdropFocus {
  backdropFocusX?: number | null
  backdropFocusY?: number | null
}

export function focusOf(c: BackdropFocus | null | undefined) {
  return {
    x: c?.backdropFocusX ?? DEFAULT_FOCUS_X,
    y: c?.backdropFocusY ?? DEFAULT_FOCUS_Y,
  }
}

/** Valor listo para `background-position` / `object-position`. */
export function backdropPosition(c: BackdropFocus | null | undefined): string {
  const { x, y } = focusOf(c)
  return `${x}% ${y}%`
}

// ── Modo de ajuste ────────────────────────────────────────────
//
// 'cover'   → llena el banner y recorta alrededor del foco.
// 'contain' → imagen completa a la derecha + copia desenfocada de fondo.
// null      → automático según la proporción de la imagen.
export type BackdropFit = 'cover' | 'contain'

/**
 * Por debajo de esta proporción (ancho/alto) el automático usa 'contain'.
 * El banner de escritorio ronda 2.2:1; una imagen 16:9 (1.78) recorta
 * poco con cover, pero una casi cuadrada (1.25) se agranda muchísimo.
 */
export const AUTO_CONTAIN_BELOW = 1.6

export function resolveFit(fit: BackdropFit | null | undefined, aspect: number | null): BackdropFit {
  if (fit) return fit
  if (aspect === null) return 'cover'
  return aspect < AUTO_CONTAIN_BELOW ? 'contain' : 'cover'
}
