# 01 — Decisiones iniciales y scaffold

> **Pre-requisitos:** Node.js 20+, npm, y un backend que ya devuelva JSON
> en `http://localhost:3333` (en nuestro caso, AdonisJS 6 — ver
> `Proyect/docs/learning/`). Este doc asume que el backend está terminado
> y vos arrancás el cliente de cero.
>
> **Objetivo:** decidir el stack, el layout de carpetas y dejar el
> proyecto Vue 3 + Vite + TypeScript scaffolded con todas las
> dependencias instaladas. Al final de este doc, `npm run dev` levanta
> un servidor en `localhost:5174` con el template default de Vite.

Al terminar este doc vas a entender:

- Por qué el stack es **Vue 3 + Vite + TypeScript + Pinia + axios + Tailwind**
  y qué problema resuelve cada uno.
- La diferencia entre **monorepo** (todo en un repo) y **carpetas hermanas**
  (front y back en repos separados), y por qué elegimos la segunda.
- Cómo funciona `npm create vite@latest` por debajo — qué genera y por qué.
- Qué deps son **runtime** (van a producción) vs **dev** (solo build).
- Por qué fijamos un puerto explícito en `vite.config.ts` cuando hay otros
  proyectos corriendo en paralelo.

---

## 1 · El problema: cómo se conecta el frontend al backend terminado

El backend ya expone 35 endpoints REST con auth por Bearer tokens, errores
estructurados y respuestas JSON paginadas. Necesitamos un cliente web que
los consuma. Las preguntas que tenemos que contestar antes de codear:

- **¿Qué framework?** Vue, React, Svelte, Solid, Angular… cada uno tiene
  pros y contras.
- **¿Qué build tool?** Vite, Webpack, Parcel, Turbopack. Importa porque
  define la experiencia de desarrollo (velocidad de HMR, tiempo de build,
  configurabilidad).
- **¿TypeScript o JavaScript plano?** Tipar la API tiene costo upfront pero
  paga cuando el shape de respuestas cambia.
- **¿Cómo manejo estado compartido?** El user logueado, el catálogo
  cacheado, etc. — necesito alguna abstracción.
- **¿Cómo organizo el repo?** ¿El frontend vive adentro del repo del
  backend (monorepo) o al lado (sibling repos)?

Cada decisión se justifica abajo.

---

## 2 · Conceptos clave antes de scaffold

### 2.1 · Por qué Vue 3 (y no React/Svelte/Angular)

**Vue 3** es el sweet spot entre simplicidad y poder para este proyecto.

| Framework | Pros para este caso | Contras |
| --------- | ------------------- | ------- |
| **Vue 3** | API reactiva clara (`ref`, `computed`); SFCs con `<template>` + `<script>` + `<style>` en un solo archivo; ecosistema oficial coherente (Vue Router, Pinia) | Menos masa crítica de devs que React |
| **React** | Comunidad gigantesca, infinitas libs | Ecosistema fragmentado (Redux vs Zustand vs Jotai vs…, React Router vs TanStack Router, etc.); cada equipo arma su stack |
| **Svelte** | Compilador genera código mínimo; sintaxis muy elegante | Ecosistema chico para tooling avanzado |
| **Angular** | Opinionado, DI built-in, formas reactivas | Mucha ceremonia para apps medianas; curva empinada |

Vue gana acá porque:

1. **Vos venís del backend con AdonisJS**, que también es opinionado. Vue
   sigue la misma filosofía: hay UN router, UN state manager (Pinia), UN
   estilo de componente (SFC). Menos decisiones por tomar.
2. **`<template>` se parece a HTML.** Si el día de mañana querés mostrarle
   el código a alguien que no sabe Vue, lo entiende. JSX (React) requiere
   ojo entrenado.
3. **Composition API + `<script setup>`** elimina boilerplate. La curva de
   "todo refactor a hooks" que sufrió React no la pasamos.

### 2.2 · Por qué Vite (y no Webpack)

**Vite** es un build tool moderno que prioriza la velocidad de desarrollo.

- En dev, Vite sirve los archivos **sin bundle**, usando ESM nativo del
  browser. El primer load es instantáneo (no espera a empaquetar 300
  archivos).
