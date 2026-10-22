'use strict';
// Toda URL que el sitio le da a un buscador como la buena -el canonical de cada pagina y cada <loc> de los sitemaps-
// es la que el servidor responde con 200, SIN redireccion. Un canonical que apunta a una redireccion (p. ej. /ayuda/x
// cuando lo que se sirve es /ayuda/x/) hace que el buscador deje la pagina fuera del indice: paso con las 370 paginas
// de la ayuda (2026-10-21; Google tenia indexada 1). Tambien falla un enlace interno <a href> a una variante que
// redirige. Se enumera lo que hay en disco y las reglas de _redirects; nada a mano. Corre en CI SIEMPRE.
// Reglas del servidor (medidas en taxcerteza.mx el 2026-10-21): /x/ con x/index.html -> 200; /x sin barra cuando x es
// carpeta -> 301 a /x/; un fichero que existe (/ayuda/404.html, /sitemap.xml) -> 200; el origen de una regla 3xx de
// _redirects -> redireccion. Fuera de alcance, declarado: lo que solo se ve ejecutando JavaScript.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const SITIO = 'https://taxcerteza.mx';

function ficheros(dir, ext, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'netlify') continue;   // .herramientas = plantillas
    const p = path.join(dir, d.name);
    if (d.isDirectory()) ficheros(p, ext, out); else if (d.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const rel = (p) => '/' + path.relative(RAIZ, p).replace(/\\/g, '/');

function redirecciones() {
  const out = new Set();
  for (const l of fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8').split('\n')) {
    const r = l.trim().split(/\s+/);
    if (!l.trim() || l.trim().startsWith('#') || r.length < 3) continue;
    if (/^3\d\d!?$/.test(r[2])) out.add(r[0]);
  }
  return out;
}

/** ¿Esta ruta del sitio se sirve con 200 y sin redireccion? Devuelve null si si, o el motivo si no. */
function motivo(ruta, redirs) {
  ruta = decodeURIComponent(ruta.split('#')[0].split('?')[0]);
  if (redirs.has(ruta)) return 'es el origen de una redireccion de _redirects';
  const p = path.join(RAIZ, ruta.replace(/^\//, ''));
  if (ruta.endsWith('/')) return fs.existsSync(path.join(p, 'index.html')) ? null : 'no existe (falta index.html)';
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return null;
  if (fs.existsSync(path.join(p, 'index.html'))) return 'sin barra final: el servidor hace 301 a ' + ruta + '/';
  return 'no existe';
}
function absolutaDelSitio(url) {
  return url.startsWith(SITIO + '/') ? url.slice(SITIO.length) : null;
}

function canonicos(redirs) {
  const malos = [];
  let n = 0;
  for (const p of ficheros(RAIZ, '.html')) {
    const m = /<link\b[^>]*\brel=["']?canonical["']?[^>]*>/i.exec(fs.readFileSync(p, 'utf8'));
    if (!m) continue;
    n++;
    const href = (/\bhref=["']([^"']+)["']/i.exec(m[0]) || [])[1] || '';
    const ruta = absolutaDelSitio(href);
    const por = ruta === null ? 'no es una URL absoluta de ' + SITIO : motivo(ruta, redirs);
    if (por) malos.push(`${rel(p)} -> ${href}: ${por}`);
  }
  return { n, malos };
}

function sitemaps(redirs) {
  const malos = [];
  let n = 0;
  for (const p of ficheros(RAIZ, '.xml').filter((f) => /sitemap[^/\\]*\.xml$/i.test(f))) {
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
      n++;
      const ruta = absolutaDelSitio(m[1]);
      const por = ruta === null ? 'no es una URL absoluta de ' + SITIO : motivo(ruta, redirs);
      if (por) malos.push(`${rel(p)}: ${m[1]}: ${por}`);
    }
  }
  return { n, malos };
}

function enlaces(redirs) {
  const malos = [];
  let n = 0;
  for (const p of ficheros(RAIZ, '.html')) {
    const html = fs.readFileSync(p, 'utf8');
    for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
      let u = m[1].replace(/&amp;/g, '&');
      const abs = absolutaDelSitio(u);
      if (abs !== null) u = abs;
      if (!u.startsWith('/') || u.startsWith('//')) continue;    // solo rutas internas absolutas (Docusaurus y plantillas las usan)
      const limpia = u.split('#')[0].split('?')[0];
      if (!limpia) continue;
      n++;
      const por = motivo(limpia, redirs);
      if (por && por !== 'no existe' && por !== 'no existe (falta index.html)') malos.push(`${rel(p)} -> ${u}: ${por}`);
    }
  }
  return { n, malos };
}

const lista = (xs) => xs.slice(0, 15).join('\n  - ') + (xs.length > 15 ? `\n  … y ${xs.length - 15} mas` : '');

test('canonicas: el canonical de cada pagina es la URL que se sirve con 200, sin redireccion', () => {
  const { n, malos } = canonicos(redirecciones());
  assert.ok(n > 100, `calibracion: se leen los canonical del sitio (${n})`);
  assert.deepEqual(malos.length, 0, `${malos.length} de ${n} canonical apuntan a una redireccion o a nada:\n  - ` + lista(malos));
});

test('canonicas: cada URL de los sitemaps se sirve con 200, sin redireccion', () => {
  const { n, malos } = sitemaps(redirecciones());
  assert.ok(n > 100, `calibracion: se leen las URL de los sitemaps (${n})`);
  assert.deepEqual(malos.length, 0, `${malos.length} de ${n} URL de sitemap no se sirven con 200 directo:\n  - ` + lista(malos));
});

test('canonicas: ningun enlace interno apunta a una variante que redirige', () => {
  const { n, malos } = enlaces(redirecciones());
  assert.ok(n > 1000, `calibracion: se leen los enlaces internos (${n})`);
  assert.deepEqual(malos.length, 0, `${malos.length} de ${n} enlaces internos van a una URL que redirige:\n  - ` + lista(malos));
});

module.exports = { motivo, redirecciones, canonicos, sitemaps, enlaces };
