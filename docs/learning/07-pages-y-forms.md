# 07 — Pages y forms

> **Pre-requisitos:** docs 01-06. Tenés design system, componentes base,
> cliente HTTP, auth store, y router con guards funcionando. Las pages
> son placeholders.
>
> **Objetivo:** convertir los placeholders en **pages completas con UX
> sólida**. La `HomePage` va a mostrar el catálogo con estados de loading
> / error / empty / success, filtros por género, ordenamiento, y
> paginación. `LoginPage` y `SignupPage` van a manejar errores 422
> (validación field-level del backend), 429 (rate limit), y redirect
> after login.

Al terminar este doc vas a entender:

- Los **cuatro estados** que toda página de listado debe manejar
  (loading, error, empty, content) y por qué saltarse uno es un bug de
  UX típico.
- Cómo escribir **skeletons** (placeholders mientras carga) con
  Tailwind sin librerías.
- El patrón **`watch` + `ref`** para reactivamente recargar datos
  cuando cambian filtros o paginación.
- Cómo armar **forms con `v-model` + manejo de error** que usa el
  helper `extractFieldErrors` del doc 04.
- Cómo manejar **429 (rate limit)** distinto de un error de validación
  normal.
- Cómo **leer un query param** (`?redirect=...`) y respetarlo después
  del login.

---

## 1 · El problema: una página con datos puede estar en muchos estados

Cuando entrás a `/` y la HomePage hace `GET /api/v1/contents`, esa
request puede:

1. **Estar en curso** (loading) — el user ve la URL cambió pero todavía
   no tiene contenido. **Si no mostrás nada, parece roto.**
2. **Fallar** (red caída, backend muerto, 500) — el user necesita
   saber que algo no anda, no quedarse mirando una página vacía
   indefinidamente.
3. **Tener éxito pero estar vacía** (el backend devolvió `data: []`) —
   el user necesita saber que "no hay nada" es **intencional**, no un
   error.
4. **Tener éxito con datos** — caso feliz, render normal.

Cada estado pide UI distinta. Un componente "completo" maneja los 4.

Lo mismo para forms: pueden estar `idle`, `submitting`, `error
(validación)`, `error (red)`, `success`.

---

## 2 · Conceptos clave

### 2.1 · Los cuatro estados de un listado

```
            ┌──────────────┐
            │   loading    │  ← skeleton, spinner
            └──────┬───────┘
                   │ (fetch resolves)
        ┌──────────┼──────────┐
        ▼          ▼          ▼
  ┌─────────┐ ┌────────┐ ┌──────────┐
  │  error  │ │ empty  │ │ content  │
  └─────────┘ └────────┘ └──────────┘
```

Errores típicos al ignorar estos estados:

- **Sin loading state:** la página queda en blanco hasta que llega data.
  El user no sabe si está cargando o roto.
- **Sin error state:** un fail silencioso. El user refresca 5 veces sin
  entender.
- **Sin empty state:** vacío con un skeleton hace dudar al user si está
  esperando algo que nunca llegó.

### 2.2 · Skeletons vs spinners

**Spinner**: un círculo girando. Útil para acciones rápidas (botón
"Guardar").

**Skeleton**: una representación grisácea de la estructura final
(cards, líneas de texto). Útil para listados — el user ve cuánto
contenido viene aproximadamente.

Tailwind te da `animate-pulse` gratis para skeletons:

```html
<div class="aspect-[2/3] animate-pulse rounded-md bg-surface-muted" />
```

Eso es un "fantasma" de una card de poster con animación de pulso. Cero
JS, cero librería.

### 2.3 · El patrón `watch` para recargar al cambiar filtros

Tenés un ref de la página actual y otro del filtro de género:

```ts
const page = ref(1)
const selectedGenre = ref<string | null>(null)
```

Querés que cuando cualquiera cambie, recargues los datos. `watch` lo
hace declarativamente:

```ts
watch([page, selectedGenre], async () => {
  await loadContents()
})
```

