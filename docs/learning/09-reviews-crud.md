# 09 — Reviews CRUD: form, modal, quick-rate y rate-only

> **Pre-requisitos:** docs 01-08. Tenés la detail page cinemática
> funcionando, las reseñas se **listan** (read), el `RatingStars` y el
> `ReviewItem` ya existen con sus variantes de tema, y el cliente HTTP
> con interceptor de auth.
>
> **Objetivo:** darle a las reseñas las otras tres letras del CRUD —
> **C**reate, **U**pdate, **D**elete — desde la UI. Y de paso resolver
> una decisión de producto que apareció en el camino: **poder puntuar
> sin escribir reseña** (solo estrellas). Eso obliga a tocar el backend
> (que hoy exige título y cuerpo), así que este doc es **fullstack**:
> arranca en AdonisJS y termina en Vue.

Al terminar este doc vas a entender:

- La diferencia entre una **puntuación** (solo rating) y una **reseña
  escrita** (rating + texto), y por qué conviene modelarlas como la
  misma tabla pero mostrarlas distinto.
- Cómo hacer un campo **opcional en VineJS** y **nullable en la DB**
  con una **migración `ALTER`** (sin recrear la tabla).
- El patrón **modal con `<Teleport>` + `<Transition>`** y por qué el
  `v-if` que lo monta es lo que hace que el form arranque limpio cada
  vez.
- Cómo convertir un `RatingStars` de solo-lectura en un **picker
  editable** que emite `update:value`.
- La estrategia **refetch vs optimistic update** tras una mutación, y
  por qué acá elegimos refetch.
- Cómo hacer **quick-rate**: puntuar con un click en el header sin
  abrir ningún form, haciendo POST o PATCH según corresponda.
- Cómo el backend **recalcula el promedio solo** con hooks de Lucid, y
  por qué eso cambia qué tenés que volver a pedir después de mutar.
- Por qué **filtramos** las puntuaciones sin texto de la lista de
  reseñas, y cómo eso obliga a separar dos conteos distintos.

---

## 1 · El modelo mental: puntuación vs reseña escrita

Hasta el doc 08, una "reseña" siempre tenía tres cosas obligatorias:
`rating`, `title`, `body`. Pero la mayoría de la gente quiere hacer lo
mínimo: **poner una nota y seguir**. Obligar a escribir un párrafo para
calificar espanta.

La decisión: **el texto pasa a ser opcional**. Una fila de la tabla
`reviews` puede ser:

- **Puntuación pura:** `rating` + `title=null` + `body=null`.
- **Reseña escrita:** `rating` + `title` y/o `body` con contenido.

Las dos viven en la misma tabla (no inventamos una tabla `ratings`
aparte) porque comparten todo: pertenecen a un user, a un content, son
únicas por `(content, user)`, y **ambas cuentan para el promedio**. La
única diferencia es de presentación:

- El **promedio del header** cuenta *todas* las filas → las llamamos
  "puntuaciones".
- La **lista de reseñas de abajo** muestra *solo* las que tienen texto
  → las llamamos "reseñas escritas".

> **Lo importante:** la regla "una puntuación sin texto no es una
> reseña que valga la pena listar, pero sí cuenta para el promedio"
> es una decisión de **producto**, no técnica. La traducimos a código
> en el §7 (filtro) y §8 (dos conteos).

---

## 2 · Backend: hacer el texto opcional

El frontend no puede mandar `{ rating: 8 }` solo si el backend rechaza
el request por falta de `title`/`body`. Así que empezamos por ahí.
Cuatro archivos en `Proyect/`.

### 2.1 · El validator (VineJS)

`app/modules/reviews/validators/review_validator.ts`:

```ts
export const createReviewValidator = vine.compile(
  vine.object({
    rating: vine.number().withoutDecimals().min(1).max(10),
    title: vine.string().trim().minLength(3).maxLength(200).optional(),
    body: vine.string().trim().minLength(10).maxLength(10000).optional(),
  })
)
```

