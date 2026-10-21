'use strict';
// Ninguna pagina publicada de /ayuda/ queda HUERFANA: todas se alcanzan desde la portada de la ayuda (ayuda/index.html)
// siguiendo enlaces internos (<a href>). Una pagina sin camino es una pagina que nadie encuentra: paso con /ayuda/leyes/
// (2026-10-21), publicada con 200 y solo enlazada desde el pie. Por eso EL PIE NO CUENTA COMO CAMINO: esta en todas las
// paginas y no es donde nadie busca; una pagina tiene que alcanzarse por la barra, la portada o el contenido.
// Se enumera lo que hay en disco, no una lista a mano, y
// las unicas excepciones son las de EXCLUIDAS, cada una con su razon: lo que no esta ahi falla CERRADO. Corre en CI SIEMPRE.
// Fuera de alcance, declarado: los enlaces que solo existen al ejecutar JavaScript (no se ven en el HTML publicado).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const AYUDA = path.join(RAIZ, 'ayuda');
const PORTADA = path.join(AYUDA, 'index.html');

// Paginas que existen sin necesitar un enlace desde la portada. Cada una con su razon.
const EXCLUIDAS = new Map([
  ['ayuda/404.html', 'la sirve el servidor cuando una ruta no existe; no se enlaza'],
  ['ayuda/search/index.html', 'resultados del buscador de la barra: la abre su JavaScript con la consulta escrita, no un enlace'],
]);

function htmls(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) htmls(p, out); else if (d.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');

/** Destinos de los <a href> de una pagina, como rutas del sitio ('/ayuda/...'). */
function enlaces(html, pagina) {
  const out = [];
  html = html.replace(/<footer\b[\s\S]*?<\/footer>/gi, '');   // el pie no es camino (ver cabecera)
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    let u = m[1].replace(/&amp;/g, '&');
    if (/^(https?:)?\/\//i.test(u)) {
      const r = /^(?:https?:)?\/\/(?:www\.)?taxcerteza\.mx(\/.*)?$/i.exec(u);   // enlace absoluto al propio sitio
      if (!r) continue;
      u = r[1] || '/';
    }
    if (/^(mailto|tel|javascript|data):/i.test(u) || u.startsWith('#')) continue;
    u = u.split('#')[0].split('?')[0];
    if (!u) continue;
    if (!u.startsWith('/')) {
      const base = '/' + rel(path.dirname(pagina)) + '/';
      u = path.posix.normalize(base + u);
    }
    out.push(u);
  }
  return out;
}

/** Fichero que sirve una ruta del sitio, o null. Mismas reglas que el servidor: carpeta -> index.html, o ruta.html. */
function fichero(ruta) {
  const limpia = decodeURIComponent(ruta).replace(/^\//, '').replace(/\/$/, '');
  const p = path.join(RAIZ, limpia);
  const cands = [path.join(p, 'index.html'), p + '.html', p];
  return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

/** Paginas de /ayuda/ alcanzables desde la portada (recorrido en anchura). */
function alcanzables(portada) {
  const vistas = new Set([portada]);
  const cola = [portada];
  while (cola.length) {
    const p = cola.shift();
    for (const u of enlaces(fs.readFileSync(p, 'utf8'), p)) {
      if (!u.startsWith('/ayuda')) continue;
      const f = fichero(u);
      if (f && f.endsWith('.html') && !vistas.has(f)) { vistas.add(f); cola.push(f); }
    }
  }
  return vistas;
}

function huerfanas() {
  const todas = htmls(AYUDA);
  const vistas = alcanzables(PORTADA);
  return { todas, vistas, sueltas: todas.filter((p) => !vistas.has(p) && !EXCLUIDAS.has(rel(p))).map(rel).sort() };
}

test('ayuda: ninguna pagina publicada queda huerfana (sin camino desde la portada)', () => {
  assert.ok(fs.existsSync(PORTADA), 'falta ayuda/index.html: sin portada no hay desde donde recorrer');
  const { todas, vistas, sueltas } = huerfanas();
  assert.ok(todas.length > 50, `calibracion: se recorren las paginas de /ayuda/ (hay ${todas.length})`);
  assert.ok(vistas.size > 50, `calibracion: desde la portada se alcanzan paginas (${vistas.size})`);
  for (const ex of EXCLUIDAS.keys()) {
    assert.ok(fs.existsSync(path.join(RAIZ, ex)), `excepcion declarada que ya no existe: ${ex} (quitarla de EXCLUIDAS)`);
  }
  assert.deepEqual(sueltas, [], `${sueltas.length} pagina(s) de /ayuda/ sin ningun enlace que lleve a ellas desde la portada ` +
    `(ponerles un camino en la barra, la portada o una seccion; o declararlas en EXCLUIDAS con su razon):\n  - ` + sueltas.join('\n  - '));
});

module.exports = { huerfanas, enlaces, fichero };
