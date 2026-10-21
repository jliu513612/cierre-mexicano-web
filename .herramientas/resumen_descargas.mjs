// Resumen de descargas para el informe del lunes. Lee /descargar/resumen con la clave interna (variable de entorno, nunca
// en el repo) y lo escribe en una linea legible y en JSON.
// Uso:  DESCARGAS_CLAVE_INTERNA=... node .herramientas/resumen_descargas.mjs [desde AAAA-MM-DD] [hasta AAAA-MM-DD] [sitio]
// Sin fechas: la semana anterior (lunes a domingo). Sitio por omision: https://taxcerteza.mx
const [desde, hasta, sitio = 'https://taxcerteza.mx'] = process.argv.slice(2);
const clave = process.env.DESCARGAS_CLAVE_INTERNA || '';
const u = new URL('/descargar/resumen', sitio);
if (clave) u.searchParams.set('clave', clave);
if (desde) u.searchParams.set('desde', desde);
if (hasta) u.searchParams.set('hasta', hasta);
const r = await fetch(u);
if (!r.ok) {
  console.error(`No se pudo leer el resumen (HTTP ${r.status}). ¿Esta puesta DESCARGAS_CLAVE_INTERNA?`);
  process.exit(1);
}
const x = await r.json();
console.log(`Descargas del ${x.periodo.desde} al ${x.periodo.hasta} (${x.contexto}): ` +
  `${x.descargas_reales} descargas reales (sin bots ni las nuestras); ` +
  `en total ${x.descargas_total} descargas, ${x.descargas_bots} de bots y ${x.descargas_internas} nuestras.` +
  ('unicos_reales' in x ? ` Personas distintas: ${x.unicos_reales}.` : ''));
if (x.usos) {
  const lista = Object.entries(x.usos.reales_por_herramienta).sort((a, b) => b[1] - a[1])
    .map(([h, n]) => `${h} ${n}` + (x.usos.elementos_por_herramienta[h] ? ` (${x.usos.elementos_por_herramienta[h]} elementos)` : '')).join(', ');
  console.log(`Usos reales por herramienta (sin bots ni los nuestros): ${x.usos.reales} en total; ${lista}.`);
}
if (x.clics) {
  const destinos = Object.entries(x.clics.reales_por_destino).map(([d, n]) => `${d} ${n}`).join(', ');
  const origenes = Object.entries(x.clics.reales_por_origen)
    .map(([o, ds]) => [o, Object.values(ds).reduce((a, b) => a + b, 0), ds]).sort((a, b) => b[1] - a[1])
    .map(([o, n, ds]) => `${o} ${n} (` + Object.entries(ds).map(([d, k]) => `${d} ${k}`).join(', ') + ')').join('; ');
  console.log(`Clics del embudo (sin bots ni los nuestros): ${x.clics.reales} en total. Por destino: ${destinos}. ` +
    `Por pagina de origen: ${origenes || 'ninguno'}.`);
}
if (x.descargas_reales_por_origen) {
  console.log('Descargas reales por pagina de origen: ' +
    (Object.entries(x.descargas_reales_por_origen).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${n}`).join(', ') || 'ninguna') + '.');
}
console.log(JSON.stringify(x, null, 1));
