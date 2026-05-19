# 03 — Componentes UI base

> **Pre-requisitos:** doc 02 (tokens de Tailwind y `base.css` listos).
>
> **Objetivo:** crear un set de **componentes UI base** (`BaseButton`,
> `BaseInput`, `BaseSelect`, `BaseBadge`, `BaseCard`) que encapsulen las
> clases recurrentes y expongan una API tipada. Al terminar, cualquier
> página de la app va a poder usar `<BaseButton variant="primary">Guardar
> </BaseButton>` sin repetir 15 clases de Tailwind cada vez.

Al terminar este doc vas a entender:

- El patrón **"Base*"** de naming y por qué se usa.
- Cómo escribir componentes con **`<script setup lang="ts">`** y
  `defineProps<{...}>` para tipar props sin boilerplate.
- Cómo implementar **variantes** (primary/secondary/ghost) sin caer en
  un `if` por cada combinación.
- Cómo hacer **`v-model` custom** con `modelValue` + emit
  `update:modelValue`.
- Cuándo usar **`<slot />`** (contenido arbitrario) vs prop `text`
  (contenido string fijo).
- La diferencia entre **`<button>` nativo restilado** vs un componente
  compuesto y cuándo conviene cada uno.

---

## 1 · El problema: clases repetidas en todas partes

Sin componentes base, cada vez que querés un botón primario escribís:

```html
<button class="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
  Guardar
</button>
```

Doce clases. Las repetís en 20 lugares de la app. Un día querés agregar
`disabled:opacity-50` y tenés que tocar los 20.

**Solución:** un componente `<BaseButton>` que encapsula esas clases. Lo
usás como `<BaseButton>Guardar</BaseButton>`. Cambiar el estilo es una
sola edición.

---

## 2 · Conceptos clave

### 2.1 · Por qué el prefijo "Base"

Convención común en Vue (también React, Angular): los componentes
primitivos del design system llevan prefijo común (`Base`, `App`, `Ui`,
`The`). Razones:

- **Discoverability:** todos juntos cuando ordenás alfabéticamente.
- **Diferenciación visual:** `<BaseButton>` se distingue inmediatamente de
  un componente de feature como `<ReviewForm>`.
- **Importable directamente:** si configurás auto-import (con
  `unplugin-vue-components`), el prefijo evita colisiones con HTML nativo.

`Base` es la más común. Otra opción: `App` (`AppButton`) — popular en la
guía oficial de Vue.

### 2.2 · `<script setup lang="ts">` — la sintaxis moderna

Es la forma recomendada de escribir componentes Vue 3 con TypeScript.
Comparemos con la sintaxis legacy:

**Vue 2 / Options API:**

```vue
<script>
export default {
  props: ['title'],
  data() { return { count: 0 } },
  computed: { doubled() { return this.count * 2 } },
  methods: { increment() { this.count++ } },
}
</script>
```

**Vue 3 Options API (un poco mejor):**

```vue
<script lang="ts">
import { defineComponent, ref } from 'vue'
export default defineComponent({
  props: { title: String },
  setup() {
    const count = ref(0)
    return { count }
  },
})
</script>
```

**Vue 3 `<script setup>` (lo que usamos):**

```vue
<script setup lang="ts">
import { ref } from 'vue'
defineProps<{ title: string }>()
const count = ref(0)
</script>
```

Mismo resultado, mucho menos código. Todo lo declarado en `<script setup>`
(refs, imports, funciones) está automáticamente disponible en `<template>`
— no hace falta `return`.

### 2.3 · `defineProps<{...}>()` vs `defineProps({...})`

Hay dos formas de declarar props:

**Runtime (objeto):**

```ts
defineProps({
  variant: { type: String, default: 'primary' },
  disabled: { type: Boolean, default: false },
})
```

**Type-only (genérico):**

```ts
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
}>()
```

La segunda es más expresiva — el tipo `'primary' | 'secondary' | 'ghost'`
le dice a TS que solo esos strings son válidos. Si alguien pasa
`<BaseButton variant="purple">`, TS lo marca en rojo.