El único cambio es `.optional()` al final de `title` y `body`.

**Qué hace `.optional()` exactamente:** si el campo **no viene** en el
payload, lo deja pasar. Pero si **viene**, igual aplica las reglas
(`minLength(3)` etc.). O sea: o no mandás título, o mandás uno válido.
No podés mandar un título de 1 carácter. Eso es justo lo que queremos.

El `updateReviewValidator` ya tenía los tres campos `.optional()` desde
el doc 08 (en un update siempre todo es opcional), así que no se toca.

### 2.2 · El modelo

`app/modules/reviews/models/review.ts` — las columnas pasan a aceptar
`null`:

```ts
@column()
declare title: string | null

@column()
declare body: string | null
```

Esto es solo el **tipo de TypeScript** del modelo. No cambia la base de
datos — para eso va la migración.

### 2.3 · La migración `ALTER` (no recrear la tabla)

Acá hay una trampa clásica de principiante: **no edites la migración
que ya corrió**. La tabla `reviews` ya existe en tu DB con `title` y
`body` como `NOT NULL`. Si editás `..._create_reviews_table.ts`, esos
cambios **no se aplican** a una DB que ya tiene la migración marcada
como ejecutada. Tenés que crear una migración **nueva** que modifique
la tabla existente.

`database/migrations/<timestamp>_alter_reviews_title_body_nullable.ts`:

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reviews'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('title', 200).nullable().alter()
      table.text('body').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('title', 200).notNullable().alter()
      table.text('body').notNullable().alter()
    })
  }
}
```

Dos cosas clave:

- **`.alter()`** le dice a Knex "no crees la columna, modificá la que
  ya existe". Sin `.alter()` intentaría hacer un `ADD COLUMN` y
  explotaría porque ya existe.
- **`down()` revierte**: vuelve a `notNullable`. Ojo, si ya tenés filas
  con `title=null`, el `down` va a fallar (no podés volver a NOT NULL
  con datos null adentro). Es esperado: el `down` es para revertir
  *antes* de generar esos datos.

El timestamp del nombre tiene que ser **mayor** que el de la migración
de creación, así corre después.

```powershell
node ace migration:run
```

```
❯ migrated database/migrations/..._alter_reviews_title_body_nullable
Migrated in 482 ms
```

### 2.4 · El service

`app/modules/reviews/services/review_service.ts` — el input opcional y
la coerción a `null`:

```ts
interface CreateReviewInput {
  rating: number
  title?: string
  body?: string
}

// dentro de createForContent:
const review = await Review.create(
  {
    contentId: content.id,
    userId,
    rating: input.rating,
    title: input.title ?? null,
    body: input.body ?? null,
  },
  { client: trx }
)
```

El `?? null` es importante: si `input.title` es `undefined`, lo
convertimos explícitamente a `null` para que la columna quede en `NULL`
y no en `undefined` (que Lucid podría interpretar distinto).

El `updateOwn` ya usaba el patrón "mergeá solo lo que vino":

```ts
review.merge({
  ...(input.rating !== undefined && { rating: input.rating }),
  ...(input.title !== undefined && { title: input.title }),
  ...(input.body !== undefined && { body: input.body }),
})
```

**Lo importante de este patrón:** un PATCH con `{ rating: 9 }` cambia
*solo* el rating y deja título/body como estaban. Eso es exactamente lo
que necesita el quick-rate del §6.

### 2.5 · El transformer ya estaba listo

`review_transformer.ts` hace `this.pick(..., ['title', 'body', ...])`.
Como `pick` copia el valor tal cual, un `null` se serializa como `null`
en el JSON. No hay que tocar nada — ya es null-safe.

> **Verificá el backend antes de seguir:** `npx tsc --noEmit` en
> `Proyect/`. Si el modelo quedó mal tipado, salta acá y no en runtime.

---

## 3 · Frontend: tipos y métodos de API

### 3.1 · `Review` con texto nullable

`src/api/types.ts` — espejamos el backend:

```ts
export interface Review {
  id: string
  contentId: string
  rating: number
  title: string | null    // ← antes string
  body: string | null     // ← antes string
  createdAt: string
  updatedAt: string | null
  user?: ReviewAuthor
}
```

**Por qué importa:** ahora cada vez que uses `review.title` en un
template, TypeScript te va a recordar que puede ser `null`. Eso nos
fuerza a poner los `v-if` del §7 — el tipo es el que te protege de
renderizar un título vacío sin querer.

### 3.2 · Los métodos CRUD

`src/api/reviews.ts` crece con `create`, `update`, `destroy`:

```ts
export interface CreateReviewInput {
  rating: number     // 1-10
  title?: string     // opcional: se puede puntuar sin reseña
  body?: string      // opcional
}

