'use strict';
// Contador de descargas: (1) ninguna pagina del sitio enlaza directo al archivo de GitHub (todas pasan por /descargar),
// (2) la tabla de /descargar solo apunta a releases propios, (3) la logica (bots, internos, resumen).
// Las visitas recurrentes tienen su prueba aparte: visita.test.js.
// Corre en CI SIEMPRE: un cambio de index.html que vuelva a enlazar directo a GitHub sale rojo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const L = () => import(path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const T = () => import(path.join(RAIZ, 'netlify', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

function htmls(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) htmls(p, out); else if (d.name.endsWith('.html')) out.push(p);
  }
  return out;
}

test('descargas: ninguna pagina enlaza directo al archivo de GitHub; el boton pasa por /descargar', () => {
  const todas = htmls(RAIZ);
  assert.ok(todas.length > 20, 'calibracion: se recorren las paginas del sitio');
  const directas = todas.filter(p => /github\.com\/[^"'\s]*\/releases\/download\//.test(fs.readFileSync(p, 'utf8')));
  assert.deepEqual(directas.map(p => path.relative(RAIZ, p)), [], 'paginas con enlace directo a un archivo de GitHub');
  assert.match(fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8'), /href="\/descargar"/, 'el boton de la portada va a /descargar');
  assert.match(fs.readFileSync(path.join(RAIZ, 'robots.txt'), 'utf8'), /^Disallow: \/descargar\s*$/m, 'los buscadores no siguen /descargar');
});

test('descargas: la tabla solo apunta a archivos de los releases propios', async () => {
  const tabla = (await T()).default;
  assert.ok(tabla.archivos[tabla.predeterminado], 'hay archivo predeterminado');
  for (const [k, d] of Object.entries(tabla.archivos)) {
    assert.match(d.url, /^https:\/\/github\.com\/jliu513612\/taxcerteza-releases\/releases\/download\/v[\d.]+\/[\w.-]+\.zip$/, k);
    assert.ok(d.url.includes('/v' + d.version + '/'), `${k}: la version de la tabla es la del archivo`);
  }
  const { destino } = await L();
  assert.equal(destino(tabla, 'https://malo.example/x.zip').url, tabla.archivos[tabla.predeterminado].url, 'la URL nunca sale de la peticion');
  assert.equal(destino(tabla, '__proto__').archivo, tabla.predeterminado);
});

test('descargas: evento, bots y claves', async () => {
  const D = await L();
  const { esBot, claveValida, evento } = D;
  assert.ok(!('huella' in D) && !('UNICOS_ACTIVOS' in D), 'la huella de IP + user-agent ya no existe: la sustituye el codigo aleatorio de visita.js');
  const base = { ts: '2026-10-20T10:00:00Z', contexto: 'production', version: '1.0.47', archivo: 'windows', pais: 'MX', metodo: 'GET', ua: 'Mozilla/5.0', ip: '1.2.3.4', sal: 's' };
  const ev = evento(base);
  assert.deepEqual(Object.keys(ev).sort(), ['archivo', 'bot', 'contexto', 'interno', 'metodo', 'origen', 'pais', 'ts', 'version'], 'nada derivado de la IP');
  assert.equal(ev.origen, 'sin_origen', 'sin Referer la descarga no se atribuye a ninguna pagina');
  assert.ok(!JSON.stringify(ev).includes('1.2.3.4') && !JSON.stringify(ev).includes('Mozilla'), 'ni la IP ni el user-agent se guardan');
  for (const ua of ['Googlebot/2.1', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'curl/8.4', 'python-requests/2.31', '', 'Mozilla/5.0 HeadlessChrome/120']) assert.equal(esBot(ua, 'GET'), true, ua);
  assert.equal(esBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'GET'), false);
  assert.equal(esBot('Mozilla/5.0 (Windows NT 10.0) Chrome/130', 'HEAD'), true, 'un HEAD no baja el archivo');
  assert.equal(claveValida('abc', 'abc'), true);
  assert.equal(claveValida('abd', 'abc'), false);
  assert.equal(claveValida('abc', ''), false, 'sin clave configurada no se entra');
  assert.equal(claveValida(null, 'abc'), false);
});

test('descargas: el resumen separa bots e internos', async () => {
  const { evento, resumir, semanaAnterior } = await L();
  const e = (dia, ip, ua, extra = {}) => evento(Object.assign({ ts: `2026-10-${dia}T12:00:00Z`, contexto: 'production', version: '1.0.47', archivo: 'windows', pais: 'MX', metodo: 'GET', ua, ip }, extra));
  const PC = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
  const eventos = [
    e('13', '1.1.1.1', PC), e('13', '1.1.1.1', PC),               // la misma persona dos veces
    e('14', '2.2.2.2', PC),
    e('15', '3.3.3.3', 'Googlebot/2.1'),                            // bot
    e('15', '9.9.9.9', PC, { interno: true }),                      // nosotros, con la cookie
    e('16', '9.9.9.9', PC),                                         // nosotros otra vez, SIN cookie: cuenta como real
    e('17', '4.4.4.4', PC, { contexto: 'deploy-preview' }),         // vista previa: otro contexto
    e('20', '5.5.5.5', PC),                                         // fuera del periodo
  ];
  const r = resumir(eventos, { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.equal(r.descargas_total, 6);
  assert.equal(r.descargas_bots, 1);
  // lo interno es SOLO lo que trae la cookie; y no hay ningun campo de unicos
  assert.equal(r.descargas_internas, 1);
  assert.equal(r.descargas_reales, 4);
  assert.ok(!('unicos_total' in r) && !('unicos_reales' in r) && !('sin_huella' in r), 'no hay unicos en el resumen');
  assert.deepEqual(r.por_version, { '1.0.47': 4 });
  assert.deepEqual(semanaAnterior('2026-10-19'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(semanaAnterior('2026-10-25'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(semanaAnterior('2026-10-26'), { desde: '2026-10-19', hasta: '2026-10-25' });
});

test('descargas: se entrega una URL firmada de GitHub que caduca, y nunca se bloquea la descarga', async () => {
  const { destino, enlaceTemporal } = await L();
  const { default: tabla } = await T();
  const d = destino(tabla, 'windows');
  const pedidos = [];
  const red = (status, location) => async (url, op) => { pedidos.push({ url, op }); return new Response(null, { status, headers: location ? { location } : {} }); };
  const firmada = 'https://release-assets.githubusercontent.com/github-production-release-asset/1/x?se=2026-10-22T14%3A36%3A38Z&sig=abc';
  // enlace publico: se resuelve la redireccion de GitHub y se entrega la firmada
  let r = await enlaceTemporal(d, { traer: red(302, firmada) });
  assert.deepEqual([r.url, r.temporal], [firmada, true]);
  assert.equal(pedidos[0].url, d.url);
  assert.equal(pedidos[0].op.method, 'HEAD');
  assert.equal(pedidos[0].op.redirect, 'manual', 'no se baja el archivo: solo se pide la redireccion');
  // un host que no es de GitHub, una respuesta sin redireccion o un fallo de red: el enlace de siempre
  for (const traer of [red(302, 'https://evil.example/x.zip'), red(302, 'http://release-assets.githubusercontent.com/x'), red(200), red(404),
                       async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }]) {
    r = await enlaceTemporal(d, { traer });
    assert.deepEqual([r.url, r.temporal], [d.url, false], r.motivo);
  }
  // repo privado: con el token de solo lectura se pide a la API, y el token no sale en el enlace
  pedidos.length = 0;
  r = await enlaceTemporal(Object.assign({}, d, { privado: { repo: 'jliu513612/taxcerteza-dist', asset: 123 } }), { traer: red(302, firmada), token: 'tok-secreto' });
  assert.deepEqual([r.url, r.temporal, r.motivo], [firmada, true, 'repo privado']);
  assert.equal(pedidos[0].url, 'https://api.github.com/repos/jliu513612/taxcerteza-dist/releases/assets/123');
  assert.equal(pedidos[0].op.headers.Authorization, 'Bearer tok-secreto');
  assert.equal(pedidos[0].op.headers.Accept, 'application/octet-stream');
  assert.ok(!r.url.includes('tok-secreto'));
  // repo privado SIN token: no se intenta la API; se usa el enlace de la tabla
  pedidos.length = 0;
  r = await enlaceTemporal(Object.assign({}, d, { privado: { repo: 'x/y', asset: 1 } }), { traer: red(302, firmada) });
  assert.equal(pedidos[0].url, d.url);
});
