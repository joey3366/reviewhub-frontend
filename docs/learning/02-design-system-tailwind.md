# 02 — Design system con Tailwind

> **Pre-requisitos:** doc 01 (scaffold listo, Tailwind v3 instalado,
> `tailwind.config.js` y `postcss.config.js` generados con
> `npx tailwindcss init -p`).
>
> **Objetivo:** convertir el "Tailwind por defecto" en un **design system
> editorial moderno** (estilo Linear / Notion): paleta neutra, tipografía
> Inter, bordes sutiles, sin sombras. Al terminar, vas a poder escribir
> `class="bg-surface text-ink border-outline"` en cualquier template y
> obtener un look consistente en toda la app.

Al terminar este doc vas a entender:

- Qué es un **design token** y por qué los nombramos semánticamente
  (`surface`, `ink`, `accent`) en vez de literales (`gray-50`, `gray-900`,
  `blue-600`).
- La diferencia entre **`theme.extend`** y **`theme`** en Tailwind — y por
  qué (casi) siempre querés `extend`.
- Cómo cargar Inter como fuente con **`@fontsource/inter`** (mejor que
  Google Fonts `<link>` para apps que pueden necesitar funcionar offline o
  en redes lentas).
- Qué son las **OpenType features** (`cv02`, `cv11`) y por qué activarlas
  hace que Inter se vea mejor.
- Cómo funciona **`@apply`** en `base.css` y cuándo NO usarlo.

---

## 1 · El problema: "Tailwind por default" no es un design system

Tailwind out-of-the-box te da clases como `bg-gray-50`, `text-gray-900`,
`border-gray-200`. Funcionan, pero tienen dos problemas para un proyecto
serio:

1. **Las clases describen color**, no propósito. `bg-gray-50` no te dice
   _para qué_ usás ese color. ¿Es el fondo del card? ¿El header? ¿El
   código bloque? Si después decidís que el fondo de cards va a ser
   ligeramente más cálido, tenés que cambiar TODOS los `bg-gray-50` →
   `bg-gray-100`… pero ¿qué pasa con los `bg-gray-50` que NO eran cards?
   Tenés que ir caso por caso.

2. **Si cambiás de tema** (claro a oscuro, beta a producción) tenés que
   reemplazar literales en cientos de archivos.

**Solución: tokens semánticos.** En vez de `bg-gray-50`, escribimos
`bg-surface-subtle`. La paleta concreta vive en un solo lugar
(`tailwind.config.js`), y cambiarla es una línea.

---

## 2 · Conceptos clave antes de escribir CSS

### 2.1 · ¿Qué es un design token?

Un **design token** es un nombre semántico que apunta a un valor concreto.

| Token semántico | Valor concreto | Lugar donde se usa |
| --- | --- | --- |
| `surface` | `#ffffff` | Fondo principal de la app |
| `surface-subtle` | `#fafafa` | Fondo de cards, áreas secundarias |
| `ink` | `#0a0a0a` | Texto principal |
| `ink-muted` | `#525252` | Texto secundario (meta, ayudas) |
| `accent` | `#2563eb` | Botones principales, links activos |

La idea: el código de la app **nunca** menciona el valor concreto. Solo
los nombres. Si mañana el rojo de error cambia de `#dc2626` a `#e11d48`,
lo cambiás en `tailwind.config.js` y se propaga.

> **Analogía:** es como definir variables CSS (`--color-error`) pero
> integrado al sistema de utilities de Tailwind. Las clases generadas
> (`text-error`, `bg-error`) son consistentes en toda la app.

### 2.2 · `theme.extend` vs `theme`

En `tailwind.config.js` tenés dos formas de declarar tu paleta:

**A. `theme: { colors: {...} }`** — **reemplaza** completamente los colores
de Tailwind. Perdés todos los `bg-red-500`, `text-gray-500`, etc.

**B. `theme: { extend: { colors: {...} } }`** — **agrega** tus colores a
los defaults. `bg-red-500` sigue existiendo y además tenés `bg-surface`.

Casi siempre querés B. Caso de excepción: si tu design system reemplaza
todos los grises con una paleta custom y querés forzar al equipo a no
usar los defaults (un linter casero), entonces A.

Para aprender, usá `extend` siempre. Los defaults de Tailwind son una red
de seguridad cuando necesitás algo rápido (`bg-green-50` para un toast de
éxito sin pensarlo).

