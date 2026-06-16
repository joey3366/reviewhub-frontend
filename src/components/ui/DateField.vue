<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * Date picker reutilizable que reemplaza al <input type="date"> nativo
 * (feo y dependiente del browser). v-model recibe/emite siempre el string
 * "yyyy-MM-dd" para integrar 1:1 con los lugares que ya usaban input nativo.
 *
 * Modos:
 *  - days  → grilla del mes (default).
 *  - months → 12 meses del año visible. Se entra clickeando el nombre del mes.
 *  - years → bloque de 12 años alrededor del visible. Se entra clickeando el año.
 *
 * Variantes:
 *  - light → para páginas claras (admin).
 *  - dark  → para modales sobre fondo oscuro.
 *
 * El popover es absoluto relativo al wrapper, lo que es suficiente en todos
 * los usos actuales (no aparece dentro de contenedores con overflow-hidden).
 */

const props = withDefaults(
  defineProps<{
    modelValue: string // "yyyy-MM-dd" o ''
    variant?: 'light' | 'dark'
    placeholder?: string
    min?: string // "yyyy-MM-dd" inclusive
    max?: string // "yyyy-MM-dd" inclusive
    ariaLabel?: string
    disabled?: boolean
  }>(),
  {
    variant: 'light',
    placeholder: 'Elegir fecha',
    min: undefined,
    max: undefined,
    ariaLabel: undefined,
    disabled: false,
  }
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const MES_LARGO = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

interface YMD { y: number; m: number; d: number }

function parseIso(iso: string): YMD | null {
  if (!iso) return null
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { y: +match[1], m: +match[2] - 1, d: +match[3] }
}
function toIso({ y, m, d }: YMD): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function todayYMD(): YMD {
  const n = new Date()
  return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }
}
function isOutOfRange(iso: string): boolean {
  if (props.min && iso < props.min) return true
  if (props.max && iso > props.max) return true
  return false
}

const open = ref(false)
const mode = ref<'days' | 'months' | 'years'>('days')
// El mes/año "visible" del calendario; arranca en el seleccionado o en hoy.
const view = ref<{ y: number; m: number }>({ y: 0, m: 0 })
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)

const selected = computed(() => parseIso(props.modelValue))
const today = computed(() => todayYMD())

const displayLabel = computed(() => {
  const s = selected.value
  if (!s) return ''
  return `${String(s.d).padStart(2, '0')}/${String(s.m + 1).padStart(2, '0')}/${s.y}`
})

const headerLabel = computed(() => `${MES_LARGO[view.value.m]} ${view.value.y}`)
const yearsRangeLabel = computed(() => {
  const start = Math.floor(view.value.y / 12) * 12
  return `${start} – ${start + 11}`
})

// Grilla de 42 celdas (6 filas × 7 días). Pre/post-mes con opacity reducida.
interface Cell { y: number; m: number; d: number; current: boolean }
const cells = computed<Cell[]>(() => {
  const { y, m } = view.value
  const firstDay = new Date(y, m, 1)
  // getDay(): 0=domingo. Queremos lunes=0, ..., domingo=6.
  const dowOffset = (firstDay.getDay() + 6) % 7
  const daysThis = new Date(y, m + 1, 0).getDate()
  const daysPrev = new Date(y, m, 0).getDate()
  const out: Cell[] = []
  for (let i = dowOffset - 1; i >= 0; i--) {
    const d = daysPrev - i
    const prev = new Date(y, m - 1, d)
    out.push({ y: prev.getFullYear(), m: prev.getMonth(), d, current: false })
  }
  for (let d = 1; d <= daysThis; d++) out.push({ y, m, d, current: true })
  let nextDay = 1
  while (out.length < 42) {
    const next = new Date(y, m + 1, nextDay)
    out.push({ y: next.getFullYear(), m: next.getMonth(), d: nextDay, current: false })
    nextDay++
  }
  return out
})

const years = computed(() => {
  const start = Math.floor(view.value.y / 12) * 12
  return Array.from({ length: 12 }, (_, i) => start + i)
})

function isSameDay(a: YMD, c: { y: number; m: number; d: number }) {
  return a.y === c.y && a.m === c.m && a.d === c.d
}
function cellSelected(c: Cell) {
  return selected.value !== null && isSameDay(selected.value, c)
}
function cellToday(c: Cell) {
  return isSameDay(today.value, c)
}
function cellDisabled(c: Cell) {
  return isOutOfRange(toIso(c))
}
function pickCell(c: Cell) {
  if (cellDisabled(c)) return
  emit('update:modelValue', toIso(c))
  open.value = false
}

