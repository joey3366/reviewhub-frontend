# 14 — Admin dashboard: CRUD de contenidos

> **Pre-requisitos:** docs 01-13. Tenés todo lo de fases anteriores
> andando, incluyendo el `requiresAdmin` del router guard (doc 06) y la
> nav con el placeholder "Admin" (doc 07).
>
> **Objetivo:** cerrar la fase 5 construyendo el back-office mínimo para
> manejar el catálogo: crear, editar y eliminar películas y series desde
> la UI. Incluye el reemplazo de las 4 carátulas placeholder seedeadas
> en fases anteriores por imágenes reales (vía TMDb + proxy weserv).

Al terminar vas a entender:

- Cómo extender un controller que solo tenía `store` con `update` y
  `destroy` reutilizando el mismo service.
- La diferencia entre **validators de create y de update** (`nullable()`
  + `optional()` para "limpiar valor", solo `optional()` para "no tocar").
- Por qué los PATCH/DELETE van por **`:id` (UUID)** aunque la lectura sea
  por **`:slug`**: estabilidad vs amigabilidad.
- Cuándo conviene **NO regenerar slug** al cambiar el título.
- Cómo modelar un **form único create/edit** que se comporta distinto
  según haya o no `:slug` en la ruta.
- El patrón **`sync(ids)`** para reemplazar todas las relaciones m:m
  de una sola vez sin manejar diffs.

---

## Parte 1 — Backend: cerrar el CRUD de contents

### 1.1 Lo que ya teníamos vs. lo que falta

Después del doc 08 + las fases siguientes, el backend tenía:

- `POST /movies` y `POST /series` (admin-only) — crear contenido
- `GET /contents/:slug` — leer
- `GET /contents` — listar paginado con filtros (`type`, `q`, `genre`, etc.)
- **Sin `PATCH` ni `DELETE`** — no había forma de editar ni eliminar

Para fase 5 sumamos los 4 endpoints faltantes: `PATCH /movies/:id`,
`PATCH /series/:id`, `DELETE /movies/:id`, `DELETE /series/:id`. Todos
admin-only.

### 1.2 Validators: create vs update

El validador de creación exige `title` y deja el resto **opcional pero
no nullable** (`vine.string().url().maxLength(500).optional()` por
ejemplo). El de update tiene una diferencia sutil:

```ts
// movie_validator.ts
export const updateMovieValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255).optional(),
    posterUrl: vine.string().url().maxLength(500).nullable().optional(),
    director: vine.string().trim().maxLength(120).nullable().optional(),
    // ...
  })
)
```

**Líneas clave explicadas:**

- `.optional()` — el campo puede **estar ausente** en el payload. Útil
  para "no toques este campo". El service interpreta `undefined` como
  "ignorar".
- `.nullable()` — si el campo está presente, **puede ser `null`**. El
  service interpreta `null` como "limpiar el valor (poner NULL en DB)".
- `title` solo es `.optional()` (no nullable): podés omitir el campo,
  pero si lo mandás no podés mandar `null` — todo contenido tiene que
  tener título.
- El resto de los campos son **ambos**: aceptás "no tocar" (omit) o
  "limpiar" (`null`).

> **Cuidado:** Vine es exigente con los nulls. Si en `createMovieValidator`
> NO ponés `.nullable()` y desde el frontend mandás `{posterUrl: null}`,
> el validador rechaza con 422 (`posterUrl` debe ser string). El form
> admin construye dos payloads distintos (`buildCreateMoviePayload` vs.
> `UpdateMovieInput` directo) para respetar esto.

### 1.3 Service: update con merge condicional

```ts
async updateMovie(contentId: string, input: UpdateMovieInput) {
  return db.transaction(async (trx) => {
    const content = await Content.query({ client: trx }).where('id', contentId).first()
    if (!content) throw new ContentNotFoundError(contentId)
    if (content.type !== 'movie') throw new ContentTypeMismatchError('movie', content.type)

    const movie = await Movie.query({ client: trx }).where('content_id', contentId).first()
    if (!movie) throw new ContentNotFoundError(contentId)

    content.merge({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.posterUrl !== undefined && { posterUrl: input.posterUrl }),
      // …el resto de campos de Content
    })
    await content.save()

    movie.merge({
      ...(input.runtimeMinutes !== undefined && { runtimeMinutes: input.runtimeMinutes }),
      // …el resto de campos de Movie
    })
    await movie.save()

    if (input.genres !== undefined) {
      await this.syncGenres(trx, content, input.genres)
    }
    // ...
  })
}
```

