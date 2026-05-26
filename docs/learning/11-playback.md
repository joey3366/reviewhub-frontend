# 11 — Playback: ritmo, seguimiento, pronóstico y retrospectiva

> **Pre-requisitos:** docs 01-10. Tenés el catálogo, el detalle
> cinematográfico, auth, reviews y watchlists andando. Entendés el patrón
> "componente tonto / page inteligente", el cliente HTTP con token, las
> rutas `fullBleed` y los modales con `<Teleport>`.
>
> **Objetivo:** construir toda la **Fase 4 (playback)**: decirle a la app
> cuánto ves por día y que calcule **cuándo vas a terminar** una serie
> (pronóstico) y **qué tan bien cumpliste tu ritmo** (retrospectiva). Igual
> que con watchlists, el backend **ya estaba** (tag `v0.9.0-forecast`), así
> que el foco es el frontend — y esta vez **no tocamos backend en absoluto**.

Al terminar este doc vas a entender:

- Cómo modelar un feature donde el **cálculo vive en el backend** y el front
  solo manda inputs y dibuja el resultado.
- El footgun de **`<input type="number">` + `v-model`** (te da un número, no
  un string) que nos costó una sesión entera de debugging.
- Por qué a veces el dato faltante no es un dato sino un **desajuste de
  configuración**, y cómo convertir un mensaje de error en una guía accionable.
- Cómo **verificar contra el backend real** con curl antes de tocar el
  navegador, para no debuggear a ciegas.

---

## 1 · El backend ya estaba: 4 capacidades

El módulo de playback exponía esto (todo bajo `/api/v1`):

| Método | Ruta | Qué |
|--------|------|-----|
| `GET` | `/account/pace-settings` | Tu ritmo (o `404` si no configuraste) |
| `PATCH` | `/account/pace-settings` | Guardar ritmo (upsert) |
| `GET` | `/account/holidays` | Tus días libres |
| `POST` | `/account/holidays` | Agregar día libre |
| `DELETE` | `/account/holidays/:date` | Borrar día libre |
| `GET` | `/watchlists/:id/items/:itemId/forecast` | Pronóstico |
| `GET` | `/watchlists/:id/items/:itemId/retrospective` | Retrospectiva |

**Regla que ya conocés:** si el backend hace lo que necesitás, no lo toques.
Esta fase es 100% frontend.

### El detalle que define todo: el "modo"

El backend decide si calcula **por tiempo** o **por episodios** mirando tu
ritmo, con esta regla (hardcodeada):

```
mode = (dailyMinutes != null) ? 'time' : 'episodes'
```

O sea: **si tenés minutos configurados, gana tiempo**; si solo tenés
episodios, va por episodios. Y según el modo usa un campo distinto del item:

- modo `time` → `item.durationSeconds`
- modo `episodes` → `item.episodesWatched`

Guardá esto en la cabeza: **el modo lo manda tu ritmo, no el título.** Es la
fuente de la confusión más grande de la fase (§7).

---

## 2 · La capa de API y los tipos

Primero los tipos (`src/api/types.ts`): `Weekday`, `PaceSettings`,
`Holiday`, `Forecast`, `Retrospective`, `ForecastMode`, `ForecastPace`.
Todos calcados de la respuesta del backend.

Después `src/api/playback.ts`. Un par de decisiones:

```ts
// getPaceSettings devuelve null si todavía no hay ritmo, en vez de tirar el 404.
getPaceSettings: async (): Promise<PaceSettings | null> => {
  try {
    const { data } = await client.get<{ data: PaceSettings }>('/account/pace-settings')
    return data.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null
    throw error
  }
},
```

**Por qué `null` y no propagar el 404:** "todavía no configuraste" no es un
error, es un estado válido. Traducirlo a `null` deja el componente limpio
(`if (pace) { ... }`) sin try/catch por todos lados.

> **Confirmá la forma de la respuesta antes de escribir.** El helper
> `serialize()` del backend envuelve **todo** en `{ data: ... }` — objetos y
> arrays. Lo verificamos comparando con un controller de watchlists que ya
> consumíamos así. Forecast/retrospective lo arman a mano pero también con
> `{ data }`. Ver [[reference-frontend-gotchas]].

---

## 3 · La página "Mi ritmo" (`/ritmo`)

Una página `fullBleed` con dos secciones: **tu ritmo diario** (minutos
y/o episodios por día + qué días NO ves nada) y **días libres**.

Cositas de UX que valen:

