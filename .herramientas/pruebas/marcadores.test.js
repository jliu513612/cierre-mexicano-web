'use strict';
// Ningun marcador {asi} sin sustituir llega al lector de /ayuda/. Paso con el buscador (2026-10-23, auditoria externa):
// el boton «Ver todos los resultados» decia «Ver los {count} resultados», porque la traduccion pedia un {count} que
// el codigo del buscador NO le pasa a ese texto. Corre en CI SIEMPRE, sobre lo PUBLICADO (ayuda/), no sobre la fuente.
// Dos comprobaciones:
//   A. El texto visible de cada pagina HTML (sin <script> ni <style>) no contiene {palabra}.
//   B. Los textos que el JavaScript pinta al vuelo: en los paquetes de ayuda/assets/js, cada traduccion
//      ("theme.X":"…") que lleva {p} tiene que tener una llamada {id:"theme.X",…} que le PASE p, y ninguna llamada
//      a ese id puede dejar de pasarlo. Falla CERRADO: una traduccion con marcador cuya llamada no se encuentra
//      cuenta como fallo, porque no se pudo comprobar. Lo unico que se salta es la traduccion cuyo id NO aparece en
//      ningun otro sitio del codigo publicado: Docusaurus mete el diccionario entero (blog, versiones…), y un texto
//      sin codigo que lo pinte no llega a nadie. Esas se cuentan en la salida.
// Limite, declarado: B mira el contrato traduccion/llamada en el codigo publicado, no ejecuta el buscador. Un texto
// que se montara pegando cadenas fuera de ese mecanismo no lo ve.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const AYUDA = path.join(RAIZ, 'ayuda');

function ficheros(dir, ext, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) ficheros(p, ext, out); else if (d.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(RAIZ, p).replace(/\\/g, '/');
const MARCADOR = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const marcadores = (s) => new Set([...s.matchAll(MARCADOR)].map(m => m[1]));

function textoVisible(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** Desescapa una cadena JS entre comillas lo justo para leer sus marcadores. */
const des = (s) => s.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, u, x) => String.fromCharCode(parseInt(u || x, 16)))
  .replace(/\\(.)/g, '$1');

/** Traducciones publicadas: "theme.X":"mensaje" (el diccionario que Docusaurus mete en el paquete). */
function traducciones(js) {
  const out = new Map();
  for (const m of js.matchAll(/"((?:theme|search)\.[A-Za-z0-9_.\-]+)":"((?:[^"\\]|\\.)*)"/g)) out.set(m[1], des(m[2]));
  return out;
}

/** Posicion del cierre que empareja la llave/parentesis abierto en `i`, saltando cadenas. -1 si no cierra. */
function cierre(js, i) {
  const abre = js[i], cierra = { '{': '}', '(': ')' }[abre];
  let n = 0;
  for (let k = i; k < js.length; k++) {
    const c = js[k];
    if (c === '"' || c === "'" || c === '`') {
      for (k++; k < js.length && js[k] !== c; k++) if (js[k] === '\\') k++;
      continue;
    }
    if (c === abre) n++;
    else if (c === cierra && --n === 0) return k;
  }
  return -1;
}