function navMonth(delta: number) {
  const cur = new Date(view.value.y, view.value.m + delta, 1)
  view.value = { y: cur.getFullYear(), m: cur.getMonth() }
}
function navYear(delta: number) {
  view.value = { ...view.value, y: view.value.y + delta }
}
function navYearBlock(delta: number) {
  view.value = { ...view.value, y: view.value.y + delta * 12 }
}
function pickMonth(m: number) {
  view.value = { ...view.value, m }
  mode.value = 'days'
}
function pickYear(y: number) {
  view.value = { ...view.value, y }
  mode.value = 'months'
}

function pickToday() {
  const t = today.value
  const iso = toIso(t)
  if (isOutOfRange(iso)) return
  emit('update:modelValue', iso)
  open.value = false
}
function clear() {
  emit('update:modelValue', '')
  open.value = false
}

function toggleOpen() {
  if (props.disabled) return
  open.value = !open.value
}

watch(open, (o) => {
  if (!o) return
  mode.value = 'days'
  const s = selected.value
  view.value = s ? { y: s.y, m: s.m } : { y: today.value.y, m: today.value.m }
})

function onClickOutside(e: MouseEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (triggerRef.value?.contains(t)) return
  if (popoverRef.value?.contains(t)) return
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  window.removeEventListener('keydown', onKey)
})

// --- Estilos por variante: agrupados acá para que el template quede legible.
const styles = computed(() => {
  if (props.variant === 'dark') {
    return {
      trigger:
        'border-white/15 bg-white/[0.04] text-white hover:border-amber-400/60 focus:border-amber-400 focus:ring-amber-400 [color-scheme:dark]',
      triggerEmpty: 'text-white/40',
      icon: 'text-amber-300/80',
      popover: 'border-amber-400/20 bg-neutral-950/98 text-white shadow-2xl shadow-black/70',
      headerBtn: 'text-white/60 hover:bg-white/10 hover:text-white',
      headerLabel: 'text-white hover:text-amber-300',
      dow: 'text-white/40',
      cellBase: 'text-white/70 hover:bg-white/10',
      cellMuted: 'text-white/25',
      cellToday: 'ring-1 ring-amber-300/70',
      cellSelected: 'bg-amber-400 text-black hover:bg-amber-300 ring-0',
      cellDisabled: 'text-white/15 cursor-not-allowed hover:bg-transparent',
      footerBorder: 'border-white/10',
      footerBtn: 'text-white/60 hover:text-white',
      footerBtnAccent: 'text-amber-300 hover:text-amber-200',
    }
  }
  return {
    trigger:
      'border-outline bg-white text-ink hover:border-accent focus:border-accent focus:ring-accent',
    triggerEmpty: 'text-ink-subtle',
    icon: 'text-ink-subtle',
    popover: 'border-outline bg-white text-ink shadow-xl shadow-black/10',
    headerBtn: 'text-ink-muted hover:bg-surface-subtle hover:text-ink',
    headerLabel: 'text-ink hover:text-accent',
    dow: 'text-ink-subtle',
    cellBase: 'text-ink-muted hover:bg-surface-subtle',
    cellMuted: 'text-ink-subtle/60',
    cellToday: 'ring-1 ring-accent/60',
    cellSelected: 'bg-accent text-white hover:bg-accent-hover ring-0',
    cellDisabled: 'text-ink-subtle/30 cursor-not-allowed hover:bg-transparent',
    footerBorder: 'border-outline',
    footerBtn: 'text-ink-muted hover:text-ink',
    footerBtnAccent: 'text-accent hover:text-accent-hover',
  }
})
</script>

