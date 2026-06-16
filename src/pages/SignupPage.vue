<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import FormBackdrop from '@/components/ui/FormBackdrop.vue'

const auth = useAuthStore()
const router = useRouter()

const fullName = ref('')
const email = ref('')
const password = ref('')
const fieldErrors = ref<Record<string, string>>({})
const generalError = ref<string | null>(null)
const loading = ref(false)

async function handleSubmit() {
  loading.value = true
  fieldErrors.value = {}
  generalError.value = null
  try {
    await auth.signup(email.value, password.value, fullName.value || undefined)
    router.push('/')
  } catch (e) {
    fieldErrors.value = extractFieldErrors(e)
    if (Object.keys(fieldErrors.value).length === 0) {
      generalError.value = extractErrorMessage(e)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <FormBackdrop>
    <div class="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
      <div
        class="card-glow w-full max-w-md rounded-2xl border border-amber-400/30 bg-neutral-950/85 p-8 backdrop-blur-xl"
      >
        <header class="flex flex-col gap-1">
          <p class="text-xs font-medium uppercase tracking-widest text-amber-300/70">Empezá ahora</p>
          <h1 class="text-2xl font-semibold tracking-tight text-white">Crear cuenta</h1>
          <p class="text-sm text-white/60">
            ¿Ya tenés cuenta?
            <RouterLink to="/login" class="font-medium text-amber-300 hover:text-amber-200">
              Iniciá sesión
            </RouterLink>
          </p>
        </header>

        <div
          v-if="generalError"
          class="mt-5 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {{ generalError }}
        </div>

        <form class="mt-6 flex flex-col gap-4" @submit.prevent="handleSubmit">
          <BaseInput
            v-model="fullName"
            label="Nombre completo (opcional)"
            autocomplete="name"
            variant="dark"
            :error="fieldErrors.fullName"
          />
          <BaseInput
            v-model="email"
            label="Email"
            type="email"
            autocomplete="email"
            variant="dark"
            required
            :error="fieldErrors.email"
          />
          <BaseInput
            v-model="password"
            label="Contraseña"
            type="password"
            autocomplete="new-password"
            variant="dark"
            required
            :error="fieldErrors.password"
            hint="Mínimo 8 caracteres."
          />

          <BaseButton type="submit" variant="gold" :loading="loading" class="mt-2 w-full">
            Crear cuenta
          </BaseButton>
        </form>
      </div>
    </div>
  </FormBackdrop>
</template>

<style scoped>
@keyframes goldGlow {
  0%, 100% {
    box-shadow:
      0 0 28px -6px rgba(251, 191, 36, 0.35),
      inset 0 0 0 1px rgba(251, 191, 36, 0.06),
      0 25px 50px -12px rgba(0, 0, 0, 0.8);
  }
  50% {
    box-shadow:
      0 0 50px -4px rgba(251, 191, 36, 0.55),
      inset 0 0 0 1px rgba(251, 191, 36, 0.18),
      0 25px 50px -12px rgba(0, 0, 0, 0.8);
  }
}
.card-glow {
  animation: goldGlow 5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .card-glow { animation: none; }
}
</style>
