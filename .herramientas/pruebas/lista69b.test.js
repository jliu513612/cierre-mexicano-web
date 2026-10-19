'use strict';
// Pruebas de la consulta 69-B contra el listado publicado y la muestra cotejada con el programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const L = require(path.join(RAIZ, 'herramientas', 'lista-69b', 'lista69b.js'));
const DATOS = require(path.join(RAIZ, 'herramientas', 'lista-69b', 'listado.json'));
const V = require(path.join('..', 'vectores', 'lista69b.json'));

// Cuando la actualizacion programada trae un listado NUEVO, los vectores siguen siendo del listado cotejado con el
// programa: el cotejo exacto solo aplica si el sha256 coincide; si no, se comprueba la forma y se dice.
const MISMO = DATOS.sha256 === V.sha256_csv;
if (!MISMO) console.log('# listado distinto del cotejado con el programa: se comprueba solo la forma (correr extraer_del_producto.py)');

test('69b: el listado publicado tiene fecha, fuente https y forma valida', () => {
  assert.match(DATOS.fecha_info, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(DATOS.fuente.startsWith('https://'));
  assert.ok(DATOS.filas >= 10000);
  assert.ok(['ACTUALIZADO', 'NO_SE_PUDO_ACTUALIZAR'].includes(DATOS.estado));
  assert.equal(Object.values(DATOS.r).flat().length, DATOS.filas);
  if (MISMO) {
    assert.equal(DATOS.fecha_info, V.fecha_info);
    assert.equal(DATOS.filas, V.filas_cotejadas);
    assert.equal(Object.keys(DATOS.r).length, V.rfc_cotejados);
  }
});

test('69b: cada RFC de la muestra da la misma situacion y fechas que el programa', { skip: !MISMO && 'listado distinto del cotejado' }, () => {
  const muestra = Object.entries(V.muestra);
  assert.ok(muestra.length >= 300);
  assert.ok(muestra.some(([, regs]) => regs.length > 1), 'la muestra incluye RFC con varias filas');
  for (const [rfc, regs] of muestra) {
    const c = L.consultar(DATOS, rfc);
    assert.equal(c.aparece, true, rfc);
    assert.deepEqual(c.registros.map(r => [r.codigo, r.fechas.presunto, r.fechas.desvirtuado, r.fechas.definitivo, r.fechas.sentenciaFavorable]), regs, rfc);
  }
});

test('69b: hay RFC de las cuatro situaciones', () => {
  const vistas = new Set(Object.values(DATOS.r).flat().map(f => f[0]));
  assert.deepEqual([...vistas].sort(), ['D', 'P', 'S', 'V']);
});

test('69b: un RFC que no esta no aparece, y no se confunde con un prototipo de JavaScript', () => {
  for (const r of ['XAXX010101000', 'EKU9003173C9', 'constructor', 'toString', '__proto__']) assert.equal(L.consultar(DATOS, r).aparece, false, r);
});

test('69b: lectura de RFC escritos (lote, duplicados, guiones, basura)', () => {
  const r = L.leerRfcs(' eku9003173c9, EKU9003173C9\nxiqb-891116-qe4 ; hola 12345 H&E951128469 ');
  assert.deepEqual(r.validos, ['EKU9003173C9', 'XIQB891116QE4', 'H&E951128469']);
  assert.deepEqual(r.invalidos, ['HOLA', '12345']);
  assert.deepEqual(L.leerRfcs('').validos, []);
  const muchos = Array.from({ length: 2100 }, (_, i) => 'AAA' + String(100000 + i).slice(-6) + 'AB1').join(' ');
  const m = L.leerRfcs(muchos);
  assert.equal(m.validos.length, 2000);
  assert.equal(m.recortados, 100);
});

test('69b: deben FALLAR, sin fecha no hay respuesta y el fallo de actualizacion se dice', () => {
  assert.equal(L.estado(null), 'SIN_DATOS');
  assert.equal(L.estado(Object.assign({}, DATOS, { fecha_info: '' })), 'SIN_DATOS');
  assert.equal(L.estado(Object.assign({}, DATOS, { r: undefined })), 'SIN_DATOS');
  assert.equal(L.estado(Object.assign({}, DATOS, { estado: 'NO_SE_PUDO_ACTUALIZAR' })), 'NO_SE_PUDO_ACTUALIZAR');
});