<template>
  <div class="relative inline-block w-full">
    <button
      ref="triggerRef"
      type="button"
      :aria-label="ariaLabel ?? placeholder"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :disabled="disabled"
      class="flex h-11 w-full items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
      :class="styles.trigger"
      @click="toggleOpen"
    >
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="h-4 w-4 shrink-0"
        :class="styles.icon"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      <span v-if="displayLabel" class="flex-1 tabular-nums">{{ displayLabel }}</span>
      <span v-else class="flex-1" :class="styles.triggerEmpty">{{ placeholder }}</span>
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0 scale-100"
      leave-to-class="opacity-0 translate-y-1 scale-[0.98]"
    >
      <div
        v-if="open"
        ref="popoverRef"
        role="dialog"
        aria-label="Calendario"
        class="absolute left-0 top-full z-30 mt-2 w-72 origin-top overflow-hidden rounded-xl border backdrop-blur-sm"
        :class="styles.popover"
      >
        <!-- Header -->
        <div class="flex items-center justify-between gap-1 px-3 pb-2 pt-3">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            :class="styles.headerBtn"
            :aria-label="mode === 'years' ? 'Bloque anterior' : mode === 'months' ? 'Año anterior' : 'Mes anterior'"
            @click="mode === 'years' ? navYearBlock(-1) : mode === 'months' ? navYear(-1) : navMonth(-1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <button
            v-if="mode === 'days'"
            type="button"
            class="flex-1 rounded-md px-2 py-1 text-center text-sm font-semibold capitalize transition-colors"
            :class="styles.headerLabel"
            @click="mode = 'months'"
          >
            {{ headerLabel }}
          </button>
          <button
            v-else-if="mode === 'months'"
            type="button"
            class="flex-1 rounded-md px-2 py-1 text-center text-sm font-semibold transition-colors"
            :class="styles.headerLabel"
            @click="mode = 'years'"
          >
            {{ view.y }}
          </button>
          <span v-else class="flex-1 text-center text-sm font-semibold tabular-nums" :class="styles.headerLabel.split(' ')[0]">
            {{ yearsRangeLabel }}
          </span>

          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-md transition-colors"
            :class="styles.headerBtn"
            :aria-label="mode === 'years' ? 'Bloque siguiente' : mode === 'months' ? 'Año siguiente' : 'Mes siguiente'"
            @click="mode === 'years' ? navYearBlock(1) : mode === 'months' ? navYear(1) : navMonth(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>

        <!-- Vista DÍAS -->
        <template v-if="mode === 'days'">
          <div class="grid grid-cols-7 gap-0.5 px-3 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide" :class="styles.dow">
            <span v-for="d in DOW" :key="d">{{ d }}</span>
          </div>
          <div class="grid grid-cols-7 gap-0.5 px-3 pb-3">
            <button
              v-for="(c, i) in cells"
              :key="i"
              type="button"
              class="flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors"
              :class="[
                cellSelected(c)
                  ? styles.cellSelected
                  : cellDisabled(c)
                    ? styles.cellDisabled
                    : c.current
                      ? styles.cellBase
                      : styles.cellMuted,
                !cellSelected(c) && cellToday(c) ? styles.cellToday : '',
              ]"
              :disabled="cellDisabled(c)"
              :aria-pressed="cellSelected(c)"
              @click="pickCell(c)"
            >
              {{ c.d }}
            </button>
          </div>
        </template>

        <!-- Vista MESES -->
        <div v-else-if="mode === 'months'" class="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-1">
          <button
            v-for="(m, i) in MES_CORTO"
            :key="m"
            type="button"
            class="flex h-10 items-center justify-center rounded-md text-sm font-medium capitalize transition-colors"
            :class="[
              selected && selected.y === view.y && selected.m === i
                ? styles.cellSelected
                : today.y === view.y && today.m === i
                  ? [styles.cellBase, styles.cellToday]
                  : styles.cellBase,
            ]"
            @click="pickMonth(i)"
          >
            {{ m }}
          </button>
        </div>

        <!-- Vista AÑOS -->
        <div v-else class="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-1">
          <button
            v-for="y in years"
            :key="y"
            type="button"
            class="flex h-10 items-center justify-center rounded-md text-sm font-medium tabular-nums transition-colors"
            :class="[
              selected && selected.y === y
                ? styles.cellSelected
                : today.y === y
                  ? [styles.cellBase, styles.cellToday]
                  : styles.cellBase,
            ]"
            @click="pickYear(y)"
          >
            {{ y }}
          </button>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between border-t px-3 py-2 text-xs" :class="styles.footerBorder">
          <button type="button" class="transition-colors" :class="styles.footerBtn" @click="clear">
            Limpiar
          </button>
          <button type="button" class="font-medium transition-colors" :class="styles.footerBtnAccent" @click="pickToday">
            Hoy
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