export type UpdateReviewInput = Partial<CreateReviewInput>

export const reviewsApi = {
  listByContent: async (slug, params = {}) => { /* doc 08 */ },

  create: async (slug: string, input: CreateReviewInput) => {
    const { data } = await client.post<{ data: Review }>(
      `/contents/${slug}/reviews`, input
    )
    return data.data
  },

  update: async (reviewId: string, input: UpdateReviewInput) => {
    const { data } = await client.patch<{ data: Review }>(
      `/reviews/${reviewId}`, input
    )
    return data.data
  },

  destroy: async (reviewId: string) => {
    await client.delete(`/reviews/${reviewId}`)
  },
}
```

- `create` postea bajo el content (`/contents/:slug/reviews`) porque la
  reseña nace asociada a un contenido.
- `update` y `destroy` van por `/reviews/:id` — una vez que existe, la
  reseña tiene identidad propia y no necesitás el slug.
- `UpdateReviewInput = Partial<CreateReviewInput>`: en un update todo es
  opcional, así que reusamos el tipo de create envuelto en `Partial`.
- `destroy` no devuelve nada (el backend responde `204 No Content`).

---

## 4 · `RatingStars` editable — de display a picker

El `RatingStars` del doc 08 era solo-lectura (mapeaba `rating/2` a 5
estrellas rellenas). Para puntuar necesitamos que sea **clickeable**.
Le agregamos una prop `editable`:

```ts
const props = withDefaults(defineProps<{
  value: number | null
  editable?: boolean
  // size, theme, showNumber...
}>(), { editable: false })

const emit = defineEmits<{ 'update:value': [value: number] }>()
```

Cuando `editable` es true, renderiza **10 botones** (no 5), porque el
rating del backend es 1-10 y queremos precisión de media-estrella
visual:

```vue
<button
  v-for="n in 10"
  :key="n"
  type="button"
  class="star-btn"
  @click="pick(n)"
  @mouseenter="hovered = n"
  @mouseleave="hovered = 0"
>★</button>
```

```ts
function pick(n: number) {
  emit('update:value', n)
  // dispara la animación "pop" 450ms
}
```

**Lo importante:** el componente no guarda el rating; lo **emite**. Es
"controlled" — el padre decide qué hacer con el valor. Eso permite usar
el mismo `RatingStars` editable en dos lugares (el form del §5 y el
header del §6) con comportamientos distintos.

La animación (`starPop` keyframe, hover con `scale` + `rotate`, glow con
`text-shadow`) es puro CSS y respeta `prefers-reduced-motion`. No es el
foco del doc, pero está comentada en el `.vue`.

---

## 5 · `ReviewForm` — el form reutilizable create/edit

Un solo componente sirve para crear **y** editar. La diferencia la
deduce de si recibió una reseña inicial:

```ts
const props = defineProps<{
  contentSlug: string
  initial?: Review | null    // si viene → modo edit
  presetRating?: number      // pre-cargar una nota
}>()

const mode = computed<'create' | 'edit'>(() => (props.initial ? 'edit' : 'create'))