Vue te llama el callback cada vez que uno de los refs cambia. No tenés
que pegar el `loadContents()` en cada `onClick` de filtro.

> **Cuidado con la dependencia circular:** si dentro de `loadContents()`
> modificás `page` o `selectedGenre`, vas a entrar en loop infinito de
> watch. Tip: cuando cambies un filtro, primero seteás `page = 1`
> (porque la nueva búsqueda empieza desde el principio) y después
> dejás que el watch haga el resto.

### 2.4 · `extractFieldErrors` en acción

Recordá del doc 04: el helper recibe un error de axios y devuelve un
`Record<string, string>` con campo → mensaje. Lo usás así:

```ts
const fieldErrors = ref<Record<string, string>>({})

async function submit() {
  try {
    await authApi.login({ email, password })
  } catch (e) {
    fieldErrors.value = extractFieldErrors(e)
  }
}
```

Y en el template:

```vue
<BaseInput v-model="email" :error="fieldErrors.email" />
```

Si el backend dice "email is required", `fieldErrors.email` queda en
ese mensaje y `<BaseInput>` lo muestra en rojo abajo del campo. Cero
JS extra.

### 2.5 · 429 Rate Limit: ¿qué hacer?

El backend tiene rate limiting en `/auth/signup` y `/auth/login`: 5
intentos por minuto. Cuando el user supera el límite, devuelve **429
Too Many Requests**.

El error no tiene "field errors" — no hay nada que el user pueda corregir
campo por campo. Solo tiene que esperar. UX correcta:

- Mostrar **mensaje general** (no en campos): "Demasiados intentos.
  Esperá un minuto y volvé a probar."
- **No agregar `fieldErrors`** — sería confuso ("tu password está mal"
  cuando en realidad no se intentó).

Por eso `extractErrorMessage` del doc 04 chequea el status 429 explícito
y devuelve el mensaje en castellano.

### 2.6 · Redirect after login

Recordá: el guard de `requiresAuth` redirige a `/login?redirect=/path`.
LoginPage tiene que leer ese query y usarlo después de login:

```ts
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

async function handleSubmit() {
  await auth.login(email.value, password.value)
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
}
```

El check `typeof === 'string'` es porque `route.query` puede tener
`string | string[] | undefined` para cada key. Solo aceptamos string.

---

## 3 · Implementación paso a paso

### Paso 1 — `ContentCard.vue`

**Archivo nuevo:** `src/components/content/ContentCard.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Content } from '@/api/types'

const props = defineProps<{ content: Content }>()
const router = useRouter()

const typeLabel = computed(() => (props.content.type === 'movie' ? 'Película' : 'Serie'))

const ratingDisplay = computed(() => {
  if (props.content.avgRating === null) return null
  return props.content.avgRating.toFixed(1)
})

const reviewLabel = computed(() => {
  const count = props.content.reviewCount
  return `${count} ${count === 1 ? 'reseña' : 'reseñas'}`
})

function navigate() {
  router.push(`/contents/${props.content.slug}`)
}
</script>

<template>
  <button
    type="button"
    class="group flex flex-col gap-3 rounded-lg text-left transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    @click="navigate"
  >
    <div class="relative aspect-[2/3] overflow-hidden rounded-md border border-outline bg-surface-muted">
      <img
        v-if="content.posterUrl"
        :src="content.posterUrl"
        :alt="content.title"
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
      <div v-else class="flex h-full w-full items-center justify-center text-xs text-ink-subtle">
        Sin poster
      </div>
    </div>

    <div class="flex flex-col gap-1">
      <h3 class="line-clamp-2 text-sm font-semibold text-ink">{{ content.title }}</h3>
      <p class="text-xs text-ink-subtle">
        {{ typeLabel }}
        <span v-if="content.releaseYear"> · {{ content.releaseYear }}</span>
      </p>
      <p class="flex items-center gap-1 text-xs text-ink-muted">
        <span v-if="ratingDisplay" class="font-medium text-ink">★ {{ ratingDisplay }}</span>
        <span v-else class="text-ink-subtle">Sin calificar</span>
        <span class="text-ink-subtle">· {{ reviewLabel }}</span>
      </p>
    </div>
  </button>
</template>
```

