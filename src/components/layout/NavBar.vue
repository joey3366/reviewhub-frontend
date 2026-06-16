<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const initials = computed(() => auth.user?.initials ?? '?')
const isDark = computed(() => route.meta.fullBleed === true)

async function handleLogout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header
    :class="
      isDark
        ? 'sticky top-0 z-40 bg-black/40 backdrop-blur-md'
        : 'sticky top-0 z-40 border-b border-outline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80'
    "
  >
    <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
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
          to="/"
          :class="
            isDark
              ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
          "
          :active-class="isDark ? 'text-white' : 'text-ink'"
        >
          Catálogo
        </RouterLink>
        <RouterLink
          v-if="auth.isAuthenticated"
          to="/watchlists"
          :class="
            isDark
              ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
          "
          :active-class="isDark ? 'text-white' : 'text-ink'"
        >
          Mis listas
        </RouterLink>
        <RouterLink
          v-if="auth.isAuthenticated"
          to="/ritmo"
          :class="
            isDark
              ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
          "
          :active-class="isDark ? 'text-white' : 'text-ink'"
        >
          Mi ritmo
        </RouterLink>
        <RouterLink
          v-if="auth.isAdmin"
          to="/admin/contents"
          :class="
            isDark
              ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
              : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
          "
          :active-class="isDark ? 'text-white' : 'text-ink'"
        >
          Admin
        </RouterLink>
      </nav>

      <div class="flex items-center gap-2">
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
            class="rounded-md bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black shadow-md shadow-amber-500/20 transition-colors hover:bg-amber-300"
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
            :class="
              isDark
                ? 'rounded-md px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink'
            "
            @click="handleLogout"
          >
            Salir
          </button>
        </template>
      </div>
    </div>
  </header>
</template>
