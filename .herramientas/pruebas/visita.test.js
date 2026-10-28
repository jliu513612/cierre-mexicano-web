'use strict';
// Visitas recurrentes: herramientas/visita.js (navegador) y /descargar/visita (netlify/lib/descargas.mjs, visitaDe).
// (1) el navegador: codigo aleatorio, como mucho una visita al dia, nada con «No rastrear» o Global Privacy Control, y
//     nada si el almacenamiento no guarda; se ejercita el SCRIPT ENTERO en una ventana simulada (vm), no solo sus piezas;
// (2) el servidor: por la RUTA entera con una peticion de verdad (Request) que trae la IP en las cabeceras — lo guardado no
//     la lleva, ni el user-agent, ni el pais; DNT/GPC no guardan nada; lo mal formado se rechaza;
// (3) el resumen por mes: nuevos, recurrentes y visitas por recurrente, sin bots ni los nuestros;
// (4) cada pagina que genera construir.py carga visita.js. Limite declarado: la portada, el blog y la ayuda tienen su
//     propio canal y todavia no lo cargan; hasta entonces lo contado son las visitas a esas paginas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const RAIZ = path.join(__dirname, '..', '..');
const ARCHIVO = path.join(RAIZ, 'herramientas', 'visita.js');
const V = require(ARCHIVO);
const L = () => import(path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const IP = '203.0.113.77', UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 prueba-visita';
const ID = '0123456789abcdef0123456789abcdef';

/* El script entero en una ventana simulada. `almacen` es el localStorage (un Map); devuelve lo que se envio. */
function cargar({ navigator = {}, doNotTrack, almacen = new Map(), setItem, getItemFalla = false, hoy = '2026-10-28T15:00:00Z' } = {}) {
  const enviados = [];
  const ventana = {
    navigator, doNotTrack, crypto: webcrypto,
    localStorage: {
      getItem: k => { if (getItemFalla) throw new Error('SecurityError'); return almacen.has(k) ? almacen.get(k) : null; },
      setItem: setItem || ((k, v) => { almacen.set(k, String(v)); }),
    },
    fetch: (url, op) => { enviados.push({ url, op }); return Promise.resolve({ ok: true }); },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [hoy])); } static now() { return Date.parse(hoy); } },
  };
  vm.runInNewContext(fs.readFileSync(ARCHIVO, 'utf8'), ventana, { filename: ARCHIVO });
  return { enviados, almacen, api: ventana.TCVisita };
}

test('visita (navegador): el codigo es aleatorio y no lleva nada de la persona', () => {
  const a = V.idAleatorio(webcrypto), b = V.idAleatorio(webcrypto);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b, 'dos codigos seguidos son distintos');
  // decidir: primera vez, mismo dia, dia siguiente y lo guardado roto
  const primera = V.decidir(null, '2026-10-28', () => ID);
  assert.deepEqual(primera.guardar, { id: ID, desde: '2026-10', dia: '2026-10-28' });
  assert.deepEqual(Object.keys(primera.enviar).sort(), ['desde', 'visitante'], 'solo se envian el codigo y el mes de la primera visita');
  assert.deepEqual(V.decidir(primera.guardar, '2026-10-28', () => 'x'), { guardar: null, enviar: null }, 'el mismo dia no se vuelve a contar');
  const otroDia = V.decidir(primera.guardar, '2026-11-03', () => 'nuevo');
  assert.deepEqual(otroDia.enviar, { visitante: ID, desde: '2026-10' }, 'otro dia: el mismo codigo y el mismo mes de primera visita');
  for (const roto of [{ id: 'corto', desde: '2026-10' }, { id: ID, desde: '2026-13' }, 'texto', 7, []]) {
    assert.equal(V.decidir(roto, '2026-10-28', () => 'f'.repeat(32)).enviar.visitante, 'f'.repeat(32), `lo guardado roto (${JSON.stringify(roto)}) se trata como nada`);
  }
});