**Decisiones notables:**

- **`<button>` toda la card** — la card entera es clickable. Más
  accesible que un wrapper `<a>` con `<button>` adentro (que confunde a
  screen readers).
- **`aspect-[2/3]`** — proporción típica de poster. Mantiene el grid
  alineado aunque algunos contents no tengan poster.
- **`loading="lazy"`** — el browser solo carga la imagen cuando está
  cerca del viewport. Esencial para grids con 20+ posters.
- **`object-cover`** — la imagen se ajusta al contenedor sin deformarse,
  recortando si es necesario.
- **`group` + `group-hover:scale-[1.02]`** — Tailwind permite que un hover
  sobre el `<button>` (con clase `group`) afecte a un descendiente
  (`group-hover:...`). El poster zoomea sutilmente al hover.
- **`line-clamp-2`** — limita el título a 2 líneas con elipsis. Plugin
  built-in en Tailwind v3.3+.
- **El `★` (estrella unicode)** — sin librería de íconos. Para algo
  más rico, instalás `lucide-vue-next` u otra lib.

### Paso 2 — `PaginationControls.vue`

**Archivo nuevo:** `src/components/PaginationControls.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { PaginationMeta } from '@/api/types'

const props = defineProps<{ meta: PaginationMeta }>()
defineEmits<{ 'update:page': [page: number] }>()

const pages = computed(() => {
  const total = props.meta.lastPage
  const current = props.meta.currentPage
  const arr: (number | '…')[] = []

  if (total <= 7) {
    for (let i = 1; i <= total; i++) arr.push(i)
    return arr
  }

  arr.push(1)
  if (current > 3) arr.push('…')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) arr.push(i)

  if (current < total - 2) arr.push('…')
  arr.push(total)
  return arr
})

const canPrev = computed(() => props.meta.currentPage > props.meta.firstPage)
const canNext = computed(() => props.meta.currentPage < props.meta.lastPage)
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-1">
    <button
      type="button"
      :disabled="!canPrev"
      class="h-9 rounded-md border border-outline px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
      @click="$emit('update:page', meta.currentPage - 1)"
    >
      Anterior
    </button>

    <template v-for="(p, i) in pages" :key="i">
      <span v-if="p === '…'" class="px-2 text-sm text-ink-subtle">…</span>
      <button
        v-else
        type="button"
        :class="[
          'h-9 min-w-9 rounded-md px-3 text-sm font-medium transition-colors',
          p === meta.currentPage
            ? 'bg-ink text-white'
            : 'border border-outline text-ink hover:bg-surface-subtle',
        ]"
        @click="$emit('update:page', p as number)"
      >
        {{ p }}
      </button>
    </template>

    <button
      type="button"
      :disabled="!canNext"
      class="h-9 rounded-md border border-outline px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-40"
      @click="$emit('update:page', meta.currentPage + 1)"
    >
      Siguiente
    </button>
  </div>
</template>
```

**El `pages` computed** genera el array `[1, '…', 4, 5, 6, '…', 12]`
para un total de 12 páginas con currentPage 5. Truco común para
paginators que evitan mostrar 100 botones.

**`update:page` event** — emitimos eventos en formato `update:X` para
permitir al padre usar `v-model:page` shorthand si quiere.

### Paso 3 — `HomePage.vue` con todos los estados

**Archivo a modificar:** `src/pages/HomePage.vue`

