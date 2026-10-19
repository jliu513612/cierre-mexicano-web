'use strict';
// Pruebas de «factura con retenciones» contra los vectores generados EJECUTANDO validador_retenciones del programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const R = require(path.join(RAIZ, 'herramientas', 'factura-con-retenciones', 'retenciones.js'));
const DATOS = require(path.join(RAIZ, 'herramientas', 'factura-con-retenciones', 'retenciones-datos.js'));
const FUENTE = require(path.join('..', 'datos', 'retenciones.json'));
const V = require(path.join('..', 'vectores', 'retenciones.json'));
const ret = R.crear(DATOS);
const reg = r => (r === '' ? '' : r === '626' ? '626' : 'otro');

test('retenciones: las tasas publicadas son las del programa, tal cual', () => {
  const sin = o => { const c = Object.assign({}, o); delete c._nota; return c; };
  assert.deepEqual(sin(DATOS), sin(FUENTE));
  assert.equal(DATOS.ret_iva_pf_pct_del_iva, '66.6667', 'el programa usa 0.666667, no 2/3 exacto');
  for (const k of ['liva-1-a', 'rliva-3', 'lisr-106', 'lisr-116', 'lisr-113-j']) assert.match(DATOS.fuentes[k].url, /^https:\/\/www\.diputados\.gob\.mx\//, k);
});

test('retenciones: hay vectores de todos los casos', () => {
  assert.ok(V.casos.length >= 300 && V.iva_de_subtotal.length >= 30);
  for (const t of ['honorarios', 'arrendamiento', 'autotransporte']) assert.ok(V.casos.some(c => c.tipo === t && c.ret_iva), t);
  assert.ok(V.casos.some(c => c.regimen === '626' && c.ret_isr));
  assert.ok(V.casos.some(c => c.receptor === 'PF'));
});

test('retenciones: el IVA a partir del subtotal, con el redondeo del programa (money.quantize_cents)', () => {
  for (const x of V.iva_de_subtotal) assert.equal(ret.ivaDeSubtotal(x.subtotal), x.iva, x.subtotal);
});

test('retenciones: cada importe retenido es el que espera validar_retenciones', () => {
  let cotejados = 0;
  for (const c of V.casos) {
    const r = ret.calcular({ tipo: c.tipo, receptor: c.receptor, emisor: c.emisor, regimen: reg(c.regimen), subtotal: '1', iva: c.iva });
    const que = JSON.stringify(c);
    if (c.receptor === 'PF') { assert.equal(r.estado, 'NO_APLICA_RECEPTOR_PF', que); continue; }
    if (c.tipo !== 'autotransporte' && c.emisor === 'PM') { assert.equal(r.estado, 'NO_APLICA_EMISOR_PM', que); assert.equal(c.codigos.length, 0, que); continue; }
    assert.equal(r.estado, 'CON_RETENCION', que);
    // El programa solo avisa por encima de 0.50 de diferencia: un importe menor no sale en el vector.
    if (c.ret_iva !== null) { assert.equal(r.retIva, c.ret_iva, que); cotejados++; } else assert.ok(Number(r.retIva) <= 0.5, que);
    if (c.tipo === 'autotransporte') assert.equal(r.retIsr, '0.00', que);
    else if (c.ret_isr !== null) { assert.equal(r.retIsr, c.ret_isr, que); cotejados++; } else assert.ok(Number(r.retIsr) <= 0.5, que);
  }
  assert.ok(cotejados >= 500, `importes cotejados: ${cotejados}`);
});

test('retenciones: casos con nombre', () => {
  const h = ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', regimen: 'otro', subtotal: '10,000' });
  assert.deepEqual([h.iva, h.retIva, h.retIsr, h.neto, h.tasaIsr], ['1600.00', '1066.67', '1000.00', '9533.33', '10']);
  const r = ret.calcular({ tipo: 'arrendamiento', receptor: 'PM', emisor: 'PF', regimen: '626', subtotal: '10000' });
  assert.deepEqual([r.retIva, r.retIsr, r.tasaIsr, r.neto], ['1066.67', '125.00', '1.25', '10408.33']);
  const f = ret.calcular({ tipo: 'autotransporte', receptor: 'PM', subtotal: '10000' });
  assert.deepEqual([f.retIva, f.retIsr, f.neto], ['400.00', '0.00', '11200.00']);
  assert.equal(ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', regimen: '', subtotal: '10000' }).supuestoRegimen, true);
  const e = ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', regimen: 'otro', subtotal: '10000', iva: '1500' });
  assert.deepEqual([e.ivaCalculado, e.base, e.retIva, e.retIsr], [false, '9375.00', '1000.00', '937.50']);
});

test('retenciones: deben FALLAR, sin datos no hay cifra y sin IVA no se inventa la base', () => {
  assert.equal(ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', subtotal: '10000', iva: '0' }).estado, 'SIN_IVA');
  for (const s of ['', 'abc', '-5', '1.234', '12,34', '1e3']) assert.deepEqual(ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', subtotal: s }), { ok: false, estado: 'SUBTOTAL' }, s);
  assert.equal(ret.calcular({ tipo: 'otro', receptor: 'PM', subtotal: '1' }).estado, 'TIPO');
  assert.equal(ret.calcular({ tipo: 'honorarios', receptor: 'X', subtotal: '1' }).estado, 'RECEPTOR');
  assert.equal(ret.calcular({ tipo: 'honorarios', receptor: 'PM', subtotal: '1' }).estado, 'EMISOR');
  assert.equal(ret.calcular({ tipo: 'honorarios', receptor: 'PM', emisor: 'PF', subtotal: '10', iva: 'x' }).estado, 'IVA');
});
