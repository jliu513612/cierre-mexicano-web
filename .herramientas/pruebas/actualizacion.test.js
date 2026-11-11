'use strict';
// Descargas de la ACTUALIZACION EN UN CLIC (Q-4980000000 del repo del programa, 2026-11-11). Desde 1.0.50 el
// version.json firmado lleva url_zip = https://taxcerteza.mx/descargar/actualizacion/<version>, asi que esas descargas
// se cuentan aparte de las del sitio. Lo que se asevera:
//   (1) la tabla de actualizaciones es cerrada, por version, y solo apunta a los releases propios de esa version;
//   (2) la ruta solo acepta una version de la tabla: lo demas da null (404), sin redireccion abierta;
//   (3) el evento lleva canal 'actualizacion' y NADA de la IP, ni aunque llegue;
//   (4) el resumen las cuenta aparte: no se mezclan con las descargas del sitio;
//   (5) el programa ("TaxCerteza/update") cuenta como persona y la verificacion de publicacion como bot.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const imp = rel => import(path.join(RAIZ, rel).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const UA_PROGRAMA = 'TaxCerteza/update';

test('actualizacion: la tabla es cerrada, por version, y solo apunta al zip propio de esa version', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const vs = Object.keys(tabla.actualizaciones || {});
  assert.ok(vs.length > 0, 'calibracion: la tabla de actualizaciones existe y no esta vacia');
  for (const v of vs) {
    assert.match(v, /^\d+\.\d+\.\d+$/, v);
    assert.equal(tabla.actualizaciones[v],
      `https://github.com/jliu513612/taxcerteza-releases/releases/download/v${v}/TaxCerteza_${v}.zip`, v);
  }
});

test('actualizacion: la ruta solo acepta una version de la tabla (sin redireccion abierta)', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { actualizacionDe } = await imp('netlify/lib/descargas.mjs');
  const v = Object.keys(tabla.actualizaciones)[0];
  const base = { tabla, ts: '2026-11-12T15:00:00Z', contexto: 'production', ua: UA_PROGRAMA, metodo: 'GET' };
  const r = actualizacionDe(Object.assign({ ruta: `/descargar/actualizacion/${v}` }, base));
  assert.ok(r, 'una version de la tabla se acepta');
  assert.equal(r.destino.url, tabla.actualizaciones[v]);
  assert.equal(r.destino.version, v);
  for (const malo of ['9.9.9', '', '__proto__', 'constructor', `${v}/../x`, `${v}.zip`, 'https://evil.example/x.zip',
    `${v}?x=1`, encodeURIComponent('https://evil.example')])
    assert.equal(actualizacionDe(Object.assign({ ruta: `/descargar/actualizacion/${malo}` }, base)), null, `aceptada: ${malo}`);
  assert.equal(actualizacionDe(Object.assign({ ruta: `/descargar/ir/${v}` }, base)), null, 'otra ruta no es actualizacion');
  assert.equal(actualizacionDe(Object.assign({ ruta: `/descargar/actualizacion/${v}` }, base, { tabla: { archivos: {} } })), null,
    'sin tabla de actualizaciones, nada se acepta');
});

test('actualizacion: el evento lleva canal y version, y nada de la IP ni del user-agent', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { actualizacionDe } = await imp('netlify/lib/descargas.mjs');
  const v = Object.keys(tabla.actualizaciones)[0];
  const r = actualizacionDe({ ruta: `/descargar/actualizacion/${v}`, tabla, ts: '2026-11-12T15:00:00Z', contexto: 'production',
    pais: 'MX', metodo: 'GET', ua: UA_PROGRAMA, ip: '203.0.113.7', interno: false });
  assert.deepEqual(r.evento, { ts: '2026-11-12T15:00:00Z', contexto: 'production', version: v, archivo: 'actualizacion',
    origen: 'sin_origen', pais: 'MX', metodo: 'GET', bot: false, interno: false, canal: 'actualizacion' });
  assert.ok(!JSON.stringify(r.evento).includes('203.0.113'), 'la IP no entra en el evento');
  assert.ok(!JSON.stringify(r.evento).includes('TaxCerteza'), 'el user-agent no se guarda');
});

test('actualizacion: el programa cuenta como persona; la verificacion de publicacion como bot', async () => {
  const { esBot } = await imp('netlify/lib/descargas.mjs');
  assert.equal(esBot(UA_PROGRAMA, 'GET'), false);
  assert.equal(esBot('verificar-publicacion', 'GET'), true);
});

test('actualizacion: el resumen las cuenta aparte, sin mezclarlas con las descargas del sitio', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { actualizacionDe, evento, resumir } = await imp('netlify/lib/descargas.mjs');
  const v = Object.keys(tabla.actualizaciones)[0];
  const act = (ts, ua, interno = false) => actualizacionDe({ ruta: `/descargar/actualizacion/${v}`, tabla, ts, contexto: 'production',
    metodo: 'GET', ua, interno }).evento;
  const eventos = [
    evento({ ts: '2026-11-10T10:00:00Z', contexto: 'production', version: v, archivo: 'windows', metodo: 'GET', ua: 'Mozilla/5.0' }),
    act('2026-11-10T11:00:00Z', UA_PROGRAMA),
    act('2026-11-11T11:00:00Z', UA_PROGRAMA),
    act('2026-11-11T12:00:00Z', 'verificar-publicacion'),
    act('2026-11-11T13:00:00Z', UA_PROGRAMA, true),
  ];
  const r = resumir(eventos, { desde: '2026-11-09', hasta: '2026-11-15' });
  assert.equal(r.descargas_total, 1, 'las actualizaciones no entran en las descargas del sitio');
  assert.equal(r.descargas_reales, 1);
  assert.deepEqual(r.actualizaciones, { total: 4, bots: 1, internas: 1, reales: 2, por_version: { [v]: 2 } });
});