```vue
<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { contentApi } from '@/api/content'
import type { Content, Genre, PaginationMeta } from '@/api/types'
import ContentCard from '@/components/content/ContentCard.vue'
import PaginationControls from '@/components/PaginationControls.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const contents = ref<Content[]>([])
const genres = ref<Genre[]>([])
const meta = ref<PaginationMeta | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const page = ref(1)
const sort = ref<'top' | 'recent'>('top')
const selectedGenre = ref<string | null>(null)

const sortOptions = [
  { value: 'top', label: 'Mejor calificadas' },
  { value: 'recent', label: 'Más recientes' },
]

async function loadContents() {
  loading.value = true
  error.value = null
  try {
    const result = await contentApi.list({
      page: page.value,
      sort: sort.value,
      genre: selectedGenre.value ?? undefined,
    })
    contents.value = result.data
    meta.value = result.meta
  } catch (e) {
    error.value = 'No pudimos cargar el catálogo. Asegurate que el backend esté corriendo en localhost:3333.'
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadGenres() {
  try {
    genres.value = await contentApi.genres()
  } catch (e) {
    console.error(e)
  }
}

function selectGenre(slug: string | null) {
  selectedGenre.value = slug
  page.value = 1
}

function changePage(newPage: number) {
  page.value = newPage
}

watch([page, sort], loadContents)
watch(selectedGenre, () => {
  page.value = 1
  loadContents()
})

onMounted(() => {
  loadGenres()
  loadContents()
})
</script>

<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-3xl font-semibold tracking-tight text-ink">Catálogo</h1>
      <p v-if="meta" class="text-sm text-ink-muted">
        {{ meta.total }} {{ meta.total === 1 ? 'título' : 'títulos' }}
      </p>
      <p v-else class="text-sm text-ink-muted">Cargando…</p>
    </header>

    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <BaseSelect v-model="sort" :options="sortOptions" label="Ordenar por" />

      <div v-if="genres.length" class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="[
            'h-8 rounded-md px-3 text-xs font-medium transition-colors',
            selectedGenre === null
              ? 'bg-ink text-white'
              : 'border border-outline text-ink-muted hover:bg-surface-subtle hover:text-ink',
          ]"
          @click="selectGenre(null)"
        >
          Todos
        </button>
        <button
          v-for="g in genres"
          :key="g.id"
          type="button"
          :class="[
            'h-8 rounded-md px-3 text-xs font-medium transition-colors',
            selectedGenre === g.slug
              ? 'bg-ink text-white'
              : 'border border-outline text-ink-muted hover:bg-surface-subtle hover:text-ink',
          ]"
          @click="selectGenre(g.slug)"
        >
          {{ g.name }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <div v-for="i in 10" :key="i" class="flex flex-col gap-3">
        <div class="aspect-[2/3] animate-pulse rounded-md bg-surface-muted" />
        <div class="h-4 animate-pulse rounded bg-surface-muted" />
        <div class="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>

    <div v-else-if="error" class="rounded-lg border border-error/30 bg-red-50 p-6 text-sm text-error">
      {{ error }}
    </div>

    <div v-else-if="contents.length === 0" class="rounded-lg border border-outline bg-surface-subtle p-12 text-center">
      <p class="text-base font-medium text-ink">No hay títulos para mostrar</p>
      <p class="mt-1 text-sm text-ink-muted">Probá cambiar el filtro de género o el orden.</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <ContentCard v-for="c in contents" :key="c.id" :content="c" />
      </div>

      <PaginationControls v-if="meta && meta.lastPage > 1" :meta="meta" @update:page="changePage" />
    </template>
  </div>
</template>
```

**Decisiones notables:**

- **Cuatro estados explícitos con `v-if/v-else-if/v-else-if/template`:**
  loading → error → empty → content. El orden importa porque
  `v-else-if` chain.
- **Skeleton de 10 cards** — número arbitrario que coincide con la
  expectativa visual de una página de catálogo cargada.
- **`watch([page, sort])` + `watch(selectedGenre)`** separados —
  cambiar genre reset la página a 1 ANTES de cargar, así que necesita
  lógica distinta.
- **`onMounted`** dispara la primera carga. El `watch` toma las
  siguientes.
- **`genre: selectedGenre.value ?? undefined`** — si pasás `null`,
  axios manda `?genre=null` como string, que el backend interpreta mal.
  Pasarle `undefined` hace que axios omita el query param.

