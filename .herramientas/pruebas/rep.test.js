'use strict';
// Pruebas del asistente del complemento de pago contra los vectores generados desde el programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const REP = require(path.join('..', '..', 'herramientas', 'complemento-de-pago', 'rep.js'));
const V = require(path.join('..', 'vectores', 'rep.json'));

test('rep: hay vectores suficientes', () => {
  assert.ok(V.limite.length >= 150 && V.estado.length >= 60 && V.lleva.length >= 6 && V.fechas_invalidas.length >= 8);
  assert.ok(V.limite.some(c => c.fecha_pago.slice(5, 7) === '12'), 'falta diciembre (cambio de ano)');
  for (const e of ['VENCIDO', 'URGENTE', 'NORMAL']) assert.ok(V.estado.some(c => c.estado === e), e);
  assert.ok(V.lleva.some(c => c.lleva_rep) && V.lleva.some(c => !c.lleva_rep));
});

test('rep: fecha limite, la misma que fecha_limite_complemento del programa', () => {
  for (const c of V.limite) assert.equal(REP.fechaLimite(c.fecha_pago), c.limite, c.fecha_pago);
});

test('rep: estado del plazo, el mismo que clasificar_severidad del programa', () => {
  for (const c of V.estado) {
    assert.deepEqual(REP.estadoPlazo(c.fecha_pago, c.hoy), { estado: c.estado, dias: c.dias }, `${c.fecha_pago} visto el ${c.hoy}`);
  }
});

test('rep: solo el metodo PPD lleva complemento, igual que estado_rep del programa', () => {
  for (const c of V.lleva) assert.equal(REP.metodoLlevaRep(c.metodo), c.lleva_rep, JSON.stringify(c.metodo));
});

test('rep: los casos del articulo publicado', () => {
  assert.equal(REP.fechaLimite('2026-10-20'), '2026-11-05');
  assert.equal(REP.fechaLimite('2026-10-31'), '2026-11-05');
  assert.equal(REP.fechaLimite('2026-11-01'), '2026-12-05');
  assert.equal(REP.fechaLimite('2026-12-31'), '2027-01-05');
});

test('rep: deben FALLAR las fechas que no existen', () => {
  for (const f of V.fechas_invalidas.concat([null, undefined, 20261020])) {
    assert.equal(REP.fechaLimite(f), null, JSON.stringify(f));
    assert.deepEqual(REP.consultarPlazo(f, '2026-10-13'), { ok: false, motivo: 'FECHA_INVALIDA' }, JSON.stringify(f));
  }
});

test('rep: solo afirma el plazo para pagos de 2026 (la regla citada es la RMF 2026)', () => {
  assert.deepEqual(REP.consultarPlazo('2025-12-31', '2026-01-02'), { ok: false, motivo: 'FUERA_DE_EJERCICIO', ejercicio: 2025 });
  assert.deepEqual(REP.consultarPlazo('2027-01-01', '2027-01-02'), { ok: false, motivo: 'FUERA_DE_EJERCICIO', ejercicio: 2027 });
  const r = REP.consultarPlazo('2026-12-15', '2026-12-20');
  assert.equal(r.ok, true);
  assert.equal(r.limite, '2027-01-05');
  assert.equal(r.limiteEnOtroEjercicio, true);
  assert.equal(REP.consultarPlazo('2026-10-20', '2026-10-25').limiteEnOtroEjercicio, false);
  assert.equal(REP.consultarPlazo('2026-10-20', '2026-10-13').pagoFuturo, true);
  assert.equal(REP.consultarPlazo('2026-10-20', '2026-10-25').pagoFuturo, false);
  assert.equal(REP.consultarPlazo('2026-10-20', 'no-es-fecha').plazo, null);
});

test('rep: lleva o no lleva, la tabla completa de combinaciones', () => {
  const t = (metodo, forma, cobro) => REP.llevaRep({ metodo, forma, cobro });
  assert.deepEqual(t('PPD', '99'), { resultado: 'SI', fundamento: ['cff-29-a', 'rmf-2.7.1.32'], avisos: [] });
  assert.deepEqual(t('PPD', 'OTRA'), { resultado: 'SI', fundamento: ['cff-29-a', 'rmf-2.7.1.32'], avisos: ['FORMA_NO_EVALUADA'] });
  assert.equal(t('PPD', '99', 'COBRADA').resultado, 'SI');
  assert.deepEqual(t('PUE', 'OTRA', 'COBRADA'), { resultado: 'NO', fundamento: ['cff-29-a', 'rmf-2.7.1.39'], avisos: [] });
  assert.deepEqual(t('PUE', 'OTRA', 'MES_ABIERTO'), { resultado: 'NO_POR_AHORA', fundamento: ['rmf-2.7.1.39'], avisos: [] });
  assert.deepEqual(t('PUE', 'OTRA', 'NO_COBRADA'), { resultado: 'SUSTITUIR', fundamento: ['rmf-2.7.1.39', 'cff-29-a'], avisos: [] });
  for (const c of ['COBRADA', 'MES_ABIERTO', 'NO_COBRADA', undefined]) {
    assert.deepEqual(t('PUE', '99', c), { resultado: 'NO_CUBIERTO', fundamento: [], avisos: ['PUE_CON_99'] });
  }
});

test('rep: deben FALLAR los datos incompletos o desconocidos (no hay veredicto)', () => {
  for (const d of [undefined, {}, { metodo: 'PUE' }, { metodo: 'PUE', forma: 'OTRA' }, { metodo: 'XXX', forma: '99' },
    { metodo: 'ppd', forma: '99' }, { metodo: 'PPD', forma: '03' }, { metodo: 'PUE', forma: 'OTRA', cobro: 'QUIZA' }]) {
    assert.equal(REP.llevaRep(d).resultado, 'FALTAN_DATOS', JSON.stringify(d));
  }
});