test('visita (navegador): el script entero manda como mucho una al dia, y nada con DNT, GPC o sin almacenamiento', () => {
  const almacen = new Map();
  let r = cargar({ almacen });
  assert.equal(r.enviados.length, 1, 'calibracion: la primera visita se envia');
  const env = r.enviados[0];
  assert.equal(env.url, '/descargar/visita');
  assert.equal(env.op.method, 'POST');
  assert.equal(env.op.credentials, 'same-origin', 'la cookie de interno (Path=/descargar) viaja: nuestras visitas no cuentan');
  const cuerpo = JSON.parse(env.op.body);
  assert.deepEqual(Object.keys(cuerpo).sort(), ['desde', 'visitante']);
  assert.match(cuerpo.visitante, /^[0-9a-f]{32}$/);
  assert.equal(cuerpo.desde, '2026-10');
  const guardado = JSON.parse(almacen.get('tc_visitante'));
  assert.deepEqual(guardado, { id: cuerpo.visitante, desde: '2026-10', dia: '2026-10-28' });
  r = cargar({ almacen, hoy: '2026-10-28T23:59:00Z' });
  assert.equal(r.enviados.length, 0, 'otra pagina el mismo dia: nada');
  r = cargar({ almacen, hoy: '2026-11-02T08:00:00Z' });
  assert.deepEqual(JSON.parse(r.enviados[0].op.body), { visitante: cuerpo.visitante, desde: '2026-10' }, 'otro mes: el mismo codigo, recurrente');
  for (const [nombre, op] of [['No rastrear (navigator)', { navigator: { doNotTrack: '1' } }], ['No rastrear (window)', { doNotTrack: '1' }],
                              ['Global Privacy Control', { navigator: { globalPrivacyControl: true } }]]) {
    const m = new Map();
    r = cargar(Object.assign({ almacen: m }, op));
    assert.equal(r.enviados.length, 0, `${nombre}: no se envia nada`);
    assert.equal(m.size, 0, `${nombre}: no se crea el codigo`);
  }
  r = cargar({ getItemFalla: true });
  assert.equal(r.enviados.length, 0, 'almacenamiento bloqueado: nada');
  r = cargar({ setItem: () => {} });
  assert.equal(r.enviados.length, 0, 'el almacenamiento no guarda (cada pagina seria un «nuevo»): nada');
  r = cargar({ setItem: () => { throw new Error('QuotaExceededError'); } });
  assert.equal(r.enviados.length, 0, 'el almacenamiento lleno: nada, y sin romper la pagina');
});

test('visita (servidor): por la ruta entera, la IP, el user-agent y el pais NO se guardan', async () => {
  const { visitaDe, RUTA_VISITA } = await L();
  const ts = '2026-10-28T12:00:00.000Z';
  const pide = (cuerpo, cab = {}, metodo = 'POST') => visitaDe(new Request('https://taxcerteza.mx' + RUTA_VISITA, {
    method: metodo, body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
    headers: Object.assign({ 'content-type': 'application/json', 'user-agent': UA, 'x-nf-client-connection-ip': IP, 'x-forwarded-for': IP,
                             'x-nf-geo': 'eyJjb3VudHJ5Ijp7ImNvZGUiOiJNWCJ9fQ==' }, cab) }), { ts, contexto: 'production' });
  const v = await pide({ visitante: ID, desde: '2026-09' });
  assert.equal(v.estado, 204);
  assert.deepEqual(v.evento, { tipo: 'visita', ts, contexto: 'production', visitante: ID, desde: '2026-09', bot: false, interno: false });
  const t = JSON.stringify(v.evento);
  assert.ok(!t.includes(IP) && !t.includes('prueba-visita') && !t.includes('MX'), 'ni la IP, ni el user-agent, ni el pais');
  assert.equal(visitaDe.length, 2, 'visitaDe recibe la peticion y {ts, contexto}: el contexto de Netlify (IP, pais) no le llega');
  // lo que llega de mas en el cuerpo no se guarda
  const conMas = await pide({ visitante: ID, desde: '2026-09', pagina: '/herramientas/validar-rfc/', rfc: 'EKU9003173C9' });
  assert.ok(!JSON.stringify(conMas.evento).includes('validar-rfc') && !JSON.stringify(conMas.evento).includes('EKU9003173C9'), 'solo visitante y desde');
  // la cookie de interno y los bots
  assert.equal((await pide({ visitante: ID, desde: '2026-10' }, { cookie: 'x=1; tc_interno=1' })).evento.interno, true);
  assert.equal((await pide({ visitante: ID, desde: '2026-10' }, { 'user-agent': 'Googlebot/2.1' })).evento.bot, true);
  // DNT / GPC: 204 y nada que guardar
  for (const cab of [{ dnt: '1' }, { 'sec-gpc': '1' }]) assert.deepEqual(await pide({ visitante: ID, desde: '2026-10' }, cab), { estado: 204, evento: null }, JSON.stringify(cab));
  // un reloj adelantado no deja a nadie «nuevo» en un mes futuro
  assert.equal((await pide({ visitante: ID, desde: '2027-01' })).evento.desde, '2026-10');
  // lo mal formado
  for (const malo of [{ visitante: ID.toUpperCase(), desde: '2026-10' }, { visitante: ID.slice(1), desde: '2026-10' }, { visitante: ID, desde: '2026-1' },
                      { visitante: ID }, 'no es json', '"' + 'x'.repeat(300) + '"', JSON.stringify({ visitante: ID, desde: '2026-10', relleno: 'x'.repeat(300) })]) {
    assert.deepEqual(await pide(malo), { estado: 400, evento: null }, `rechaza ${String(JSON.stringify(malo)).slice(0, 60)}`);
  }
  assert.deepEqual(await pide(null, {}, 'GET'), { estado: 404, evento: null }, 'solo POST');
});

