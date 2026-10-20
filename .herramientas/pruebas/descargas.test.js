'use strict';
// Contador de descargas: (1) ninguna pagina del sitio enlaza directo al archivo de GitHub (todas pasan por /descargar),
// (2) la tabla de /descargar solo apunta a releases propios, (3) la logica (huella, bots, internos, resumen).
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

test('descargas: huella, bots y claves', async () => {
  const { huella, esBot, claveValida, evento } = await L();
  const h1 = huella('sal', '2026-10-20T10:00:00Z', '1.2.3.4', 'Mozilla/5.0');
  assert.match(h1, /^[0-9a-f]{20}$/);
  assert.equal(huella('sal', '2026-10-31T23:00:00Z', '1.2.3.4', 'Mozilla/5.0'), h1, 'mismo mes, misma huella');
  assert.notEqual(huella('sal', '2026-11-01T00:00:00Z', '1.2.3.4', 'Mozilla/5.0'), h1, 'otro mes, otra huella');
  assert.notEqual(huella('otra', '2026-10-20T10:00:00Z', '1.2.3.4', 'Mozilla/5.0'), h1, 'otra sal, otra huella');
  assert.equal(huella('', '2026-10-20T10:00:00Z', '1.2.3.4', 'x'), null, 'sin sal no hay huella');
  const ev = evento({ ts: '2026-10-20T10:00:00Z', contexto: 'production', version: '1.0.47', archivo: 'windows', pais: 'MX', metodo: 'GET', ua: 'Mozilla/5.0', ip: '1.2.3.4', sal: 's' });
  assert.ok(!JSON.stringify(ev).includes('1.2.3.4') && !JSON.stringify(ev).includes('Mozilla'), 'ni la IP ni el user-agent se guardan en claro');
  for (const ua of ['Googlebot/2.1', 'facebookexternalhit/1.1', 'WhatsApp/2.23', 'curl/8.4', 'python-requests/2.31', '', 'Mozilla/5.0 HeadlessChrome/120']) assert.equal(esBot(ua, 'GET'), true, ua);
  assert.equal(esBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'GET'), false);
  assert.equal(esBot('Mozilla/5.0 (Windows NT 10.0) Chrome/130', 'HEAD'), true, 'un HEAD no baja el archivo');
  assert.equal(claveValida('abc', 'abc'), true);
  assert.equal(claveValida('abd', 'abc'), false);
  assert.equal(claveValida('abc', ''), false, 'sin clave configurada no se entra');
  assert.equal(claveValida(null, 'abc'), false);
});

test('descargas: el resumen separa bots e internos y cuenta unicos', async () => {
  const { evento, resumir, semanaAnterior } = await L();
  const e = (dia, ip, ua, extra = {}) => evento(Object.assign({ ts: `2026-10-${dia}T12:00:00Z`, contexto: 'production', version: '1.0.47', archivo: 'windows', pais: 'MX', metodo: 'GET', ua, ip, sal: 's' }, extra));
  const PC = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130';
  const eventos = [
    e('13', '1.1.1.1', PC), e('13', '1.1.1.1', PC),               // la misma persona dos veces
    e('14', '2.2.2.2', PC),
    e('15', '3.3.3.3', 'Googlebot/2.1'),                            // bot
    e('15', '9.9.9.9', PC, { interno: true }),                      // nosotros, con la cookie
    e('16', '9.9.9.9', PC),                                         // nosotros otra vez, SIN cookie: misma huella del mes
    e('17', '4.4.4.4', PC, { contexto: 'deploy-preview' }),         // vista previa: otro contexto
    e('20', '5.5.5.5', PC),                                         // fuera del periodo
  ];
  const r = resumir(eventos, { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.equal(r.descargas_total, 6);
  assert.equal(r.descargas_bots, 1);
  assert.equal(r.descargas_internas, 2);
  assert.equal(r.descargas_reales, 3);
  assert.equal(r.unicos_total, 4);
  assert.equal(r.unicos_reales, 2);
  assert.deepEqual(r.por_version, { '1.0.47': 3 });
  assert.deepEqual(semanaAnterior('2026-10-19'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(semanaAnterior('2026-10-25'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(semanaAnterior('2026-10-26'), { desde: '2026-10-19', hasta: '2026-10-25' });
});