const form = reactive<{ rating: number; title: string; body: string }>({
  rating: props.initial?.rating ?? props.presetRating ?? 0,
  title: props.initial?.title ?? '',
  body: props.initial?.body ?? '',
})
```

> **Por qué `form` usa `string` y no `string | null`:** un `<input>`
> v-modeleado no puede bindear `null` (rompe). El form interno siempre
> trabaja con strings (`''` para vacío). La conversión a `null` la hace
> el backend cuando recibe `undefined`.

### 5.1 · Validación: solo si escribiste algo

Como el texto es opcional, la validación cambia de "siempre exigir
mínimo" a "exigir mínimo **solo si hay contenido**":

```ts
function validate(): boolean {
  const errs: Record<string, string> = {}
  if (form.rating < 1 || form.rating > 10) {
    errs.rating = 'Elegí una calificación entre 1 y 10.'
  }
  // Título y body son opcionales: solo se validan si escribiste algo.
  if (titleCount.value > 0 && titleCount.value < TITLE_MIN) {
    errs.title = `Mínimo ${TITLE_MIN} caracteres (o dejalo vacío).`
  } else if (titleCount.value > TITLE_MAX) {
    errs.title = `Máximo ${TITLE_MAX} caracteres.`
  }
  // ídem body...
  fieldErrors.value = errs
  return Object.keys(errs).length === 0
}
```

El `rating` es lo único realmente obligatorio. Los `> 0 &&` son la clave
del "opcional pero válido si está".

### 5.2 · El payload: `|| undefined` para mandar vacío como ausente

```ts
const payload: CreateReviewInput = {
  rating: form.rating,
  title: form.title.trim() || undefined,
  body: form.body.trim() || undefined,
}
```

`'' || undefined` da `undefined`. Así, un campo vacío **no se manda**, y
el backend lo guarda como `null` (§2.4). Si lo mandáramos como `''`, el
validator lo rechazaría (no llega al `minLength(3)`).

### 5.3 · Manejo de errores: 422 y 409

```ts
catch (e) {
  const status = axios.isAxiosError(e) ? e.response?.status : undefined
  if (status === 422) {
    fieldErrors.value = extractFieldErrors(e)   // reusado del doc 07
  } else if (status === 409) {
    generalError.value = extractErrorMessage(e) // ya reseñaste este contenido
  } else {
    generalError.value = extractErrorMessage(e)
  }
}
```

- **422** = el validator del backend rechazó algo → mapeamos a errores
  por campo con el mismo `extractFieldErrors` que armamos para los forms
  de auth (doc 07). Reuso puro.
- **409** = `UNIQUE (content_id, user_id)` — el user ya tiene una reseña
  para este contenido. El backend lo traduce a un 409 con `{ message }`.

---

## 6 · `ReviewModal` — Teleport + Transition

No queremos una página dedicada para escribir; queremos un modal sobre
el detail. Tres piezas:

```vue
<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 ...backdrop blur..." @click.self="emit('close')">
        <div class="modal-card">
          <ReviewForm
            :content-slug="contentSlug"
            :initial="initial"
            :preset-rating="presetRating"
            @success="emit('success', $event)"
            @cancel="emit('close')"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
```

Cada pieza resuelve un problema concreto:

- **`<Teleport to="body">`** saca el modal del árbol del componente y lo
  monta directo en `<body>`. Sin esto, el `overflow-hidden` o el
  `transform` del hero cinemático recortarían el modal o le romperían el
  `position: fixed`.
- **`<Transition name="fade">`** anima la entrada/salida (fade del
  backdrop). Vue maneja el montaje/desmontaje.
- **`v-if="open"`** (no `v-show`): esto **destruye y recrea** el
  `ReviewForm` cada vez que abrís. ¿Por qué importa? Porque el `reactive`
  del form se inicializa en el setup. Con `v-if`, cada apertura arranca
  con valores frescos (el `presetRating` nuevo, el `initial` nuevo). Con
  `v-show` el form quedaría montado con el estado de la vez anterior.

Extras de UX que el modal maneja: **ESC para cerrar**, **click en el
backdrop** (`@click.self`) para cerrar, y **lock del scroll del body**
mientras está abierto (`document.body.style.overflow = 'hidden'`).

---

## 7 · `ContentDetailPage` — la orquestación de las mutaciones

Acá vive el estado y las decisiones. El header y el modal solo emiten
eventos; la page los traduce en llamadas a la API + refetch.

### 7.1 · ¿Cuál es *mi* reseña?

```ts
const myReview = computed(() => {
  if (!auth.user) return null
  return reviews.value.find((r) => r.user?.id === auth.user!.id) ?? null
})