- Un **resumen en lenguaje natural** que se actualiza solo mientras editás:
  *"Ves 2 episodios por día · descansás Sáb, Dom."* Es un `computed` sobre
  los campos. Da sensación de que la app "entiende" lo que cargás.
- Los días de la semana son 7 botones toggle. **No te deja saltear los 7**
  (el backend lo rechaza con `422`; lo prevenimos en el cliente).
- Las fechas (`yyyy-MM-dd`) se muestran sin `new Date(str)` directo: parseamos
  las partes con `.split('-')` para que **no se corra el día por timezone**.

---

## 4 · El footgun que nos costó una sesión: `v-model` + `type="number"`

Síntoma reportado: *"le doy guardar y no pasa nada"*. Ni verde ni rojo.
Pero los días libres (otro form en la misma página) **sí** guardaban.

Debug en orden, descartando de afuera hacia adentro:

1. ¿Backend roto? No: `PATCH` por curl devolvía `200` y persistía.
2. ¿CORS? No: el preflight `OPTIONS` de `PATCH` devolvía `204` con headers OK.
3. ¿Auth? No: holidays escribía con el mismo token.

La consola del navegador lo cerró:

```
TypeError: episodes.value.trim is not a function
[savePace] clic recibido. minutes= 60 episodes= 3   ← ¡son NÚMEROS!
```

**La causa:** en Vue 3, `<input type="number">` con `v-model` te entrega un
**número**, no un string. Mi ref era string y hacía `.trim()` sobre ella →
crasheaba en la **primera línea de la función, antes del `try`**. Por eso no
salía ni el éxito ni el error: la función abortaba sin llegar a ningún lado.

**El arreglo:**

```ts
const minutes = ref<number | null>(null)        // no string
// v-model.number en el input

// '' (campo vaciado) / null / NaN → null; número → número
function fieldValue(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
```

> **Lección general:** si un handler "no hace nada", sospechá de una excepción
> **antes** del `try`. Y si un input es numérico, tu ref es numérica.
> Lo registramos en [[reference-frontend-gotchas]] porque reaparece en
> CADA formulario de la app (lo volvimos a aplicar en el modal de seguimiento).

---

## 5 · Seguimiento por título (`ItemTrackingModal`)

Un modal (`<Teleport>` + `Esc` + scroll lock, igual que `ReviewModal`) que se
abre con un botón de **reloj** sobre cada póster. Carga:

- **Duración** en `horas / minutos / segundos`. La guardamos como
  `durationSeconds = h*3600 + m*60 + s`. (Los segundos los pidió la usuaria:
  al principio solo había horas/minutos y "no se contabilizaban".)
- **Episodios** (solo series). Ojo el label: dice **"Episodios"**, no
  "vistos", porque sirve para los dos casos — una serie que vas a *empezar*
  (cargás el total) y una que *terminaste*.
- **Empezaste / Terminaste** (solo series). **Una peli se ve de una**, así que
  no lleva fechas; y al guardar una peli forzamos las fechas a `null`.

El backend devuelve campos **derivados** que no mandamos: `durationFormatted`
(`"2:30:00"`), `daysElapsed` y `avgDaysPerEpisode`. Tras guardar, **refetcheamos**
la lista para recalcular esos derivados y el total.

> El `durationFormatted` del backend es `HH:MM:SS`. En las cards lo mostramos
> como `"2h 30m 45s"` (formateado por nosotros) porque queda más legible.
> Mostramos los segundos solo cuando los hay.

### Total visto destacado

El header de la lista muestra `totalDurationSeconds` como una **píldora ámbar**
prominente (la usuaria lo pidió "más vistoso"), no como texto gris. Mismo
formateador `fmtDuration` con segundos.

---

## 6 · Pronóstico (`ForecastModal`)

Botón **"Pronóstico"** en cada **serie** con datos. El modal:

- Pre-carga el date picker con `item.startedAt` (si lo marcaste) o, si no, hoy.
- Llama `GET .../forecast?startDate=...` y dibuja: **"Terminás el [fecha
  larga]"** + `requiredDays` viendo, días salteados, días de calendario.
- Recalcula al cambiar la fecha (un `watch` sobre `startDate`).

Manejo de los `422`:

- *Pace not configured* → cartel + botón **"Configurar mi ritmo"** a `/ritmo`.
- El resto, mensaje genérico.

---

## 7 · El acoplamiento modo↔ritmo (la confusión grande)