**Lo importante:**

- El check `input.X !== undefined` es lo que hace `optional()` significativo
  en la práctica: si la usuaria omite el campo, no lo tocamos; si manda
  `null`, lo merge con `null` (limpia).
- **No regeneramos el slug aunque cambie el título**. Cambiar el slug
  rompe URLs bookmarkeadas y links internos. Si la usuaria quiere un
  slug distinto, lo elimina y lo recrea. (Patrón "ID is forever, slug is
  forever-ish".)
- **`ContentTypeMismatchError`** evita que alguien convierta una serie
  en película (o viceversa) llamando al endpoint equivocado: tiramos
  422 si el `:id` no coincide con el tipo de la ruta.

### 1.4 `syncGenres` — reemplazo total

```ts
private async syncGenres(trx, content, genreIds: string[]) {
  if (genreIds.length > 0) {
    const existing = await Genre.query({ client: trx }).whereIn('id', genreIds).select('id')
    if (existing.length !== genreIds.length) {
      const existingIds = existing.map((g) => g.id)
      const invalid = genreIds.filter((id) => !existingIds.includes(id))
      throw new InvalidGenresError(invalid)
    }
  }
  await content.related('genres').sync(genreIds)
}
```

**Lo importante:**

- `.sync(ids)` reemplaza la lista entera (desvincula los que no estén,
  vincula los nuevos). Mucho más simple que calcular el diff vos.
- Validamos que **todos los géneros existan ANTES** de tocar el pivot.
  Si alguno es inválido, tiramos `InvalidGenresError` sin dejar estado
  parcial (toda la operación está dentro de una transacción de todas
  formas).
- **Lista vacía es válida**: significa "desvincular todos". El form
  admin manda `[]` cuando la usuaria deselecciona todos los géneros.

### 1.5 DELETE: cascada por FK

```ts
async deleteContent(contentId: string) {
  return db.transaction(async (trx) => {
    const content = await Content.query({ client: trx }).where('id', contentId).first()
    if (!content) throw new ContentNotFoundError(contentId)
    await content.delete()
  })
}
```

Una sola línea borra TODO porque todas las FKs del schema tienen
`onDelete: 'CASCADE'`:

- `movies.content_id` y `series.content_id` → CASCADE
- `reviews.content_id` → CASCADE
- `content_genre.content_id` → CASCADE
- `watchlist_items.content_id` → CASCADE

Borrar un content elimina su subtipo (movie/series), sus reseñas y lo
quita de las listas de los usuarios. La cascada es agresiva — el modal
de confirmación del frontend lo dice explícitamente para que la usuaria
no se sorprenda.

### 1.6 Routes: agrupadas bajo middleware admin

```ts
// app/modules/content/routes.ts
router
  .group(() => {
    router.post('movies', [controllers.content.Movies, 'store']).as('content.movies.store')
    router.patch('movies/:id', [controllers.content.Movies, 'update']).as('content.movies.update')
    router.delete('movies/:id', [controllers.content.Movies, 'destroy']).as('content.movies.destroy')

    router.post('series', [controllers.content.Series, 'store']).as('content.series.store')
    router.patch('series/:id', [controllers.content.Series, 'update']).as('content.series.update')
    router.delete('series/:id', [controllers.content.Series, 'destroy']).as('content.series.destroy')
  })
  .prefix('/api/v1')
  .use(middleware.auth())
  .use(middleware.requireRole({ roles: ['admin'] }))
```

**Lo importante:**

- Toda la **mutación de contents** vive en el mismo grupo con
  `requireRole(['admin'])`. Si después agregás `PATCH /contents/:id`
  (una operación cross-type), pertenece a este grupo también.
- Las **lecturas** (`GET /contents`, `GET /contents/:slug`) están en
  otro grupo SIN auth — todo el catálogo es público.
- **URL pattern**: PATCH/DELETE por `:id` (UUID), GET por `:slug`. El
  id es inmutable; el slug puede cambiar (en teoría). Por eso para
  escrituras siempre id, para lecturas slug.

---

## Parte 2 — Frontend: `/admin/contents` y form único

### 2.1 Router + guard

El guard ya existía (`router.beforeEach`):

```ts
if (to.meta.requiresAdmin && !auth.isAdmin) return { path: '/' }
```

Solo agregamos las 3 rutas nuevas:

```ts
{ path: '/admin/contents',           name: 'admin-contents',       component: () => import('@/pages/AdminContentsPage.vue'),    meta: { requiresAuth: true, requiresAdmin: true } },
{ path: '/admin/contents/new',       name: 'admin-content-new',    component: () => import('@/pages/AdminContentFormPage.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
{ path: '/admin/contents/:slug/edit',name: 'admin-content-edit',   component: () => import('@/pages/AdminContentFormPage.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
```

**Lo importante:**

- `requiresAuth` **+** `requiresAdmin`: el guard valida los dos. Si un
  user no logueado entra a `/admin/contents`, primero lo manda a login
  (por `requiresAuth`); si entra logueado pero sin role admin, lo manda
  a `/` (por `requiresAdmin`). Dos checks ordenados, no uno solo
  combinado, para que el redirect sea el natural en cada caso.
- **Mismo componente para `new` y `edit`**. El componente lee
  `route.params.slug` para decidir el modo. Esto evita duplicar el form
  entero por dos casos casi idénticos.

### 2.2 Navbar: convertir placeholder en RouterLink

Antes era un `<span>` deshabilitado con `title="Próximamente"`. Ahora
es un `<RouterLink>` a `/admin/contents`. El `v-if="auth.isAdmin"` ya
estaba — solo descomentamos la funcionalidad.

### 2.3 AdminContentsPage — listado con filtros

Listado tabla con poster mini, título, tipo (badge coloreado),
año, géneros, y acciones. Filtros por búsqueda (search) y tipo
(select). Paginación con `meta.currentPage`/`meta.lastPage`.

**Detalle de UX:**

- El input de búsqueda **no dispara fetch** hasta `Enter` o `blur` —
  evita N requests mientras la usuaria tipea.
- El select de tipo **sí dispara fetch** al cambiar — son 3 opciones,
  no hay riesgo de spam.
- El botón "Eliminar" abre un `window.confirm` con texto **explícito**
  sobre la cascada: "Esto borra esta serie, sus reseñas y la quita de
  las listas. No se puede deshacer." La advertencia evita sorpresas.
- Loading state inicial + empty state distintos. Empty state con CTA
  "Limpiar filtros" si los filtros activos son la razón del vacío.

### 2.4 AdminContentFormPage — form único create + edit

Un componente, dos modos. La diferencia está en `editingSlug`:

```ts
const editingSlug = computed(() => (route.params.slug as string | undefined) ?? null)
const isEdit = computed(() => editingSlug.value !== null)
const editingId = ref<string | null>(null)  // viene del fetch en edit
```

En `onMounted`:
- Si `editingSlug` está, hace `contentApi.show(slug)` para precargar
  campos y guarda el `id` (para PATCH).
- Carga géneros (`contentApi.genres()`).

**Detalles del form:**

- **Tipo (radio movie/series)** visible solo en create. En edit es un
  cartelito de solo lectura: cambiar de tipo no está soportado.
- **Campos comunes** (title, originalTitle, year, synopsis) en un
  bloque arriba.
- **Carátulas con preview**: dos inputs URL + `<img>` debajo que se
  actualiza en vivo. Si la URL es inválida el `<img>` muestra el alt;
  no rompe el form.
- **Campos type-específicos** abajo: runtime/director/country para
  movie, seasons/episodes/status/dates para series. Se ocultan con `v-if`
  según el `type` actual.
- **Géneros como pills toggleables** (no `<select multiple>`): más
  visual, más mobile-friendly, no requiere `[color-scheme:dark]` porque
  vive en theme light.
- **Submit** elige `createMovie`/`createSeries`/`updateMovie`/`updateSeries`
  según el par `(type, isEdit)`. Para create, los `null` se convierten a
  `undefined` (el validador de create no acepta nulls explícitos — ver
  1.2). Para update, los `null` se mandan directo (significan "limpiar").

### 2.5 El `buildCreateMoviePayload` / `buildCreateSeriesPayload`

```ts
function buildCreateMoviePayload(base: {...}): CreateMovieInput {
  const out: CreateMovieInput = { title: base.title }
  if (base.originalTitle !== null) out.originalTitle = base.originalTitle
  if (base.synopsis !== null) out.synopsis = base.synopsis
  // ... etc
  return out
}
```

**Lo importante:** este helper existe porque create y update tienen
contratos distintos:
- update: aceptás `null` para limpiar
- create: solo `string | undefined`

Convertir adentro del componente (en lugar de "no permitir vaciar
campos en create") significa que la usuaria escribe un campo y lo borra
y nada pasa — el campo no se manda y el backend usa el default.
Comportamiento natural sin ceremonia.

---

## Parte 3 — Reemplazar las 4 placeholders

Las 4 series seedeadas (Chernobyl, Breaking Bad, Stranger Things, The
Bear) tenían carátulas de `placehold.co`. Ahora con la UI admin podés
reemplazarlas en 30 segundos:

1. Andá a `/admin/contents`, filtrá por "Series".
2. Click en "Editar" en cada una.
3. Pegá la URL del poster (vertical 2:3) y del backdrop (horizontal 16:9).
4. Guardá.

**URLs usadas** (TMDb + proxy `weserv`, para evitar CORS):

```
poster:   https://images.weserv.nl/?url=image.tmdb.org/t/p/w500/{file}.jpg
backdrop: https://images.weserv.nl/?url=image.tmdb.org/t/p/original/{file}.jpg
```

| Serie | poster file | backdrop file |
|---|---|---|
| Chernobyl | `hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg` | `tRNA2CRgA4XHvd7Mx9dH3sFtDVb.jpg` |
| Breaking Bad | `ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg` | `tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg` |
| Stranger Things | `uOOtwVbSr4QDjAGIifLDwpb2Pdl.jpg` | `56v2KjBlU4XaOv9rVYEQypROD7P.jpg` |
| The Bear | `4fVddnbhcmzRZE14NJY03GKS6Fn.jpg` | `97yvRBw1GzX7fXprcF80er19ot.jpg` |

> **Cuidado — TMDb image paths:** la convención es
> `image.tmdb.org/t/p/{size}/{filepath}.jpg`. Los `{file}.jpg` salen del
> backend de TMDb (campo `poster_path`/`backdrop_path` en la API) o de
> los `<img src>` de la web. Sizes válidos para posters: `w92`, `w154`,
> `w185`, `w342`, `w500`, `w780`, `original`. Para backdrops: `w300`,
> `w780`, `w1280`, `original`. Si vas a usar como portada de detalle
> (pantalla completa), `original` para backdrop y `w500` para poster
> está bien.

---

## Cierre

La fase 5 cierra el CRUD del catálogo. Ahora podés:

- Crear nuevas pelis y series desde `/admin/contents/new`.
- Editarlas (incluyendo reemplazar URLs de carátulas) desde el listado.
- Eliminarlas — el delete cascadea reseñas, items de listas y géneros.

**Lo que NO entra en esta fase** (intencional):

- Manejo de drafts/published toggle (todo se crea como `published`).
- Listado admin de users / reviews / watchlists (los endpoints
  existen pero sin UI). Si la usuaria lo necesita, es un agregado fácil
  reutilizando el patrón de `AdminContentsPage`.
- Upload de imágenes (URLs externas únicamente). Si en el futuro
  querés subir archivos, agregás un `POST /admin/uploads` que devuelva
  una URL y la pegás en el form.

Próximo natural: **fase 6 (polish + tests + deploy)**, según el plan
de `project_fase_status`.
