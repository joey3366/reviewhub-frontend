import { ref, watch, type Ref } from 'vue'

/**
 * Proporción (ancho / alto) de una imagen por URL. null mientras carga o
 * si falla. Cachea por URL para no medir dos veces la misma imagen.
 */
const cache = new Map<string, number>()

export function useImageAspect(url: Ref<string | null | undefined>) {
  const aspect = ref<number | null>(null)

  watch(
    url,
    (u) => {
      aspect.value = null
      if (!u) return
      const cached = cache.get(u)
      if (cached !== undefined) {
        aspect.value = cached
        return
      }
      const img = new Image()
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) return
        const a = img.naturalWidth / img.naturalHeight
        cache.set(u, a)
        if (url.value === u) aspect.value = a
      }
      img.src = u
    },
    { immediate: true }
  )

  return aspect
}
