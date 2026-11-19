<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import type { Content, ContentType } from '@/api/types'
import { contentApi } from '@/api/content'
import { franchisesApi } from '@/api/franchises'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'
import ImageUploadInput from '@/components/ui/ImageUploadInput.vue'
import BackdropFocusPicker from '@/components/admin/BackdropFocusPicker.vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'
import { useToast } from '@/composables/useToast'

/**
 * Admin: crear / editar una franquicia. Datos básicos + fondo (con foco y
 * ajuste, igual que los títulos) + sus títulos: buscador para agregar y
 * lista ordenable con ↑↓ (sirve igual en el celular que con mouse).
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()

interface PickedContent {
  id: string
  slug: string
  title: string
  type: ContentType
  releaseYear: number | null
  posterUrl: string | null
}

const editSlug = computed(() => (route.params.slug as string | undefined) ?? null)
const isEdit = computed(() => editSlug.value !== null)

const franchiseId = ref<string | null>(null)
const name = ref('')
const description = ref('')
const backdropUrl = ref('')
const backdropFocusX = ref<number | null>(null)
const backdropFocusY = ref<number | null>(null)
const backdropFit = ref<'cover' | 'contain' | null>(null)
const picked = ref<PickedContent[]>([])

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const confirmDelete = ref(false)
const deleting = ref(false)

onMounted(async () => {
  if (!editSlug.value) return
  loading.value = true
  try {
    const f = await franchisesApi.show(editSlug.value, { drafts: true })
    franchiseId.value = f.id
    name.value = f.name
    description.value = f.description ?? ''
    backdropUrl.value = f.backdropUrl ?? ''
    backdropFocusX.value = f.backdropFocusX
    backdropFocusY.value = f.backdropFocusY
    backdropFit.value = f.backdropFit
    picked.value = (f.contents ?? []).map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      type: c.type,
      releaseYear: c.releaseYear,
      posterUrl: c.posterUrl,
    }))
  } catch (e) {
    error.value = 'No pudimos cargar la franquicia.'
    console.error(e)
  } finally {
    loading.value = false
  }
})

// ── Buscador de títulos ───────────────────────────────────────
const q = ref('')
const results = ref<Content[]>([])
const searching = ref(false)
let searchTimer: number | null = null
const pickedIds = computed(() => new Set(picked.value.map((p) => p.id)))

function onSearchInput() {
  if (searchTimer) window.clearTimeout(searchTimer)
  const term = q.value.trim()
  if (term.length < 2) {
    results.value = []
    return
  }
  searchTimer = window.setTimeout(async () => {
    searching.value = true
    try {
      results.value = (await contentApi.list({ q: term, perPage: 12 })).data
    } catch (e) {
      console.error(e)
    } finally {
      searching.value = false
    }
  }, 250)
}

function add(c: Content) {
  if (pickedIds.value.has(c.id)) return
  picked.value = [
    ...picked.value,
    { id: c.id, slug: c.slug, title: c.title, type: c.type, releaseYear: c.releaseYear, posterUrl: c.posterUrl },
  ]
}
function addAllResults() {
  for (const c of results.value) add(c)
}
function removePicked(id: string) {
  picked.value = picked.value.filter((p) => p.id !== id)
}
function move(index: number, delta: number) {
  const to = index + delta
  if (to < 0 || to >= picked.value.length) return
  const arr = [...picked.value]
  const [item] = arr.splice(index, 1)
  arr.splice(to, 0, item)
  picked.value = arr
}
function sortByYear() {
  picked.value = [...picked.value].sort((a, b) => (a.releaseYear ?? 9999) - (b.releaseYear ?? 9999))
}

const TYPE_LABEL: Record<string, string> = { movie: 'Película', series: 'Serie', game: 'Juego' }

// ── Guardar / borrar ──────────────────────────────────────────
async function save() {
  error.value = null
  if (!name.value.trim()) {
    error.value = 'El nombre es obligatorio.'
    return
  }
  saving.value = true
  const hasBackdrop = !!backdropUrl.value.trim()
  try {
    const fields = {
      name: name.value.trim(),
      description: description.value.trim() || null,
      backdropUrl: backdropUrl.value.trim() || null,
      backdropFocusX: hasBackdrop ? backdropFocusX.value : null,
      backdropFocusY: hasBackdrop ? backdropFocusY.value : null,
      backdropFit: hasBackdrop ? backdropFit.value : null,
    }
    let id = franchiseId.value
    let slug = editSlug.value
    if (id) {
      await franchisesApi.update(id, fields)
    } else {
      // Create no acepta nulls: mandamos solo lo que tiene valor.
      const created = await franchisesApi.create({
        name: fields.name,
        ...(fields.description && { description: fields.description }),
        ...(fields.backdropUrl && { backdropUrl: fields.backdropUrl }),
        ...(fields.backdropFocusX !== null && { backdropFocusX: fields.backdropFocusX }),
        ...(fields.backdropFocusY !== null && { backdropFocusY: fields.backdropFocusY }),
        ...(fields.backdropFit && { backdropFit: fields.backdropFit }),
      })
      id = created.id
      slug = created.slug
      franchiseId.value = id
    }
    await franchisesApi.setContents(id, picked.value.map((p) => p.id))
    toast.success(isEdit.value ? 'Franquicia guardada' : 'Franquicia creada')
    if (!isEdit.value && slug) router.replace({ name: 'admin-franchise-edit', params: { slug } })
  } catch (e) {
    error.value = axios.isAxiosError(e)
      ? ((e.response?.data as { message?: string })?.message ?? `Error HTTP ${e.response?.status ?? '—'}`)
      : 'No se pudo guardar.'
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function performDelete() {
  if (!franchiseId.value) return
  deleting.value = true
  try {
    await franchisesApi.remove(franchiseId.value)
    toast.success('Franquicia eliminada')
    router.push({ name: 'admin-franchises' })
  } catch (e) {
    toast.error('No se pudo eliminar.')
    console.error(e)
  } finally {
    deleting.value = false
    confirmDelete.value = false
  }
}
</script>

<template>
  <FormBackdrop>
    <div class="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <button
        type="button"
        class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white"
        @click="router.push({ name: 'admin-franchises' })"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        Franquicias
      </button>

      <div class="card-glow rounded-2xl border border-amber-400/30 bg-neutral-950/85 p-6 backdrop-blur-xl sm:p-8">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Admin · Franquicia</p>
            <h1 class="mt-0.5 text-2xl font-bold text-white">{{ isEdit ? 'Editar franquicia' : 'Nueva franquicia' }}</h1>
          </div>
          <RouterLink
            v-if="isEdit && editSlug"
            :to="`/franquicias/${editSlug}`"
            class="rounded-md px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
          >
            Ver página
          </RouterLink>
        </div>

        <p v-if="loading" class="mt-6 text-sm text-white/50">Cargando…</p>

        <form v-else class="mt-6 flex flex-col gap-6" @submit.prevent="save">
          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-white">Nombre</span>
            <input
              v-model="name"
              type="text"
              maxlength="120"
              placeholder="Scooby-Doo"
              class="h-10 rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </label>

          <label class="flex flex-col gap-1.5">
            <span class="text-sm font-medium text-white">Descripción <span class="text-white/40">(opcional)</span></span>
            <textarea
              v-model="description"
              rows="3"
              maxlength="5000"
              class="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </label>

          <div class="flex flex-col gap-4">
            <ImageUploadInput
              v-model="backdropUrl"
              label="Fondo (panorámico ~21:9, opcional)"
              folder="reviewhub/covers/franchises"
              aspect-class="aspect-[21/9]"
              variant="dark"
            />
            <BackdropFocusPicker
              v-if="backdropUrl.trim()"
              :url="backdropUrl.trim()"
              :x="backdropFocusX"
              :y="backdropFocusY"
              :fit="backdropFit"
              @update:x="backdropFocusX = $event"
              @update:y="backdropFocusY = $event"
              @update:fit="backdropFit = $event"
            />
            <p v-else class="text-xs text-white/40">Sin fondo, la página usa el póster del primer título.</p>
          </div>

          <!-- Títulos -->
          <section class="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-white">Títulos <span class="text-white/40">({{ picked.length }})</span></span>
              <button
                v-if="picked.length > 1"
                type="button"
                class="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white"
                @click="sortByYear"
              >
                Ordenar por año
              </button>
            </div>

            <div class="relative">
              <input
                v-model="q"
                type="search"
                placeholder="Buscar en el catálogo para agregar… (ej. scooby)"
                class="h-10 w-full rounded-md border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                @input="onSearchInput"
              />
              <div v-if="q.trim().length >= 2" class="mt-2 overflow-hidden rounded-md border border-white/10 bg-black/40">
                <p v-if="searching" class="p-3 text-xs text-white/50">Buscando…</p>
                <p v-else-if="results.length === 0" class="p-3 text-xs text-white/50">Sin resultados.</p>
                <template v-else>
                  <ul class="max-h-64 divide-y divide-white/[0.06] overflow-y-auto">
                    <li v-for="c in results" :key="c.id" class="flex items-center gap-3 p-2">
                      <span class="h-10 w-7 flex-none overflow-hidden rounded bg-zinc-900">
                        <img v-if="c.posterUrl" :src="c.posterUrl" :alt="c.title" class="h-full w-full object-cover" loading="lazy" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm text-white">{{ c.title }}</span>
                        <span class="text-[11px] text-white/45">{{ c.releaseYear ?? '—' }} · {{ TYPE_LABEL[c.type] }}</span>
                      </span>
                      <button
                        type="button"
                        class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40"
                        :class="pickedIds.has(c.id) ? 'text-emerald-300' : 'border border-amber-400/40 text-amber-200 hover:bg-amber-400/10'"
                        :disabled="pickedIds.has(c.id)"
                        @click="add(c)"
                      >
                        {{ pickedIds.has(c.id) ? '✓ Agregado' : '+ Agregar' }}
                      </button>
                    </li>
                  </ul>
                  <button
                    v-if="results.some((c) => !pickedIds.has(c.id))"
                    type="button"
                    class="w-full border-t border-white/10 p-2 text-xs font-medium text-amber-300 hover:bg-white/[0.04]"
                    @click="addAllResults"
                  >
                    + Agregar todos los resultados
                  </button>
                </template>
              </div>
            </div>

            <p v-if="picked.length === 0" class="py-2 text-center text-xs text-white/40">Buscá títulos arriba para armar la franquicia.</p>
            <ol v-else class="flex flex-col gap-1.5">
              <li v-for="(p, i) in picked" :key="p.id" class="flex items-center gap-3 rounded-md border border-white/10 bg-black/30 p-2">
                <span class="w-5 text-right font-mono text-[11px] text-white/30">{{ i + 1 }}</span>
                <span class="h-10 w-7 flex-none overflow-hidden rounded bg-zinc-900">
                  <img v-if="p.posterUrl" :src="p.posterUrl" :alt="p.title" class="h-full w-full object-cover" loading="lazy" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-white">{{ p.title }}</span>
                  <span class="text-[11px] text-white/45">{{ p.releaseYear ?? '—' }} · {{ TYPE_LABEL[p.type] }}</span>
                </span>
                <button type="button" class="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-20" :disabled="i === 0" :aria-label="`Subir ${p.title}`" @click="move(i, -1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m18 15-6-6-6 6" /></svg>
                </button>
                <button type="button" class="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-20" :disabled="i === picked.length - 1" :aria-label="`Bajar ${p.title}`" @click="move(i, 1)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button type="button" class="flex h-7 w-7 items-center justify-center rounded text-white/50 hover:bg-red-500/20 hover:text-red-300" :aria-label="`Quitar ${p.title}`" @click="removePicked(p.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </li>
            </ol>
          </section>

          <p v-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{{ error }}</p>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <button
              v-if="isEdit"
              type="button"
              class="rounded-md border border-red-400/40 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10"
              @click="confirmDelete = true"
            >
              Eliminar
            </button>
            <span v-else />
            <button
              type="submit"
              class="rounded-full bg-amber-400 px-6 py-2.5 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300 disabled:opacity-50"
              :disabled="saving"
            >
              {{ saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear franquicia' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmModal
      :open="confirmDelete"
      title="Eliminar franquicia"
      :message="`¿Eliminar &quot;${name}&quot;? Los títulos no se borran, solo dejan de estar agrupados.`"
      confirm-label="Eliminar"
      variant="destructive"
      :loading="deleting"
      @close="confirmDelete = false"
      @confirm="performDelete"
    />
  </FormBackdrop>
</template>
