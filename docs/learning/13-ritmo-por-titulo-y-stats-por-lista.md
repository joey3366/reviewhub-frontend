# 13 — Ritmo por título y estadísticas por lista

> **Pre-requisitos:** docs 01-12. Tenés todo lo de fases anteriores andando,
> incluyendo el ¿Cómo voy?, listas anidadas y tabs.
>
> **Objetivo:** dos iteraciones más antes de la fase 5 (admin), ambas tocan
> backend y frontend:
> 1. **Ritmo personalizado por título** — un override de `paceMinutes` /
>    `paceEpisodes` por item, para cuando dentro de una misma lista hay
>    series con duración muy distinta y el ritmo global no representa.
> 2. **Estadísticas agregadas por lista** — endpoint nuevo que mira toda la
>    lista (propios + heredados) y te dice cuánto tiempo viste, en qué
>    ventana, a qué ritmo real, y cómo se compara con tu ritmo apuntado.

Al terminar vas a entender:

- Cuándo conviene un **override por entidad hija** (más simple) vs un
  **catálogo de overrides por usuario** (más DRY, más complejo).
- Cómo implementar **precedencia** en una función pure: query > item >
  global, con una bandera de origen que se expone al cliente.
- Por qué la **dimensión del ritmo la decide el override**, no la config
  global (y qué pasa con el otro lado cuando se pisa solo uno).
- Cómo modelar una **ventana temporal abierta** (cuando una de las puntas
  depende de "hay algo in-flight").
- El patrón de **endpoint agregador**: reusa servicios existentes
  (`findByIdWithIncluded`, `walkCalendar`) pero pega los números en una
  única vista; el frontend no recompone nada.
- La diferencia entre **"target absoluto" y "multiplicador"** como veredicto
  (1.3× es más legible que "+30%" cuando lo combinás con texto).

---

## Parte 1 — Ritmo personalizado por título

### 1.1 El problema

Hasta hoy el ritmo era **global** (`UserPaceSetting.dailyMinutes` o
`dailyEpisodes`, configurado en `/ritmo`). Si tu ritmo dice "3 episodios por
día", el pronóstico de **todas** las series asume eso. Funciona si las series
duran parecido. Se rompe cuando mezclás:

- **The Bear** — 28 min por episodio
- **Stranger Things** — 60 min por episodio

3 episodios al día son **84 minutos** en una y **180 minutos** en la otra.
La usuaria pidió que el ritmo se pueda **definir por título**, sin tener
que cambiar el global cada vez.

### 1.2 La decisión de modelo

Pensamos 3 opciones:

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A — Override en el item** | Agregar `pace_minutes` y `pace_episodes` nullable a `watchlist_items`. Si están seteados, ganan. | Mínimo cambio, sigue patrón existente (igual que `durationProgressSeconds` también vive en el item), fácil de entender ("para esta serie") | Repetís el override si la misma serie está en varias listas |
| B — Override por contenido | Tabla `content_pace_overrides(user_id, content_id, ...)`. Una vez por serie, vale en todas tus listas | DRY semánticamente correcto | Tabla nueva + endpoints + UI nueva ("Mi ritmo para X") + más complejidad |
| C — Pace dinámico desde duración | Calcular pace efectivo automáticamente a partir de `episode_runtime` | Cero config | `episode_runtime` no existe en `contents`. Y rompe el modelo "yo decido cuánto miro" |

**Fuimos con A.** La decisión clave: el override se setea **poco** (lo configurás
una vez y te olvidás), así que la repetición entre listas es un costo bajo. En
cambio, la opción B implicaba tabla nueva, controller nuevo, página nueva.

### 1.3 Migración + modelo + validator + transformer

Cuatro cambios pequeños, todos siguiendo el patrón de `durationProgressSeconds`:

