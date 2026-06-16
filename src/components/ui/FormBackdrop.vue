<script setup lang="ts">
/**
 * Fondo cinematográfico negro/dorado. Imagen base + Ken Burns + partículas
 * doradas flotando + overlay para legibilidad. El contenido del slot se
 * renderiza por encima.
 *
 * Posiciones/tiempos de partículas predefinidos (no random) para mantener un
 * look consistente entre renders y evitar saltos al recargar.
 *
 * Prop `image`: ruta a la imagen de fondo (default /forms-bg.png para los
 * forms). El catálogo principal usa /catalog-bg.png.
 */

withDefaults(
  defineProps<{
    image?: string
  }>(),
  { image: '/forms-bg.png' }
)

const particles = [
  { top: '14%', left: '8%', size: 3, delay: 0, dur: 12 },
  { top: '22%', left: '78%', size: 4, delay: 1.5, dur: 14 },
  { top: '38%', left: '32%', size: 2, delay: 3, dur: 10 },
  { top: '60%', left: '88%', size: 5, delay: 0.8, dur: 13 },
  { top: '72%', left: '15%', size: 3, delay: 2.2, dur: 11 },
  { top: '40%', left: '60%', size: 2, delay: 4, dur: 10 },
  { top: '82%', left: '55%', size: 4, delay: 1, dur: 15 },
  { top: '50%', left: '90%', size: 3, delay: 3.5, dur: 11 },
  { top: '28%', left: '50%', size: 2, delay: 2.8, dur: 12 },
  { top: '90%', left: '30%', size: 3, delay: 1.2, dur: 13 },
]
</script>

<template>
  <div class="relative min-h-[calc(100vh-3.5rem)] overflow-hidden text-white">
    <!-- Fondo cinematográfico fijo -->
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div class="absolute inset-0 bg-black" />
      <div
        class="ken-burns absolute inset-0 bg-cover bg-center"
        :style="{ backgroundImage: `url(${image})` }"
      />
      <!-- Overlay sutil para que cualquier card encima se lea bien -->
      <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/60" />
      <!-- Vignette en los bordes -->
      <div class="absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.65)_100%)]" />
      <!-- Partículas doradas flotando -->
      <span
        v-for="(p, i) in particles"
        :key="i"
        class="dust absolute rounded-full bg-amber-300/80"
        :style="{
          top: p.top,
          left: p.left,
          width: `${p.size}px`,
          height: `${p.size}px`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
        }"
      />
    </div>

    <!-- Contenido por encima del fondo -->
    <div class="relative z-10">
      <slot />
    </div>
  </div>
</template>

<style scoped>
@keyframes kenBurns {
  0% { transform: scale(1.05) translate(0, 0); }
  50% { transform: scale(1.14) translate(-1.8%, -1.2%); }
  100% { transform: scale(1.05) translate(0, 0); }
}
.ken-burns {
  animation: kenBurns 38s ease-in-out infinite;
  transform-origin: center;
}

@keyframes dustFloat {
  0% { transform: translateY(0); opacity: 0; }
  20% { opacity: 0.9; }
  80% { opacity: 0.6; }
  100% { transform: translateY(-70px); opacity: 0; }
}
.dust {
  animation-name: dustFloat;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  filter: blur(0.5px);
  box-shadow: 0 0 6px rgba(252, 211, 77, 0.65);
}

@media (prefers-reduced-motion: reduce) {
  .ken-burns,
  .dust {
    animation: none;
  }
  .dust {
    opacity: 0.4;
  }
}
</style>
