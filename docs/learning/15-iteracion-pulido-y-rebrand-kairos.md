# 15 — Iteración de pulido + rebrand a Kairos

Sesión grande de un día (2026-06-16) que mezcla **bug fixes**, **features
nuevas** y una **renovación visual completa**. No hay una fase nueva del
plan: es la sesión de "afilar todo antes de meterle a juegos / deploy".

Lo que cubre este doc:

1. [Bug fixes](#1-bug-fixes) — fechas en edit, retro colgada, pronóstico
   cuando ya terminaste.
2. [DateField custom](#2-datefield-custom) — chau a los `<input type=date>`
   nativos.
3. [CRUD de géneros desde el admin](#3-crud-de-géneros) — backend + modal
   de gestión.
4. [Toasts globales](#4-toasts-globales) — composable + container, cableado
   en todo.
5. [Filtro de géneros multi-select](#5-filtro-de-géneros) — backend
   `genres[]` + dropdown con búsqueda.
6. [Fondo cinemático + tematización dark](#6-fondo-cinemático--tematización-dark)
   — FormBackdrop + componentes con `variant`.
7. [Rebrand a Kairos](#7-rebrand-a-kairos) — nombre, IMDb badge falso,
   logo.
8. [Patrones aprendidos](#8-patrones-aprendidos).
9. [Próximo](#9-próximo).

---

## 1. Bug fixes

### Fechas en el form de edición no se cargaban

**Síntoma:** abrías la edición de una serie, los inputs "Primer aire" y
"Último aire" quedaban en blanco aunque la BD tuviera fechas.

**Causa:** `Series.firstAired` está declarado con `@column.date()`, así que
Lucid lo deserializa a `Luxon DateTime`. El `ContentTransformer` lo
pickeaba tal cual:

```ts
series: this.pick(this.resource.series, [
  'seasonsCount', 'episodesCount', 'broadcastStatus',
  'firstAired', 'lastAired',
])
```

`JSON.stringify` serializa el `DateTime` como ISO completo
(`"2008-04-05T00:00:00.000-03:00"`). El `<input type="date">` del
navegador **solo acepta `yyyy-MM-dd` puro**, así que se rendía vacío.

**Fix** en el transformer:

```ts
series: {
  seasonsCount: s.seasonsCount,
  episodesCount: s.episodesCount,
  broadcastStatus: s.broadcastStatus,
  firstAired: s.firstAired ? s.firstAired.toFormat('yyyy-MM-dd') : null,
  lastAired: s.lastAired ? s.lastAired.toFormat('yyyy-MM-dd') : null,
}
```

Además: si la serie no está "Finalizada" (`broadcastStatus !== 'ended'`)
ocultamos el input de "Último aire" — no tiene sentido tener fecha de
último aire de una serie en emisión.

### Retrospectiva colgada (spinner eterno)

Yo había agregado un campo `expectedFinishDate` al `retrospective()` del
service, pero **olvidé sumarlo al payload del controller** (el controller
serializa los DateTimes manualmente con `toFormat`):

```ts
// Mal: faltaba la línea de expectedFinishDate
return {
  data: {
    mode, startedAt, finishedAt, expectedDays,
    actualValidDays, actualSkippedDays, ...
  }
}
```

El frontend recibía `expectedFinishDate: undefined`, el template hacía
`formatMedium(undefined)` que llama a `.split('-')` y reventaba. El
`loading.value = false` del `finally` ya se había ejecutado, pero el
render se quedaba en un estado inconsistente → spinner para siempre.

**Lección:** cuando algo "se queda cargando", el bug puede estar
**después** del `loading = false`, en un render que tira `TypeError`.
Chequeá lo que devuelve el backend antes que el frontend.

### Pronóstico cuando ya terminaste no tenía sentido

En `WatchlistDetailPage`, el botón "Pronóstico" aparecía aunque
`finishedAt` estuviera cargado. Fix simple:

```ts
function canForecast(item: WatchlistItem) {
  return (
    !isInherited(item) &&
    item.content?.type === 'series' &&
    !item.finishedAt &&  // ← nuevo
    (item.durationSeconds > 0 || (item.episodesWatched ?? 0) > 0)
  )
}
```

Y la **retrospectiva ahora responde "deberías haber terminado el X"** —
reusa `walkUntilTarget(startedAt, expectedDays, ...)` y devuelve esa
fecha. El modal muestra:

> A tu ritmo deberías haber terminado el **viernes 4 de marzo**.
> Terminaste el **martes 12 de abril** (empezaste el 1 de enero).

---

## 2. DateField custom

Reemplazo total de los `<input type="date">` nativos por un componente
propio (`src/components/ui/DateField.vue`, ~280 líneas).

**Por qué cambiar:** el calendario nativo del navegador es feo,
inconsistente entre browsers y rompe con el design system. Además su
estilo no se puede customizar más allá del `[color-scheme:dark]`.

**Características:**

- **3 modos** navegables desde el header:
  - `days`: grilla mensual 6×7.
  - Click en el nombre del mes → `months` (grilla 3×4 con los 12 meses).
  - Click en el año → `years` (grilla 3×4 con bloques de 12 años).
- **2 variantes**: `light` (admin claro) y `dark` (modales sobre fondo
  oscuro).
- **v-model con string `yyyy-MM-dd`** → integra 1:1 con los lugares que
  usaban input nativo (no hay que tocar nada del save/load).
- **Footer** con botones **Limpiar** y **Hoy** (saltea al día actual
  respetando `min`/`max` si los hay).
- **Accesible**: `role="dialog"`, `aria-haspopup`, `aria-expanded`,
  Escape cierra, click-outside cierra.
- Animación sutil de fade + scale al abrir.

**Truco UX**: el día de **hoy** lleva un anillo (`ring-1`) y el
**seleccionado** se rellena con accent — los dos están claros y no se
confunden.

**Reemplazos hechos:**

| Archivo | Antes | Ahora |
|---|---|---|
| AdminContentFormPage | 2× input nativo | DateField light |
| ItemTrackingModal | 2× input nativo | DateField dark |
| ForecastModal | 1× input nativo | DateField dark |

El cambio fue invisible para la lógica de guardado.

---

## 3. CRUD de géneros

Antes los géneros eran **seed-only**: solo se podían crear corriendo el
seeder. La admin no podía agregar/editar/eliminar desde la UI.

### Backend

```ts
// app/modules/content/validators/genre_validator.ts
export const createGenreValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(80),
  })
)
```

El **slug no se acepta del cliente** — lo genera el controller con
`slugify(name)` (NFD + sin diacríticos + lowercase + `[^a-z0-9]→-`).
Si choca con un slug existente, le suma `-2`, `-3`, … hasta encontrar
uno libre. La unicidad la garantiza el `UNIQUE` de la BD; el bucle es
para no mostrarle a la admin un error cuando dos nombres normalizan al
mismo slug ("Sci-Fi" y "Sci Fi").

```ts
async store({ request, response, serialize }) {
  const { name } = await request.validateUsing(createGenreValidator)
  const baseSlug = slugify(name)
  let slug = baseSlug
  let suffix = 1
  while (suffix < 100 && (await Genre.findBy('slug', slug))) {
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }
  const genre = await Genre.create({ name, slug })
  response.status(201)
  return serialize(GenreTransformer.transform(genre))
}
```

`update()` cambia el `name` pero **mantiene el slug original** — si la
admin renombra "Comedia" a "Comedy", la URL/slug sigue siendo `comedia`.
Lo mismo que hacemos con `Content` (ver doc 14).

`destroy()` borra el género; la pivot `content_genre` se limpia sola con
`ON DELETE CASCADE`.

Rutas: `POST/PATCH/DELETE /api/v1/genres[/:id]` bajo el grupo admin.

### Frontend

Dos UIs distintas:

1. **Botón "+ Nuevo género"** inline en el panel de géneros del form
   admin → mini-form expandible con input + Crear/Cancelar. Al crear,
   inserta alfabéticamente en `allGenres` y selecciona automáticamente.
   Si el nombre ya existe (case-insensitive), solo lo selecciona (no
   crea duplicado).

2. **GenreManagerModal** — modal aparte para rename/delete:
   - Lista alfabética con cada género en una fila.
   - Input editable + botón **Guardar** que aparece solo si cambió el
     nombre.
   - Icono de papelera → la fila se transforma en confirmación inline
     ("¿Eliminar X? Se desvincula de los contenidos que lo usen.
     [Cancelar] [Eliminar]"). **No usamos ConfirmModal** dentro de otro
     modal — anidar Teleports puede dar problemas de z-index; la
     confirmación inline en la fila es más simple y contextual.
   - Eventos: `@updated` y `@deleted` para que el padre sincronice
     `allGenres` y limpie `selectedGenreIds` (importante: si la admin
     borra un género que tenía marcado, hay que sacarlo del estado del
     form para no romper el save).

---

## 4. Toasts globales

Hasta ahora teníamos banners `actionError` regados por todas las páginas.
Cada error nuevo era un nuevo banner. Cada éxito era… nada (a veces un
banner verde con timeout manual).

Solución: **un sistema global**, reutilizable, con animaciones.

### Composable

```ts
// src/composables/useToast.ts
const state = reactive({ toasts: [] as Toast[] })
let nextId = 1

function push(variant, message, duration) {
  const id = nextId++
  state.toasts.push({ id, variant, message })
  if (duration > 0) window.setTimeout(() => dismiss(id), duration)
}

export function useToast() {
  return {
    toasts: state.toasts,
    success: (msg, dur = 3500) => push('success', msg, dur),
    error:   (msg, dur = 5000) => push('error', msg, dur),
    info:    (msg, dur = 3500) => push('info', msg, dur),
    dismiss,
  }
}
```

**Clave**: el `state` vive en **module scope**, no dentro de la función.
Así todas las invocaciones de `useToast()` comparten la misma cola. No
hace falta provide/inject ni un store de Pinia: el módulo en sí es el
singleton.

### Container

```vue
<!-- ui/ToastContainer.vue -->
<Teleport to="body">
  <div class="fixed right-4 top-4 z-[60] ...">
    <TransitionGroup
      enter-from-class="opacity-0 -translate-y-2 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="... absolute right-0"
      leave-to-class="opacity-0 translate-x-4"
      move-class="transition duration-200 ease-out"
    >
      <div v-for="t in toasts" :key="t.id" ...>
        ...
      </div>
    </TransitionGroup>
  </div>
</Teleport>
```

**`TransitionGroup`** es el equivalente de `<Transition>` para listas.
La clase `move-class` anima los toasts que se desplazan cuando uno se
remueve. La clase `leave-active-class` con `absolute right-0` saca al
toast saliendo del flujo para que los otros se acomoden suave.

Montado **una sola vez** en `App.vue`:

```vue
<template>
  <div :class="isFullBleed ? '... bg-black' : '... bg-surface'">
    <NavBar />
    <main><RouterView /></main>
    <ToastContainer />
  </div>
</template>
```

### Cableado

Todo lo que antes seteaba `actionError.value = '...'` ahora hace
`toast.error(...)` y los éxitos hacen `toast.success(...)`. Ejemplos:

- `AdminContentsPage.confirmDelete` → `toast.success(\`\${label} "\${title}" eliminada\`)`.
- `AdminContentFormPage.submit` → en edit: aplica la respuesta a refs locales **sin redirigir** y muestra `'Cambios guardados'`. En create: redirige al listado y muestra `'Contenido creado'`.
- `WatchlistsPage`: create/rename/visibility/delete/reorder.
- `WatchlistDetailPage`: quitar item, tracking saved.
- `ContentDetailPage`: quick-rate ("Tu puntuación: X/10"), review save/delete.
- `PacePage`: savePace, addHoliday, removeHoliday (con mensajes específicos por error).
- `GenreManagerModal`: success en rename/delete; errores quedan inline en cada fila (más contextual que toast cuando el error es de una fila específica).

Y limpieza colateral: borré los refs `actionError`, `paceError`,
`holidayError`, `paceSaved` y sus banners. Menos código, menos estado.

**Regla heurística** que decanté:
- **Errores de network/server** → toast.
- **Errores de validación local** → toast también (más visible que un
  banner inline).
- **Errores específicos de una fila/item** → inline (el toast pierde el
  contexto de "cuál fue").

---

## 5. Filtro de géneros

El catálogo tenía una fila de pills "Todos / Action / Anime / ...". Con
14 géneros ya ocupaba 2 líneas. La pregunta de la usuaria fue: "¿y si
tengo 300 géneros?".

### Backend: de `genre` (single) a `genres` (multi)

Validator:

```ts
// Antes
genre: vine.string().trim().minLength(2).maxLength(60).optional()
// Ahora
genres: vine.string().trim().minLength(2).maxLength(500).optional()
```

`genres` es un **CSV string** (`"action,anime"`). El controller lo
splittea:

```ts
const { genres: genresCsv, ...rest } = params
const genres = genresCsv
  ? genresCsv.split(',').map(s => s.trim()).filter(Boolean)
  : undefined
const paginator = await service.search({ ...rest, genres })
```

Service:

```ts
if (genres && genres.length > 0) {
  query.whereHas('genres', (q2) => q2.whereIn('slug', genres))
}
```

**Semántica OR**: un content que tenga **al menos uno** de los géneros
aparece. Es lo más natural para un filtro de checkboxes — si marcás
"Action" y "Anime", esperás ver cosas de Action **o** de Anime, no la
intersección.

### Frontend: GenreFilter

Componente nuevo (`src/components/content/GenreFilter.vue`):

- **Trigger compacto**: botón `[ 🔻 Géneros · 3 ▾ ]` con badge accent
  cuando hay seleccionados.
- **Popover** con search input arriba (foco automático, normalize-acentos
  con NFD para que "anime" matchee "Animé"), lista scroll de checkboxes
  (`max-h-64`), footer con "Limpiar selección" + "Cerrar".
- **Escape cierra, click-outside cierra, accesible**.
- v-model: `string[]` de slugs.

**Aguanta cientos de géneros** porque la lista tiene scroll vertical y
la búsqueda filtra en vivo.

Axios necesitó un truco para serializar:

```ts
list: async (params: ContentListParams = {}) => {
  const { genres, ...rest } = params
  const query: Record<string, unknown> = { ...rest }
  if (genres && genres.length > 0) query.genres = genres.join(',')
  return client.get('/contents', { params: query })
}
```

Por default axios serializa arrays como `?genres[]=action&genres[]=anime`,
pero el backend espera CSV (`?genres=action,anime`). Joineamos
manualmente.

---

## 6. Fondo cinemático + tematización dark

La cara grande de la sesión. Cambio visual coordinado en muchas páginas.

### FormBackdrop

Componente reusable (`src/components/ui/FormBackdrop.vue`) que provee:

- **Imagen de fondo fixed cover** con **Ken Burns** lento (38s ciclo,
  scale 1.05→1.14 + traslación sutil).
- **10 partículas doradas** flotando hacia arriba con delays
  pre-calculados (no random — para que el look sea consistente entre
  renders).
- **Overlay** gradient + vignette radial en los bordes para que cualquier
  card encima se lea bien.
- **Slot default** para el contenido.
- Respeta `prefers-reduced-motion`.

Prop `image` opcional (default `/forms-bg.png` para forms,
`/catalog-bg.png` para el catálogo).

### Páginas full-bleed cinemáticas

Marqué 5 rutas como `meta.fullBleed: true`: `/`, `/login`, `/signup`,
`/admin/contents`, `/admin/contents/new`, `/admin/contents/:slug/edit`.
`App.vue` ya sabía cambiar `bg-surface` por `bg-black` cuando es
`fullBleed`, y el `NavBar` ya tenía la lógica `isDark`. Solo había que
envolver el contenido de cada página con `<FormBackdrop>`.

### Componentes con `variant`

Patrón clave: cuando un componente usado en páginas light y dark, sumarle
prop `variant: 'light' | 'dark'` con un `computed` que agrupa todas las
clases por variant:

```ts
const styles = computed(() => {
  if (props.variant === 'dark') {
    return {
      trigger: 'border-white/15 bg-white/[0.04] text-white ...',
      input: 'border-white/15 bg-black/30 text-white ...',
      // ...
    }
  }
  return {
    trigger: 'border-outline bg-white text-ink ...',
    input: 'border-outline bg-surface text-ink ...',
    // ...
  }
})
```

Y en template: `:class="styles.trigger"`. Es la única forma escalable
que encontré para no duplicar componentes ni hackear con `:deep()`.

**Componentes que ahora tienen variant:**

- `BaseInput`
- `BaseSelect`
- `ImageUploadInput` (con todos sus sub-estados: preview, drop-zone,
  progress, URL mode, errores)
- `GenreFilter` (trigger + popover + lista + footer)
- `DateField` (ya nació con variant)

**`BaseButton`** sumó variante `'gold'`: `bg-amber-400 text-black
shadow-amber` para CTAs cinemáticos.

`ContentCard` y `PaginationControls` los pasé a **dark hardcoded** porque
sus únicos usos hoy están en páginas dark. Si en el futuro hace falta
una variante light, los parametrizamos.

### Glow animado

Cada card grande de form tiene un border dorado que respira:

```css
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
```

El `box-shadow` doble (externo + inset) hace que el borde dorado se
"encienda" suavemente. Ciclo de 5s — lento, no distrae.

---

## 7. Rebrand a Kairos

### IMDb badge falso

El `ContentDetailHeader` mostraba un badge amarillo `IMDb 7.0/10` que en
realidad usaba `avgRating` interno (el promedio de las reseñas de la app,
NO de IMDb). Mentira que se nos coló.

**Decisión**: borrar el badge. La línea inferior `★ X.X prom. · N
puntuaciones` queda como la única fuente, y ahora **se muestra siempre**
(antes era condicional `v-if="ratingForBadge"`). Cuando no hay reseñas,
`avgRatingLabel` devuelve `"0.0"`:

```ts
const avgRatingLabel = computed(() => {
  const v = props.content.avgRating
  return v === null ? '0.0' : v.toFixed(1)
})
```

### Cambio de nombre

`ReviewHub` → `Kairos` en los lugares user-visible:

- `index.html` title.
- `NavBar` (texto del logo).
- `PacePage` ("Decile a Kairos cuánto ves por día…").
- Comentario interno de `ContentDetailHeader`.

**NO cambié intencionalmente** (deuda decidida):

- `localStorage` keys (`reviewhub_token`, `reviewhub_lists_tab`) →
  cambiarlas desloguea a todos los users y borra preferencias.
- `.env.development` upload preset (`reviewhub_covers`) → está
  configurado así en Cloudinary; renombrarlo requiere reconfigurar el
  preset.
- Carpetas Cloudinary (`reviewhub/covers/...`) → assets ya subidos están
  ahí; migrarlos no aporta valor.
- Docs viejos.

### Logo

La usuaria pasó un PNG con fondo gris opaco. Probamos varias estrategias:

1. **`mix-blend-mode: screen`** sobre fondo dark — el gris medio del PNG
   no se vuelve transparente, solo se aclara. Queda un cuadrado gris
   visible.
2. **Filtros `brightness/contrast`** para llevar el gris al negro y dejar
   el dorado vivo — funciona en teoría pero los valores extremos
   oscurecen también el símbolo.
3. **Recortar el centro en un círculo** con `overflow-hidden rounded-full`
   y `object-position 50% 35%` + `scale(1.3)` para esconder el fondo
   gris fuera del crop — más limpio pero el detalle del símbolo se ve
   chiquito.

**Conclusión**: ninguna técnica CSS reemplaza un PNG con alfa o un SVG.
Por ahora el navbar muestra **solo el wordmark** `KAIROS` en dorado
(uppercase, tracking ancho `0.25em`). Cuando la usuaria consiga el PNG
transparente, lo integramos al lado del texto.

**Lección que vale guardar**: `mix-blend-mode` modifica luminancia, no
opacidad. Para logos con fondo, la única solución limpia es PNG con
alfa o SVG.

---

## 8. Patrones aprendidos

### Cuando algo "se queda cargando"

El `finally { loading = false }` siempre se ejecuta, pero un render que
tira `TypeError` sobre `undefined.split('-')` deja la vista en estado
inconsistente. **Chequeá el payload del backend antes que el frontend.**

### Cambiar el service requiere mirar el controller

Si el controller arma el payload manualmente (mapea cada campo con
`toFormat('yyyy-MM-dd')`), agregar un campo en el service no alcanza —
hay que sumarlo también en el controller. Lección cara: una línea
olvidada = spinner eterno.

### Componente con `variant` > componente duplicado

Cuando el mismo componente vive en páginas light y dark, sumarle
`variant: 'light' | 'dark'` + computed `styles` es la forma escalable.
Lo intenté con `:deep()` selectors y se vuelve frágil. Con prop
explícita, cada uso elige su tema y el componente queda limpio.

### Toasts > banners

Una cola global con TransitionGroup posicionada en top-right ocupa el
mismo footprint que una sola línea de banner, pero:

- No bloquea el contenido (el banner reserva espacio en el flujo).
- Mantiene múltiples mensajes apilados.
- Auto-dismiss con timer.
- Reusable desde cualquier componente sin pasar props.

Vale la pena el armado inicial.

### Module-scope reactive como singleton

Para estado compartido por toda la app sin pasar provide/inject,
declarar el `reactive(...)` **fuera** de la función exportada:

```ts
const state = reactive({ ... })       // module scope = singleton
export function useToast() {
  return { state, push, dismiss }
}
```

Cada `useToast()` devuelve la misma referencia. Más simple que un
store de Pinia para casos chicos.

### `mix-blend-mode` no transparenta

Solo modifica luminancia/color. Para logos con fondo opaco, la única
solución limpia es PNG con alfa o SVG.

---

## 9. Próximo

Acordamos implementar **juegos** como `content.type = 'game'`. Las
decisiones tomadas (HLTB simple, plataformas enum fija, sin estado
"Abandonado" inicial, **géneros propios** de juegos) están guardadas
en memoria; cuando arranquemos, la fase es 1-2 sesiones (backend
3-4h + frontend 4-5h).

Después de juegos: fase 6 (polish + tests + deploy) sigue pendiente —
toasts ya están metidos así que ese ítem se puede cruzar de la lista.

---

## Commits relevantes

- Backend: agregar al cierre del push.
- Frontend: agregar al cierre del push.

Doc completo, sigan brillando con dorado.
