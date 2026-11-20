'use strict';
// Descargas de la ACTUALIZACION EN UN CLIC (Q-4980000000 del repo del programa, 2026-11-11). Desde 1.0.50 el
// version.json firmado lleva url_zip = https://taxcerteza.mx/descargar/actualizacion/<version>, asi que esas descargas
// se cuentan aparte de las del sitio. Lo que se asevera:
//   (1) la tabla de actualizaciones es cerrada, por version, y solo apunta a los releases propios de esa version;
//   (2) la ruta solo acepta una version de la tabla: lo demas da null (404), sin redireccion abierta;
//   (3) el evento lleva canal 'actualizacion' y ni la IP ni huella, ni aunque llegue (si el pais, como las descargas);
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

// --- El MANEJADOR de la ruta (lo que corre en Netlify), entrando por la peticion y no por la API comoda. La funcion de
// netlify/functions/descargar.mjs solo lo cablea (elige el almacen y el token); esto ejercita todo lo demas.
const FIRMADA = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/x?sig=abc';
function montaje({ almacenRoto = false, githubFirma = true } = {}) {
  const guardados = [], pedidos = [], errores = [];
  const store = { setJSON: async (k, v) => { if (almacenRoto) throw new Error('almacen caido'); guardados.push({ k, v }); } };
  const traer = async (u, o) => {
    pedidos.push({ u, metodo: o && o.method });
    if (!githubFirma) throw Object.assign(new Error('sin red'), { name: 'SinRed' });
    return { status: 302, headers: { get: h => (h.toLowerCase() === 'location' ? FIRMADA : null) } };
  };
  return { guardados, pedidos, errores, store, traer, registrarError: (...a) => errores.push(a.join(' ')) };
}
// la peticion trae la IP por las cabeceras que pone Netlify y por x-forwarded-for: el evento no debe recoger NINGUNA
const IP_CABECERAS = { 'x-nf-client-connection-ip': '198.51.100.23', 'x-forwarded-for': '192.0.2.44, 10.0.0.1' };
function peticion(ruta, { ua = UA_PROGRAMA, cookie = '' } = {}) {
  return new Request('https://taxcerteza.mx' + ruta,
    { headers: Object.assign({ 'user-agent': ua }, IP_CABECERAS, cookie ? { cookie } : {}) });
}
// LISTA CERRADA de lo que se guarda (#14: se enumera lo permitido, no lo malo): cualquier clave nueva es roja
const CLAVES_EVENTO = ['bot', 'canal', 'contexto', 'interno', 'metodo', 'origen', 'pais', 'ts', 'version', 'archivo'].sort();
const CONTEXTO = { deploy: { context: 'production' }, geo: { country: { code: 'MX' } }, ip: '203.0.113.7' };

test('actualizacion (manejador): 302 al zip firmado de ESA version; la URL de la peticion no decide nada', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { responderActualizacion } = await imp('netlify/lib/descargas.mjs');
  const v = Object.keys(tabla.actualizaciones)[0];
  const m = montaje();
  const r = await responderActualizacion({ req: peticion(`/descargar/actualizacion/${v}?u=https://evil.example/x.zip&archivo=x`),
    context: CONTEXTO, tabla, store: m.store, traer: m.traer, registrarError: m.registrarError });
  assert.equal(r.estado, 302);
  assert.equal(r.cabeceras.Location, FIRMADA);
  assert.deepEqual(m.pedidos.map(p => p.u), [tabla.actualizaciones[v]], 'a GitHub se le pide el zip de la tabla, nada de la peticion');
  // sin URL firmada de GitHub: el enlace permanente de la tabla, y queda en el log
  const m2 = montaje({ githubFirma: false });
  const r2 = await responderActualizacion({ req: peticion(`/descargar/actualizacion/${v}?u=https://evil.example/x.zip`),
    context: CONTEXTO, tabla, store: m2.store, traer: m2.traer, registrarError: m2.registrarError });
  assert.deepEqual([r2.estado, r2.cabeceras.Location], [302, tabla.actualizaciones[v]]);
  assert.equal(m2.errores.length, 1);
});

test('actualizacion (manejador): guarda UN evento sin la IP; si el almacen falla, redirige igual', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { responderActualizacion } = await imp('netlify/lib/descargas.mjs');
  const v = Object.keys(tabla.actualizaciones)[0];
  const m = montaje();
  await responderActualizacion({ req: peticion(`/descargar/actualizacion/${v}`), context: CONTEXTO, tabla, store: m.store,
    traer: m.traer, registrarError: m.registrarError });
  assert.equal(m.guardados.length, 1);
  const e = m.guardados[0].v;
  assert.deepEqual(Object.keys(e).sort(), CLAVES_EVENTO, 'el evento guarda solo la lista cerrada');
  const todo = JSON.stringify(m.guardados);
  for (const prohibido of ['203.0.113', '198.51.100', '192.0.2.', UA_PROGRAMA])
    assert.ok(!todo.includes(prohibido), `se guardo ${prohibido} (IP o user-agent)`);
  assert.deepEqual([e.canal, e.version, e.pais, e.contexto, e.bot, e.interno], ['actualizacion', v, 'MX', 'production', false, false]);
  assert.match(m.guardados[0].k, /^ev\/\d{4}-\d{2}-\d{2}\/.+-a-[a-z0-9]+$/);
  const mi = montaje();
  await responderActualizacion({ req: peticion(`/descargar/actualizacion/${v}`, { cookie: 'x=1; tc_interno=1' }), context: CONTEXTO,
    tabla, store: mi.store, traer: mi.traer, registrarError: mi.registrarError });
  assert.equal(mi.guardados[0].v.interno, true, 'la cookie de interno se respeta');
  const mr = montaje({ almacenRoto: true });
  const r = await responderActualizacion({ req: peticion(`/descargar/actualizacion/${v}`), context: CONTEXTO, tabla, store: mr.store,
    traer: mr.traer, registrarError: mr.registrarError });
  assert.deepEqual([r.estado, r.cabeceras.Location], [302, FIRMADA]);
  assert.equal(mr.errores.length, 1);
});

test('actualizacion (manejador): una version fuera de la lista da 404 sin guardar ni pedir nada', async () => {
  const { default: tabla } = await imp('netlify/descargas.mjs');
  const { responderActualizacion } = await imp('netlify/lib/descargas.mjs');
  for (const ruta of ['/descargar/actualizacion/9.9.9', '/descargar/actualizacion/__proto__', '/descargar/actualizacion/x',
    '/descargar/actualizacion/', '/descargar/actualizacion/1.0.49.zip']) {
    const m = montaje();
    const r = await responderActualizacion({ req: peticion(ruta), context: CONTEXTO, tabla, store: m.store, traer: m.traer,
      registrarError: m.registrarError });
    assert.equal(r.estado, 404, ruta);
    assert.deepEqual([m.guardados.length, m.pedidos.length], [0, 0], ruta);
  }
});
