<script setup lang="ts">
import type { ForecastMode, GroupedSummary } from '@/api/types'

/**
 * Nota en Pronóstico / ¿Cómo voy? / Retrospectiva cuando el título tiene
 * otros unidos: aclara que el cálculo los incluye y cuánto aportan. En modo
 * episodios, un unido sin episodios (película, juego) cuenta como 1.
 */
defineProps<{
  grouped: GroupedSummary[] | undefined
  mode: ForecastMode
}>()

function fmt(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}
</script>

<template>
  <div
    v-if="grouped && grouped.length > 0"
    class="mt-4 flex gap-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-white/70"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 h-3.5 w-3.5 flex-none text-amber-300">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
    <div class="min-w-0">
      <p class="font-medium text-amber-200">
        Incluye {{ grouped.length }} {{ grouped.length === 1 ? 'título unido' : 'títulos unidos' }}
      </p>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li v-for="g in grouped" :key="g.title">
          {{ g.title }}
          <span class="text-white/45">
            ·
            <template v-if="mode === 'episodes'">+{{ g.episodes }} ep ({{ fmt(g.durationSeconds) }})</template>
            <template v-else>+{{ fmt(g.durationSeconds) }}</template>
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