test('visita (resumen): por mes, nuevos, recurrentes y visitas por recurrente, sin bots ni los nuestros', async () => {
  const { eventoVisita, resumir } = await L();
  const PC = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
  const v = (dia, visitante, desde, extra = {}) => eventoVisita(Object.assign({ ts: `${dia}T12:00:00Z`, contexto: 'production', cuerpo: { visitante, desde }, metodo: 'POST', ua: PC }, extra));
  const A = 'a'.repeat(32), B = 'b'.repeat(32), C = 'c'.repeat(32), N = 'd'.repeat(32);
  const eventos = [
    v('2026-10-13', A, '2026-09'), v('2026-10-14', A, '2026-09'), v('2026-10-15', A, '2026-09'),   // vuelve, 3 visitas
    v('2026-10-13', B, '2026-10'), v('2026-10-20', B, '2026-10'),                                    // nueva en octubre
    v('2026-10-14', C, '2026-10', { ua: 'Googlebot/2.1' }),                                          // bot
    v('2026-10-14', N, '2026-08', { interno: true }),                                                // nosotros
    v('2026-11-02', B, '2026-10'),                                                                   // en noviembre, B vuelve
    v('2026-10-16', A, '2026-09', { contexto: 'deploy-preview' }),                                   // vista previa: otro contexto
  ];
  let r = resumir(eventos, { desde: '2026-10-01', hasta: '2026-11-30' });
  assert.deepEqual(r.visitas, {
    total: 8, bots: 1, internas: 1, reales: 6,
    por_mes: {
      '2026-10': { cubre: { desde: '2026-10-01', hasta: '2026-10-31' }, nuevos: 1, recurrentes: 1, visitas_recurrentes: 3, visitas_por_recurrente: 3 },
      '2026-11': { cubre: { desde: '2026-11-01', hasta: '2026-11-30' }, nuevos: 0, recurrentes: 1, visitas_recurrentes: 1, visitas_por_recurrente: 1 },
    },
  });
  // la semana del informe del lunes: el mes va a medias y lo dice
  r = resumir(eventos, { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(r.visitas.por_mes, { '2026-10': { cubre: { desde: '2026-10-12', hasta: '2026-10-18' }, nuevos: 1, recurrentes: 1, visitas_recurrentes: 3, visitas_por_recurrente: 3 } });
  assert.equal(r.descargas_total, 0, 'las visitas no se cuentan como descargas');
  assert.equal(r.usos.total + r.clics.total, 0, 'ni como usos ni como clics');
  r = resumir([], { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(r.visitas, { total: 0, bots: 0, internas: 0, reales: 0, por_mes: {} });
});

test('visita: cada pagina que genera construir.py carga visita.js una vez', () => {
  const base = fs.readFileSync(path.join(RAIZ, '.herramientas', 'plantillas', 'base.html'), 'utf8');
  assert.equal(base.split('<script src="/herramientas/visita.js" defer></script>').length - 1, 1, 'la plantilla carga visita.js una vez');
  const paginas = [path.join(RAIZ, 'herramientas', 'index.html'), path.join(RAIZ, 'privacidad', 'index.html'), path.join(RAIZ, 'privacidad', 'en', 'index.html')];
  for (const d of fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'index.html'))) paginas.push(path.join(RAIZ, 'herramientas', d.name, 'index.html'));
  }
  assert.ok(paginas.length >= 13, `calibracion: se recorren las paginas generadas (${paginas.length})`);
  for (const p of paginas) {
    const n = fs.readFileSync(p, 'utf8').split('<script src="/herramientas/visita.js" defer></script>').length - 1;
    assert.equal(n, 1, `${path.relative(RAIZ, p)}: carga visita.js ${n} veces`);
  }
});
