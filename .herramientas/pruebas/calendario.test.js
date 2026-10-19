'use strict';
// Pruebas del calendario del dia 17 contra los vectores generados EJECUTANDO calendario_obligaciones del programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const C = require(path.join(RAIZ, 'herramientas', 'calendario-dia-17', 'calendario.js'));
const DATOS = require(path.join(RAIZ, 'herramientas', 'calendario-dia-17', 'calendario-datos.js'));
const FUENTE = require(path.join('..', 'datos', 'calendario.json'));
const V = require(path.join('..', 'vectores', 'calendario.json'));
const cal = C.crear(DATOS);
const RFCS = [...'0123456789'].map(d => `XAXX0${d}0${d}0${d}AB${d}`);

test('calendario: los datos publicados son los del programa, tal cual', () => {
  const sin = o => { const c = Object.assign({}, o); delete c._nota; return c; };
  assert.deepEqual(sin(DATOS), sin(FUENTE));
  assert.deepEqual(DATOS.anios, [2026, 2027]);
  assert.equal(DATOS.transmision_hasta, 2018);
  for (const f of Object.values(DATOS.fuentes)) assert.match(f.url, /^https:\/\/(www\.diputados\.gob\.mx|www\.sat\.gob\.mx|dof\.gob\.mx)\//);
});

test('calendario: hay vectores de 2015 a 2040 y del caso de la transmision', () => {
  assert.equal(Object.keys(V.inhabiles).length, 26);
  assert.equal(V.limite.length, 26 * 12);
  assert.ok(V.inhabiles['2018'].includes('2018-12-01'), 'el 1 de diciembre de 2018 es inhabil en el programa');
  assert.ok(!V.inhabiles['2024'].includes('2024-12-01') && !V.inhabiles['2030'].includes('2030-12-01'));
  // la duda de la transmision mueve fechas en otros anos (el instrumento la ve) y en los elegibles no
  assert.ok(V.transmision.anios_que_se_mueven.length > 0);
  for (const a of DATOS.anios) assert.ok(!V.transmision.anios_que_se_mueven.includes(a), a);
});

test('calendario: dias inhabiles del CFF 12 iguales al programa, ano por ano', () => {
  for (const [a, lista] of Object.entries(V.inhabiles)) assert.deepEqual(cal.inhabiles(+a), lista, a);
});

test('calendario: habil y recorrido iguales al programa, dia por dia (2015-2040)', () => {
  let n = 0;
  for (const [a, lista] of Object.entries(V.no_habiles)) {
    const no = new Set(lista);
    for (let t = Date.UTC(+a, 0, 1); t <= Date.UTC(+a, 11, 31); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      assert.equal(cal.esHabil(iso), !no.has(iso), iso);
      assert.equal(cal.recorrer(iso), no.has(iso) ? V.recorrer[iso] : iso, iso);
      assert.equal(cal.motivo(iso) !== null, no.has(iso), iso);
      n++;
    }
  }
  assert.equal(n, 9497);
});

test('calendario: dias extra por RFC iguales al programa', () => {
  for (const x of V.dias_extra) assert.equal(cal.diasExtraRfc(x.rfc), x.dias, String(x.rfc));
  for (const d of '0123456789') assert.equal(cal.diasExtraRfc(RFCS[+d]), DATOS.dias_por_digito[d]);
});

test('calendario: fecha limite del dia 17, DIOT y facilidad iguales al programa (312 meses x 12)', () => {
  for (const x of V.limite) {
    const k = `${x.a}-${x.m}`;
    assert.equal(cal.fechaLimite(x.a, x.m, RFCS[0], 'ISR'), x.base, k);
    assert.equal(cal.fechaLimite(x.a, x.m, RFCS[0], 'DIOT'), x.diot, k);
    assert.equal(cal.fechaLimite(x.a, x.m, RFCS[9], 'DIOT', true), x.diot, `${k} la DIOT no lleva facilidad`);
    RFCS.forEach((r, i) => assert.equal(cal.fechaLimite(x.a, x.m, r, 'ISR', true), x.prorroga[i], `${k} digito ${i}`));
    for (const p of [undefined, false, 'si', 1]) assert.equal(cal.fechaLimite(x.a, x.m, RFCS[9], 'ISR', p), x.base, `${k} sin un si explicito`);
  }
});

test('calendario: la vista de 12 meses coincide con fecha_limite del programa', () => {
  for (const a of DATOS.anios) {
    const sin = cal.calendario(a, '');
    assert.equal(sin.ok, true);
    assert.equal(sin.sextoDigito, null);
    RFCS.forEach((r, i) => {
      const con = cal.calendario(a, r);
      assert.equal(con.sextoDigito, String(i));
      con.meses.forEach((x, j) => {
        const v = V.limite.find(y => y.a === a && y.m === j + 1);
        assert.equal(x.dia17.limite, v.base);
        assert.equal(x.diot.limite, v.diot);
        assert.equal(x.prorroga, v.prorroga[i]);
        assert.equal(sin.meses[j].prorroga, null);
        assert.equal(x.dia17.motivo !== null, x.dia17.original !== x.dia17.limite);
      });
    });
  }
});

test('calendario: casos con nombre', () => {
  const c26 = cal.calendario(2026, '');
  assert.deepEqual(c26.meses[8].dia17, { original: '2026-10-17', limite: '2026-10-19', motivo: 'SABADO' });
  assert.deepEqual(c26.meses[11].diot, { original: '2027-01-31', limite: '2027-02-02', motivo: 'DOMINGO' });
  assert.equal(cal.motivo('2027-02-01'), 'CONSTITUCION');
  assert.equal(cal.motivo('2027-05-01'), 'SABADO');
  assert.equal(cal.festivo('2027-05-01'), 'TRABAJO', 'el inhabil del CFF 12 se nombra aunque caiga en sabado');
  for (const [a, lista] of Object.entries(V.inhabiles)) for (const f of lista) assert.ok(cal.festivo(f), f);
  assert.equal(c26.meses[5].diot.limite, '2026-07-31', 'las vacaciones del SAT de julio no recorren la DIOT');
  assert.equal(c26.meses[2].dia17.limite, '2026-04-17', 'un viernes 17 se queda en viernes');
  assert.equal(cal.calendario(2026, 'XIQB891116QE4').diasExtra, 3, 'digitos 8-9-1-1-1-6: el sexto es 6 -> 3 dias');
});

test('calendario: fuera de los anos elegibles no da fechas', () => {
  for (const a of [2025, 2028, 2030, 'x', '']) assert.deepEqual(cal.calendario(a, ''), { ok: false, motivo: 'FUERA_DE_ANIOS', anios: [2026, 2027] }, String(a));
  const c = cal.calendario(2026, 'ABC123');
  assert.equal(c.sextoDigito, null);
  assert.equal(c.conRfc, true);
});
