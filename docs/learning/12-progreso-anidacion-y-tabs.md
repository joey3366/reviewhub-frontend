# 12 — Progreso parcial, listas anidadas y tabs

> **Pre-requisitos:** docs 01-11. Tenés todo de las fases anteriores andando:
> catálogo, auth, reseñas, watchlists con drag-reorder, playback completo
> (ritmo, días libres, pronóstico, retrospectiva).
>
> **Objetivo:** tres iteraciones que extienden el dominio de listas y
> seguimiento, esta vez **tocando ambos lados** (backend + frontend):
> 1. **¿Cómo voy?** — mid-flight check ("vas en ritmo / atrasado / adelantado")
>    para series empezadas pero no terminadas. Campos nuevos en el item +
>    endpoint nuevo + UI con desplegable.
> 2. **Listas anidadas** — incluir una lista dentro de otra (many-to-many con
>    anti-ciclo, flatten BFS y dedupe por contenido).
> 3. **Tabs por tipo** — filtrar `/watchlists` por Películas / Series / Todas,
>    sin crear entidades nuevas (counts derivados via subquery).

Al terminar vas a entender:

- Cuándo un cálculo nuevo necesita un **campo de datos nuevo** (en vez de
  reutilizar uno existente).
- Cómo modelar **many-to-many auto-referencial** en Lucid con tabla pivot
  custom + relación `@manyToMany`.
- El patrón **flatten + dedupe** para combinar datos de múltiples fuentes
  manteniendo prioridad clara (más cercano gana).
- Por qué los controles nativos (`<select>`, scrollbar) tienen comportamientos
  del OS que necesitan `color-scheme` explícito en dark mode.
- Cómo meter **subqueries raw** en Lucid sin perder tipos.
- El footgun de **`Luxon.toSQL()`** con offset cuando insertás manual a
  MySQL DATETIME.

---

## Parte 1 — "¿Cómo voy?"

### 1.1 La métrica que faltaba

Después del doc 11 teníamos:

- **Pronóstico** → "¿cuándo termino?" — para serie no empezada
- **Retrospectiva** → "¿cómo me fue?" — para serie terminada

El caso intermedio quedaba sin respuesta: **serie empezada pero no
terminada**. La pregunta natural ("¿voy bien o atrasado?") necesitaba algo
nuevo.

### 1.2 La decisión de modelo: nuevo campo, no reutilizar

Para responder "vas atrasado N días" hay que comparar:

- **Esperado a hoy** = `validDaysElapsed × ritmo` (ya lo teníamos: ritmo del
  usuario + `startedAt` del item)
- **Real a hoy** = lo que llevás visto ← **no se registraba**