```ts
// database/migrations/1778920000000_add_pace_overrides_to_watchlist_items.ts
this.schema.alterTable('watchlist_items', (table) => {
  table.integer('pace_minutes').unsigned().nullable()
  table.integer('pace_episodes').unsigned().nullable()
})
```

```ts
// app/modules/watchlists/models/watchlist_item.ts (campos nuevos)
@column() declare paceMinutes: number | null
@column() declare paceEpisodes: number | null
```

```ts
// app/modules/watchlists/validators/watchlist_item_validator.ts
paceMinutes: vine.number().withoutDecimals().min(1).nullable().optional(),
paceEpisodes: vine.number().withoutDecimals().min(1).nullable().optional(),
```

```ts
// app/modules/watchlists/transformers/watchlist_item_transformer.ts
// agregar a la lista del pick:
'paceMinutes', 'paceEpisodes',
```

**Lo importante:** los campos van **nullable** porque "no tener override" es
un estado válido y distinto a "tener override de 0". Y `.min(1)` porque
`0 min/día` no tiene sentido (sería como pausar la serie indefinidamente).

### 1.4 `resolveEffectivePace` con precedencia

Acá está toda la lógica. La función `resolveEffectivePace` ya tomaba `viewerId`
y `overrides` (query params del endpoint). Ahora también acepta un `item` opcional:

```ts
// app/modules/playback/services/forecast_service.ts

private async resolveEffectivePace(
  viewerId: string | null,
  overrides: PaceOverrides,
  item?: WatchlistItem
): Promise<EffectivePace> {
  const settings = viewerId
    ? await UserPaceSetting.query().where('user_id', viewerId).first()
    : null

  // Precedencia: query > item > global
  let dailyMinutes: number | null
  let minutesFromItem = false
  if (overrides.dailyMinutes !== undefined) {
    dailyMinutes = overrides.dailyMinutes
  } else if (item && item.paceMinutes !== null) {
    dailyMinutes = item.paceMinutes
    minutesFromItem = true
  } else {
    dailyMinutes = settings?.dailyMinutes ?? null
  }
  // ...idem para dailyEpisodes con `episodesFromItem`

  const mode: 'time' | 'episodes' = dailyMinutes !== null ? 'time' : 'episodes'
  const customForItem =
    (mode === 'time' && minutesFromItem) || (mode === 'episodes' && episodesFromItem)

  return { mode, dailyMinutes, dailyEpisodes, skipWeekdays, holidays, customForItem }
}
```

**Líneas clave explicadas:**