const canWriteReview = computed(() => auth.isAuthenticated && !myReview.value)
```

Como cada user tiene **una** reseña por contenido (constraint UNIQUE),
buscar la propia es un `find` por `user.id`. Si la encuentra, mostramos
"editar"; si no, "escribir".

### 7.2 · Abrir el modal (create / edit)

```ts
function openCreate() {
  if (!auth.isAuthenticated) { router.push({ path: '/login', query: { redirect: route.fullPath } }); return }
  editingReview.value = myReview.value ?? null
  presetRating.value = undefined
  modalOpen.value = true
}

function openEdit(review: Review) {
  editingReview.value = review
  presetRating.value = undefined
  modalOpen.value = true
}
```

### 7.3 · Quick-rate: puntuar **sin** abrir el modal

Este es el corazón del "puntuar sin escribir". El header emite
`quick-rate` con un número, y la page lo resuelve **directo contra la
API**, sin form:

```ts
async function openQuickRate(rating: number) {
  if (!auth.isAuthenticated) { router.push({ path: '/login', query: { redirect: route.fullPath } }); return }
  actionError.value = null
  try {
    if (myReview.value) {
      await reviewsApi.update(myReview.value.id, { rating })  // PATCH solo el rating
    } else {
      await reviewsApi.create(slug.value, { rating })          // POST solo el rating
    }
    await Promise.all([loadReviews(), loadContent()])
  } catch (e) {
    actionError.value = 'No pudimos guardar tu puntuación. Intentá de nuevo.'
  }
}
```

- Si **ya tengo** reseña → `PATCH { rating }` (gracias al merge del
  §2.4, solo cambia la nota, conserva el texto si lo había).
- Si **no tengo** → `POST { rating }` (el backend guarda title/body como
  `null`).

### 7.4 · Refetch vs optimistic — y por qué refetch

Tras cualquier mutación hacemos:

```ts
await Promise.all([loadReviews(), loadContent()])
```

**¿Por qué pedir las dos cosas?** Porque en el backend el modelo `Review`
tiene hooks de Lucid (`@afterCreate`, `@afterUpdate`, `@afterDelete`)
que **recalculan** `avg_rating` y `review_count` del contenido. O sea:
cuando puntúo, el promedio del header cambia del lado del servidor. Si
solo recargara `reviews` y no `content`, el header mostraría el promedio
viejo.

**¿Por qué refetch y no optimistic update?** Optimistic = actualizar la
UI al toque asumiendo que va a salir bien, sin esperar al server. Es más
rápido visualmente, pero acá tendríamos que **recalcular el promedio en
el cliente** replicando la lógica del backend (el AVG sobre todas las
reseñas). Duplicar esa lógica es frágil: si el backend cambia cómo
calcula, el front miente. Con refetch, **el server es la única fuente de
verdad**. Para esta escala (decenas de reseñas) el costo de un request
extra es despreciable.

### 7.5 · Borrar con confirmación

```ts
async function handleDelete(review: Review) {
  if (!window.confirm('¿Borrar esta reseña? No se puede deshacer.')) return
  deletingId.value = review.id
  try {
    await reviewsApi.destroy(review.id)
    await Promise.all([loadReviews(), loadContent()])
  } finally {
    deletingId.value = null
  }
}