Tentación: usar el `episodesWatched` que ya existía. Problema: ya lo usábamos
como **TOTAL planificado** (input del pronóstico — "los 42 ep de la serie
entera"). Si lo reinterpretamos como "lo que llevás visto", se rompe el
pronóstico.

> **Cuidado — la regla:** cuando un campo existente está **semánticamente
> sobrecargado** entre dos usos incompatibles, agregá un campo nuevo. Es más
> barato que mantener una interpretación ambigua durante meses.

Decisión: dos campos nuevos en el item:

- `duration_progress_seconds` (int unsigned, NOT NULL, default 0)
- `episodes_progress` (int unsigned, nullable)

Coexisten con `duration_seconds` y `episodes_watched` (que ahora son
explícitamente "TOTALES planificados").

### 1.3 Backend — data layer

**Migración** (`add_progress_to_watchlist_items.ts`):

```ts
async up() {
  this.schema.alterTable('watchlist_items', (table) => {
    table.integer('duration_progress_seconds').unsigned().notNullable().defaultTo(0)
    table.integer('episodes_progress').unsigned().nullable()
  })
}
```

**Modelo:** dos `@column()` nuevas. **Validator** (`updateWatchlistItem`):
los dos campos opcionales con `vine.number().withoutDecimals().min(0)`.
**Transformer:** los dos campos en el `pick`. **Servicio** `updateItem`:
mantener el patrón de `...(input.X !== undefined && { X: input.X })` para
permitir setear `null` sin pisar accidentalmente con `undefined`.

### 1.4 Backend — endpoint `/progress`

El cálculo reusa toda la infraestructura del `ForecastService`
(`resolveEffectivePace`, `walkCalendar`, set de holidays). Lo nuevo es:

```ts
async progress(watchlistId, itemId, viewerId, input) {
  const item = await this.locateItem(watchlistId, itemId, viewerId)
  if (!item.startedAt) throw new ProgressNotStartedError()
  if (item.finishedAt) throw new ProgressAlreadyFinishedError()

  const pace = await this.resolveEffectivePace(viewerId, input.overrides)
  const asOf = input.asOf.startOf('day')
  const startedAt = item.startedAt.startOf('day')
  const effectiveEnd = asOf < startedAt ? startedAt.minus({ days: 1 }) : asOf
  const range = walkCalendar(startedAt, effectiveEnd, pace.skipWeekdays, pace.holidays)
  const validDaysElapsed = range.validDays

  // Modo time: comparamos contra duración progresiva en segundos.
  // Modo episodes: contra los episodios vistos hasta hoy.
  let expectedUnits, actualUnits
  if (pace.mode === 'time') {
    expectedUnits = validDaysElapsed * pace.dailyMinutes! * 60
    actualUnits = item.durationProgressSeconds ?? 0
  } else {
    expectedUnits = validDaysElapsed * pace.dailyEpisodes!
    actualUnits = item.episodesProgress ?? 0
  }
  const ratePerDay = pace.mode === 'time' ? pace.dailyMinutes! * 60 : pace.dailyEpisodes!
  const equivalentDaysOfActual = actualUnits > 0 ? Math.ceil(actualUnits / ratePerDay) : 0
  const deviationDays = validDaysElapsed - equivalentDaysOfActual
  const tolerance = Math.max(1, Math.ceil(validDaysElapsed * 0.1))
  return {
    ..., deviationDays, toleranceDays: tolerance,
    onPace: Math.abs(deviationDays) <= tolerance,
    progressLogged: actualUnits > 0,
    ...
  }
}
```

**Lo importante:**

- **`equivalentDaysOfActual`**: convertimos el progreso real a "días
  equivalentes" para poder comparar contra `validDaysElapsed`. Sin esa
  normalización, estaríamos comparando peras con manzanas (segundos contra
  días).
- **Tolerancia ±10%** (mín 1 día): igual fórmula que la retrospectiva, para
  que el veredicto se sienta consistente entre las dos pantallas.
- **`progressLogged`** boolean: si `actualUnits === 0`, la usuaria no cargó
  progreso aún. El frontend muestra guidance distinta en vez del veredicto.

**Ruta:** `GET /watchlists/:id/items/:itemId/progress` — mismo prefijo que
`forecast` y `retrospective`.

### 1.5 Verificar con curl antes de tocar el navegador

Patrón que repetimos siempre: levantar el backend y probar el endpoint
extremo a extremo antes de tocar la UI. Nos ahorra debuggear a ciegas.

```bash
TOKEN=$(curl -s -X POST .../auth/login -d '...' | jq -r .token)
PARENT_ID=...
# Setear pace: 10 ep/día
curl -X PATCH .../account/pace-settings -d '{"dailyEpisodes":10,"dailyMinutes":null}'
# Item con startedAt hace 7 días, episodesProgress=30
# Esperado: 30 ep / 10 = 3 días equiv vs 7 días pasados → atrasado 4 días
curl .../watchlists/$WL/items/$ITEM/progress -H "Authorization: Bearer $TOKEN"
# → {"deviationDays":4,"onPace":false,"toleranceDays":1,...}
```

Tres casos (atrasado / on-pace / adelantado) + el de error (`finished` →
HTTP 422). Cuando los cuatro pasan, recién ahí pasás al frontend.

### 1.6 Frontend — ItemTrackingModal: el bloque desplegable

El modal de seguimiento ya tenía cuatro inputs (h/m/s + ep totales + 2
fechas). Si sumás el bloque de progreso, el modal queda visualmente cargado.
Solución: **desplegable colapsable**.

```ts
const progressOpen = ref(false)

function resetFromItem() {
  // ...precargar campos...
  progressOpen.value = psec > 0 || (props.item?.episodesProgress ?? 0) > 0
}

const progressSummary = computed(() => {
  // "30 ep vistos · 2h 15m" cuando hay progreso, null cuando no
})
```

El bloque arranca **abierto solo si ya hay progreso** (la usuaria viene a
editar, no a descubrir). Si arranca cerrado, el header muestra el resumen:
"30 ep vistos · 2h 15m" o "cargá lo que llevás visto para '¿Cómo voy?'".

> **Footgun visual:** los `<input type="number">` tienen un `min-width`
> default del navegador que IGNORA `flex-1`. En contenedores angostos (este
> bloque tiene `p-4` extra), el tercer input se desborda. Fix:
> `class="min-w-0 w-full"` en cada input. **Acordate** cada vez que pongas
> 3 inputs numéricos en un flex angosto.

### 1.7 Frontend — ProgressModal con cinco estados

Espejado del `RetrospectiveModal` (mismo lenguaje verde/ámbar/celeste), pero
con un estado más: **`!progressLogged`**. Total: cinco estados que el modal
maneja explícitamente:

| Estado | Cuándo | UI |
|--------|--------|-----|
| `loading` | Mientras llega la respuesta | Spinner |
| `needsPace` | 422 con "pace" en el mensaje | Banner ámbar + botón "Configurar mi ritmo" |
| `notStarted` | 422 con "startedAt" en el mensaje | "Marcá la fecha en que empezaste" |
| `alreadyFinished` | 422 con "finished" en el mensaje | "Ya terminaste; mirá la retrospectiva" |
| `!progressLogged` | OK pero sin progreso cargado | Banner celeste con "tendrías que ir por X" |
| `verdict` | OK con progreso | Veredicto verde/ámbar/celeste + 2 cards comparativas |

Patrón clave: en vez de mostrar el error crudo del backend, el frontend lo
**clasifica** y muestra guidance accionable. La usuaria nunca ve "HTTP 422".

### 1.8 Aprendizaje: género gramatical default

Detalle de UX que vino del feedback de la usuaria. El primer commit decía:

```
"Vas atrasada N días" / "Vas adelantada N días"
```

(adjetivo en femenino, concuerda con el sujeto implícito "vos" cuando vos
sos mujer). Como la app es **multi-usuario y no sabemos el género**, default
a masculino genérico:

```
"Vas atrasado N días" / "Vas adelantado N días"
```

Alternativa más neutra hubiera sido reformular como verbo ("Llevás N días
de atraso"), pero el masculino genérico es el patrón más común en español
para texto multi-usuario y no introduce ambigüedad.

---

## Parte 2 — Listas anidadas (inclusión many-to-many)

### 2.1 El problema

La usuaria tenía "Películas" y "Western" como listas separadas. Quería verlas
"como una sola" en Películas, sin perder Western como entidad independiente.

Tres opciones que evaluamos:

| Opción | Cómo | Costo | Veredicto |
|--------|------|-------|-----------|
| **A — Inclusión** | A *incluye* a B; items de B aparecen en A con badge "via B" | many-to-many + endpoints | **Elegida** |
| B — Jerarquía padre-hijo | B tiene `parentId` apuntando a A | columna simple | Menos flexible (1 padre) |
| C — Tags | Cada lista tiene tags; filtro por tag | entidad tags | Otra cosa distinta — no agrupa, etiqueta |

**Por qué A:** el frase de la usuaria fue "incluir western dentro de
películas **como si fuera una sola**". "Como si fuera" = unificación visual,
no movimiento físico. Una lista puede estar incluida en varias padres a la
vez. Las hijas se siguen editando desde su lista propia (zero ambigüedad de
"¿desde dónde edito?").

### 2.2 Modelo — tabla pivot many-to-many auto-referencial

Migración:

```ts
this.schema.createTable('watchlist_includes', (table) => {
  table.string('id', 36).primary().notNullable()
  table.string('parent_id', 36).notNullable()
    .references('id').inTable('watchlists').onDelete('CASCADE')
  table.string('child_id', 36).notNullable()
    .references('id').inTable('watchlists').onDelete('CASCADE')
  table.integer('position').notNullable().defaultTo(0)
  table.timestamp('created_at').notNullable()
  table.unique(['parent_id', 'child_id'], { indexName: 'uq_...' })
  table.index(['parent_id', 'position'], 'idx_...')
})
```

> **Cuidado:** `ON DELETE CASCADE` en ambos lados es importante. Si borrás
> una watchlist (parent O child), las filas de la pivot se limpian. Si no
> tendrías "includes huérfanos" que romperían los queries.

Relación en el modelo `Watchlist` (auto-referencial):

```ts
@manyToMany(() => Watchlist, {
  pivotTable: 'watchlist_includes',
  localKey: 'id',
  pivotForeignKey: 'parent_id',
  relatedKey: 'id',
  pivotRelatedForeignKey: 'child_id',
  pivotColumns: ['position'],
})
declare includedLists: ManyToMany<typeof Watchlist>
```

Esto le dice a Lucid: "para esta lista, las `includedLists` (hijas) se
obtienen joineando vía `watchlist_includes`, donde `parent_id` apunta a mí".

### 2.3 Backend — `addInclude` con anti-ciclo (DFS recursivo)

```ts
async addInclude(parentId, childId, userId) {
  if (parentId === childId) throw new SelfIncludeError()

  return db.transaction(async (trx) => {
    const parent = await Watchlist.query({ client: trx }).where('id', parentId).first()
    if (!parent || parent.userId !== userId) throw new WatchlistForbiddenError()
    const child = await Watchlist.query({ client: trx }).where('id', childId).first()
    if (!child) throw new WatchlistNotFoundError(childId)
    if (child.userId !== userId) throw new IncludeOwnershipError()

    // Anti-ciclo: si el padre ya es descendiente del hijo, agregar la
    // inclusión cerraría un loop (A→B→...→A).
    const descendants = await this.collectDescendantIds(childId)
    if (descendants.has(parentId)) throw new CyclicalIncludeError()

    const existing = await trx.from('watchlist_includes')
      .where('parent_id', parentId).where('child_id', childId).first()
    if (existing) throw new DuplicateIncludeError()

    const counted = await trx.from('watchlist_includes')
      .where('parent_id', parentId).count('* as total')
    const position = Number(counted[0].total ?? 0)

    await trx.table('watchlist_includes').insert({
      id: randomUUID(),
      parent_id: parentId, child_id: childId, position,
      created_at: DateTime.now().toSQL({ includeOffset: false }),  // ⚠ §2.5
    })
    return child
  })
}
```

Y `collectDescendantIds` (DFS iterativo con stack):

```ts
async collectDescendantIds(rootId: string): Promise<Set<string>> {
  const visited = new Set<string>()
  const stack: string[] = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    const rows = await db.from('watchlist_includes')
      .where('parent_id', current).select('child_id')
    for (const row of rows) {
      const childId = row.child_id as string
      if (!visited.has(childId) && childId !== rootId) {
        visited.add(childId)
        stack.push(childId)
      }
    }
  }
  return visited
}
```

**Lo importante:**

- **`visited` Set** previene loops infinitos si por algún bug ya hay un ciclo
  en la DB. El walk siempre termina.
- **Bucle iterativo con stack** en vez de recursión natural. Más simple de
  debuggear, sin stack overflow en jerarquías grandes.
- La query se hace **fuera de la transacción** del addInclude. Es seguro
  porque estamos chequeando ANTES del insert; no necesitamos read-after-write
  de la propia TX.

### 2.4 Backend — `findByIdWithIncluded`: flatten + dedupe (BFS por niveles)

El `show` enriquecido devuelve los items propios + los items heredados
(planos, no anidados), con dedupe por `contentId`. Recorremos descendientes
**por niveles (BFS)** en vez de DFS profundo. Razón crucial:

> La dedupe tiene que priorizar al **más cercano** al padre.

Ejemplo: A incluye a B, B incluye a C. Si el contenido X está en A (propio)
y también en C (más profundo), la copia que se conserva es la de A. Si X
está en B y en C, gana la de B. Y así.

Con DFS profundo recorreríamos C antes que terminar B; con BFS por niveles,
B completo se procesa antes de tocar C:

```ts
const seenContentIds = new Set(watchlist.items.map((i) => i.contentId))
const inherited: InheritedItem[] = []
let frontier = directIncludes.map((d) => d.id)  // nivel 1: hijas directas

while (frontier.length > 0) {
  const lists = await Watchlist.query()
    .whereIn('id', frontier)
    .preload('items', (q) => q.preload('content', ...))

  const nextFrontier: string[] = []
  for (const id of frontier) {
    const l = byId.get(id)
    for (const item of l.items) {
      if (seenContentIds.has(item.contentId)) continue  // ← DEDUPE
      seenContentIds.add(item.contentId)
      inherited.push({ item, viaWatchlistId: l.id, viaWatchlistName: l.name })
    }
    // Recolectar hijas para el próximo nivel
    const childRows = await db.from('watchlist_includes')
      .where('parent_id', id).select('child_id')
    for (const row of childRows) {
      if (!visited.has(row.child_id)) {
        visited.add(row.child_id)
        nextFrontier.push(row.child_id)
      }
    }
  }
  frontier = nextFrontier
}
```

**El truco:** inicializar `seenContentIds` con los items **propios**, no
vacío. Así los propios siempre ganan sobre cualquier heredado del mismo
contenido.

### 2.5 El bug Luxon → MySQL (footgun importante)

Cuando intenté el primer addInclude, MySQL me tiró:

```
ER_TRUNCATED_WRONG_VALUE: Incorrect datetime value:
'2026-05-31 01:52:28.982 +00:00' for column 'created_at' at row 1
```

`DateTime.now().toSQL()` de Luxon devuelve por default un string con offset
(`+00:00`). MySQL DATETIME (no TIMESTAMP) no acepta el offset. Fix:

```ts
created_at: DateTime.now().toSQL({ includeOffset: false })
```

> **Cuándo importa:** insertás manualmente a una columna DATETIME (sin
> pasar por el ORM con `@column.dateTime` que ya hace la transformación
> correcta). Si estás haciendo `trx.table().insert(...)` con un campo
> datetime, recordá `includeOffset: false`.

### 2.6 Frontend — `IncludesManagerModal` con cierre automático

Componente Teleport con dos secciones:

1. **Incluidas ahora**: lista de hijas con botón "Quitar"
2. **Agregar**: `<select>` con tus otras listas + botón "Incluir"

```ts
async function addInclude() {
  // ...
  await watchlistsApi.addInclude(props.watchlist.id, selectedId.value)
  selectedId.value = ''
  emit('changed')
  emit('close')   // ← cerramos automático: la usuaria ve el resultado
}
```

**Por qué cerrar al agregar:** la usuaria pidió expresamente ver el resultado
en la grilla del padre apenas agrega. Si quiere agregar varias, lo hace de a
una (low frequency action).

> **Bug visual del `<select>`:** los dropdowns nativos usan el esquema de
> color del OS, no del CSS. Con tema dark, las options se ven blancas sobre
> blanco. Fix:
> ```html
> <select class="... [color-scheme:dark]">
>   <option class="bg-neutral-900 text-white">...</option>
> </select>
> ```
> `color-scheme: dark` le dice al navegador qué variante del control nativo
> usar. Para máxima compatibilidad, también pintamos las `<option>` (algunos
> navegadores las ignoran si solo tenés `color-scheme`).

### 2.7 Frontend — heredados: badge "via X" y bloqueo de acciones

```ts
function isInherited(item: WatchlistItem): boolean {
  return !!item.viaWatchlistId
}
```

En la card del item:

- **Badge "📁 via Western"** en esquina superior derecha, siempre visible
  (no on-hover)
- Botones de reloj/quitar **ocultos** con `v-if="!isInherited(item)"`
- `:draggable="!isInherited(item)"` (no se reordenan, viven en su lista)
- `canForecast`/`canProgress`/`canRetrospect` agregan `!isInherited(item)` —
  los endpoints requieren que `itemId` pertenezca al `watchlistId` y el
  heredado no cumple

Los chips informativos (duración, ep, daysElapsed) **sí** se siguen
mostrando — son lectura, no edición.

---

## Parte 3 — Tabs por tipo en /watchlists

### 3.1 El problema y la solución

La página `/watchlists` mostraba todo en una grilla única. Cuando crece a
10+ listas, agruparlas por tipo es natural.

Tres opciones evaluamos:

| Opción | Esfuerzo | Cuándo conviene |
|--------|----------|-----------------|
| **Tabs autom. por tipo** | Frontend + 1 subquery | Cuando los tipos son pocos y derivables del contenido |
| Tags manuales | Backend + UI | Cuando querés clasificación libre/multidimensional |
| Carpetas/grupos | Backend completo + UX drag | Cuando hay muchas listas y categorías amplias |

Elegimos la primera: **cero entidades nuevas, el frontend deriva del
contenido**.

### 3.2 Backend — subqueries raw para counts por tipo

`listMine` ya devolvía `itemsCount` total via `withCount('items')`. Para
contar por tipo (que vive en `contents`, joineado) Lucid no tiene una API
limpia. Solución: subquery raw en `select`:

```ts
async listMine(userId: string) {
  const moviesCountSql = `(
    SELECT COUNT(*) FROM watchlist_items wi
    INNER JOIN contents c ON wi.content_id = c.id
    WHERE wi.watchlist_id = watchlists.id AND c.type = 'movie'
  )`
  const seriesCountSql = `( ... AND c.type = 'series' )`

  return Watchlist.query()
    .where('user_id', userId)
    .withCount('items')
    .select('watchlists.*')
    .select(db.raw(`${moviesCountSql} as movies_count`))
    .select(db.raw(`${seriesCountSql} as series_count`))
    .orderBy('position', 'asc')
    .orderBy('created_at', 'desc')
}
```

Una sola query, dos subqueries por row. Eficiente para escalas razonables
(decenas de listas por usuario; cada subquery es un index scan barato).

**Lucid los devuelve en `$extras`** (no son columnas declaradas del modelo).
El transformer las recoge:

```ts
const extras = this.resource.$extras as Record<string, unknown>
if (extras.movies_count !== undefined) out.moviesCount = Number(extras.movies_count)
if (extras.series_count !== undefined) out.seriesCount = Number(extras.series_count)
```

> **Cuidado con la coalesción:** `Number(extras.movies_count)` convierte
> "0" string a 0 number. Si dejás el string crudo, los comparadores en el
> frontend (`> 0`) fallan silenciosamente.

### 3.3 Frontend — tabs con localStorage

```ts
type ListsTab = 'all' | 'movies' | 'series'
const TAB_KEY = 'reviewhub_lists_tab'

function readTab(): ListsTab {
  const raw = localStorage.getItem(TAB_KEY)
  return raw === 'movies' || raw === 'series' ? raw : 'all'
}
const activeTab = ref<ListsTab>(readTab())
watch(activeTab, (v) => {
  try { localStorage.setItem(TAB_KEY, v) } catch {}
})
```

Persistir entre sesiones es chico pero valioso: si la usuaria vive en
"Películas", no quiere reconfigurarlo cada vez que entra.

> El `try/catch` alrededor del setItem es para **modo privado de Safari**,
> donde `localStorage.setItem` tira. No queremos romper la app por una
> persistencia best-effort.

Computed para filtrar:

```ts
const filteredLists = computed(() => {
  if (activeTab.value === 'all') return lists.value
  if (activeTab.value === 'movies') return lists.value.filter((l) => (l.moviesCount ?? 0) > 0)
  return lists.value.filter((l) => (l.seriesCount ?? 0) > 0)
})
```

Las **mixtas** (con pelis Y series) aparecen en ambos tabs filtrados.

### 3.4 Drag-reorder: solo en "Todas"

Si reordenás dentro de "Películas" y solo mandás los IDs de pelis al
backend, las posiciones globales quedan mezcladas (las series mantienen sus
positions viejos). Fix simple: **deshabilitar drag en tabs filtrados**.

```ts
function onDragStart(index: number) {
  if (activeTab.value !== 'all') return
  dragIndex.value = index
}
```

Y en el template, el cursor también cambia:

```html
:class="activeTab === 'all' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'"
```

Si quisieras drag dentro de tabs filtrados, necesitarías un endpoint
distinto (reorder relativo, no absoluto). Por simplicidad, la regla actual
está bien.

### 3.5 "Mixtas" aparecen en ambos tabs

Una lista con 5 pelis + 3 series:

- En **Todas**: aparece (`8 títulos`)
- En **Películas**: aparece (`moviesCount = 5 ≥ 1`) — la card sigue diciendo
  "8 títulos"
- En **Series**: aparece igual (`seriesCount = 3 ≥ 1`)

El sub-conteo interno NO se filtra. El filtro decide en qué tabs aparece la
lista entera, no su contenido. Si después querés mostrar "5 películas" en
el tab de Películas, agregás un computed por tab.

---

## 4 · Cierre

Tres iteraciones, tres patrones reutilizables:

1. **¿Cómo voy?** → cuando un cálculo nuevo necesita comparar contra datos
   que no existen, **agregá campos nuevos** en vez de sobrecargar los
   existentes. Y reutilizá la infraestructura de cálculo
   (`ForecastService.resolveEffectivePace`, `walkCalendar`) en el nuevo
   método.

2. **Listas anidadas** → many-to-many auto-referencial con **dedupe por
   contenido + BFS por niveles** mantiene la regla "más cercano gana" sin
   complicación. Las validaciones de ciclo se hacen al INSERTAR la
   inclusión, no al consultar.

3. **Tabs por tipo** → cuando el agrupamiento se puede **derivar del
   contenido**, no inventes entidades nuevas (ni tags ni carpetas). Una
   subquery + un computed alcanza, y el resultado se siente más natural
   (no hay que "configurar" nada).

Bugs aprendidos para el próximo proyecto:

- **`<input type="number">` en flex angosto** → `min-w-0 w-full` siempre.
- **`<select>` en dark** → `[color-scheme:dark]` + `class` en las `<option>`.
- **`Luxon.toSQL()` + MySQL DATETIME** → `{ includeOffset: false }`.

Próximo: **fase 5 — admin dashboard** para reemplazar los placeholders de
carátulas de las series seedeadas y crear nuevas pelis/series desde UI.
