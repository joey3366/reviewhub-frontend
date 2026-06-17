# 16 · Fase juegos

> Cómo agregamos un tercer tipo de contenido (juegos) sin duplicar
> infraestructura. Reusa watchlists, tracking de tiempo, ratings, reviews,
> stats, admin CRUD, confirm modals y fondos cinemáticos; solo se suma lo
> específico del dominio "juego".

## TL;DR de la decisión

- **Un solo `contents.type`** con valor agregado `'game'` (en vez de tabla
  separada de juegos). Eso reusa de una toda la infra existente.
- **Tabla `games`** 1:1 con `contents` (igual que `movies`/`series`) con
  los campos específicos: `hltb_hours`, `developer`, `publisher`,
  `platforms` (JSON).
- **Plataformas como enum fija** (PC/PS5/PS4/Xbox/Switch/Mobile) — chips
  bonitas, filtrables, sin tabla extra.
- **HLTB simple**: una sola cifra (Main Story). Si después hace falta
  Main+Extra y Completionist se suman columnas.
- **Sin estado "Abandonado"**: `finishedAt` cubre "terminé"; sin él cubre
  "estoy jugando o lo dejé". Si después necesitamos distinguir, sumamos
  `abandonedAt` o un ENUM `status`.
- **Géneros propios**: extendimos `genres` con columna `applies_to`
  (`movie`/`series`/`game`/`all`) en vez de crear `game_genres`. Una sola
  tabla, validación en el pivot.

## Pre-requisitos

- Docs 11 (módulo content + CTI), 14 (admin dashboard) y 15 (toasts +
  rebrand a Kairos) leídos. Estamos extendiendo todo eso.

## Backend

### 1. Migraciones

**`alter_contents_type_add_game.ts`** — agregar valor al ENUM:

```ts
async up() {
  this.schema.raw(
    "ALTER TABLE contents MODIFY type ENUM('movie','series','game') NOT NULL"
  )
}
async down() {
  this.schema.raw("ALTER TABLE contents MODIFY type ENUM('movie','series') NOT NULL")
}
```

> **Cuidado:** MySQL no permite agregar un valor a un ENUM con un comando
> dedicado; hay que `MODIFY` la columna entera con la lista nueva. Knex no
> tiene helper limpio para esto, así que va por `raw`. El `down` solo
> funciona si no hay filas con `type='game'` — borralas antes de rollback.

**`alter_genres_add_applies_to.ts`** — la columna nueva en géneros:

```ts
table
  .enum('applies_to', ['movie', 'series', 'game', 'all'])
  .notNullable()
  .defaultTo('all')
  .after('name')
```

Default `'all'` para no romper los géneros existentes — los seedeados
("Acción", "Drama", etc.) son universales y aplican a los 3 tipos.

**`create_games_table.ts`** — la tabla específica:

```ts
table.string('id', 36).primary().notNullable()
table
  .string('content_id', 36)
  .notNullable()
  .unique()
  .references('id').inTable('contents').onDelete('CASCADE')
table.decimal('hltb_hours', 6, 1).unsigned().nullable()
table.string('developer', 120).nullable()
table.string('publisher', 120).nullable()
table.json('platforms').nullable()
```

> **Gotcha de DECIMAL:** MySQL devuelve `DECIMAL` como **string** en
> JavaScript (precisión arbitraria). El transformer convierte a `Number`
> antes de mandarlo al frontend — sin esa conversión, `hltbHours.toFixed(1)`
> en el front explota.

### 2. Modelo `Game` con columna JSON

```ts
export const GAME_PLATFORMS = ['pc', 'ps5', 'ps4', 'xbox', 'switch', 'mobile'] as const
export type GamePlatform = (typeof GAME_PLATFORMS)[number]

export default class Game extends BaseModel {
  @column({
    prepare: (value: GamePlatform[] | null) =>
      value === null ? null : JSON.stringify(value),
    consume: (value: string | GamePlatform[] | null) => {
      if (value === null || value === undefined) return null
      if (Array.isArray(value)) return value
      try { return JSON.parse(value) as GamePlatform[] }
      catch { return null }
    },
  })
  declare platforms: GamePlatform[] | null
}
```

