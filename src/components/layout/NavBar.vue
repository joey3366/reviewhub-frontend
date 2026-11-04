<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import GlobalSearch from '@/components/layout/GlobalSearch.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const initials = computed(() => auth.user?.initials ?? '?')
const isDark = computed(() => route.meta.fullBleed === true)

/**
 * Links de navegación en un solo lugar: los usan tanto la barra de
 * escritorio (md+) como el menú móvil (☰).
 */
const links = computed(() =>
  [
    { to: '/', label: 'Catálogo', show: true },
    { to: '/watchlists', label: 'Mis listas', show: auth.isAuthenticated },
    { to: '/ritmo', label: 'Mi ritmo', show: auth.isAuthenticated },
    { to: '/admin/contents', label: 'Admin', show: auth.isAdmin },
  ].filter((l) => l.show)
)

const linkClass = computed(() =>
  isDark.value
    ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
    : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
)
const activeClass = computed(() => (isDark.value ? 'text-white' : 'text-ink'))

// ── Menú móvil ──────────────────────────────────────────────
const menuOpen = ref(false)

// Al navegar (tocar un link o un resultado del buscador) se cierra solo.
watch(() => route.fullPath, () => {
  menuOpen.value = false
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

async function handleLogout() {
  menuOpen.value = false
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header
    :class="
      isDark
        ? 'relative z-40 mt-3 bg-neutral-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-neutral-950/75'
        : 'relative z-40 mt-3 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80'
    "
  >
    <div class="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 md:px-6">
      <RouterLink
        to="/"
        :class="
          isDark
            ? 'text-xl font-semibold uppercase tracking-[0.25em] text-amber-300'
            : 'text-xl font-semibold uppercase tracking-[0.25em] text-ink'
        "
      >
        Kairos
      </RouterLink>

      <nav class="hidden items-center gap-1 md:flex">
        <RouterLink
          v-for="l in links"
          :key="l.to"
          :to="l.to"
          :class="linkClass"
          :active-class="activeClass"
        >
          {{ l.label }}
        </RouterLink>
      </nav>

      <div class="hidden flex-1 justify-center md:flex">
        <GlobalSearch :variant="isDark ? 'dark' : 'light'" />
      </div>

      <div class="ml-auto flex items-center gap-2 md:ml-0">
        <template v-if="!auth.isAuthenticated">
          <RouterLink
            to="/login"
            :class="
              isDark
                ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle'
            "
          >
            Iniciar sesión
          </RouterLink>
          <RouterLink
            to="/signup"
            class="hidden rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-300 sm:inline-block"
          >
            Crear cuenta
          </RouterLink>
        </template>
        <template v-else>
          <div
            :class="
              isDark
                ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-semibold uppercase text-black'
                : 'flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold uppercase text-white'
            "
            :title="auth.user?.email ?? ''"
          >
            {{ initials }}
          </div>
          <button
            type="button"
            :class="['hidden md:inline-block', linkClass]"
            @click="handleLogout"
          >
            Salir
          </button>
        </template>

        <!-- Botón ☰ solo en móvil -->
        <button
          type="button"
          class="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors md:hidden"
          :class="isDark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-surface-subtle'"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          :aria-label="menuOpen ? 'Cerrar menú' : 'Abrir menú'"
          @click="menuOpen = !menuOpen"
        >
          <svg v-if="!menuOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-6 w-6">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-6 w-6">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Panel móvil -->
    <Transition name="menu">
      <div
        v-if="menuOpen"
        id="mobile-menu"
        class="absolute inset-x-0 top-full border-t shadow-2xl md:hidden"
        :class="
          isDark
            ? 'border-white/10 bg-neutral-950/95 shadow-black/60 backdrop-blur-xl'
            : 'border-outline bg-surface shadow-black/10'
        "
      >
        <div class="flex flex-col gap-4 px-4 py-4">
          <GlobalSearch :variant="isDark ? 'dark' : 'light'" />

          <nav class="flex flex-col">
            <RouterLink
              v-for="l in links"
              :key="l.to"
              :to="l.to"
              :class="[
                'rounded-md px-3 py-3 text-base font-medium transition-colors',
                isDark ? 'text-white/80 hover:bg-white/10' : 'text-ink-muted hover:bg-surface-subtle',
              ]"
              :exact-active-class="isDark ? '!text-amber-300 bg-white/5' : '!text-ink bg-surface-subtle'"
            >
              {{ l.label }}
            </RouterLink>
          </nav>

          <div
            class="flex items-center justify-between border-t pt-4"
            :class="isDark ? 'border-white/10' : 'border-outline'"
          >
            <template v-if="auth.isAuthenticated">
              <span class="truncate text-sm" :class="isDark ? 'text-white/50' : 'text-ink-subtle'">
                {{ auth.user?.email }}
              </span>
              <button
                type="button"
                class="rounded-md border px-4 py-2 text-sm font-medium transition-colors"
                :class="isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-outline text-ink hover:bg-surface-subtle'"
                @click="handleLogout"
              >
                Salir
              </button>
            </template>
            <RouterLink
              v-else
              to="/signup"
              class="w-full rounded-md bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black"
            >
              Crear cuenta
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.menu-enter-active,
.menu-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.menu-enter-from,
.menu-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