- HMR (Hot Module Replacement): cambiás un componente y se actualiza en
  100ms sin perder el estado de la página.
- En prod, Vite usa Rollup por debajo y genera bundles optimizados.

> **Por qué importa para aprender:** con Webpack, esperás 30 segundos entre
> que guardás un archivo y ves el cambio. Con Vite, 100ms. Eso es la
> diferencia entre experimentar 100 veces por hora y experimentar 5. Para
> aprender, iterar rápido es todo.

### 2.3 · Por qué TypeScript (y por qué a veces molesta)

Tipamos la respuesta de cada endpoint del backend. Cuando el shape cambia
(por ejemplo, el backend ahora devuelve `releaseYear` en vez de `year`),
TypeScript te marca el archivo en rojo **antes** de que el bug llegue al
browser.

**Costo:** vas a tener que escribir `interface Content { ... }` para cada
respuesta. Si una propiedad puede ser `null`, hay que decirlo (`number | null`).
Al principio se siente verboso.

**Beneficio:** refactorear es mucho más seguro. Renombrás un campo en una
interface y TS te lista todos los archivos que se rompen.

### 2.4 · Por qué Pinia (y no Vuex)

**Pinia** es el state manager oficial de Vue 3 desde 2022. Reemplaza a
Vuex.

- **Type-safe** out of the box (Vuex requería boilerplate para que TS
  funcione).
- **API más simple:** no hay mutations/actions/getters separados como en
  Vuex; en Pinia hay state + getters + actions, sin más.
- **Devtools support** integrado.

> Si encontrás tutoriales viejos que usan Vuex, podés mentalmente mapear:
> Vuex `mutations` + Vuex `actions` → Pinia `actions`. El resto es similar.

### 2.5 · Por qué axios (y no fetch)

`fetch` es nativo del browser. Funciona. Pero para una app real necesitás:

- Inyectar el header `Authorization` automáticamente en cada request.
- Manejar respuestas 401 globalmente (limpiar token y mandar al login).
- Parsear JSON sin un `.then(r => r.json())` extra por llamada.
- Catchear errores HTTP (4xx/5xx) — `fetch` no rechaza la promise en 4xx,
  hay que checkear `response.ok` a mano.

**Axios** trae todo eso. La inversión en aprenderlo paga rápido.

### 2.6 · Por qué Tailwind (y no CSS plano)

Tailwind te da clases utilitarias (`flex`, `gap-4`, `bg-white`) en vez de
escribir CSS custom. Para un proyecto de aprendizaje tiene ventajas:

- **Velocidad de iteración** — cambiás clases en el template, no editás
  CSS aparte.
- **Cero naming** — no tenés que pensar nombres como `card-header-title`.
- **Design system integrado** — los tokens (colores, spacing, font sizes)
  viven en `tailwind.config.js` y son consistentes en todo el proyecto.

**Contras:** las clases en el HTML se ven cargadas. Algunos developers
odian eso. Convivís con ello — vale la pena.

### 2.7 · Monorepo vs carpetas hermanas: la decisión que define el repo

Tenés dos formas de organizar back + front:

**Opción A — Monorepo:** el frontend vive _adentro_ del repo del backend:

```
Proyect/
├── app/                  ← backend
├── frontend/             ← Vue
├── package.json          ← backend
└── frontend/package.json
```

Pros: un solo `git clone` para todo. El frontend puede importar tipos
generados por el backend directamente.

Contras: dos `package.json` separados, dos `node_modules`. Si en el futuro
querés CI/CD separado o publicar el backend solo, hay que distinguir.

**Opción B — Carpetas hermanas:** front y back son repos independientes,
uno al lado del otro:

```
Nueva carpeta/
├── Proyect/              ← backend (su propio .git)
└── frontend/             ← Vue (su propio .git)
```

Pros: separación total. Cada uno tiene su CI, su deploy, su historia.
Más limpio si pensás liberar el backend como servicio público.

Contras: para compartir tipos hay que publicar un paquete npm o copiar a
mano (no es tan grave — cada pocos endpoints copiamos las interfaces).