**¿Cómo se ponen defaults con el type-only?** Con `withDefaults`:

```ts
const props = withDefaults(
  defineProps<{ variant?: 'primary' | 'secondary' }>(),
  { variant: 'primary' }
)
```

### 2.4 · `v-model` custom con `modelValue` + emit

`v-model` es **sintaxis sugar** para una prop `modelValue` y un evento
`update:modelValue`. Cuando hacés:

```vue
<BaseInput v-model="email" />
```

Vue lo expande a:

```vue
<BaseInput :modelValue="email" @update:modelValue="email = $event" />
```

Entonces tu componente recibe la prop y emite el evento. Patrón estándar:

```vue
<script setup lang="ts">
defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
```

El cast `as HTMLInputElement` es porque `$event.target` por defecto es
`EventTarget | null` (genérico) y queremos acceder a `.value` que solo
tiene `HTMLInputElement`.

### 2.5 · `<slot />` vs prop `text`

¿Qué uso para que el contenido del botón sea configurable?

**Prop `text`:**

```vue
<BaseButton text="Guardar" />
```

Pros: simple. Contras: solo acepta string. No podés meter un `<icon>` ni
formatear nada.

**`<slot />`:**

```vue
<BaseButton>
  <Icon name="save" /> Guardar
</BaseButton>
```

Pros: el contenido es **cualquier cosa** — texto, otro componente,
markup. Más flexible.

**Regla práctica:** si el contenido podría incluir markup, slot. Si
siempre va a ser una palabra suelta, prop. Para botones, slot gana.

---

## 3 · Implementación paso a paso

Vamos a crear cinco componentes. Cada uno tiene patrones distintos a
practicar.

### Paso 1 — Estructura de carpetas

```powershell
mkdir src\components\ui
```

Los Base* viven juntos. Componentes de feature (`ContentCard`,
`ReviewForm`) van en otras carpetas (`src/components/content/`, etc.).

### Paso 2 — `BaseButton.vue`

**Archivo nuevo:** `src/components/ui/BaseButton.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'primary', size: 'md', type: 'button', disabled: false, loading: false }
)

const classes = computed(() => {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

  const variants: Record<Variant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-hover',
    secondary:
      'border border-outline bg-surface text-ink hover:bg-surface-subtle hover:border-outline-strong',
    ghost: 'text-ink hover:bg-surface-subtle',
  }

  const sizes: Record<Size, string> = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
  }

  return `${base} ${variants[props.variant]} ${sizes[props.size]}`
})
</script>

<template>
  <button :type="type" :disabled="disabled || loading" :class="classes">
    <span
      v-if="loading"
      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
    <slot />
  </button>
</template>
```

**Líneas clave explicadas:**

- **`type Variant = 'primary' | 'secondary' | 'ghost'`** — alias de tipo
  reutilizable. Si en el futuro agregás `'danger'`, lo metés acá y TS te
  obliga a manejarlo en todos los lugares que usan `Variant`.
- **`Record<Variant, string>`** — TS te garantiza que el objeto `variants`
  tiene una entrada por cada miembro del union. Si agregás `'danger'` al
  type pero te olvidás de poner sus clases, TS marca error. Es **exhaustive
  matching** sin necesidad de switch.
- **`disabled || loading`** — durante loading, el botón también está
  funcionalmente disabled (no debería poderse re-clickear). Lo combinamos.
- **`<span v-if="loading" class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />`**
  — un spinner CSS-only. `border-current` toma el color del texto del
  botón; `border-t-transparent` deja el borde superior invisible, y al
  girarlo con `animate-spin`, da la ilusión de un círculo cargando.
  Cero deps, cero JS.
- **`computed(() => ...)`** — el string de clases se recalcula solo cuando
  cambian `props.variant` o `props.size`. Mientras tanto Vue cachea el
  resultado.

