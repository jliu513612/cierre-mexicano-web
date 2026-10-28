'use strict';
// La salida del generador de /ayuda/ (.ayuda/fuente/) no se edita a mano: cada fichero generado tiene que
// coincidir con su huella en .ayuda/SELLO.json (decision de pauta, 2026-10-27: un solo canal). Falla CERRADO:
// un fichero generado que cambio, uno nuevo dentro de lo generado que el sello no nombra y uno sellado que falta
// cuentan los tres como fallo. La huella es sha256 con finales de linea normalizados a LF (git los convierte).
// Limite, declarado: comprueba que lo commiteado es lo que se sello, no que el sello salga del generador. Eso solo
// se puede ver regenerando desde el producto, que tiene las escenas y el registro de formulas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AQUI = path.join(__dirname, '..');
const FUENTE = path.join(AQUI, 'fuente');
const sello = JSON.parse(fs.readFileSync(path.join(AQUI, 'SELLO.json'), 'utf8'));

const huella = (p) => crypto.createHash('sha256')
  .update(Buffer.from(fs.readFileSync(p).toString('latin1').replace(/\r\n/g, '\n'), 'latin1')).digest('hex');

function ficheros(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) ficheros(p, out); else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(FUENTE, p).replace(/\\/g, '/');

function enDisco() {
  const out = [];
  for (const g of sello.generado) {
    const p = path.join(FUENTE, g);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) out.push(...ficheros(p).map(rel)); else out.push(g);
  }
  return out.sort();
}

test('el sello cubre algo (no es un sello vacio)', () => {
  assert.ok(Array.isArray(sello.generado) && sello.generado.length >= 5, 'el sello no declara que es lo generado');
  assert.ok(Object.keys(sello.ficheros).length > 300, `se esperaban mas de 300 ficheros sellados y hay ${Object.keys(sello.ficheros).length}`);
});

test('cada fichero generado coincide con su sello; ninguno sobra ni falta', () => {
  const sellados = new Set(Object.keys(sello.ficheros));
  const disco = enDisco();
  const sinSellar = disco.filter(f => !sellados.has(f));
  const faltan = [...sellados].filter(f => !disco.includes(f));
  const cambiados = disco.filter(f => sellados.has(f) && huella(path.join(FUENTE, f)) !== sello.ficheros[f]);
  const malas = [
    ...cambiados.map(f => `${f}: cambio respecto al sello (se edito a mano o se regenero sin volver a sellar)`),
    ...sinSellar.map(f => `${f}: esta dentro de lo generado y el sello no lo nombra`),
    ...faltan.map(f => `${f}: sellado y no esta en disco`),
  ];
  assert.deepEqual(malas, [], 'la salida del generador no coincide con .ayuda/SELLO.json. Los textos se cambian en la fuente ' +
    '(manual/escenas del producto, o .ayuda/fuente/conceptos.json para los titulos), se regenera y se vuelve a sellar con ' +
    '.ayuda/sellar.py:\n  ' + malas.join('\n  '));
});