**Por qué `prepare`/`consume`:** el driver MySQL2 parsea JSON columns
automáticamente, pero queremos blindarnos contra el caso donde el valor
llegue como string (por ejemplo, en un `db.raw` o un join custom). El
helper `consume` acepta ambos y devuelve siempre el array tipado.

El enum `GAME_PLATFORMS` es **fuente única**: el validator VineJS lo usa
para validar al crear/editar, el frontend lo importa para renderizar las
pills, y el modelo lo usa para tipar la columna. Cuando agreguemos una
plataforma (ej. "VR"), tocamos un solo lugar.

### 3. Validators con plataformas enum

```ts
import { GAME_PLATFORMS } from '#modules/content/models/game'

export const createGameValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    hltbHours: vine.number().positive().max(9999).optional(),
    developer: vine.string().trim().maxLength(120).optional(),
    publisher: vine.string().trim().maxLength(120).optional(),
    platforms: vine.array(vine.enum(GAME_PLATFORMS)).distinct().maxLength(10).optional(),
    // ...comunes
  })
)
```

`vine.enum(GAME_PLATFORMS)` valida que cada item esté en la lista cerrada;
`.distinct()` evita duplicados; `.maxLength(10)` evita que un payload
malicioso intente meter 10000 plataformas.

### 4. Géneros con `applies_to` — validación en pivot

El truco está en `attachGenres` / `syncGenres` en `ContentService`. Antes
de asociar géneros con un content, traemos también `applies_to` y
chequeamos que cada género encaje con el `type` del content:

```ts
const existing = await Genre.query({ client: trx })
  .whereIn('id', genreIds)
  .select('id', 'applies_to')

const incompatible = existing
  .filter((g) => g.appliesTo !== 'all' && g.appliesTo !== content.type)
  .map((g) => g.id)
if (incompatible.length > 0) {
  throw new IncompatibleGenresError(incompatible, content.type)
}
```

**Por qué en el service y no en VineJS:** validar acá no necesita
hardcodear los géneros por tipo — pregunta a la BD. Cuando la admin crea
un género nuevo "FPS" con `appliesTo='game'`, no hay que tocar el
validator.

El controller mapea el error a 422 con `incompatibleIds` para que el
frontend pueda destacar los géneros problema (todavía no usamos esa
info — se muestra el mensaje general).

### 5. `ContentTransformer` branch para game

```ts
if (this.resource.type === 'game' && this.resource.game) {
  const g = this.resource.game
  return {
    ...enriched,
    game: {
      hltbHours: g.hltbHours !== null ? Number(g.hltbHours) : null,
      developer: g.developer,
      publisher: g.publisher,
      platforms: g.platforms ?? [],
    },
  }
}
```

`Number(g.hltbHours)` convierte el DECIMAL-como-string a número. Sin esto,
el frontend recibe `"35.5"` y `toFixed(1)` falla.

### 6. Forecast forzado a `time` para juegos

Los juegos no tienen episodios — si el usuario tiene `paceEpisodes`
configurado pero no `paceMinutes`, el forecast no puede operar. Forzamos
`mode='time'` en `resolveEffectivePace`:

```ts
const isGame = item?.content?.type === 'game'
if (isGame) {
  if (dailyMinutes === null) throw new GameRequiresTimePaceError()
  dailyEpisodes = null
  episodesFromItem = false
}
```

El controller mapea `GameRequiresTimePaceError` a 422 con un mensaje
claro ("Games require a time-based pace…") para que la UI muestre
"configurá minutos por día".

> **Cuidado:** este chequeo asume que `item.content` está precargado.
> `WatchlistService.findById` precarga `content` con `c.preload('genres')` —
> el `belongsTo` viene gratis. Si algún día se llama a `forecast()` con un
> item sin content cargado (no debería pasar), el chequeo del isGame da
> `false` (acceso a propiedad de `undefined` con `?.`) y el forecast usa
> episodios. Aceptable como fallback silencioso.

## Frontend

### 7. Types y API

`api/types.ts`:

