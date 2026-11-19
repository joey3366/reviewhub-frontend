<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { Franchise } from '@/api/types'
import { franchisesApi } from '@/api/franchises'
import { useAuthStore } from '@/stores/auth'
import { backdropPosition } from '@/lib/backdrop'

/**
 * Listado público de franquicias (/franquicias). Cada tarjeta muestra la
 * imagen (fondo de la franquicia o póster del primer título), cuántos
 * títulos tiene y, con sesión, tu progreso.
 */
const auth = useAuthStore()
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

const cards = computed(() =>
  franchises.value.map((f) => {
    const contents = f.contents ?? []
    const total = f.contentsCount ?? contents.length
    const watched = f.viewer?.watchedCount ?? 0
    return {
      f,
      total,
      watched,
      pct: total ? Math.round((watched / total) * 100) : 0,
      image: f.backdropUrl ?? contents.find((c) => c.posterUrl)?.posterUrl ?? null,
      imagePos: f.backdropUrl ? backdropPosition(f) : 'center 20%',
      posters: contents.filter((c) => c.posterUrl).slice(0, 4),
    }
  })
)
</script>

<template>
  <div class="min-h-screen bg-black text-white">
    <div class="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-14">
      <header class="mb-8">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">Catálogo</p>
        <h1 class="mt-1 text-4xl font-bold tracking-tight md:text-5xl">Franquicias</h1>
        <p class="mt-2 max-w-2xl text-sm text-white/60">
          Sagas y universos completos: todas sus series, películas y juegos en orden.
          <template v-if="auth.isAuthenticated">Mirá cuánto te falta de cada una.</template>
        </p>
      </header>

      <div v-if="loading" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="h-56 animate-pulse rounded-2xl bg-white/[0.06]" />
      </div>
      <p v-else-if="error" class="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">{{ error }}</p>
      <p v-else-if="cards.length === 0" class="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-sm text-white/50">
        Todavía no hay franquicias.
      </p>

      <div v-else class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <RouterLink
          v-for="card in cards"
          :key="card.f.id"
          :to="`/franquicias/${card.f.slug}`"
          class="group relative flex h-60 flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl shadow-black/40 transition-colors hover:border-amber-400/40"
        >
          <div
            v-if="card.image"
            class="absolute inset-0 bg-cover transition-transform duration-700 group-hover:scale-105"
            :style="{ backgroundImage: `url(${card.image})`, backgroundPosition: card.imagePos }"
          />
          <div v-else class="absolute inset-0 bg-gradient-to-br from-amber-500/20 via-zinc-900 to-black" />
          <div class="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10" />

          <!-- Mini pósters -->
          <div v-if="card.posters.length > 1" class="absolute right-3 top-3 flex -space-x-3">
            <span
              v-for="p in card.posters"
              :key="p.id"
              class="h-14 w-10 overflow-hidden rounded border border-black/60 shadow-lg"
            >
              <img :src="p.posterUrl!" :alt="p.title" class="h-full w-full object-cover" loading="lazy" />
            </span>
          </div>

          <div class="relative flex flex-col gap-2 p-5">
            <h2 class="text-2xl font-bold leading-tight group-hover:text-amber-300">{{ card.f.name }}</h2>
            <p class="text-xs text-white/60">
              {{ card.total }} {{ card.total === 1 ? 'título' : 'títulos' }}
              <template v-if="card.f.counts">
                <template v-if="card.f.counts.series"> · {{ card.f.counts.series }} series</template>
                <template v-if="card.f.counts.movie"> · {{ card.f.counts.movie }} películas</template>
                <template v-if="card.f.counts.game"> · {{ card.f.counts.game }} juegos</template>
              </template>
            </p>
            <div v-if="card.f.viewer" class="flex items-center gap-3">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div class="h-full rounded-full bg-amber-400" :style="{ width: `${card.pct}%` }" />
              </div>
              <span class="text-xs font-medium text-amber-200">{{ card.watched }}/{{ card.total }}</span>
            </div>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
