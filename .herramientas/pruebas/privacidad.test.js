'use strict';
// Aviso de privacidad (/privacidad/ y /privacidad/en/): lo que AFIRMA es lo que el codigo GUARDA. Cada lista de datos del
// aviso lleva data-campos con los campos que declara, y aqui se construye el evento REAL con las funciones de
// netlify/lib/descargas.mjs (y el envio de opinion con herramientas/opinion.js) y se compara: un campo que el codigo
// guarda y el aviso no dice, o uno que el aviso dice y el codigo ya no guarda, = rojo. Encender los unicos (huella de IP)
// sin cambiar el aviso, tambien rojo. Y mientras queden datos de la empresa [POR COMPLETAR], rojo: no se publica a medias.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const L = () => import(path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const PAGINAS = { es: path.join(RAIZ, 'privacidad', 'index.html'), en: path.join(RAIZ, 'privacidad', 'en', 'index.html') };
const IP = '203.0.113.77', UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) prueba-aviso';

function declarados(html) {
  const out = {};
  for (const m of html.matchAll(/<ul data-evento="([a-z]+)" data-campos="([^"]*)">/g)) out[m[1]] = m[2].split(' ').sort();
  return out;
}
const claves = (o) => Object.keys(o).sort();

async function eventosReales() {
  const D = await L();
  const ts = '2026-10-28T12:00:00.000Z';
  const descarga = D.evento({ ts, contexto: 'production', version: '1.0.47', archivo: 'x.zip', origen: 'portada', pais: 'MX',
    metodo: 'GET', ua: UA, ip: IP, sal: 'sal-de-prueba', interno: false });
  const H = await import(path.join(RAIZ, 'netlify', 'lib', 'herramientas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const conAccion = Object.keys(H.ACCIONES).find((h) => (H.ACCIONES[h] || []).length);
  const uso = D.eventoUso({ ts, contexto: 'production', cuerpo: { herramienta: conAccion, n: 3, accion: H.ACCIONES[conAccion][0] },
    pais: 'MX', metodo: 'POST', ua: UA, interno: false });
  const embudo = (await import(path.join(RAIZ, 'netlify', 'embudo.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'))).default;
  const clic = D.clicDe({ ruta: D.PREFIJO_IR + Object.keys(embudo)[0], tabla: embudo, referer: 'https://taxcerteza.mx/',
    host: 'taxcerteza.mx', ts, contexto: 'production', pais: 'MX', metodo: 'GET', ua: UA, interno: false }).evento;
  const O = require(path.join(RAIZ, 'herramientas', 'opinion.js'));
  const op = O.construir({ herramienta: 'validar-rfc', clase: 'DIGITO_NO_COINCIDE', voto: 'NO', motivo: 'no me cuadra', fecha: '2026-10-28' });
  assert.ok(op.ok, 'calibracion: el envio de opinion de prueba es valido');
  const opinion = Object.assign({}, op.campos);
  delete opinion['form-name'];   // el nombre del formulario de Netlify, no es un dato de la persona
  return { D, descarga, uso, clic, opinion };
}

for (const [idioma, archivo] of Object.entries(PAGINAS)) {
  test(`privacidad ${idioma}: cada lista de datos del aviso dice exactamente lo que el codigo guarda`, async () => {
    const html = fs.readFileSync(archivo, 'utf8');
    const dec = declarados(html);
    assert.deepEqual(Object.keys(dec).sort(), ['clic', 'descarga', 'opinion', 'uso'], 'el aviso tiene una lista por cada cosa que se guarda');
    const r = await eventosReales();
    assert.deepEqual(dec.descarga, claves(r.descarga), 'descarga: lo guardado != lo declarado');
    assert.deepEqual(dec.uso, claves(r.uso), 'uso de herramienta: lo guardado != lo declarado');
    assert.deepEqual(dec.clic, claves(r.clic), 'clic del embudo: lo guardado != lo declarado');
    assert.deepEqual(dec.opinion, claves(r.opinion), 'opinion: lo enviado != lo declarado');
  });
}

test('privacidad: ninguna IP ni identificador del navegador entra en lo que se guarda (el aviso lo afirma)', async () => {
  const r = await eventosReales();
  assert.equal(r.D.UNICOS_ACTIVOS, false, 'los unicos (huella de IP) estan encendidos: el aviso dice que no se guarda ninguna huella');
  for (const [k, e] of Object.entries({ descarga: r.descarga, uso: r.uso, clic: r.clic })) {
    const t = JSON.stringify(e);
    assert.ok(!t.includes(IP), `${k}: la IP entra en el evento`);
    assert.ok(!t.includes('prueba-aviso'), `${k}: el identificador del navegador entra en el evento`);
    assert.ok(!('huella' in e), `${k}: lleva huella`);
  }
});

test('privacidad: las dos versiones existen, se enlazan entre si y el pie de las herramientas enlaza el aviso', () => {
  const es = fs.readFileSync(PAGINAS.es, 'utf8'), en = fs.readFileSync(PAGINAS.en, 'utf8');
  assert.match(es, /<html lang="es-MX">/);
  assert.match(en, /<html lang="en">/);
  assert.ok(es.includes('href="/privacidad/en/"') && en.includes('href="/privacidad/"'), 'cada version enlaza a la otra');
  assert.ok(es.includes('hreflang="en" href="https://taxcerteza.mx/privacidad/en/"'), 'hreflang de la version en ingles');
  const pie = fs.readFileSync(path.join(RAIZ, 'herramientas', 'index.html'), 'utf8');
  assert.ok(pie.includes('<a href="/privacidad/">Aviso de privacidad</a>'), 'el pie de las herramientas no enlaza el aviso');
});

test('privacidad: no se publica con datos de la empresa [POR COMPLETAR] (los da la duena del sitio)', () => {
  for (const [idioma, archivo] of Object.entries(PAGINAS)) {
    const html = fs.readFileSync(archivo, 'utf8');
    const n = (html.match(/\[POR COMPLETAR/g) || []).length;
    if (n) assert.match(html, /<meta name="robots" content="noindex, nofollow">/, `${idioma}: con marcadores tiene que ir con noindex`);
    assert.equal(n, 0, `${idioma}: quedan ${n} datos [POR COMPLETAR]: razon social, domicilio, correo ARCO y fecha`);
  }
});