### Paso 4 — `LoginPage.vue` con manejo de 422 y redirect

**Archivo a modificar:** `src/pages/LoginPage.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

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
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
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
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Iniciar sesión</h1>
      <p class="text-sm text-ink-muted">
        ¿No tenés cuenta?
        <RouterLink to="/signup" class="font-medium text-accent hover:text-accent-hover">
          Creá una
        </RouterLink>
      </p>
    </header>

    <div v-if="generalError" class="rounded-md border border-error/30 bg-red-50 px-3 py-2 text-sm text-error">
      {{ generalError }}
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <BaseInput v-model="email" label="Email" type="email" autocomplete="email" required :error="fieldErrors.email" />
      <BaseInput v-model="password" label="Contraseña" type="password" autocomplete="current-password" required :error="fieldErrors.password" />

      <BaseButton type="submit" :loading="loading" class="mt-2 w-full">
        Iniciar sesión
      </BaseButton>
    </form>
  </div>
</template>
```

**Líneas clave explicadas:**

- **`@submit.prevent="handleSubmit"`** — `.prevent` llama a
  `event.preventDefault()` automáticamente, evitando el reload de la
  página (comportamiento default de submit en form HTML).
- **Reset de errores al inicio de `handleSubmit`** — limpiamos
  `fieldErrors` y `generalError` para que un segundo intento no muestre
  errores stale del intento anterior.
- **Dos niveles de error:** field-level (debajo de cada input) y
  general (banner arriba del form). Si `extractFieldErrors` devuelve
  algo, no mostramos el banner; si no, sí. Evita duplicación.
- **`finally { loading.value = false }`** — sea éxito o error, el botón
  vuelve a estar habilitado. Sin esto, un error deja el spinner para
  siempre.
- **`autocomplete="current-password"`** vs `"new-password"` en signup —
  hint al password manager del browser. Para login es current, para
  signup es new.

### Paso 5 — `SignupPage.vue` similar

**Archivo a modificar:** `src/pages/SignupPage.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { extractFieldErrors, extractErrorMessage } from '@/utils/extractFieldErrors'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

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
  <div class="mx-auto flex max-w-md flex-col gap-6 py-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Crear cuenta</h1>
      <p class="text-sm text-ink-muted">
        ¿Ya tenés cuenta?
        <RouterLink to="/login" class="font-medium text-accent hover:text-accent-hover">
          Iniciá sesión
        </RouterLink>
      </p>
    </header>

    <div v-if="generalError" class="rounded-md border border-error/30 bg-red-50 px-3 py-2 text-sm text-error">
      {{ generalError }}
    </div>

    <form class="flex flex-col gap-4" @submit.prevent="handleSubmit">
      <BaseInput v-model="fullName" label="Nombre completo (opcional)" autocomplete="name" :error="fieldErrors.fullName" />
      <BaseInput v-model="email" label="Email" type="email" autocomplete="email" required :error="fieldErrors.email" />
      <BaseInput v-model="password" label="Contraseña" type="password" autocomplete="new-password" required :error="fieldErrors.password" hint="Mínimo 8 caracteres." />

      <BaseButton type="submit" :loading="loading" class="mt-2 w-full">
        Crear cuenta
      </BaseButton>
    </form>
  </div>
</template>
```

**Diferencia con login:**

- Hay un campo extra (`fullName`, opcional).
- `fullName.value || undefined` — si el user no escribió nada, mandamos
  `undefined` en vez de `''`, así el backend recibe el campo como ausente
  (no como string vacío que dispararía una validación de min length).
- Después de signup, push a `/` (no a redirect, porque signup no se
  inicia desde un guard de auth — es voluntario).

---

## 4 · Verificación

1. **HomePage carga con skeleton, después grilla:** `localhost:5174/`
   muestra cards animadas durante ~200ms y después datos reales.
2. **Filtros funcionan:** click un género chip → la grilla se actualiza,
   paginación se resetea a 1.
