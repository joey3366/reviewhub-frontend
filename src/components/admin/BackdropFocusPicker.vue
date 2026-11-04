<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import {
  AUTO_CONTAIN_BELOW,
  DEFAULT_FOCUS_X,
  DEFAULT_FOCUS_Y,
  resolveFit,
  type BackdropFit,
} from '@/lib/backdrop'
import { useImageAspect } from '@/composables/useImageAspect'
import BackdropLayer from '@/components/content/BackdropLayer.vue'

/**
 * Ajuste + punto de enfoque del backdrop.
 *
 * - Ajuste: Automático (según proporción) / Llenar (cover) / Completa (contain).
 * - Foco (solo aplica a Llenar): tocás / arrastrás sobre la imagen ENTERA.
 * - Vistas previas en vivo con el MISMO componente que el banner real
 *   (BackdropLayer), en forma de escritorio y de celular.
 *
 * x / y: enteros 0–100 o null (default). fit: 'cover' | 'contain' | null (auto).
 */
const props = defineProps<{
  url: string
  x: number | null
  y: number | null
  fit: BackdropFit | null
}>()

const emit = defineEmits<{
  'update:x': [value: number | null]
  'update:y': [value: number | null]
  'update:fit': [value: BackdropFit | null]
}>()

const imgBox = ref<HTMLElement | null>(null)
const dragging = ref(false)
const loadError = ref(false)

const aspect = useImageAspect(toRef(props, 'url'))
const mode = computed(() => resolveFit(props.fit, aspect.value))

const isDefaultFocus = computed(() => props.x === null && props.y === null)
const fx = computed(() => props.x ?? DEFAULT_FOCUS_X)
const fy = computed(() => props.y ?? DEFAULT_FOCUS_Y)

const FIT_LABEL: Record<BackdropFit, string> = { cover: 'Llenar', contain: 'Completa' }
const fitOptions: Array<{ value: BackdropFit | null; label: string }> = [
  { value: null, label: 'Automático' },
  { value: 'cover', label: 'Llenar' },
  { value: 'contain', label: 'Completa' },
]

const autoHint = computed(() => {
  if (aspect.value === null) return 'Midiendo la imagen…'
  const ratio = `${aspect.value.toFixed(2)}:1`
  const why =
    aspect.value < AUTO_CONTAIN_BELOW
      ? 'casi cuadrada: llenar el banner la agrandaría demasiado'
      : 'panorámica: llena bien el banner'
  return `Imagen ${ratio} (${why}) → ${FIT_LABEL[mode.value]}`
})

function setFromPointer(e: PointerEvent) {
  const el = imgBox.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)))
  emit('update:x', clamp(((e.clientX - r.left) / r.width) * 100))
  emit('update:y', clamp(((e.clientY - r.top) / r.height) * 100))
}

function onPointerDown(e: PointerEvent) {
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  setFromPointer(e)
}
function onPointerMove(e: PointerEvent) {
  if (dragging.value) setFromPointer(e)
}
function onPointerUp() {
  dragging.value = false
}

function resetFocus() {
  emit('update:x', null)
  emit('update:y', null)
}
</script>

<template>
  <div class="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
    <!-- Ajuste -->
    <div class="flex flex-col gap-2">
      <span class="text-sm font-medium text-white">Ajuste del backdrop</span>
      <div
        class="inline-flex w-fit rounded-full border border-white/15 bg-black/30 p-1"
        role="radiogroup"
        aria-label="Ajuste del backdrop"
      >
        <button
          v-for="opt in fitOptions"
          :key="opt.label"
          type="button"
          role="radio"
          :aria-checked="fit === opt.value"
          class="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors"
          :class="fit === opt.value ? 'bg-amber-400 text-black' : 'text-white/70 hover:text-white'"
          @click="emit('update:fit', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <span class="text-xs text-white/50">
        <template v-if="fit === null">{{ autoHint }}</template>
        <template v-else-if="fit === 'cover'">
          La imagen llena todo el banner y se recorta alrededor del punto de enfoque.
        </template>
        <template v-else>La imagen se ve entera a la derecha, sobre una versión desenfocada de sí misma.</template>
      </span>
    </div>

    <p v-if="loadError" class="text-xs text-red-300">No se pudo cargar la imagen.</p>

    <!-- Punto de enfoque: solo tiene efecto en modo Llenar -->
    <div v-if="!loadError" v-show="mode === 'cover'" class="flex flex-col gap-2">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-medium text-white">Punto de enfoque</span>
          <span class="text-xs text-white/50">
            Tocá o arrastrá sobre lo más importante (una cara, el logo). El recorte se arma alrededor de ese punto.
          </span>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          :disabled="isDefaultFocus"
          @click="resetFocus"
        >
          Restablecer
        </button>
      </div>

      <div
        ref="imgBox"
        class="relative cursor-crosshair touch-none select-none overflow-hidden rounded-md border border-white/10"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          :src="url"
          alt="Backdrop completo"
          class="block h-auto w-full"
          draggable="false"
          @error="loadError = true"
          @load="loadError = false"
        />
        <div class="pointer-events-none absolute inset-y-0 w-px bg-amber-300/40" :style="{ left: `${fx}%` }" />
        <div class="pointer-events-none absolute inset-x-0 h-px bg-amber-300/40" :style="{ top: `${fy}%` }" />
        <div
          class="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_2px_rgba(0,0,0,0.6)] transition-transform"
          :class="[isDefaultFocus ? 'border-dashed border-white/60' : 'border-amber-300', dragging ? 'scale-125' : '']"
          :style="{ left: `${fx}%`, top: `${fy}%` }"
        >
          <div class="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300" />
        </div>
        <span
          class="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white/80"
        >
          {{ isDefaultFocus ? `default · ${fx}% ${fy}%` : `${fx}% ${fy}%` }}
        </span>
      </div>
    </div>

    <!-- Vistas previas: mismo componente que el banner real -->
    <div v-if="!loadError" class="flex items-end gap-3">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="text-[11px] uppercase tracking-wider text-white/40">Escritorio</span>
        <div class="relative aspect-[2.2/1] w-full overflow-hidden rounded border border-white/10 bg-black">
          <BackdropLayer :url="url" :focus-x="x" :focus-y="y" :fit="fit" :animated="false" />
          <!-- Siluetas del contenido real (póster + título) para juzgar el espacio -->
          <div
            class="pointer-events-none absolute left-[9%] top-[14%] aspect-[2/3] h-[58%] rounded-sm border border-white/25 bg-white/10"
          />
          <div class="pointer-events-none absolute left-[30%] top-[22%] flex w-[34%] flex-col gap-1.5">
            <div class="h-2 w-4/5 rounded bg-white/50" />
            <div class="h-1 w-full rounded bg-white/20" />
            <div class="h-1 w-11/12 rounded bg-white/20" />
            <div class="h-1 w-3/4 rounded bg-white/20" />
          </div>
        </div>
      </div>
      <div class="flex w-20 flex-none flex-col gap-1 sm:w-24">
        <span class="text-[11px] uppercase tracking-wider text-white/40">Celular</span>
        <div class="relative aspect-[7/10] w-full overflow-hidden rounded border border-white/10 bg-black">
          <BackdropLayer :url="url" :focus-x="x" :focus-y="y" :fit="fit" :animated="false" />
          <div
            class="pointer-events-none absolute left-1/2 top-[14%] aspect-[2/3] h-[46%] -translate-x-1/2 rounded-sm border border-white/25 bg-white/10"
          />
        </div>
      </div>
    </div>
  </div>
</template>
