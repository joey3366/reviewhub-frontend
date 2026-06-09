<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Modal de confirmación genérico (reemplazo de window.confirm). Visualmente
 * neutro (card claro centrado sobre dimmer) para que funcione tanto en
 * páginas light como dark sin pelearse con el theme de fondo.
 *
 * Patrón de uso desde la página:
 *   const itemToDelete = ref<X | null>(null)
 *   <ConfirmModal
 *     :open="itemToDelete !== null"
 *     title="..."
 *     :message="itemToDelete ? `...${itemToDelete.title}...` : ''"
 *     confirm-label="Eliminar"
 *     variant="destructive"
 *     @close="itemToDelete = null"
 *     @confirm="performDelete"
 *   />
 *
 * Atajos: Escape cierra, Enter confirma. El padre maneja el estado y la
 * acción — este componente solo emite eventos.
 */

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'destructive'
    loading?: boolean
  }>(),
  {
    confirmLabel: 'Confirmar',
    cancelLabel: 'Cancelar',
    variant: 'default',
    loading: false,
  }
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)

function close() {
  if (props.loading) return
  emit('close')
}
function confirm() {
  if (props.loading) return
  emit('confirm')
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') close()
  // Enter confirma siempre que no estemos dentro de un input/textarea (no aplica
  // acá porque no hay form, pero por hábito).
  if (e.key === 'Enter') confirm()
}
function lockScroll(lock: boolean) {
  document.body.style.overflow = lock ? 'hidden' : ''
}

watch(
  () => props.open,
  (open) => {
    lockScroll(open)
    if (open) setTimeout(() => dialogRef.value?.focus(), 0)
  },
  { immediate: true }
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  lockScroll(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`confirm-title-${title}`"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          tabindex="-1"
          class="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl focus:outline-none"
        >
          <div class="flex items-start gap-3">
            <span
              v-if="variant === 'destructive'"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
                <path d="m10.29 3.86-8.18 14.18A2 2 0 0 0 3.83 21h16.34a2 2 0 0 0 1.72-2.96L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <h2 :id="`confirm-title-${title}`" class="text-base font-semibold text-ink">
                {{ title }}
              </h2>
              <p class="mt-1.5 text-sm text-ink-muted">{{ message }}</p>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              class="h-10 rounded-md border border-outline px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle disabled:opacity-50"
              :disabled="loading"
              @click="close"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              :class="
                variant === 'destructive'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-accent hover:bg-accent-hover'
              "
              :disabled="loading"
              @click="confirm"
            >
              <span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