#### ¿Cuál elegimos?

**Opción B (carpetas hermanas).** Estamos aprendiendo y querer que el
frontend sea un proyecto separado mentalmente — con su propio README, su
propia historia de commits, sus propias decisiones. Migrar de B a A es
trivial (`mv frontend/ ../Proyect/`) si después cambiamos de idea.

---

## 3 · Implementación paso a paso

A partir de acá, los pasos son replicables sobre cualquier setup
Windows/Mac/Linux con Node 20+ y npm.

### Paso 1 — Verificar versiones de Node y npm

```powershell
node -v   # esperás v20.x o superior
npm -v    # esperás 10.x o superior
```

> Si tenés Node 16 o 18, instalá la última LTS desde nodejs.org antes de
> seguir. Vite 5+ requiere Node 18+ y muchas libs modernas ya piden 20.

### Paso 2 — Decidir dónde va el proyecto

Vamos a crear `frontend/` al lado de `Proyect/`. Movete al directorio
**padre** del backend (no adentro):

```powershell
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta'
```

### Paso 3 — Scaffold con `npm create vite`

```powershell
npx --yes create-vite@latest frontend --template vue-ts
```

**Qué hace cada parte:**

- **`npx --yes`** corre `create-vite` sin instalarlo globalmente. El `--yes`
  evita el prompt "¿Querés instalar este paquete?".
- **`create-vite@latest`** baja la última versión del generador oficial.
- **`frontend`** es el nombre de la carpeta (y del `name` en `package.json`).
- **`--template vue-ts`** elige el template Vue 3 con TypeScript. Otros
  templates: `vanilla-ts`, `react-ts`, `svelte-ts`, etc.

**Qué genera adentro de `frontend/`:**

```
frontend/
├── public/
│   └── vite.svg
├── src/
│   ├── assets/
│   │   └── vue.svg
│   ├── components/
│   │   └── HelloWorld.vue        ← demo, lo vamos a borrar
│   ├── App.vue
│   ├── main.ts
│   ├── style.css                 ← lo vamos a reemplazar
│   └── vite-env.d.ts             ← types de Vite
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── vite.config.ts
```

### Paso 4 — Entrar al proyecto y bajar deps base

```powershell
Set-Location 'C:\Users\Valentina\Desktop\Nueva carpeta\frontend'
npm install
```

Esto baja Vue, Vite y los tipos de TS — las deps que el template trae por
default.

### Paso 5 — Agregar deps runtime (van a prod)

```powershell
npm install vue-router pinia axios '@fontsource/inter'
```

Una por una:

| Dep | Qué hace |
| --- | -------- |
| `vue-router` | Routing client-side. Cambiás URL sin recargar la página |
| `pinia` | State manager. El user logueado, datos compartidos entre páginas |
| `axios` | Cliente HTTP. Mejor experiencia que fetch para apps con auth |
| `@fontsource/inter` | Bundlea la fuente Inter como módulo. Ver doc 02 |

> **El truco de las comillas en PowerShell:** `'@fontsource/inter'` va entre
> comillas porque el `@` al principio de un token en PowerShell puede ser
> interpretado como el operador splat. Las comillas le dicen "esto es un
> string literal".

### Paso 6 — Agregar deps de desarrollo (solo build)

```powershell
npm install -D 'tailwindcss@^3.4' postcss autoprefixer '@types/node'
```

| Dep | Qué hace | Por qué `-D` |
| --- | -------- | ------------ |
| `tailwindcss@^3.4` | Framework CSS | Solo se usa en build (genera el CSS final) |
| `postcss` | Procesador de CSS que Tailwind necesita | Build-only |
| `autoprefixer` | Agrega prefijos `-webkit-`, `-moz-` automáticamente | Build-only |
| `@types/node` | Tipos de Node.js (para `import.meta`, etc.) | Build-only |

> **¿Por qué fijo Tailwind en `^3.4`?** Tailwind v4 (la última) cambió
> drásticamente cómo se instala — usa un plugin de Vite directo y no
> necesita `postcss` ni `tailwindcss init`. Para aprender es más simple
> quedarse en v3.4 (estable, mucha doc online). Cuando v4 madure y haya
> tutoriales abundantes, migrás.