- `overrides.dailyMinutes !== undefined` antes que `item.paceMinutes !== null`:
  query gana sobre item. ¿Por qué? El query es para **simulaciones** ("¿y si
  miro 5 eps/día?") — gana sobre el setup persistido.
- `item && item.paceMinutes !== null`: necesitamos ambos chequeos. `item?` solo
  protege contra `item` undefined; `.paceMinutes` puede ser `null` (no setado)
  o un número. **No usés `!= null`**: el eslint del proyecto fuerza `!==` y
  rompe el commit con `eqeqeq`.
- `minutesFromItem` / `episodesFromItem` capturan **de dónde vino** el valor.
  Después se combina con `mode` para definir `customForItem`: si gana el modo
  tiempo PERO los minutos vinieron del item, sí es custom; si gana tiempo y
  los minutos vinieron del global, no.
- El **mode lo decide el ganador de minutos vs episodios**, no la config
  global. Esto significa que si tu global está en episodios pero el item
  define minutos, esa serie se pronostica/retrospecta en **modo tiempo**
  (con `dailyMinutes` del item). Es lo que queremos.

Las tres funciones públicas (`forecast`, `progress`, `retrospective`) pasan
ahora el item a `resolveEffectivePace`:

```ts
const pace = await this.resolveEffectivePace(viewerId, input.overrides, item)
```

### 1.5 UI — bloque desplegable

El override vive en el `ItemTrackingModal` (el del reloj). Le agregamos un
tercer bloque colapsable con la misma mecánica que "Tu progreso hasta hoy":

```html
<div v-if="isSeries" class="overflow-hidden rounded-lg border border-violet-400/20 ...">
  <button type="button" @click="paceOpen = !paceOpen" ...>
    <span>Ritmo para esta serie</span>
    <span class="text-xs">
      <template v-if="paceSummary">{{ paceSummary }}</template>
      <template v-else>opcional · sobrescribe tu ritmo global solo acá</template>
    </span>
  </button>
  <div v-if="paceOpen">
    <label><input v-model.number="paceMinutes" type="number" min="1" .../> min por día</label>
    <label><input v-model.number="paceEpisodes" type="number" min="1" .../> eps por día</label>
  </div>
</div>
```

**Lo importante:**

- **Sólo para series.** En `save()` se pone `null` para películas, porque
  el ritmo no aplica (las pelis se ven de una).
- **Desplegable abre solo si hay algo cargado**: `paceOpen.value = (item.paceMinutes ?? 0) > 0
  || (item.paceEpisodes ?? 0) > 0`. Si la usuaria nunca seteó override, no le
  cargamos el modal con un acordeón innecesario.
- **`v-model.number` + ref `number | null`** + helper `fieldValue()` (visto
  en docs anteriores) — sino los inputs vacíos llegan como `''` y el backend
  rechaza por validador.

En la **card del item** (en `WatchlistDetailPage`) agregamos un mini-pill
violeta cuando hay override, así se ve de un vistazo:

```html
<span v-if="item.paceMinutes != null || item.paceEpisodes != null"
      class="... bg-violet-500/15 text-violet-200"
      :title="`Ritmo propio: ${item.paceMinutes ?? item.paceEpisodes} ...`">
  ritmo propio
</span>
```

Y en los modales de Pronóstico / ¿Cómo voy? / Retrospectiva, cuando el cálculo
usó el override la etiqueta del ritmo agrega `"(ritmo propio de esta serie)"`
para que sea obvio de dónde salió. La pista es el `customForItem` del descriptor.

### 1.6 Lo importante de la parte 1

- **Override por entidad hija** es la primera reach cuando la repetición es
  baja. Una tabla aparte (opción B) recién vale cuando la misma config se
  usa en muchos lugares.
- **Precedencia explícita en código** (no en config). Tres ifs ordenados son
  más auditable que un dict de prioridades.
- **Exponé el origen al cliente** (`customForItem`) — la UI lo necesita para
  ser transparente con el usuario.
- **El modo del cálculo lo decide el ganador**, no la config base. Si esto
  no te encaja, repensá la abstracción.

---

## Parte 2 — Estadísticas agregadas por lista

### 2.1 La pregunta agregada

El pronóstico y la retrospectiva trabajan **por título**. La usuaria pidió
una vista **por lista entera**: "del 1 al 9 de junio vi por 8 días, totalicé
15h, a un ritmo real de 100 min/día — ¿cómo me fue contra mi ritmo apuntado?".

Esto requiere un endpoint nuevo que **agregue** todos los items con
`startedAt` (propios + heredados) y devuelva un solo objeto con todo lo
necesario para el modal.

### 2.2 Diseño del endpoint

`GET /watchlists/:id/stats`. Sólo dueño (las stats son personales). Sin
overrides de query: acá estamos midiendo lo que pasó, no proyectando.

Devuelve un objeto con `status: 'ok' | 'empty'`, y cuando es `ok`:

- `window` — `{ start, end, endIsToday, calendarDays, validDays, skippedDays }`
- `totals` — `{ durationSeconds, durationFormatted, episodes }`
- `actualPace` — `{ minutesPerValidDay, episodesPerValidDay }`
- `targetPace` — el global del usuario (puede ser `null` si nunca configuró)
- `comparison` — `{ minutesMultiplier, episodesMultiplier }` (cada uno puede
  ser `null` si esa dimensión no tiene actual o no tiene target)
- `contributingItems[]` — id, title, startedAt, finishedAt, viaWatchlistName

### 2.3 Service — `computeStats`

```ts
// app/modules/playback/services/list_stats_service.ts
async computeStats(watchlistId: string, userId: string) {
  const detail = await new WatchlistService().findByIdWithIncluded(watchlistId, userId)
  if (detail.watchlist.userId !== userId) throw new ListStatsForbiddenError()

  // Items contribuyentes = los que tienen startedAt (propios + heredados)
  const items: ContributingItem[] = []
  for (const item of detail.watchlist.items) {
    if (item.startedAt) items.push({ ...item, viaWatchlistName: null })
  }
  for (const inh of detail.inherited) {
    if (inh.item.startedAt) items.push({ ...inh.item, viaWatchlistName: inh.viaWatchlistName })
  }

  if (items.length === 0) return { status: 'empty', ... }

  // Ventana
  const today = DateTime.now().startOf('day')
  const windowStart = min(items.map(i => i.startedAt))
  const hasInFlight = items.some(i => i.finishedAt === null)
  const windowEnd = hasInFlight
    ? (today < windowStart ? windowStart : today)
    : max(items.map(i => i.finishedAt))

  // walkCalendar reusa la utility del playback module
  const range = walkCalendar(windowStart, windowEnd, settings?.skipWeekdays ?? [], holidays)
  const denominatorDays = Math.max(1, range.validDays)  // evita div/0

  // Totales: finished → completos; in-flight → progress
  let totalDurationSeconds = 0
  let totalEpisodes = 0
  for (const i of items) {
    if (i.finishedAt) {
      totalDurationSeconds += i.durationSeconds
      totalEpisodes += i.episodesWatched ?? 0
    } else {
      totalDurationSeconds += i.durationProgressSeconds
      totalEpisodes += i.episodesProgress ?? 0
    }
  }
  // ... actualPace, comparison ...
}
```

**Líneas clave explicadas:**

- **`findByIdWithIncluded` ya hace todo el trabajo pesado**: ownership, items
  propios precargados con `content`, items heredados con `viaWatchlistName`,
  dedupe por contentId. Reusarlo es el patrón "endpoint agregador": tu
  service nuevo no consulta DB directamente, compone.
- **Dueño explícito**: `findByIdWithIncluded` deja pasar listas públicas
  (canView), pero las stats son privadas. Re-chequeamos `detail.watchlist.userId
  !== userId` y tiramos `ListStatsForbiddenError` (responde 403). Sin este
  guard, cualquiera que pudiera ver una lista pública vería las stats del dueño.
- **Ventana cuando hay in-flight**: `windowEnd = today`. Si todos terminaron,
  `windowEnd = max(finishedAt)`. El borde `today < windowStart` es defensivo
  por si alguien setea startedAt en el futuro.
- **`Math.max(1, range.validDays)` como denominador**: si la ventana es de 1
  día y ese día es feriado, `validDays` sería 0 y `total/0 = Infinity`. Pisamos
  a 1 para que el ritmo real sea al menos `total/1`. Esto preserva el dato
  visible aun en ventanas degeneradas.
- **finished → full / in-flight → progress**: refleja **lo efectivamente visto
  en la ventana**, no lo planificado. Si una serie está in-flight con 3 eps
  vistos de 10, solo aportan 3 al total. Esto es lo que la usuaria espera ver.

### 2.4 Frontend — modal con estados

`ListStatsModal.vue` sigue el patrón de los otros modales del módulo
(`<Teleport>`, scroll lock, Escape, loading/error/empty/ok states).

El veredicto del comparison usa **multiplicador**, no porcentaje raw:

```ts
const verdict = computed(() => {
  const mult = stats.value?.comparison?.minutesMultiplier
            ?? stats.value?.comparison?.episodesMultiplier
  if (mult === null || mult === undefined) return null
  if (mult >= 0.9 && mult <= 1.1) {
    return { kind: 'onpace', label: 'Fuiste fiel a tu ritmo', detail: `(${mult.toFixed(2)}× lo apuntado)` }
  }
  if (mult > 1.1) {
    const pct = Math.round((mult - 1) * 100)
    return { kind: 'fast', label: `${pct}% más rápido`, detail: 'que tu ritmo apuntado' }
  }
  const pct = Math.round((1 - mult) * 100)
  return { kind: 'slow', label: `${pct}% más lento`, detail: 'que tu ritmo apuntado' }
})
```

**Lo importante:**

- **Multiplicador como API, porcentaje como UI**: backend devuelve `1.3` (más
  legible para debugging, más estable contra cambios de signo); frontend
  convierte a "30% más rápido" para la usuaria. Si quisiéramos otra forma de
  presentación (gauge, barra, ratio explícito), cambiamos sólo el frontend.
- **Tolerancia de ±10%** para considerarlo "fiel" (`0.9 ≤ mult ≤ 1.1`).
  Mismo margen que el `onPace` de la retrospectiva. Coherencia entre vistas.
- **Picks por prioridad**: si hay `minutesMultiplier`, lo usamos; sino,
  `episodesMultiplier`. La usuaria ve un solo veredicto, no dos. Cuando hay
  ambos (raro), el de tiempo gana porque es el modo "más natural" en la
  config global.
- **`noTargetMsg` para cuando no hay con qué comparar**: si el target es null
  o no coincide la dimensión, mostramos un cartelito con CTA a `/ritmo` en
  lugar de mostrar números sin contexto.

### 2.5 Edge cases que el endpoint cubre

| Situación | Comportamiento |
|---|---|
| Lista vacía | `status: 'empty'`, todo lo demás `null`/0 |
| Lista con items pero ninguno con `startedAt` | igual: `status: 'empty'` |
| Solo items in-flight | `windowEnd = today`, totales usan progress |
| Solo items terminados | `windowEnd = max(finishedAt)`, totales usan full |
| Ventana de 1 día | `calendarDays = validDays = 1`, denominador OK |
| Ventana toda feriado | `denominatorDays = 1` (clamp anti-div/0) |
| Usuario sin `PaceSettings` | `targetPace: null`, `comparison: null`, modal muestra "no hay con qué comparar" |
| Lista no existe / ajena | 404 (`canView` falla) |
| Lista pública ajena | 403 (`findByIdWithIncluded` deja pasar, pero el guard re-chequea ownership) |

### 2.6 Lo importante de la parte 2

- **Endpoint agregador** compone servicios existentes. No vayas a la DB directo
  si ya hay un service que carga lo que necesitás.
- **Re-validá ownership en cada endpoint sensible**, aunque el service que
  usás ya tenga sus propios chequeos. Los chequeos del service pueden ser
  más laxos que lo que tu endpoint requiere.
- **Backend devuelve datos crudos, frontend les pone narrativa.** Multiplicador
  → porcentaje, segundos → "27h 30min", etc.
- **Las ventanas con punta in-flight** son comunes en stats temporales.
  Modelalas explícitamente con un flag (`endIsToday`) para que la UI pueda
  decir "hasta hoy" y no "hasta el 9 de junio" (que parece elegido al azar).

---

## Cierre

Después de esta sesión la app tiene:

- **3 vistas analíticas por título** (pronóstico, ¿cómo voy?, retrospectiva)
  que ahora respetan el ritmo individual cuando lo definís.
- **1 vista analítica agregada por lista** que reusa toda la infraestructura
  del playback module.
- El concepto de **override de configuración** documentado y aplicado de
  forma consistente.

Próxima fase: **admin dashboard** (reemplazar las carátulas placeholder y
crear contents). Ver `project-fase-status` en memoria para el plan completo.
