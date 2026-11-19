<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import type { Franchise } from '@/api/types'
import { franchisesApi } from '@/api/franchises'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'

/** Admin: listado de franquicias del catálogo. */
const router = useRouter()
const franchises = ref<Franchise[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    franchises.value = await franchisesApi.list()
  } catch (e) {
    error.value = 'No pudimos cargar las franquicias.'
    console.error(e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <FormBackdrop>
    <div class="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Admin</p>
          <h1 class="mt-0.5 text-3xl font-bold text-white">Franquicias</h1>
          <p class="mt-1 text-sm text-white/60">
            Agrupá títulos del catálogo que pertenecen a lo mismo (ej. todas las series y películas de Scooby-Doo).
          </p>
        </div>
        <div class="flex gap-2">
          <RouterLink
            to="/admin/contents"
            class="inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            Catálogo
          </RouterLink>
          <button
            type="button"
            class="inline-flex h-11 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-black shadow-lg shadow-amber-500/20 transition-colors hover:bg-amber-300"
            @click="router.push({ name: 'admin-franchise-new' })"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
            Crear franquicia
          </button>
        </div>
      </header>

      <p v-if="loading" class="text-sm text-white/50">Cargando…</p>
      <p v-else-if="error" class="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">{{ error }}</p>
      <div v-else-if="franchises.length === 0" class="rounded-xl border border-white/10 bg-neutral-950/70 p-10 text-center text-sm text-white/60 backdrop-blur-xl">
        Todavía no hay franquicias. Creá la primera con “Crear franquicia”.
      </div>
      <ul v-else class="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 bg-neutral-950/70 backdrop-blur-xl">
        <li v-for="f in franchises" :key="f.id" class="flex items-center gap-4 p-4">
          <span class="h-12 w-20 flex-none overflow-hidden rounded border border-white/10 bg-zinc-900">
            <img v-if="f.backdropUrl" :src="f.backdropUrl" :alt="f.name" class="h-full w-full object-cover" loading="lazy" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-white">{{ f.name }}</p>
            <p class="text-xs text-white/50">{{ f.contentsCount ?? 0 }} títulos · /franquicias/{{ f.slug }}</p>
          </div>
          <RouterLink :to="`/franquicias/${f.slug}`" class="rounded-md px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white">Ver</RouterLink>
          <RouterLink
            :to="{ name: 'admin-franchise-edit', params: { slug: f.slug } }"
            class="rounded-md border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/10"
          >
            Editar
          </RouterLink>
        </li>
      </ul>
    </div>
  </FormBackdrop>
</template>