function canDeleteReview(review: Review): boolean {
  if (!auth.user) return false
  if (auth.isAdmin) return true                 // admin borra cualquiera
  return review.user?.id === auth.user.id       // user borra la propia
}
```

`deletingId` evita doble-click mientras el request está en vuelo. El
admin puede borrar cualquier reseña (moderación); el user común, solo la
suya. **Ojo:** esto es UX — el backend igual revalida el permiso. Nunca
confíes en que el front esconda un botón; el server tiene que verificar.

### 7.6 · Filtrar las puntuaciones sin texto de la lista

Acá aterriza la decisión del §1. La lista de abajo muestra solo reseñas
**con texto**:

```ts
const writtenReviews = computed(() =>
  reviews.value.filter((r) => (r.title && r.title.trim()) || (r.body && r.body.trim()))
)
```

Y en el template usamos `writtenReviews` (no `reviews`) para el render,
el empty state y el conteo:

```vue
<p v-if="writtenReviews.length">
  {{ writtenReviews.length }} {{ writtenReviews.length === 1 ? 'reseña escrita' : 'reseñas escritas' }}
</p>

<div v-else-if="writtenReviews.length === 0"> empty state </div>

<ReviewItem v-for="r in writtenReviews" :key="r.id" :review="r" ... />
```

Y en `ReviewItem`, los `v-if` que el tipo `string | null` nos obligó a
poner:

```vue
<h4 v-if="hasTitle">{{ review.title }}</h4>
<p v-if="hasBody">{{ review.body }}</p>
```

```ts
const hasTitle = computed(() => Boolean(props.review.title?.trim()))
const hasBody = computed(() => Boolean(props.review.body?.trim()))
```

---

## 8 · Quick-rate desde el header — una sola fila

El header tiene **una** fila de estrellas (no dos). Logueado, son
**editables**; deslogueado, muestra el promedio en modo lectura:

```vue
<div class="flex flex-wrap items-center gap-3">
  <template v-if="canQuickRate">           <!-- logueado -->
    <span>{{ myReview ? 'Tu nota' : 'Calificá' }}</span>
    <RatingStars
      :value="myReview ? myReview.rating : null"
      :editable="true"
      @update:value="emit('quick-rate', $event)"
    />
    <button v-if="myReview" @click="emit('edit-mine')" :title="hasWrittenReview ? 'Editar reseña' : 'Escribir reseña'">
      <svg><!-- ícono lápiz --></svg>
    </button>
  </template>

  <template v-else>                          <!-- deslogueado -->
    <RatingStars :value="content.avgRating" />
  </template>

  <!-- promedio como texto chico, con estrellita animada -->
  <span class="inline-flex items-center gap-1.5">
    <template v-if="ratingForBadge">
      <svg class="avg-star"><!-- estrella --></svg>
      <span>{{ ratingForBadge }} prom.</span>
      <span>·</span>
    </template>
    <span>{{ reviewCountLabel }}</span>
  </span>