Caso real de la usuaria: serie de **123 episodios**, ritmo con **minutos**
cargados. Abre el pronóstico y le dice *"Cargá la duración"* — pero ella había
cargado los 123 **episodios**, no la duración. ¿Por qué?

Porque (§1) **el modo lo manda el ritmo**: tenía minutos → modo `time` → el
pronóstico mira `durationSeconds` (vacío) e **ignora los episodios**.

**Lo importante de cómo lo resolvimos:** el problema no era un dato faltante,
era un **desajuste**. Así que en vez de un seco "cargá la duración",
el mensaje ahora **diagnostica y propone**:

```
Tu ritmo está en minutos por día, así que el pronóstico usa la duración
(vacía) e ignora los 123 episodios. Para pronosticar por episodios, poné
tu ritmo en episodios por día.        [ Ajustar mi ritmo → /ritmo ]
```

> **Lección de producto:** cuando una feature "no anda" por configuración,
> no muestres un error — mostrá **el camino para arreglarlo**. Un mensaje que
> explica *por qué* y un botón que lleva *adónde* convierte un callejón sin
> salida en un paso más.
>
> **Por qué no lo "arreglamos" en el front:** el override de pace del endpoint
> no permite **anular** el `dailyMinutes` de tus settings (solo pasar un
> número). O sea, desde el front no podés forzar modo episodios si tu ritmo
> tiene minutos. La única palanca real es el ritmo. Hacer que el modo lo
> elija el título sería un cambio de backend — lo dejamos anotado para más
> adelante.

---

## 8 · Retrospectiva (`RetrospectiveModal`)

Botón **"Retrospectiva"** en series con **fecha de inicio Y fin**. No pide
fecha (usa las del item). Compara los **días reales** contra los **esperados a
tu ritmo** y dicta un veredicto con color:

- ✅ **"Ibas en ritmo"** (verde) si `|deviationDays| <= toleranceDays`.
- ⏱ **"Te atrasaste N días"** (ámbar) si fuiste más lento.
- ⏩ **"Te adelantaste N días"** (celeste) si fuiste más rápido.

La tolerancia es el 10% de lo esperado (mínimo 1 día), la calcula el backend.
Dos tarjetas comparativas (`días reales` vs `esperados`) lo hacen entendible
de un vistazo.

---

## 9 · Cómo verificamos (sin adivinar)

Patrón que usamos toda la fase: **probar el endpoint real con curl/python
ANTES de confiar en el navegador.** Login como admin → crear lista de prueba →
cargar datos → pegarle al endpoint → comparar contra el cálculo esperado a
mano → borrar la lista de prueba.

Ejemplo del pronóstico (123 ep, arranco 27/05/2026, 2 ep/día, salto findes):

```
esperado: requiredDays = ceil(123/2) = 62 días viendo
respuesta: finishDate = 2026-08-20, skippedDays = 24, totalCalendarDays = 86  ✓
```

Cuando el número de la respuesta coincide con el que sacaste a mano, sabés que
el backend está bien y cualquier rareza es del front. Eso nos ahorró horas en
el bug del §4 (descartamos backend/CORS/auth en minutos).

---

## 10 · Errores comunes

> **"Le doy guardar y no pasa nada."** Excepción síncrona antes del `try`.
> Casi siempre: ref string donde el input da número (§4). Abrí la consola.

> **"El pronóstico me pide duración pero cargué episodios."** Desajuste de
> modo: tu ritmo tiene minutos. Poné el ritmo en episodios/día (§7).

> **"La fecha del día libre se guarda un día corrida."** Estás haciendo
> `new Date('2026-12-25')` (lo interpreta como UTC y lo corre por tu zona).
> Parseá las partes con `.split('-')`.

> **Página "cargando para siempre".** Un `DECIMAL` de MySQL llega como string
> (`"8.00"`) y `.toFixed()` rompe el render. Casteá con `Number()`. Ver
> [[reference-frontend-gotchas]].

---

## Recapitulando

Construiste un feature de **cálculo en el backend + UI en el front**: ritmo,
días libres, seguimiento (con segundos y campos según el tipo), pronóstico y
retrospectiva. Las dos lecciones que te llevás:

1. **Los inputs numéricos dan números.** Tipá las refs como `number | null` y
   usá `v-model.number` (§4).
2. **Un error de configuración merece una guía, no un cartel rojo** (§7).

Con esto cerramos la Fase 4. La **Fase 5** es el panel de admin para crear
contenido (cargar pósters/backdrops reales en vez de los placeholders que
seedeamos para probar series).
