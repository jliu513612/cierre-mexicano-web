'use strict';
// Los sitemaps y las paginas de /herramientas/ EN DISCO: se enumera lo que hay, no una lista escrita a mano.
// Corre en CI SIEMPRE, tambien en los PR del blog que tocan sitemap.xml.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const SITIO = 'https://taxcerteza.mx';

function enDisco() {
  const urls = new Set();
  if (fs.existsSync(path.join(RAIZ, 'herramientas', 'index.html'))) urls.add(SITIO + '/herramientas/');
  for (const d of fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'index.html'))) urls.add(`${SITIO}/herramientas/${d.name}/`);
  }
  return urls;
}
function entradas(rel) {
  const x = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
  return [...x.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g)].map(m => ({ loc: m[1], lastmod: m[2] }));
}

test('sitemap: cada pagina de /herramientas/ en disco esta en herramientas/sitemap.xml, y no hay de mas', () => {
  const disco = enDisco(), sm = entradas('herramientas/sitemap.xml');
  assert.ok(disco.size >= 2, 'calibracion: hay paginas en disco');
  const locs = sm.map(e => e.loc);
  assert.equal(new Set(locs).size, locs.length, 'sin repetidas');
  assert.deepEqual([...disco].filter(u => !locs.includes(u)), [], 'paginas que FALTAN en herramientas/sitemap.xml');
  assert.deepEqual(locs.filter(u => !disco.has(u)), [], 'el sitemap nombra paginas que NO existen');
});

test('sitemap: ningun sitemap del sitio nombra una herramienta que no existe', () => {
  const disco = enDisco();
  for (const rel of ['sitemap.xml', 'herramientas/sitemap.xml']) {
    const malas = entradas(rel).map(e => e.loc).filter(u => u.startsWith(SITIO + '/herramientas/') && !disco.has(u));
    assert.deepEqual(malas, [], rel);
  }
});

test('sitemap: lastmod es una fecha valida y no futura', () => {
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  for (const e of entradas('herramientas/sitemap.xml')) {
    assert.match(e.lastmod || '', /^\d{4}-\d{2}-\d{2}$/, e.loc);
    assert.ok(!Number.isNaN(Date.parse(e.lastmod)) && e.lastmod <= manana, `${e.loc}: ${e.lastmod}`);
  }
});

test('sitemap: robots.txt declara el sitemap de /herramientas/', () => {
  const r = fs.readFileSync(path.join(RAIZ, 'robots.txt'), 'utf8');
  assert.match(r, /^Sitemap: https:\/\/taxcerteza\.mx\/herramientas\/sitemap\.xml\s*$/m);
});
