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
            ? 'flex items-center gap-2 text-base font-semibold tracking-tight text-white'
            : 'flex items-center gap-2 text-base font-semibold tracking-tight text-ink'
        "
      >
        <span :class="isDark ? 'inline-block h-6 w-6 rounded bg-white' : 'inline-block h-6 w-6 rounded bg-ink'" />
        ReviewHub
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
        <span
          v-if="auth.isAuthenticated"
          :class="
            isDark
              ? 'cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-white/40'
              : 'cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-ink-subtle'
          "
          title="Próximamente"
        >
          Mis listas
        </span>
        <span
          v-if="auth.isAdmin"
          :class="
            isDark
              ? 'cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-white/40'
              : 'cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-ink-subtle'
          "
          title="Próximamente"
        >
          Admin
        </span>
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
            class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