```ts
export type ContentType = 'movie' | 'series' | 'game'
export type GenreAppliesTo = 'movie' | 'series' | 'game' | 'all'
export type GamePlatform = 'pc' | 'ps5' | 'ps4' | 'xbox' | 'switch' | 'mobile'

export interface Genre {
  id: string
  slug: string
  name: string
  appliesTo: GenreAppliesTo
}

export interface Content {
  // ...
  game?: {
    hltbHours: number | null
    developer: string | null
    publisher: string | null
    platforms: GamePlatform[]
  }
}
```

`api/admin.ts`: agregamos `CreateGameInput` / `UpdateGameInput` siguiendo
el patrón de movies/series, más `createGame`/`updateGame`/`deleteGame` y
re-exportamos `GAME_PLATFORMS` + `GAME_PLATFORM_LABELS` para que la UI los
use sin redefinir.

### 8. `AdminContentFormPage` — radio + bloque condicional + géneros filtrados

```ts
const type = ref<ContentType>('movie')
const hltbHours = ref<number | null>(null)
const developer = ref('')
const publisher = ref('')
const platforms = ref<GamePlatform[]>([])

// Géneros que aplican al type activo (universales + del tipo).
const availableGenres = computed(() =>
  allGenres.value.filter((g) => g.appliesTo === 'all' || g.appliesTo === type.value)
)

// Al cambiar de tipo en create: desmarcar géneros que ya no aplican.
watch(type, (next) => {
  selectedGenreIds.value = selectedGenreIds.value.filter((id) => {
    const g = allGenres.value.find((x) => x.id === id)
    return g && (g.appliesTo === 'all' || g.appliesTo === next)
  })
  // ...reset de campos type-específicos
})
```

**Quick-create de género:** cuando la admin crea un género desde el form
con "+ Nuevo género", lo asociamos al `type` activo (no `'all'`) —
asunción razonable: si estás creando un género mientras editás un juego,
probablemente es un género de juegos.

```ts
const created = await adminApi.createGenre({ name, appliesTo: type.value })
```

Si quiere uno universal, lo edita después desde `GenreManagerModal` (que
ahora tiene un select de `applies_to` por fila).

### 9. `ItemTrackingModal` — variant juegos

Refactor de las flags type-específicas a `trackable` y `hasEpisodes`:

```ts
const isSeries = computed(() => props.item?.content?.type === 'series')
const isGame = computed(() => props.item?.content?.type === 'game')
const trackable = computed(() => isSeries.value || isGame.value)
const hasEpisodes = computed(() => isSeries.value)
```

- `trackable` controla fechas, progreso parcial y ritmo personalizado
  (todo lo que series ya tenía).
- `hasEpisodes` controla los inputs de "episodios totales" y "ep/día"
  del override de ritmo.

Labels cambian según el tipo:

- "Duración total" → "Horas estimadas (total)" cuando es juego.
- "Ritmo para esta serie" → "Ritmo para este juego".
- El input de `paceEpisodes` se oculta en juegos; el de `paceMinutes`
  queda en grid de 1 columna en lugar de 2.

### 10. `WatchlistsPage` — tab "Juegos" + `gamesCount`

Backend `WatchlistService.listMine` agrega una subquery para contar
juegos por lista (mismo patrón que movies/series):

```ts
const gamesCountSql = `(
  SELECT COUNT(*) FROM watchlist_items wi
  INNER JOIN contents c ON wi.content_id = c.id
  WHERE wi.watchlist_id = watchlists.id AND c.type = 'game'
)`
```

El transformer expone `gamesCount`; el frontend lo lee y agrega tab
`'games'` con su filtro y empty state. localStorage acepta `'games'` como
valor válido para que persista la elección entre sesiones.

### 11. `ContentDetailPage` — HLTB + dev/publisher + plataformas

`ContentDetailHeader.vue` recibe el content y muestra:

- En la fila de metadata (`releaseYear · tipo · runtime`): para juegos,
  `≈ X h (HLTB)` en lugar de duración/temporadas.
- Bloque nuevo bajo la sinopsis con developer/publisher en grid y
  plataformas como pills emerald (color custom para diferenciarlas del
  amber del rating).