</div>
```

Decisiones de diseño que aparecieron iterando con capturas:

- **Editar/Escribir reseña es un ícono** (lápiz), no texto plano. Con
  `:title` y `:aria-label` para no perder accesibilidad. El texto del
  tooltip cambia según `hasWrittenReview` (si ya escribiste o solo
  puntuaste).
- **La estrellita del promedio "titila"** (`twinkle` keyframe: escala +
  rotación + `drop-shadow` ámbar, loop 2.6s) — detalle vivo sin ser
  molesto. También respeta `prefers-reduced-motion`.
- **El conteo del header dice "puntuaciones"** (`reviewCount` cuenta
  todo), mientras la sección de abajo dice "reseñas escritas". Dos
  números distintos a propósito — ver §1.

> **El `canQuickRate` lo decide el padre:** `:can-quick-rate="auth.isAuthenticated"`.
> El header no sabe de auth; recibe un booleano y emite eventos. Esa es
> la separación: **componente tonto, page inteligente**.

---

## 9 · Verificación

Logueate (`admin@reviewhub.local` o tu user) y andá a un detail:

1. **Quick-rate desde cero:** tocá una estrella del header. Aparece "Tu
   nota" con tu rating, el botón lápiz, y el promedio se actualiza. No
   se abrió ningún modal.
2. **Re-puntuar:** tocá otra estrella. El PATCH cambia la nota; el
   promedio del header se recalcula (refetch de content).
3. **Escribir reseña completa:** click en el lápiz → modal. Llená título
   y cuerpo, guardá. Aparece como tarjeta abajo.
4. **Puntuar sin texto NO genera tarjeta:** si solo puntuaste, abajo no
   aparece ninguna tarjeta vacía. El conteo dice "reseñas escritas"
   contando solo las que tienen texto.
5. **Editar tu reseña:** el lápiz / "Editar mi reseña" abre el modal
   pre-cargado con tu rating y texto.
6. **Borrar:** botón "Borrar" en tu tarjeta → confirm → desaparece y el
   promedio se ajusta.
7. **Admin:** como admin, ves "Borrar" en *todas* las tarjetas.
8. **Duplicado (409):** intentá crear una segunda reseña para el mismo
   contenido (forzando el modal) → mensaje "Ya reseñaste este contenido".
9. **Deslogueado:** el header muestra el promedio en modo lectura, sin
   estrellas editables; el CTA invita a iniciar sesión.

---

## 10 · Errores comunes

### "Mando solo `{ rating }` y el backend tira 422"

- ¿Corriste la migración? `node ace migration:run` en `Proyect/`.
- ¿Le pusiste `.optional()` a title/body en `createReviewValidator`? Sin
  eso el validator sigue exigiéndolos aunque la columna sea nullable.

### "El promedio del header no se actualiza al puntuar"

- ¿Estás haciendo `loadContent()` además de `loadReviews()` tras la
  mutación? El promedio vive en `content`, no en la lista de reseñas
  (§7.4).

### "El form arranca con los datos de la reseña anterior"

- ¿El modal usa `v-if="open"` o `v-show`? Tiene que ser `v-if` para que
  el `ReviewForm` se remonte limpio cada vez (§6).

### "El modal aparece recortado o detrás del hero"

- Falta `<Teleport to="body">`. El `overflow-hidden`/`transform` del
  hero cinemático te recorta cualquier `fixed` que viva adentro.

### "TypeScript se queja de que `review.title` puede ser null"

- Es a propósito (§3.1). Poné el `v-if="hasTitle"` antes de renderizarlo.
  El tipo te está protegiendo, no molestando.

### "Edité la migración de creación y no pasó nada"

- Una migración ya ejecutada no se vuelve a correr. Necesitás una
  migración **nueva** con `ALTER` (§2.3).

---

## 11 · Recap

- Una **puntuación** (solo rating) y una **reseña escrita** (rating +
  texto) son la misma tabla; cambia solo cómo las mostrás. El promedio
  cuenta todas; la lista muestra solo las que tienen texto.
- En VineJS, `.optional()` = "ausente OK, pero si está tiene que ser
  válido". En la DB, columna `.nullable()`. Los dos cambios van juntos.
- **Nunca edites una migración ya corrida** — creá una nueva con
  `alterTable(...).alter()`.
- Un **modal con `<Teleport>`** escapa de los `overflow`/`transform` del
  layout; el **`v-if`** que lo monta es lo que garantiza estado fresco.
- **Refetch > optimistic** cuando el server calcula cosas derivadas (acá
  el promedio): el server es la única fuente de verdad y no duplicás
  lógica frágil en el cliente.
- **Quick-rate** = POST/PATCH directo desde el header sin form, eligiendo
  el verbo según si ya existe tu reseña.
- El backend recalcula el promedio con **hooks de Lucid**; por eso tras
  mutar tenés que refetchear *también* el content, no solo las reseñas.
- **Componente tonto, page inteligente**: el header/modal emiten eventos;
  la page decide qué API llamar y cuándo refetchear.

Con esto cierra la **Fase 2** (reviews CRUD). La Fase 3 arranca con
watchlists ("Mi lista", hoy un botón disabled en el header).