> **¿Por qué un `<button>` y no un `<div role="button">`?** Botones HTML
> nativos vienen con keyboard handling gratis (Enter y Space los activan)
> y son reconocidos por screen readers. Un `<div>` requiere ARIA manual y
> es un riesgo de accesibilidad. **Siempre `<button>` cuando sea un botón
> de acción.**

### Paso 3 — `BaseInput.vue`

**Archivo nuevo:** `src/components/ui/BaseInput.vue`

```vue
<script setup lang="ts">
defineProps<{
  modelValue: string
  label?: string
  placeholder?: string
  type?: string
  error?: string
  autocomplete?: string
  required?: boolean
  hint?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium text-ink">{{ label }}</span>
    <input
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :required="required"
      :class="[
        'h-10 rounded-md border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-accent',
        error ? 'border-error' : 'border-outline focus:border-accent',
      ]"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="text-xs text-error">{{ error }}</span>
    <span v-else-if="hint" class="text-xs text-ink-subtle">{{ hint }}</span>
  </label>
</template>
```

**Decisiones notables:**

- **Wrap en `<label>`** — clickear el texto del label foco el input
  automáticamente (gratis con HTML semántico). Sin esto necesitarías un
  `<label for="email">` con un `id="email"` matchando, más burocrático.
- **`error` y `hint` mutuamente excluyentes** — si hay error, no mostramos
  hint (sería ruido). El `v-else-if` lo expresa con cero lógica.
- **`type ?? 'text'`** — el operador nullish coalescing (`??`) en runtime.
  Si `type` es `undefined`, default a `'text'`. Más limpio que un
  ternario.
- **`:class="[...]"`** array — Vue acepta arrays de strings que se
  concatenan. Útil para mezclar clases siempre presentes con condicionales.
- **`placeholder:text-ink-subtle`** — variant `placeholder:` de Tailwind
  aplica al pseudo-elemento `::placeholder` del input. Es un truco menos
  conocido.

> **¿Por qué no `v-model.lazy`?** `v-model.lazy` actualiza el binding solo
> al evento `change` (no en cada keystroke). Para forms, querés feedback
> instantáneo de cambios (ej. validar mientras tipea), así que dejamos el
> binding en `input` (cada tecla).

### Paso 4 — `BaseSelect.vue`

**Archivo nuevo:** `src/components/ui/BaseSelect.vue`

```vue
<script setup lang="ts">
defineProps<{
  modelValue: string
  options: Array<{ value: string; label: string }>
  label?: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-sm font-medium text-ink">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-10 rounded-md border border-outline bg-surface px-3 pr-8 text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
  </label>
</template>
```

**Notable:**

- **`options: Array<{ value: string; label: string }>`** — interfaz simple
  para las opciones. Pasas `[{ value: 'top', label: 'Mejor calificadas' }]`
  desde el padre.
- **`@change` en vez de `@input`** — los `<select>` nativos disparan
  `change` cuando el user elige una opción (un evento es suficiente, no
  hay "tipeo intermedio").
- **`pr-8`** — padding right extra para dejar lugar al ícono nativo del
  select (la flecha). Sin esto, el último carácter del label se solapa.

> **Nota:** estilar `<select>` nativos en CSS tiene límites (la flecha es
> del browser). Si querés total control, hay que armar un combobox custom
> con `<button>` + `<ul>` + ARIA. Es mucho más código y para este proyecto
> el `<select>` nativo está bien.

### Paso 5 — `BaseBadge.vue`

**Archivo nuevo:** `src/components/ui/BaseBadge.vue`

```vue
<script setup lang="ts">
type Tone = 'neutral' | 'accent' | 'success' | 'error' | 'warning'

withDefaults(defineProps<{ tone?: Tone }>(), { tone: 'neutral' })
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
      tone === 'neutral' && 'border border-outline bg-surface-subtle text-ink-muted',
      tone === 'accent' && 'bg-accent-soft text-accent',
      tone === 'success' && 'bg-green-50 text-success',
      tone === 'error' && 'bg-red-50 text-error',
      tone === 'warning' && 'bg-yellow-50 text-warning',
    ]"
  >
    <slot />
  </span>
</template>
```

