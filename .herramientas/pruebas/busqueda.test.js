'use strict';
// El titulo de cada pagina de /herramientas/ sale de lo que la gente BUSCA, medido, no adivinado (June 2026-10-27).
// Cada plantilla lleva junto a ella .herramientas/busqueda/<nombre>.json: la medicion de Google Trends (geo MX, 12
// meses) o, si Trends no tiene datos, el autocompletado de Google como segunda fuente declarada; la expresion elegida
// y por que. Falla CERRADO: una pagina publicada sin registro, un registro sin pagina, o un titulo cambiado sin
// volver a medir (el titulo del registro ya no es el de la plantilla) = rojo. Y el titulo contiene la elegida.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const DIR = path.join(RAIZ, '.herramientas', 'busqueda');
const FUENTES = ['Google Trends', 'autocompletado de Google'];

// Paginas PUBLICADAS en disco (como sitemap.test.js): /herramientas/ es «indice», cada carpeta con index.html es la suya.
function publicadas() {
  const n = [];
  if (fs.existsSync(path.join(RAIZ, 'herramientas', 'index.html'))) n.push('indice');
  for (const d of fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'index.html'))) n.push(d.name);
  }
  return n.sort();
}
const sinMarca = (t) => t.replace(/\s*\|\s*Tax Certeza\s*$/, '').trim();
const normal = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();
const tituloPlantilla = (n) => sinMarca(/^@@TITULO\r?\n(.+)$/m.exec(fs.readFileSync(path.join(RAIZ, '.herramientas', 'plantillas', n + '.html'), 'utf8'))[1]);
const tituloPublicado = (n) => {
  const h = fs.readFileSync(path.join(RAIZ, 'herramientas', n === 'indice' ? '' : n, 'index.html'), 'utf8');
  return sinMarca(/<title>([^<]*)<\/title>/.exec(h)[1].replace(/&amp;/g, '&'));
};

test('busqueda: cada pagina publicada de /herramientas/ tiene su registro de busqueda, y no hay de mas', () => {
  const pags = publicadas();
  assert.ok(pags.length >= 2, 'calibracion: hay paginas publicadas');
  const regs = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
  assert.deepEqual(pags.filter((n) => !regs.includes(n)), [], 'paginas SIN registro de busqueda');
  assert.deepEqual(regs.filter((n) => !pags.includes(n)), [], 'registros de una pagina que no existe');
});

test('busqueda: cada registro esta completo y el titulo contiene la expresion elegida', () => {
  for (const n of publicadas()) {
    const p = path.join(DIR, n + '.json');
    if (!fs.existsSync(p)) continue;  // lo dice la prueba de arriba
    const r = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.ok(FUENTES.includes(r.fuente), `${n}: fuente ${r.fuente}`);
    assert.match(r.fecha || '', /^\d{4}-\d{2}-\d{2}$/, `${n}: fecha`);
    assert.equal(r.geo, 'MX', `${n}: geo`);
    assert.ok(Array.isArray(r.expresiones) && r.expresiones.length >= 2 && r.expresiones.length <= 5, `${n}: 2 a 5 expresiones`);
    for (const e of r.expresiones) {
      assert.ok(typeof e.texto === 'string' && e.texto.trim(), `${n}: expresion sin texto`);
      if (r.fuente === 'Google Trends') assert.ok(Number.isInteger(e.media) && e.media >= 0 && e.media <= 100, `${n}: «${e.texto}» sin media`);
    }
    if (r.fuente === 'Google Trends') assert.match(r.periodo || '', /^12 meses \(\d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}\)$/, `${n}: periodo`);
    else assert.match(r.sin_datos_en_trends || '', /\S/, `${n}: autocompletado sin decir que Trends no tenia datos`);
    assert.ok(Array.isArray(r.relacionadas), `${n}: relacionadas`);
    assert.ok(r.expresiones.some((e) => e.texto === r.elegida), `${n}: la elegida «${r.elegida}» no esta entre las medidas`);
    assert.ok((r.por_que || '').trim().length >= 20, `${n}: sin por que`);
    assert.equal(r.titulo, tituloPlantilla(n), `${n}: el titulo cambio sin volver a medir (registro .herramientas/busqueda/${n}.json)`);
    assert.ok(normal(tituloPublicado(n)).includes(normal(r.elegida)), `${n}: el titulo «${tituloPublicado(n)}» no contiene «${r.elegida}»`);
  }
});
