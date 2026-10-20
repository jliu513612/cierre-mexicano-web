'use strict';
// Cada pagina del sitio (tambien las de /ayuda/ y /blog/) pide solo recursos locales que EXISTEN: hojas de estilo, scripts,
// iconos, imagenes y precargas. Un recurso local que no esta en disco ni lo sirve una regla 200 de _redirects es un 404
// para cada visitante. Se enumera lo que hay en disco, no una lista a mano. Corre en CI SIEMPRE.
// Fuera de alcance, declarado: los enlaces de navegacion (<a href>) y lo que se pide desde JavaScript.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');

function htmls(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'netlify') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) htmls(p, out); else if (d.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const reescrituras = () => new Set(fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8').split('\n')
  .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/)).filter(r => r[2] === '200').map(r => r[0]));

/** Las URL de recursos que pide una pagina: link (stylesheet, icon, preload, manifest...), script, img y source. */
function recursos(html) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = /\brel=["']?([^"'>]+)/i.exec(m[0]);
    const href = /\bhref=["']([^"']+)["']/i.exec(m[0]);
    if (href && rel && !/\b(canonical|alternate|next|prev|author|license|me)\b/i.test(rel[1])) out.push(href[1]);
  }
  for (const m of html.matchAll(/<(?:script|img|source|iframe)\b[^>]*\bsrc=["']([^"']+)["']/gi)) out.push(m[1]);
  return out;
}
function local(url, pagina) {
  if (/^(https?:)?\/\//i.test(url) || /^(data|mailto|tel|javascript):/i.test(url) || url.startsWith('#')) return null;
  const limpia = url.split('#')[0].split('?')[0];
  if (!limpia) return null;
  if (limpia.startsWith('/')) return limpia;
  const base = '/' + path.relative(RAIZ, path.dirname(pagina)).replace(/\\/g, '/') + '/';
  return path.posix.normalize(base.replace(/^\/\.\//, '/') + limpia);
}
function existe(ruta, rescritas) {
  if (rescritas.has(ruta)) return true;
  let p = path.join(RAIZ, decodeURIComponent(ruta).replace(/^\//, ''));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  return fs.existsSync(p);
}

test('recursos: ninguna pagina pide un recurso local que no existe', () => {
  const paginas = htmls(RAIZ), rescritas = reescrituras();
  assert.ok(paginas.length > 50, 'calibracion: se recorren las paginas del sitio, ayuda incluida');
  let n = 0;
  const faltan = new Map();
  for (const p of paginas) {
    for (const u of recursos(fs.readFileSync(p, 'utf8'))) {
      const r = local(u, p);
      if (!r) continue;
      n++;
      if (!existe(r, rescritas)) faltan.set(r, (faltan.get(r) || 0) + 1);
    }
  }
  assert.ok(n > 100, `calibracion: se revisan recursos locales (${n})`);
  assert.deepEqual([...faltan].map(([r, k]) => `${r} (${k} paginas)`), [], 'recursos locales que no existen');
});

test('recursos: el detector ve un recurso que falta (control)', () => {
  const html = '<link rel="icon" href="/no-existe.ico"><link rel="canonical" href="/x/"><script src="/herramientas/opinion.js"></script>';
  const rs = recursos(html).map(u => local(u, path.join(RAIZ, 'index.html')));
  assert.deepEqual(rs, ['/no-existe.ico', '/herramientas/opinion.js']);
  assert.equal(existe('/no-existe.ico', new Set()), false);
  assert.equal(existe('/herramientas/opinion.js', new Set()), true);
});
