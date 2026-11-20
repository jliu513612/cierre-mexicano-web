'use strict';
// Coherencia de un lanzamiento: la portada, la tabla de /descargar y el manifiesto de la actualizacion automatica
// (version.json) hablan de la MISMA version, y la portada no publica ningun marcador sin rellenar.
// Se pone ROJA a proposito mientras el PR del lanzamiento espera los datos reales del release: eso es lo que impide
// mergearlo antes de tiempo. Se rellena con .herramientas/lanzamiento.py, que mide el zip publicado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const T = () => import(path.join(RAIZ, 'netlify', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

test('lanzamiento: la portada no publica marcadores sin rellenar', () => {
  const h = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.deepEqual([...new Set(h.match(/\{\{[A-Z0-9_]+\}\}/g) || [])], [], 'marcadores en la portada: rellenarlos con .herramientas/lanzamiento.py');
});

test('lanzamiento: portada, /descargar y version.json dicen la misma version y el mismo archivo', async () => {
  const h = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const tabla = (await T()).default;
  const d = tabla.archivos[tabla.predeterminado];
  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'version.json'), 'utf8'));
  const enPortada = {
    titulo: (/<h2>Descarga Tax Certeza ([\d.]+)<\/h2>/.exec(h) || [])[1],
    meta: (/<p class="dl-meta">[^<]* · versión ([\d.]+) ·/.exec(h) || [])[1],
    jsonld: (/"softwareVersion":"([\d.]+)"/.exec(h) || [])[1],
    descripcion: (/<meta name="description" content="[^"]*Versión ([\d.]+) para Windows\."/.exec(h) || [])[1],
  };
  for (const [k, v] of Object.entries(enPortada)) assert.equal(v, d.version, `portada (${k}) = /descargar`);
  assert.equal(manifiesto.version, d.version, 'version.json (actualizacion automatica) = /descargar');
  const zip = (/<p class="dl-meta">([^ <]+) ·/.exec(h) || [])[1];
  assert.ok(d.url.endsWith('/v' + d.version + '/' + zip), `el archivo de la portada (${zip}) es el que entrega /descargar (${d.url})`);
  assert.match((/<code>([^<]*)<\/code>/.exec(h.slice(h.indexOf('inst-verif'))) || [])[1] || '', /^[0-9a-f]{64}$/, 'la huella de la portada es un SHA-256');
});

// Q-4980000000: desde 1.0.50 el url_zip del version.json firmado va por el embudo (/descargar/actualizacion/<version>).
// Si la version no esta dada de alta en `actualizaciones`, el programa recibe 404 y cae a la descarga manual: este test
// pone ROJO el lanzamiento que publica el manifiesto sin darla de alta, o con otra version en la ruta.
const L = () => import(path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
function problemasEmbudo(man, tabla, prefijo) {
  const u = String((man && man.url_zip) || '');
  if (!u.startsWith(prefijo)) return [];                 // url_zip directo (hasta 1.0.49): esta regla no aplica
  const v = u.slice(prefijo.length);
  const p = [];
  if (v !== man.version) p.push(`url_zip nombra ${v} y el manifiesto es ${man.version}`);
  if (!Object.prototype.hasOwnProperty.call((tabla && tabla.actualizaciones) || {}, v))
    p.push(`la version ${v} no esta en actualizaciones de netlify/descargas.mjs: el programa recibiria 404`);
  return p;
}

test('lanzamiento: un url_zip por el embudo nombra la version del manifiesto y esa version esta dada de alta', async () => {
  const tabla = (await T()).default;
  const pref = 'https://taxcerteza.mx' + (await L()).PREFIJO_ACTUALIZACION;
  const manifiesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'version.json'), 'utf8'));
  assert.deepEqual(problemasEmbudo(manifiesto, tabla, pref), [], 'version.json publicado');
  // calibracion: la regla ve los dos fallos y deja pasar los dos casos buenos
  const v = Object.keys(tabla.actualizaciones)[0];
  assert.deepEqual(problemasEmbudo({ version: v, url_zip: pref + v }, tabla, pref), []);
  assert.deepEqual(problemasEmbudo({ version: v, url_zip: 'https://github.com/x/y.zip' }, tabla, pref), []);
  assert.equal(problemasEmbudo({ version: '9.9.9', url_zip: pref + '9.9.9' }, tabla, pref).length, 1, 'version sin dar de alta');
  assert.equal(problemasEmbudo({ version: '9.9.9', url_zip: pref + v }, tabla, pref).length, 1, 'otra version en la ruta');
});
