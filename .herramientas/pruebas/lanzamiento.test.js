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