/** Llaves de primer nivel de un objeto literal js[i..j] (i en «{»). */
function llaves(js, i, j) {
  const out = [];
  let n = 0;
  for (let k = i; k <= j; k++) {
    const c = js[k];
    if (c === '"' || c === "'" || c === '`') { for (k++; k < j && js[k] !== c; k++) if (js[k] === '\\') k++; continue; }
    if (c === '{' || c === '(' || c === '[') { n++; if (n > 1) continue; }
    else if (c === '}' || c === ')' || c === ']') { n--; continue; }
    if (n === 1 && (c === '{' || c === ',')) {
      const m = /^[{,]\s*([A-Za-z_$][A-Za-z0-9_$]*|"[^"]+")\s*:/.exec(js.slice(k, k + 80));
      if (m) out.push({ nombre: m[1].replace(/"/g, ''), pos: k + m[0].length });
    }
  }
  return out;
}

/** Llamadas de traduccion en el codigo publicado: cada objeto con id:"theme.X". Sus parametros son los de
 *  `values:{…}` dentro del objeto (componente <Translate>) o los del objeto que lo sigue, `,{…}` (funcion translate). */
function llamadas(js) {
  const out = new Map();   // id -> [Set(parametros)]
  for (const m of js.matchAll(/\bid:"((?:theme|search)\.[A-Za-z0-9_.\-]+)"/g)) {
    // el objeto que contiene este id: la llave abierta mas cercana hacia atras que cierra despues de el
    let i = m.index, ini = -1, fin = -1;
    for (let pasos = 0; pasos < 40 && i > 0; pasos++) {
      i = js.lastIndexOf('{', i - 1);
      if (i < 0) break;
      const j = cierre(js, i);
      if (j > m.index) { ini = i; fin = j; break; }
    }
    const params = new Set();
    if (ini >= 0) {
      const ks = llaves(js, ini, fin);
      const v = ks.find(k => k.nombre === 'values');
      if (v && js[v.pos] === '{') {
        const vf = cierre(js, v.pos);
        for (const k of llaves(js, v.pos, vf)) params.add(k.nombre);
      }
      const sig = /^\s*,\s*\{/.exec(js.slice(fin + 1, fin + 20));
      if (sig) {
        const pi = fin + 1 + sig[0].length - 1, pf = cierre(js, pi);
        for (const k of llaves(js, pi, pf)) params.add(k.nombre);
      }
    }
    if (!out.has(m[1])) out.set(m[1], []);
    out.get(m[1]).push(params);
  }
  return out;
}

test('A. el texto visible de /ayuda/ no tiene marcadores {…} sin sustituir', () => {
  const malas = [];
  for (const f of ficheros(AYUDA, '.html')) {
    const ms = marcadores(textoVisible(fs.readFileSync(f, 'utf8')));
    if (ms.size) malas.push(`${rel(f)}: ${[...ms].map(x => `{${x}}`).join(' ')}`);
  }
  assert.deepEqual(malas, [], 'paginas con marcadores sin sustituir:\n  ' + malas.join('\n  '));
});

test('B. cada {marcador} de una traduccion lo pasa el codigo que pinta ese texto', () => {
  const js = ficheros(path.join(AYUDA, 'assets', 'js'), '.js').map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const tr = traducciones(js), ll = llamadas(js);
  assert.ok(tr.size > 20, `se esperaban las traducciones del sitio en los paquetes y se leyeron ${tr.size}: el lector no ve el paquete`);
  assert.ok(ll.size > 20, `se esperaban llamadas de traduccion en los paquetes y se leyeron ${ll.size}: el lector no ve el paquete`);
  const malas = [], sinCodigo = [];
  for (const [id, msg] of tr) {
    const ms = marcadores(msg);
    if (!ms.size) continue;
    const usos = ll.get(id);
    if (!usos) {
      // ¿el id sale en el codigo fuera del diccionario? Entonces algo lo pinta y el lector no entendio la llamada.
      const fuera = (js.split(`"${id}"`).length - 1) - (js.split(`"${id}":`).length - 1);
      if (fuera > 0) malas.push(`${id} = «${msg}»: el codigo lo usa ${fuera} vez/veces y no se pudo leer la llamada (no comprobable)`);
      else sinCodigo.push(id);
      continue;
    }
    for (const params of usos) {
      const faltan = [...ms].filter(x => !params.has(x));
      if (faltan.length) malas.push(`${id} = «${msg}»: el codigo no le pasa ${faltan.map(x => `{${x}}`).join(' ')} (pasa: ${[...params].join(', ') || 'nada'})`);
    }
  }
  console.log(`  traducciones con marcador sin codigo que las pinte en este sitio (no llegan al lector): ${sinCodigo.length}`);
  assert.ok(ll.has('theme.SearchBar.seeAll') && ll.has('theme.SearchPage.documentsFound.plurals'),
    'el lector no encuentra las llamadas del buscador, que son las que motivaron esta prueba');
  assert.deepEqual(malas, [], 'traducciones con marcadores que nadie sustituye:\n  ' + malas.join('\n  '));
});
