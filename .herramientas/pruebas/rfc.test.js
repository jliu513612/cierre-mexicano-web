'use strict';
// Pruebas del validador de RFC contra los vectores generados desde el programa.
// Ejecutar: node --test .herramientas/pruebas/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RFC = require(path.join('..', '..', 'herramientas', 'validar-rfc', 'rfc.js'));
const V = require(path.join('..', 'vectores', 'rfc.json'));

test('rfc: hay vectores de todas las clases (un vector vacio no prueba nada)', () => {
  const n = {};
  for (const c of V.casos) n[c.esperado.resultado] = (n[c.esperado.resultado] || 0) + 1;
  for (const k of ['CORRECTO', 'DIGITO_NO_COINCIDE', 'FORMATO_INVALIDO', 'FECHA_INVALIDA', 'GENERICO', 'VACIO']) {
    assert.ok(n[k] >= 2, `faltan vectores de ${k}`);
  }
  assert.ok(V.casos.length >= 400);
  assert.ok(V.sat_prueba.length >= 20);
});

test('rfc: formato y tipo, el mismo veredicto que validar_rfc del programa', () => {
  for (const c of V.casos) {
    const r = RFC.validar(c.entrada);
    assert.equal(r.rfc, c.normalizado, `normalizacion de ${JSON.stringify(c.entrada)}`);
    assert.equal(r.formato, c.producto.ok, `formato de ${JSON.stringify(c.entrada)}`);
    assert.equal(r.tipo, c.producto.tipo, `tipo de ${JSON.stringify(c.entrada)}`);
  }
});

test('rfc: resultado y digito esperado de cada vector', () => {
  for (const c of V.casos) {
    const r = RFC.validar(c.entrada);
    assert.equal(r.resultado, c.esperado.resultado, `resultado de ${JSON.stringify(c.entrada)}`);
    if (c.esperado.digito_esperado !== undefined) {
      assert.equal(r.digitoEsperado, c.esperado.digito_esperado, `digito de ${JSON.stringify(c.entrada)}`);
    }
  }
});

test('rfc: en los RFC de prueba publicados por el SAT el digito real es el que calcula el modulo 11', () => {
  for (const rfc of V.sat_prueba) {
    assert.equal(RFC.digitoVerificador(rfc), rfc.slice(-1), rfc);
    assert.equal(RFC.validar(rfc).resultado, 'CORRECTO', rfc);
  }
});

test('rfc: casos con nombre (generico, letra enie, ampersand, digito A y digito 0)', () => {
  assert.equal(RFC.validar('XAXX010101000').tipo, 'GENERICO_NAC');
  assert.equal(RFC.validar('XEXX010101000').tipo, 'GENERICO_EXT');
  assert.equal(RFC.validar('OÑO120726RX3').resultado, 'CORRECTO');
  assert.equal(RFC.validar('H&E951128469').resultado, 'CORRECTO');
  assert.equal(RFC.validar('COSC8001137NA').digitoEsperado, 'A');
  assert.equal(RFC.validar('JES900109Q90').digitoEsperado, '0');
  assert.equal(RFC.validar('EKU9003173C9').tipo, 'PM');
  assert.equal(RFC.validar('XIQB891116QE4').tipo, 'PF');
});

test('rfc: deben FALLAR un caracter cambiado, dos digitos traspuestos y una fecha que no existe', () => {
  assert.equal(RFC.validar('EKU9003173C8').resultado, 'DIGITO_NO_COINCIDE');
  assert.equal(RFC.validar('EKU0903173C9').resultado, 'DIGITO_NO_COINCIDE'); // 90 -> 09: la fecha sigue existiendo
  assert.equal(RFC.validar('XIQB981116QE4').resultado, 'DIGITO_NO_COINCIDE');
  assert.equal(RFC.validar('EKU9002303C9').resultado, 'FECHA_INVALIDA');
  assert.equal(RFC.validar('XIQB010229QE4').resultado, 'FECHA_INVALIDA');
  assert.equal(RFC.validar('EKU90O3173C9').resultado, 'FORMATO_INVALIDO');
  assert.equal(RFC.validar('EKU9003173C').resultado, 'FORMATO_INVALIDO');
  for (const x of [null, undefined, '', '   ']) assert.equal(RFC.validar(x).resultado, 'VACIO');
});

test('rfc: el diagnostico de formato dice que fallo', () => {
  assert.deepEqual(RFC.validar('EKU9003173C').detalle, [{ codigo: 'LONGITUD', largo: 11 }]);
  assert.deepEqual(RFC.validar('E.U9003173C9').detalle, [{ codigo: 'CARACTERES', cuales: '.' }]);
  assert.deepEqual(RFC.validar('1KU9003173C9').detalle, [{ codigo: 'ORDEN' }]);
});