### 2.3 · ¿Por qué Inter y por qué fontsource?

**Inter** es la fuente de UI más usada en apps modernas (Linear, Vercel,
Stripe, GitHub). Está diseñada para legibilidad en pantalla y tiene
características OpenType que la hacen verse "profesional" con bajo esfuerzo.

Hay dos formas de cargarla:

**Opción 1 — Google Fonts `<link>`:**

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Pros: cero deps. Contras: depende de la red de Google. Si la página carga
sin internet, la fuente no aparece. Hay un pico de FOUT (Flash of Unstyled
Text) en la primera visita.

**Opción 2 — `@fontsource/inter` (paquete npm):**

```bash
npm install @fontsource/inter
```

Y en `main.ts`:

```ts
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
```

Pros: la fuente se bundlea con tu app, queda **self-hosted**, no hay
request externo. Funciona offline. Más rápido en el primer load porque no
hay DNS lookup a `fonts.googleapis.com`.

Contras: agrega ~100KB al bundle (los archivos `.woff2`).

**Para una app que probablemente desplegues en Cloudflare Pages o Vercel
con CDN cerca del user**, la opción 2 es ligeramente mejor. Y para aprender
es interesante porque ves cómo se importan assets como módulos en Vite.

### 2.4 · ¿Qué son `font-feature-settings`?

Las fuentes modernas (Inter, JetBrains Mono, Geist, etc.) tienen
**OpenType features**: variantes alternativas de glifos que mejoran
aspectos específicos.

| Feature | Qué hace |
| ------- | -------- |
| `cv02` | Forma alternativa de la letra "l" (con cola, menos confundible con "I") |
| `cv03` | Forma alternativa de "g" (más legible) |
| `cv04` | Forma alternativa de "y" |
| `cv11` | Forma alternativa de "i" |
| `ss01`-`ss20` | Stylistic sets — variantes completas de la fuente |
| `tnum` | Tabular numbers (todos los dígitos tienen el mismo ancho — útil en tablas) |

Activarlas es opcional y la mayoría de developers ni saben que existen.
Pero la diferencia visual es notable, especialmente en cuerpos de texto.

> **Importante:** las features solo aplican si la fuente las soporta. Inter
> soporta `cv02`, `cv03`, `cv04`, `cv11`. Una fuente del sistema como Arial
> no, y los browsers simplemente ignoran las que no existen — no rompe nada.

### 2.5 · `@apply` y cuándo NO usarlo

Tailwind permite usar sus clases utilitarias **dentro** de CSS con
`@apply`:

```css
body {
  @apply bg-surface text-ink font-sans;
}
```

Es equivalente a aplicar `class="bg-surface text-ink font-sans"` al `body`.

**Cuándo usar `@apply`:**

- Estilos **base** que aplican a tags HTML (`body`, `h1`, `*`).
- Reset CSS / normalize.

**Cuándo NO usar `@apply`:**

- Para "componentes" custom como `.btn-primary` con `@apply`. Eso recrea
  el problema que Tailwind quiere resolver (clases custom que vivien en
  CSS aparte). Mejor crear un componente Vue (`<BaseButton>`) que
  encapsula las clases. Ver doc 03.

---

## 3 · Implementación paso a paso

### Paso 1 — Definir los tokens en `tailwind.config.js`