3. **Sort funciona:** cambiar el dropdown → orden cambia.
4. **Paginación funciona:** click "Siguiente" / "Anterior" / número →
   grilla cambia.
5. **Error state:** parar el backend (`Ctrl+C` en su terminal) y
   refrescar la home → ves el banner rojo.
6. **Empty state:** filtrar por un género que no tenga contents → ves el
   mensaje "No hay títulos".
7. **Login OK:** ir a `/login`, ingresar `admin@reviewhub.local` /
   `Admin1234` (asumiendo que el ace command creó este admin) → te
   manda a `/` con el avatar mostrando "A".
8. **Login con error de validación (422):** intentar con email vacío →
   ves error debajo del campo email diciendo lo que el backend devuelve.
9. **Login con credenciales mal (probablemente 401):** email correcto +
   password mal → ves el banner general "Invalid credentials" (o lo que
   devuelva el backend).
10. **Rate limit (429):** hacer 6 intentos rápidos de login → ves
    "Demasiados intentos. Esperá un minuto y volvé a probar."
11. **Redirect after login:** ir a `localhost:5174/login?redirect=/foo` →
    hacer login → te manda a `/foo` (que probablemente da 404 porque
    `/foo` no existe, pero el redirect funcionó).

---

## 5 · Errores comunes

### "La grilla no se actualiza al cambiar el filtro"

Probablemente te olvidaste del `watch(selectedGenre, ...)`. O el watcher
está, pero la función `loadContents` lee `selectedGenre.value` capturado
en un closure viejo. Asegurate que `loadContents` siempre lee
`selectedGenre.value` fresh.

### "Hay 4 requests cuando cargo la home"

Pasa si tenés `watch([page, sort, selectedGenre], loadContents)` Y al
inicializar las refs cambian todas a la vez. Solución: definir el
`watch` ANTES de los `onMounted`, o usar `{ immediate: false }` (default).

### "El form submitea dos veces"

Olvidaste `.prevent` en `@submit.prevent`. El form HTML default sigue
ejecutando su acción de submit (intento de POST nativo), además de la
de tu handler. Resultado: el browser intenta navegar y al mismo tiempo
fetcheás. Caos.

### "Aparecen errores `[object Object]` en los inputs"

`fieldErrors.email` es un objeto, no un string. Casi siempre porque
`extractFieldErrors` devolvió algo distinto a lo esperado. Logueá `e`
en el catch para inspeccionar.

---

## 6 · Recap

Lo que hicimos:

- Cubrimos los **4 estados** de un listado (loading / error / empty /
  content) en `HomePage`, usando `v-if/v-else-if` y un skeleton
  Tailwind sin librerías.
- Implementamos `ContentCard` con poster, fallback, hover scale y
  `loading="lazy"` para performance.
- Hicimos `PaginationControls` con el típico patrón `1 … 4 5 6 … 12`
  y eventos `update:page`.
- Usamos `watch` para recargar al cambiar filtros, separando el watcher
  de género (que reset la página) del de page/sort.
- Construimos `LoginPage` y `SignupPage` con `<BaseInput>` + manejo
  field-level (422) y general (429, otros), redirect after login.

---

## 7 · Adónde sigue esto

Con los 7 docs cubrimos el setup completo del frontend MVP. Las
siguientes sesiones agregan funcionalidad sobre esta base sin tocar
mucho del plumbing:

- **Doc 08 (futuro):** ContentDetailPage + Reviews CRUD.
- **Doc 09 (futuro):** Watchlists CRUD + items + management.
- **Doc 10 (futuro):** Playback (pace, holidays, forecast,
  retrospective) — feature compleja, da para un doc completo.
- **Doc 11 (futuro):** Admin dashboard.
- **Doc 12 (futuro):** Tests con Vitest + Vue Test Utils.
- **Doc 13 (futuro):** Build + deploy a Cloudflare Pages / Vercel.

Cada uno reusa el design system, el cliente HTTP, el store de auth, y
el router que ya construimos. Es lo lindo de invertir en buena base
arriba.