### Paso 7 — Inicializar Tailwind y git

```powershell
npx tailwindcss init -p
git init
```

**`npx tailwindcss init -p`** crea dos archivos:

- `tailwind.config.js` — donde vamos a definir los tokens del design system
  en el doc 02.
- `postcss.config.js` — registra Tailwind como plugin de PostCSS.

**`git init`** crea el repo nuevo (independiente del backend, por la
Opción B que elegimos).

### Paso 8 — Smoke test: levantar el dev server

```powershell
npm run dev
```

Esperás algo como:

```
VITE v8.0.13  ready in 716 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

Abrí `http://localhost:5173` en el browser. Tenés que ver la página default
de Vite con el logo de Vue y "Hello World".

### Paso 9 — Lockear el puerto en `vite.config.ts`

Si tenés otro proyecto Vue/Vite corriendo, Vite va a saltar a `5174`, `5175`,
etc. automáticamente. Esto rompe el CORS del backend (que tiene una
allowlist explícita). Solución: **fijar el puerto**.

**Archivo a modificar:** `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
})
```

**Lo importante:**

- **`server.port: 5174`** — Vite intenta usar este puerto siempre.
- **`server.strictPort: true`** — si está ocupado, **falla en vez de saltar
  a otro**. Esto es bueno: te enterás del conflicto en vez de tener un
  bug silencioso de CORS.
- **`resolve.alias['@']`** — permite escribir `import x from '@/api/client'`
  en vez de `import x from '../../api/client'`. La línea con `fileURLToPath`
  + `new URL('./src', import.meta.url)` es la forma ESM-compatible de
  resolver a una ruta absoluta sin depender de `__dirname` (que no existe
  en módulos ESM).

> **¿Cuál puerto elegir?** El default de Vite es 5173. Si sabés que otro
> proyecto vive ahí, usá 5174 o 5180. Lo importante es que sea estable
> entre runs.

### Paso 10 — Agregar el alias `@` a `tsconfig.app.json`

Si solo lo agregás en Vite, el bundler resuelve `@/`, pero el IDE (VSCode)
no entiende los imports y te marca todo en rojo. Hay que decirle a TS también.

**Archivo a modificar:** `tsconfig.app.json`

```jsonc
{
  "extends": "@vue/tsconfig/tsconfig.dom.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

**Las dos líneas que importan:**

- **`"baseUrl": "."`** — el punto de referencia para las paths.
- **`"paths": { "@/*": ["src/*"] }`** — cualquier `@/X` se resuelve a `src/X`.

Reiniciá el TS server del IDE (en VSCode: `Ctrl+Shift+P` → "TypeScript:
Restart TS Server") para que tome el cambio.

---

## 4 · Verificación

Después del paso 10:

1. **`npm run dev`** debería arrancar en `http://localhost:5174` (puerto
   fijo).
2. **Abrí el browser** — seguís viendo la página default de Vite.
3. **En un editor**, probá escribir `import x from '@/main'` en `App.vue`
   — el IDE no debería marcarlo en rojo (aunque la línea no haga sentido
   semántico, sintácticamente debe resolver).

Si los tres puntos pasan, el scaffold está completo y listo para ponerle
el design system arriba (doc 02).

---

## 5 · Recap

Lo que hicimos:

- Decidimos el stack: **Vue 3 + Vite + TS + Pinia + axios + Tailwind**.
- Optamos por **carpetas hermanas** (front y back en repos separados) por
  claridad mental — fácil migrar a monorepo después si hace falta.
- Scaffolded el proyecto con `npm create vite`, lo metimos en
  `Nueva carpeta/frontend/`.
- Instalamos deps separando **runtime** (van a prod) de **dev** (solo build).
- Lockeamos el puerto a `5174` con `strictPort: true` para evitar líos con
  otros proyectos paralelos.
- Configuramos el alias `@` en Vite y en TS para que los imports queden
  limpios.

**Próximo doc:** [02 — Design system con Tailwind](02-design-system-tailwind.md).
Vamos a definir los tokens del estilo "editorial moderno" y dejar la base
visual lista.
