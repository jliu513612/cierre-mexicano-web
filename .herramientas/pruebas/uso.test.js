'use strict';
// Usos reales de las herramientas: (1) TODA herramienta publicada cuenta su uso (una nueva sin su evento sale roja),
// (2) el envio lleva solo {herramienta, n}, (3) el servidor guarda solo lo permitido, (4) un uso repetido en 2 s cuenta
// una vez, (5) el resumen cuenta usos reales por herramienta sin tocar las descargas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const imp = rel => import(path.join(RAIZ, rel).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const USO = require(path.join(RAIZ, 'herramientas', 'uso.js'));
const OP = require(path.join(RAIZ, 'herramientas', 'opinion.js'));

const enDisco = () => fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'pagina.js'))).map(d => d.name).sort();

test('usos: toda herramienta publicada cuenta su uso (lista, script y llamada)', async () => {
  const { HERRAMIENTAS } = await imp('netlify/lib/herramientas.mjs');
  const disco = enDisco();
  assert.ok(disco.length >= 8, 'calibracion: hay herramientas en disco');
  assert.deepEqual([...HERRAMIENTAS].sort(), disco, 'la lista del servidor es la de las carpetas en disco');
  const fuenteOp = fs.readFileSync(path.join(RAIZ, 'herramientas', 'opinion.js'), 'utf8');
  const listaOp = JSON.parse(/var HERRAMIENTAS = (\[[^\]]*\])/.exec(fuenteOp)[1].replace(/'/g, '"'));
  assert.deepEqual([...listaOp].sort(), disco, 'la lista de opinion.js es la de las carpetas en disco');
  for (const h of disco) {
    // trinquete sobre el FUENTE (el sujeto es el fuente); el comportamiento lo mira prueba_navegador.mjs
    const pag = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'pagina.js'), 'utf8');
    assert.ok(pag.includes(`window.TCUso.registrar('${h}'`), `${h}: su pagina.js no cuenta el uso`);
    const html = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'index.html'), 'utf8');
    assert.ok(html.includes('<script src="/herramientas/uso.js" defer></script>'), `${h}: la pagina no carga uso.js`);
  }
  assert.ok(OP.construir, 'opinion.js carga');
});

test('usos: el navegador envia solo {herramienta, n}', () => {
  assert.deepEqual(JSON.parse(USO.cuerpo('iva-del-mes', 120)), { herramienta: 'iva-del-mes', n: 120 });
  assert.deepEqual(JSON.parse(USO.cuerpo('validar-rfc')), { herramienta: 'validar-rfc' });
  assert.deepEqual(JSON.parse(USO.cuerpo('lista-69b', 50000)), { herramienta: 'lista-69b', n: 1000 }, 'tope de elementos');
  for (const n of [0, -3, NaN, 'EKU9003173C9', '120', null, { rfc: 'x' }]) {
    assert.deepEqual(JSON.parse(USO.cuerpo('valor-uma', n)), { herramienta: 'valor-uma' }, String(n));
  }
  assert.equal(USO.cuerpo.length, 3, 'cuerpo() no recibe nada mas que la herramienta, n y el nombre de la accion');
  assert.deepEqual(JSON.parse(USO.cuerpo('tipo-de-cambio', 31, 'descarga_rango')), { herramienta: 'tipo-de-cambio', n: 31, accion: 'descarga_rango' });
  // por el nombre de la accion no cabe nada de la persona: fechas, RFC, texto libre
  for (const a of ['2026-03-01', '2026-03-01_2026-03-31', 'EKU9003173C9', 'descarga rango', 'x'.repeat(31), { f: 1 }, 7])
    assert.deepEqual(JSON.parse(USO.cuerpo('tipo-de-cambio', 31, a)), { herramienta: 'tipo-de-cambio', n: 31 }, String(a));
  assert.equal(USO.RUTA, '/descargar/uso', 'va bajo /descargar: le llega la cookie de interno');
});

test('usos: un uso repetido en menos de 2 s cuenta una vez (dedupe en el navegador)', () => {
  const ultimos = {};
  assert.equal(USO.cuenta(ultimos, 'validar-rfc', 1000), true);
  assert.equal(USO.cuenta(ultimos, 'validar-rfc', 1500), false, 'doble clic');
  assert.equal(USO.cuenta(ultimos, 'validar-rfc', 2999), false);
  assert.equal(USO.cuenta(ultimos, 'valor-uma', 1600), true, 'otra herramienta cuenta aparte');
  assert.equal(USO.cuenta(ultimos, 'validar-rfc', 3000), true, 'pasados 2 s vuelve a contar');
});