**Archivo a modificar:** `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#fafafa',
          muted: '#f5f5f5',
        },
        outline: {
          DEFAULT: '#e5e5e5',
          strong: '#d4d4d4',
        },
        ink: {
          DEFAULT: '#0a0a0a',
          muted: '#525252',
          subtle: '#a3a3a3',
        },
        accent: {
          DEFAULT: '#2563eb',
          hover: '#1d4ed8',
          soft: '#eff6ff',
        },
        success: '#16a34a',
        error: '#dc2626',
        warning: '#ca8a04',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

**Líneas clave explicadas:**

- **`content: [...]`** — Tailwind hace **purging**: genera solo las clases
  que ve usadas en tu código. Sin esta config, no detecta tus templates y
  genera un CSS con 4000 clases que no usás. Acá decimos: "escaneá
  `index.html` y todos los archivos `.vue/.js/.ts/.jsx/.tsx` dentro de
  `src/`".

- **`theme.extend.colors.surface`** — el truco de `DEFAULT`:
  - `surface.DEFAULT = '#ffffff'` genera la clase `bg-surface`.
  - `surface.subtle = '#fafafa'` genera `bg-surface-subtle`.
  - Sin `DEFAULT`, tendríamos que escribir `bg-surface-base` lo cual es
    más verboso.

- **`fontFamily.sans`** — sobrescribimos la `font-sans` default de Tailwind
  para que apunte a Inter. Hacemos fallback a `system-ui` y `-apple-system`
  por si Inter no carga (por red, por bloqueador, etc.) — el user ve algo
  parecido y no Times New Roman feo.

- **`accent.hover`, `accent.soft`** — variantes preparadas para estados.
  El `soft` es un fondo muy claro del accent (azul casi blanco), útil para
  badges o estados activos sutiles.

### Paso 2 — Verificar `postcss.config.js`

`npx tailwindcss init -p` ya lo creó. Confirmá que se ve así:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Si no, copialo. Esto hace que Vite, al procesar CSS, le pase los archivos
por **Tailwind** (genera utilities) y después por **autoprefixer** (agrega
`-webkit-`, `-moz-`).

### Paso 3 — Crear el CSS base

**Archivo nuevo:** `src/assets/base.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  body {
    @apply bg-surface text-ink font-sans antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  button {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  h1,
  h2,
  h3,
  h4 {
    letter-spacing: -0.01em;
  }
}
```

**Pieza por pieza:**

- **`@tailwind base; @tailwind components; @tailwind utilities;`** — tres
  directivas obligatorias. PostCSS las reemplaza con todo el CSS que
  Tailwind genera. El orden importa: `base` (reset normalizado), después
  `components` (clases definidas por plugins), después `utilities` (las
  clases atómicas). Las últimas ganan en cascada CSS.

- **`@layer base`** — todo lo que ponemos dentro se inyecta en la capa
  base de Tailwind. Esto significa que **cualquier clase utility puede
  sobrescribirlo** después. Es importante: si tu `body { @apply bg-surface }`
  estuviera fuera de `@layer`, los `class="bg-error"` específicos no podrían
  vencerlo por la cascada CSS.

- **`html { -webkit-text-size-adjust: 100% }`** — evita que mobile Safari
  agrande la tipografía cuando rota la pantalla.

- **`html { -webkit-font-smoothing: antialiased }`** y `-moz-osx-...` —
  fuerzan antialiasing suave en macOS y Linux. Sin esto, la tipografía se
  ve "negrita" comparada a otras apps.

- **`text-rendering: optimizeLegibility`** — activa kerning fino y
  ligaduras. Inter las usa.

- **`body { @apply bg-surface text-ink font-sans antialiased; }`** —
  estilos base de todo el documento. Si después un componente quiere otra
  cosa, lo dice explícito en su clase.

- **`font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';`** — las
  features de Inter que mejoran la "l", "g", "y", "i". Es la línea que más
  diferencia visual aporta con menos esfuerzo.

- **`button { background: none; border: 0; padding: 0; }`** — los browsers
  ponen estilos default feos a `<button>` (background gris, border, etc.).
  Los matamos. En su lugar, cada `<button>` recibe estilos vía Tailwind o
  vía nuestro `<BaseButton>`.

- **`h1, h2, h3, h4 { letter-spacing: -0.01em }`** — pequeño tightening de
  títulos. Hace que los headings se vean editoriales (estilo Linear/Vercel)
  en vez de "default".

### Paso 4 — Borrar el `style.css` del template Vite

El template de Vite trae `src/style.css` con un estilo de demo. No lo
necesitamos, pero como `main.ts` lo importa por defecto, ese import tiene
que desaparecer (Paso 5).

> **Decisión:** podés borrarlo del filesystem o solo dejar de importarlo.
> Para aprender es más limpio borrarlo así no queda código muerto.

### Paso 5 — Actualizar `main.ts` con la nueva orquestación

**Archivo a modificar:** `src/main.ts`

```ts
import { createApp } from 'vue'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './assets/base.css'
import App from './App.vue'

createApp(App).mount('#app')
```

**Por qué este orden importa:**

1. Las fuentes (`@fontsource/inter/*`) se importan **primero**. Cuando
   PostCSS / Vite procesan la cadena, los `@font-face` que estos archivos
   declaran están disponibles antes de que `base.css` defina
   `body { font-family: Inter... }`.
2. **`base.css` después** — porque referencia `Inter`. Si fuera al revés,
   `base.css` podría aplicar antes y el browser usaría la fuente fallback.

> **¿Y los archivos `500.css`, `600.css`, `700.css`?** Cada uno trae un
> peso distinto de Inter. Si solo importás `400.css`, los `<h1>` con
> `font-weight: 700` se ven simulados (el browser engrosa el peso 400 a
> mano y queda mal). Importando los pesos que usás, cada uno carga su
> archivo `.woff2` propio.

### Paso 6 — Hello world del design system en `App.vue`

**Archivo a modificar:** `src/App.vue`

```vue
<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen bg-surface">
    <main class="mx-auto max-w-7xl px-6 py-10">
      <h1 class="text-3xl font-semibold tracking-tight text-ink">Hola, design system</h1>
      <p class="mt-2 text-sm text-ink-muted">
        Si esto se ve con Inter, fondo blanco y texto casi-negro, los tokens
        están funcionando.
      </p>
      <button class="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
        Botón de prueba
      </button>
    </main>
  </div>
</template>
```

Esta página es **temporal** — la vamos a reemplazar cuando armemos los
componentes base (doc 03). Sirve para verificar que el sistema funcione.

---

## 4 · Verificación

Corré `npm run dev` y abrí `http://localhost:5174`:

1. **Fondo blanco puro**, no off-white grisáceo → `bg-surface` aplica.
2. **Texto casi negro** (no negro puro `#000`) → `text-ink` aplica.
3. **Inter cargada** — abrir DevTools, pestaña Network, filtrar por "font":
   tenés que ver requests a archivos `.woff2` de `@fontsource/inter`. Si
   no aparecen, hay un problema en los imports.
4. **Botón azul** con `#2563eb` → `bg-accent` aplica. Hover lo oscurece
   levemente a `#1d4ed8`.
5. **Heading "Hola, design system"** se ve más apretado (kerning) que un
   `<h1>` default → el `letter-spacing: -0.01em` aplica.
6. **DevTools → Computed → font-feature-settings**: tiene que decir
   `'cv02' 'cv03' 'cv04' 'cv11'`.

Si los 6 puntos pasan, el design system está activo y consistente. Estás
listo para construir componentes encima (doc 03).

---

## 5 · Errores comunes

### "Mis clases no aplican aunque las escribí bien"

99% de las veces es porque el archivo está **fuera del `content` glob de
Tailwind**. Confirmá que tu archivo termina en `.vue`, `.ts`, `.js`,
`.jsx`, o `.tsx`, y que vive dentro de `src/`. Si estás escribiendo en una
ruta exótica (ej. `lib/raw.html`), agregala al array `content` y reiniciá
Vite.

### "Inter no carga, sigo viendo Arial"

Chequeá:

1. **DevTools → Network → font**: ¿hay un `inter-400.woff2`? Si no:
   - El import en `main.ts` está mal escrito.
   - Tu navegador tiene ad-blocker que bloquea fontsource.
2. **DevTools → Computed → font-family** del body: ¿dice `Inter, system-ui...`?
   Si no, Tailwind no aplicó tu `fontFamily.sans` — chequeá `tailwind.config.js`.

### "Los colores custom no salen aunque están en el config"

Causa típica: te olvidaste de **reiniciar Vite** después de cambiar
`tailwind.config.js`. El watcher de Tailwind en Vite v3 a veces no
re-procesa al cambiar el config. `Ctrl+C` + `npm run dev` lo arregla.

---

## 6 · Recap

Lo que hicimos:

- Definimos una paleta semántica (`surface`, `ink`, `accent`, etc.) en
  `tailwind.config.js`, **extendiendo** los defaults para no perder
  `bg-red-50` cuando lo necesitemos rápido.
- Cargamos Inter con `@fontsource/inter` (self-hosted, sin CDN externo).
- Activamos OpenType features (`cv02`, `cv03`, `cv04`, `cv11`) para que la
  fuente se vea como en las apps que admiramos.
- Hicimos un reset CSS mínimo en `@layer base` para neutralizar estilos
  default del browser sin pelearnos con la cascada.
- Lo demostramos con un `App.vue` de un solo header + botón que valida
  que todo conecta.

**Próximo doc:** [03 — Componentes UI base](03-componentes-ui-base.md).
Vamos a encapsular las clases recurrentes (`bg-accent text-white hover:...`)
en componentes Vue reutilizables: `BaseButton`, `BaseInput`, `BaseSelect`,
`BaseBadge`, `BaseCard`.