```vue
<div v-if="content.type === 'game'" class="flex flex-col gap-3 fade-up">
  <div v-if="developer || publisher" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <div v-if="developer">…</div>
    <div v-if="publisher">…</div>
  </div>
  <div v-if="platforms.length">
    <span v-for="p in platforms" :key="p"
      class="rounded-full border border-emerald-400/40 bg-emerald-500/10 …">
      {{ PLATFORM_LABEL[p] }}
    </span>
  </div>
</div>
```

### 12. `WatchlistDetailPage` — `canForecast` para juegos

Cambio mínimo: las funciones `canForecast`/`canRetrospect`/`canProgress`
ahora aceptan series **y** juegos (antes solo series). El forecast del
backend ya rechaza juegos si solo hay paceEpisodes — el frontend solo
tiene que ofrecer los botones.

```ts
function canForecast(item: WatchlistItem) {
  return (
    !isInherited(item) &&
    (item.content?.type === 'series' || item.content?.type === 'game') &&
    !item.finishedAt &&
    (item.durationSeconds > 0 || (item.episodesWatched ?? 0) > 0)
  )
}
```

### 13. `AdminContentsPage` + `HomePage` — pills y filtros

`AdminContentsPage`:

- Pill "Juego" en color `emerald-500/15 + emerald-300` (distinto del
  sky/violet de movies/series).
- Opción "Juegos" en el filtro de tipo.

`HomePage`:

- BaseSelect "Tipo" sumado al lado de "Ordenar por", con opciones
  `Todos / Películas / Series / Juegos`.
- Al filtrar por tipo, el `GenreFilter` muestra solo los géneros
  aplicables (universales + del tipo).

`GlobalSearch` (NavBar): el `typeLabel` mapping suma `game: 'Juego'`
— ningún otro cambio, los juegos entran automáticamente al typeahead.

## Patrones aprendidos

- **ENUM extensible vs tabla separada.** Extender un ENUM existente con
  `MODIFY` es la opción correcta cuando el "type" sigue siendo una
  dimensión del mismo concepto (acá: "qué clase de contenido es"). Si los
  juegos fueran una entidad ortogonal (sin reviews, ni listas, ni
  ratings), tabla separada hubiera sido lo correcto.
- **`applies_to` en lugar de tabla "tipo-específica".** Una columna que
  marca a qué subset aplica una fila es más simple que una tabla por
  subset cuando el resto de la estructura es idéntica. La validación va
  al service (no al validator), porque depende de datos de la BD.
- **JSON columns con `prepare`/`consume`.** Lucid maneja JSON
  automáticamente pero conviene poner un wrapper defensivo cuando el
  valor podría llegar por raw queries o joins exóticos.
- **DECIMAL = string en MySQL.** Cualquier columna DECIMAL/NUMERIC vuelve
  como string en Node. Convertí en el transformer (`Number(g.hltbHours)`)
  para evitar que el frontend reciba mixed types.
- **Computed `trackable` y `hasEpisodes`** son mejores que `if (isSeries
  || isGame)` repartido por el template. Centraliza la regla y el día que
  agregás un cuarto tipo (¿libros con páginas leídas?) solo tocás esas
  dos computeds.
- **Fuente única para enums chicos.** `GAME_PLATFORMS as const` en el
  backend + re-export del frontend evita drift. Si un día el backend agrega
  `'vr'` y el frontend no, el typecheck detecta el desalineo en el primer
  build.

## Próximo

- Si la usuaria pide diferenciar "abandonado" de "no empecé", sumar
  columna `abandonedAt` o ENUM `status` en `watchlist_items` (afecta
  WatchlistsPage stats, ListStats y el filtro de tabs).
- HLTB multi-cifra (Main+Extra, Completionist) si hace falta más
  granularidad — sumar 2 columnas a `games`, opcionales, sin migración
  destructiva.
- Carátulas grid distinto para juegos (cover art es 1:1 en consolas,
  no 2:3 como pósters de cine). Hoy compartimos el aspect-2/3 del
  AdminContentFormPage; en un sprint futuro podemos hacer
  `aspect-square` para juegos.
