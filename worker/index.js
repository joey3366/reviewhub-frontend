/**
 * Worker de Cloudflare del frontend de Kairos.
 *
 * 1) fetch: sirve la SPA (dist/) tal cual, vía el binding ASSETS. El
 *    fallback a index.html para rutas de Vue Router lo sigue resolviendo
 *    `not_found_handling: "single-page-application"` en wrangler.jsonc.
 *
 * 2) scheduled (Cron Trigger, ver `triggers.crons`): keep-alive del backend.
 *    Render free duerme el servicio tras 15 min sin tráfico y despertarlo
 *    tarda ~1-3 min. Un ping cada 10 min lo mantiene despierto. Pegamos a
 *    /api/v1/genres porque es liviano y además toca la DB (mantiene viva la
 *    conexión con TiDB).
 *
 * Los logs del cron se ven en Cloudflare → Workers → kairos → Logs.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ping(env.KEEPALIVE_URL))
  },
}

async function ping(url) {
  const started = Date.now()
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'kairos-keepalive' },
      // Si Render está dormido, despertar puede tardar; esperamos hasta 90 s.
      signal: AbortSignal.timeout(90_000),
    })
    console.log(`keepalive ${res.status} en ${Date.now() - started} ms`)
  } catch (error) {
    console.log(`keepalive falló tras ${Date.now() - started} ms: ${error}`)
  }
}
