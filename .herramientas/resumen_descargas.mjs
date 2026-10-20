// Resumen de descargas para el informe del lunes. Lee /descargar/resumen con la clave de lectura (variable de entorno, nunca
// en el repo) y lo escribe en una linea legible y en JSON.
// Uso:  DESCARGAS_CLAVE_LECTURA=... node .herramientas/resumen_descargas.mjs [desde AAAA-MM-DD] [hasta AAAA-MM-DD] [sitio]
// Sin fechas: la semana anterior (lunes a domingo). Sitio por omision: https://taxcerteza.mx
const [desde, hasta, sitio = 'https://taxcerteza.mx'] = process.argv.slice(2);
const clave = process.env.DESCARGAS_CLAVE_LECTURA || '';
const u = new URL('/descargar/resumen', sitio);
if (clave) u.searchParams.set('clave', clave);
if (desde) u.searchParams.set('desde', desde);
if (hasta) u.searchParams.set('hasta', hasta);
const r = await fetch(u);
if (!r.ok) {
  console.error(`No se pudo leer el resumen (HTTP ${r.status}). ¿Esta puesta DESCARGAS_CLAVE_LECTURA?`);
  process.exit(1);
}
const x = await r.json();
console.log(`Descargas del ${x.periodo.desde} al ${x.periodo.hasta} (${x.contexto}): ` +
  `${x.unicos_reales} usuarios reales unicos (${x.descargas_reales} descargas); ` +
  `en total ${x.descargas_total} descargas, ${x.descargas_bots} de bots y ${x.descargas_internas} nuestras.` +
  (x.sal_configurada ? '' : ' OJO: sin DESCARGAS_SAL no se pueden contar unicos.'));
console.log(JSON.stringify(x, null, 1));