**Truco:** `tone === 'neutral' && '...clases...'`. El `&&` en JS devuelve
`false` (que se ignora) o el string (que se concatena). Vue acepta `false`
en el array de clases y simplemente no lo aplica. Más limpio que un objeto
de condicionales con keys.

### Paso 6 — `BaseCard.vue`

**Archivo nuevo:** `src/components/ui/BaseCard.vue`

```vue
<script setup lang="ts">
withDefaults(defineProps<{ padded?: boolean }>(), { padded: true })
</script>

<template>
  <div
    :class="[
      'rounded-lg border border-outline bg-surface',
      padded && 'p-6',
    ]"
  >
    <slot />
  </div>
</template>
```

Tan simple que casi no necesita comentario. Lo importante: encapsula el
"look de card" (border + radius) en un lugar. Si mañana querés sombrear
todas las cards de la app, agregás `shadow-sm` acá y se aplica a todas.

---

## 4 · Verificación: probarlos en `App.vue`

Reemplazá temporalmente el `App.vue` con un showcase para ver que todo
funciona:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseCard from '@/components/ui/BaseCard.vue'

const text = ref('')
const choice = ref('a')
const options = [
  { value: 'a', label: 'Opción A' },
  { value: 'b', label: 'Opción B' },
]
</script>

<template>
  <div class="min-h-screen bg-surface">
    <main class="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Showcase Base*</h1>

      <BaseCard>
        <div class="flex flex-col gap-4">
          <BaseInput v-model="text" label="Email" placeholder="tu@email.com" />
          <BaseInput v-model="text" label="Con error" error="Este email ya existe" />
          <BaseSelect v-model="choice" :options="options" label="Elegí algo" />

          <div class="flex flex-wrap gap-2">
            <BaseBadge>neutral</BaseBadge>
            <BaseBadge tone="accent">accent</BaseBadge>
            <BaseBadge tone="success">success</BaseBadge>
            <BaseBadge tone="error">error</BaseBadge>
            <BaseBadge tone="warning">warning</BaseBadge>
          </div>

          <div class="flex flex-wrap gap-2">
            <BaseButton>Primary</BaseButton>
            <BaseButton variant="secondary">Secondary</BaseButton>
            <BaseButton variant="ghost">Ghost</BaseButton>
            <BaseButton :loading="true">Loading</BaseButton>
            <BaseButton :disabled="true">Disabled</BaseButton>
          </div>

          <p class="text-sm text-ink-muted">
            Input value: <code>{{ text || '(vacío)' }}</code> · Choice:
            <code>{{ choice }}</code>
          </p>
        </div>
      </BaseCard>
    </main>
  </div>
</template>
```

Si abrís `http://localhost:5174` y ves todos los componentes renderizando
correctamente, con sus variantes, hover states funcionando y el `v-model`
de input/select sincronizando con el texto al pie — los componentes base
están listos.

> **No te olvides:** este showcase es **temporal**. Cuando agreguemos el
> router (doc 06), reemplazamos `App.vue` con un layout que tenga `<NavBar>`
> + `<RouterView>`.

---

## 5 · Recap

Lo que hicimos:

- Creamos 5 componentes base (`BaseButton`, `BaseInput`, `BaseSelect`,
  `BaseBadge`, `BaseCard`) que encapsulan las clases recurrentes del
  design system del doc 02.
- Tipamos props con `defineProps<{...}>` y usamos `withDefaults` para
  valores por defecto.
- Implementamos `v-model` custom con `modelValue` + `update:modelValue`.
- Resolvimos variantes con un `Record<Variant, string>` que TS verifica
  exhaustivamente (si agregás un valor al union sin manejarlo, el
  compilador te avisa).
- Usamos `<slot />` para contenido arbitrario en lugar de prop `text`,
  ganando flexibilidad.

**Próximo doc:** [04 — Cliente HTTP con axios + CORS](04-cliente-http-axios.md).
Toca conectar al backend: instancia axios, interceptors, manejo de 401, y
qué pasa cuando el browser dice "CORS error".
