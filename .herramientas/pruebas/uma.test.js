'use strict';
// Pruebas de la pagina de la UMA contra los datos y vectores generados desde el programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const UMA = require(path.join(RAIZ, 'herramientas', 'valor-uma', 'uma.js'));
const DATOS = require(path.join(RAIZ, 'herramientas', 'valor-uma', 'uma-datos.js'));
const FUENTE = require(path.join('..', 'datos', 'uma.json'));
const V = require(path.join('..', 'vectores', 'uma.json'));
const uma = UMA.crear(DATOS);

test('uma: uma-datos.js es exactamente lo extraido del programa', () => {
  const sin = o => { const c = Object.assign({}, o); delete c._nota; return c; };
  assert.deepEqual(sin(DATOS), sin(FUENTE));
});

test('uma: los datos estan completos y cada valor trae su fuente oficial', () => {
  assert.ok(DATOS.valores.length >= 5);
  let previo = null;
  for (const v of DATOS.valores) {
    for (const k of ['diario', 'mensual', 'anual']) assert.match(v[k], /^\d+\.\d{2}$/, `${v.anio} ${k}`);
    assert.equal(v.desde, `${v.anio}-02-01`);
    assert.equal(v.hasta, `${v.anio + 1}-01-31`);
    assert.match(v.url, /^https:\/\/(www\.)?dof\.gob\.mx\/.+/);
    assert.match(v.dof, /^\d{4}-01-\d{2}$/);
    assert.match(v.verificado, /^\d{4}-\d{2}-\d{2}$/);
    if (previo) assert.equal(v.anio, previo.anio + 1, 'no puede faltar un ano en medio');
    previo = v;
  }
});

test('uma: hay vectores suficientes', () => {
  assert.ok(V.vigencia.length >= 40 && V.conversion.length >= 1000 && V.cantidades_invalidas.length >= 10);
  for (const e of ['VIGENTE', 'ANTERIOR_A_TABLA', 'SIN_CONFIRMAR']) assert.ok(V.vigencia.some(c => c.estado === e), e);
  for (const s of ['VECES_A_PESOS', 'PESOS_A_VECES']) assert.ok(V.conversion.some(c => c.sentido === s), s);
});

test('uma: vigencia, el mismo valor que el motor del programa en cada fecha', () => {
  for (const c of V.vigencia) {
    const r = uma.vigenteEn(c.fecha);
    assert.equal(r.estado, c.estado, c.fecha);
    assert.equal(r.valor ? r.valor.diario : null, c.diario, c.fecha);
  }
});

test('uma: enero usa el valor del ano anterior y el 1 de febrero entra el nuevo', () => {
  assert.equal(uma.vigenteEn('2026-01-31').valor.anio, 2025);
  assert.equal(uma.vigenteEn('2026-02-01').valor.anio, 2026);
  assert.equal(uma.vigenteEn('2024-02-29').valor.anio, 2024);
});

test('uma: conversion, cada vector calculado con Decimal en Python', () => {
  for (const c of V.conversion) {
    const r = uma.convertir(c);
    assert.equal(r.ok, true, JSON.stringify(c));
    assert.equal(r.resultado, c.resultado, JSON.stringify(c));
  }
});

test('uma: deben FALLAR las cantidades que no son un numero', () => {
  for (const x of V.cantidades_invalidas.concat([null, undefined])) {
    assert.deepEqual(uma.convertir({ cantidad: x, periodo: 'diario', sentido: 'VECES_A_PESOS', fecha: '2026-06-01' }),
      { ok: false, motivo: 'CANTIDAD' }, JSON.stringify(x));
  }
  assert.equal(UMA.leerCantidad('1,234.50'), '1234.50');
  assert.equal(UMA.leerCantidad('$ 1234.5'), '1234.5');
  assert.equal(UMA.leerCantidad('1,23.4'), null);
});

test('uma: deben FALLAR las fechas fuera de la tabla (no hay numero ni antes ni despues)', () => {
  const p = { cantidad: '10', periodo: 'diario', sentido: 'VECES_A_PESOS' };
  assert.deepEqual(uma.convertir(Object.assign({ fecha: '2022-01-31' }, p)), { ok: false, motivo: 'ANTERIOR_A_TABLA' });
  assert.deepEqual(uma.convertir(Object.assign({ fecha: '2027-02-01' }, p)), { ok: false, motivo: 'SIN_CONFIRMAR' });
  assert.deepEqual(uma.convertir(Object.assign({ fecha: '2026-02-30' }, p)), { ok: false, motivo: 'FECHA_INVALIDA' });
  assert.deepEqual(uma.convertir({ cantidad: '10', periodo: 'semanal', sentido: 'VECES_A_PESOS', fecha: '2026-06-01' }), { ok: false, motivo: 'PERIODO' });
  assert.deepEqual(uma.convertir({ cantidad: '10', periodo: 'diario', sentido: 'OTRO', fecha: '2026-06-01' }), { ok: false, motivo: 'SENTIDO' });
});

test('uma: que avisa la pagina segun el dia (al dia, enero de transicion, sin confirmar)', () => {
  const ult = DATOS.valores[DATOS.valores.length - 1].anio;
  assert.equal(uma.estadoPagina(`${ult}-10-13`), 'AL_DIA');
  assert.equal(uma.estadoPagina(`${ult}-12-31`), 'AL_DIA');
  assert.equal(uma.estadoPagina(`${ult + 1}-01-01`), 'ENERO');
  assert.equal(uma.estadoPagina(`${ult + 1}-01-31`), 'ENERO');
  assert.equal(uma.estadoPagina(`${ult + 1}-02-01`), 'SIN_CONFIRMAR');
  assert.equal(uma.estadoPagina(`${ult - 1}-01-15`), 'AL_DIA');
});

test('uma: la pagina publicada lleva los mismos numeros que los datos (texto estatico, sin teclear)', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'herramientas', 'valor-uma', 'index.html'), 'utf8');
  assert.ok(!/\{\{[A-Z_]+\}\}|\[\[[A-Z_]+\]\]/.test(html), 'quedaron marcadores sin rellenar');
  const miles = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (const v of DATOS.valores) {
    for (const k of ['diario', 'mensual', 'anual']) {
      assert.ok(html.includes('$' + miles(v[k])), `falta ${v.anio} ${k} = $${miles(v[k])}`);
    }
    assert.ok(html.includes(v.url.replace(/&/g, '&amp;')), `falta la fuente de ${v.anio}`);
  }
});