test('usos: el servidor guarda solo lo permitido y rechaza lo que no es una herramienta', async () => {
  const { eventoUso } = await imp('netlify/lib/descargas.mjs');
  const base = { ts: '2026-10-20T12:00:00Z', contexto: 'production', pais: 'MX', metodo: 'POST', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' };
  const e = eventoUso(Object.assign({ cuerpo: { herramienta: 'verificar-factura', n: 12, rfc: 'EKU9003173C9', importe: '1600.00', xml: '<cfdi/>' } }, base));
  assert.deepEqual(Object.keys(e).sort(), ['bot', 'contexto', 'herramienta', 'interno', 'n', 'pais', 'tipo', 'ts']);
  assert.ok(!/EKU9003173C9|1600|cfdi/.test(JSON.stringify(e)), 'nada de lo que llega aparte de herramienta y n');
  assert.equal(e.tipo, 'uso');
  assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'otra' } }, base)), null);
  assert.equal(eventoUso(Object.assign({ cuerpo: null }, base)), null);
  assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'valor-uma', n: 99999 } }, base)).n, 1000);
  assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'valor-uma', n: '5' } }, base)).n, null);
  assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'valor-uma' }, ua: 'Googlebot/2.1' }, base)).bot, false, 'calibracion: el ua de base no es bot');
  // la accion: solo de la lista cerrada de esa herramienta; cualquier otra invalida el evento
  const a = eventoUso(Object.assign({ cuerpo: { herramienta: 'tipo-de-cambio', n: 31, accion: 'descarga_rango', desde: '2026-03-01' } }, base));
  assert.deepEqual(Object.keys(a).sort(), ['accion', 'bot', 'contexto', 'herramienta', 'interno', 'n', 'pais', 'tipo', 'ts']);
  assert.ok(!JSON.stringify(a).includes('2026-03-01'), 'ni las fechas del rango');
  for (const malo of ['otra', '2026-03-01', '', null])
    assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'tipo-de-cambio', accion: malo } }, base)), null, String(malo));
  assert.equal(eventoUso(Object.assign({ cuerpo: { herramienta: 'valor-uma', accion: 'descarga_rango' } }, base)), null, 'la accion es de UNA herramienta');
});

test('usos: el resumen cuenta aparte las acciones de la lista cerrada', async () => {
  const { eventoUso, resumir } = await imp('netlify/lib/descargas.mjs');
  const b = { ts: '2026-10-14T12:00:00Z', contexto: 'production', metodo: 'POST', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' };
  const ev = [eventoUso(Object.assign({ cuerpo: { herramienta: 'tipo-de-cambio', n: 31, accion: 'descarga_rango' } }, b)),
              eventoUso(Object.assign({ cuerpo: { herramienta: 'tipo-de-cambio' } }, b)),
              eventoUso(Object.assign({}, b, { cuerpo: { herramienta: 'tipo-de-cambio', accion: 'descarga_rango' }, ua: 'curl/8' }))];
  assert.equal(ev[2].bot, true, 'calibracion: el tercero es de un bot');
  const r = resumir(ev, { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(r.usos.reales_por_accion, { 'tipo-de-cambio:descarga_rango': 1 });
  assert.equal(r.usos.reales_por_herramienta['tipo-de-cambio'], 2, 'la descarga tambien es un uso de la herramienta');
});

test('usos: el resumen cuenta usos reales por herramienta y no toca las descargas', async () => {
  const { eventoUso, evento, resumir } = await imp('netlify/lib/descargas.mjs');
  const PC = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
  const u = (h, n, extra = {}) => eventoUso(Object.assign({ ts: '2026-10-14T12:00:00Z', contexto: 'production', cuerpo: { herramienta: h, n }, metodo: 'POST', ua: PC }, extra));
  const d = evento({ ts: '2026-10-14T12:00:00Z', contexto: 'production', version: '1.0.47', archivo: 'windows', metodo: 'GET', ua: PC });
  const r = resumir([d, u('iva-del-mes', 30), u('iva-del-mes', 5), u('validar-rfc'), u('valor-uma', null, { ua: 'Googlebot/2.1' }),
    u('lista-69b', 3, { interno: true }), u('validar-rfc', null, { contexto: 'deploy-preview' })], { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.equal(r.descargas_total, 1, 'los usos no cuentan como descargas');
  assert.equal(r.descargas_reales, 1);
  assert.equal(r.usos.total, 5);
  assert.equal(r.usos.bots, 1);
  assert.equal(r.usos.internos, 1);
  assert.equal(r.usos.reales, 3);
  assert.equal(r.usos.reales_por_herramienta['iva-del-mes'], 2);
  assert.equal(r.usos.reales_por_herramienta['validar-rfc'], 1);
  assert.equal(r.usos.reales_por_herramienta['lista-69b'], 0);
  assert.equal(r.usos.elementos_por_herramienta['iva-del-mes'], 35);
  assert.equal(Object.keys(r.usos.reales_por_herramienta).length, enDisco().length, 'una fila por herramienta, aunque sea 0');
});
