<script setup lang="ts">
import { useToast, type ToastVariant } from '@/composables/useToast'

/**
 * Container global de toasts. Se monta UNA sola vez en App.vue. Lee la cola
 * desde useToast() y renderiza cada toast con animación de entrada/salida.
 * Posición: bottom-right (no tapa el header ni el contenido principal).
 */

const { toasts, dismiss } = useToast()

function variantStyles(v: ToastVariant) {
  if (v === 'success') {
    return {
      ring: 'ring-emerald-500/20',
      bg: 'bg-emerald-50',
      iconBg: 'bg-emerald-100 text-emerald-700',
      text: 'text-emerald-900',
    }
  }
  if (v === 'error') {
    return {
      ring: 'ring-red-500/20',
      bg: 'bg-red-50',
      iconBg: 'bg-red-100 text-red-700',
      text: 'text-red-900',
    }
  }
  return {
    ring: 'ring-sky-500/20',
    bg: 'bg-sky-50',
    iconBg: 'bg-sky-100 text-sky-700',
    text: 'text-sky-900',
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2"
      role="region"
      aria-label="Notificaciones"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-150 ease-in absolute right-0"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-4"
        move-class="transition duration-200 ease-out"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          :class="[
            'pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg ring-1',
            variantStyles(t.variant).ring,
            variantStyles(t.variant).bg,
          ]"
          role="status"
        >
          <span
            :class="[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              variantStyles(t.variant).iconBg,
            ]"
          >
            <svg v-if="t.variant === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg v-else-if="t.variant === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </span>
          <p :class="['flex-1 text-sm font-medium', variantStyles(t.variant).text]">
            {{ t.message }}
          </p>
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-black/5 hover:text-ink"
            aria-label="Cerrar notificación"
            @click="dismiss(t.id)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
