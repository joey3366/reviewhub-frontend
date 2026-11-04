<script setup lang="ts">
import { computed, toRef } from 'vue'
import { backdropPosition, resolveFit, type BackdropFit } from '@/lib/backdrop'
import { useImageAspect } from '@/composables/useImageAspect'

/**
 * Fondo del banner de un título. Llena su contenedor (que debe ser
 * `relative`/`absolute` con tamaño). Lo usan el banner real del detalle y
 * las vistas previas del admin, así la vista previa es exactamente lo que
 * se va a ver.
 *
 * Dos modos (ver lib/backdrop):
 *  - cover:   la imagen llena todo y se recorta alrededor del foco.
 *  - contain: la imagen entera pegada a la derecha (donde no hay texto),
 *             fundida con un degradado, sobre una copia desenfocada de sí
 *             misma que rellena el resto.
 */
const props = withDefaults(
  defineProps<{
    url: string
    focusX?: number | null
    focusY?: number | null
    fit?: BackdropFit | null
    /** Ken Burns. Apagado en las vistas previas. */
    animated?: boolean
    /** Degradados para que el texto encima se lea. */
    overlays?: boolean
  }>(),
  { focusX: null, focusY: null, fit: null, animated: true, overlays: true }
)

const aspect = useImageAspect(toRef(props, 'url'))
const mode = computed(() => resolveFit(props.fit, aspect.value))
const position = computed(() =>
  backdropPosition({ backdropFocusX: props.focusX, backdropFocusY: props.focusY })
)

// Caja de la imagen completa en modo contain: el mayor rectángulo con la
// proporción de la imagen que entra en el contenedor (unidades cq* = % del
// contenedor; el padre declara container-type: size).
const containBox = computed(() => {
  const a = aspect.value ?? 1
  return {
    width: `min(100cqw, calc(100cqh * ${a}))`,
    height: `min(100cqh, calc(100cqw / ${a}))`,
  }
})
</script>

<template>
  <div class="absolute inset-0 overflow-hidden" style="container-type: size">
    <!-- Modo cover -->
    <div
      v-if="mode === 'cover'"
      class="absolute inset-0 bg-cover"
      :class="animated && 'ken-burns'"
      :style="{
        backgroundImage: `url(${url})`,
        backgroundPosition: position,
        // El zoom se acerca hacia el punto de enfoque, no al centro.
        transformOrigin: position,
      }"
    />

    <!-- Modo contain -->
    <template v-else>
      <div
        class="contain-fill absolute -inset-[10%] bg-cover bg-center"
        :class="animated && 'ken-burns'"
        :style="{ backgroundImage: `url(${url})` }"
      />
      <div
        v-if="aspect !== null"
        class="contain-image absolute right-0 top-0 bg-cover bg-center"
        :style="{ backgroundImage: `url(${url})`, ...containBox }"
      />
    </template>

    <template v-if="overlays">
      <div class="absolute inset-0 bg-gradient-to-r from-black via-black/70 via-40% to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black to-transparent" />
      <div class="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
    </template>
  </div>
</template>

<style scoped>
@keyframes kenBurns {
  0% { transform: scale(1.02) translate(0, 0); }
  50% { transform: scale(1.07) translate(-1%, -0.75%); }
  100% { transform: scale(1.02) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 32s ease-in-out infinite;
}

/* Copia desenfocada que rellena el espacio alrededor de la imagen. */
.contain-fill {
  filter: blur(40px) brightness(0.55) saturate(1.25);
}

/* La imagen completa se funde por la izquierda y por abajo. */
.contain-image {
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 35%),
    linear-gradient(to top, transparent 0%, #000 22%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 35%),
    linear-gradient(to top, transparent 0%, #000 22%);
  mask-composite: intersect;
}

@media (prefers-reduced-motion: reduce) {
  .ken-burns {
    animation: none;
  }
}
</style>
