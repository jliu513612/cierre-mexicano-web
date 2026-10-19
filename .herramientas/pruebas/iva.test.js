'use strict';
// Pruebas del «IVA del mes» contra vectores generados EJECUTANDO la cadena del programa
// (enriquecedor_v2.parse_cfdi_v2 -> cargar_cfdis_enriquecidos -> calculador_iva_v2.calcular), ver .herramientas/oraculo_iva.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const zlib = require('node:zlib');
const RAIZ = path.join(__dirname, '..', '..');
const Dm = require(path.join(RAIZ, 'herramientas', 'iva-del-mes', 'decimal.js'));
const CFDI = require(path.join(RAIZ, 'herramientas', 'verificar-factura', 'cfdi.js'));
const fabrica = require(path.join(RAIZ, 'herramientas', 'iva-del-mes', 'iva.js'));
const DATOS = require(path.join('..', 'datos', 'iva.json'));
const V = require(path.join('..', 'vectores', 'iva.json'));
const CASOS = JSON.parse(zlib.gunzipSync(Buffer.from(V.casos_gz, 'base64')).toString('utf8'));
const IVA = fabrica(Dm, CFDI.leerXml);
IVA.configurar(DATOS);

const CAMPOS = ['iva_estado', 'iva_causado_16', 'iva_causado_8', 'iva_causado_total', 'iva_acreditable', 'iva_retenido_a_terceros',
  'entero_retenciones', 'iva_retenido_al_contribuyente', 'iva_retenido_al_contribuyente_aplicado',
  'iva_retenido_al_contribuyente_remanente', 'iva_neto', 'tipo', 'monto_a_pagar', 'saldo_a_favor_para_arrastrar'];

/* El valor de un campo del metadato: los importes se comparan por VALOR (el programa los guarda como float). */
function igual(a, b) {
  if (a === null || b === null || typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (typeof a === 'object' && typeof a.c === 'bigint') return Dm.comparar(a, Dm.de(String(b))) === 0;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && a.every((x, i) => igual(x, b[i]));
  if (typeof b === 'object') return Object.keys(b).every(k => igual(a[k], b[k]));
  return String(a) === String(b);
}

function correr(caso) {
  const cfdis = caso.xml.map(x => {
    const r = IVA.leer(x);
    assert.ok(r.ok, r.ok ? '' : JSON.stringify(r));
    const dir = r.m.emisor_rfc === V.propio ? 'emitido' : 'recibido';
    return IVA.cargar(r.m, dir, IVA.efosDe(V.listado_prueba, r.m.emisor_rfc));
  });
  return IVA.calcular(cfdis, V.periodo);
}

test('iva: hay casos de todas las exclusiones que el corte soporta', () => {
  assert.equal(CASOS.length, V.n_casos);
  const vistas = new Set(CASOS.flatMap(c => Object.keys(c.salida.exclusiones)));
  for (const k of ['deduccion_personal', 'rep_otro_mes', 'tc_faltante', 'formas_pago_sin_confirmar', 'efectivo_no_deducible',
    'libro_de_pagos', 'rep_sobre_pue', 'efos_no_acreditable', 'efos_definitivo_sin_fecha']) assert.ok(vistas.has(k), k);
  assert.ok(CASOS.some(c => c.salida.iva_estado === 'NO_DETERMINADO') && CASOS.some(c => c.salida.iva_estado === 'DETERMINADO'));
});

test('iva: la lectura de cada XML da lo mismo que enriquecedor_v2.parse_cfdi_v2', () => {
  let n = 0;
  for (const caso of CASOS) {
    caso.xml.forEach((x, i) => {
      const r = IVA.leer(x), e = caso.m[i];
      assert.ok(r.ok, r.ok ? '' : JSON.stringify(r));
      for (const k of Object.keys(e)) {
        if (k === 'drs') continue;
        if (k === 'conceptos') {  // solo lo que el calculo lee de cada concepto
          const sub = l => l.map(c => ({ importe: c.importe, objeto_imp: c.objeto_imp, descuento: c.descuento, tasas: c.tasas }));
          assert.ok(igual(sub(r.m.conceptos), sub(e.conceptos)), 'conceptos'); continue;
        }
        assert.ok(igual(r.m[k], e[k]), `${k}: ${JSON.stringify(r.m[k], (a, b) => typeof b === 'bigint' ? String(b) : b)} vs ${JSON.stringify(e[k])}`);
      }
      if (e.drs) {
        const drs = r.m.complemento_pago.documentos_relacionados;
        assert.equal(drs.length, e.drs.length);
        drs.forEach((d, j) => { for (const k of Object.keys(e.drs[j])) assert.ok(igual(d[k], e.drs[j][k]), `dr.${k}: ${Dm.texto ? JSON.stringify(d[k], (a, b) => typeof b === 'bigint' ? String(b) : b) : ''} vs ${JSON.stringify(e.drs[j][k])}`); });
      }
      n++;
    });
  }
  assert.ok(n > 700, n);
});

test('iva: la estimacion da lo mismo que calculador_iva_v2.calcular, caso por caso', () => {
  CASOS.forEach((caso, i) => {
    const r = correr(caso), e = caso.salida;
    for (const k of CAMPOS) assert.equal(r[k], e[k], `caso ${i} ${k}`);
    assert.deepEqual(r.pendiente_causado, e.pendiente_causado, `caso ${i} pendientes de causar`);
    assert.deepEqual(r.pendiente_acreditable, e.pendiente_acreditable, `caso ${i} pendientes de acreditar`);
    assert.deepEqual(r.exclusiones, e.exclusiones, `caso ${i} exclusiones`);
  });
});

test('iva: el 69-B elige la misma fila que el programa (todos los RFC con varias filas y una muestra)', () => {
  const pub = require(path.join(RAIZ, 'herramientas', 'lista-69b', 'listado.json'));
  let varias = 0;
  for (const [rfc, [status, def]] of Object.entries(V.eleccion_69b)) {
    const r = IVA.efosDe(pub, rfc);
    assert.equal(r.status, status, rfc);
    assert.equal(r.definitivo || null, def || null, rfc);
    if (pub.r[rfc].length > 1) varias++;
  }
  assert.equal(varias, Object.values(pub.r).filter(f => f.length > 1).length, 'estan TODOS los RFC con varias filas');
});

test('iva: el modo manual da lo mismo que calcular() del programa con los mismos totales', () => {
  assert.ok(V.manual.length >= 200);
  V.manual.forEach((c, i) => {
    const r = IVA.manual(c.entrada);
    for (const k of CAMPOS) assert.equal(r[k], c.salida[k], `manual ${i} ${k}`);
  });
  assert.deepEqual(IVA.manual({ cobrado: 'diez' }), { ok: false, campo: 'cobrado' });
  const r = IVA.manual({ cobrado: '16,000', pagado: '6,000.00', retuviste: '', teRetuvieron: '' });
  assert.equal(r.iva_neto, '10000.00');
  assert.equal(r.monto_a_pagar, '10000.00');
});

const archivos = caso => caso.xml.map((x, i) => ({ nombre: `f${i}.xml`, texto: x }));
const PERIODO = V.periodo, PROPIO = V.propio;

test('iva: la pagina (estimar) da lo mismo que el programa en todos los casos', () => {
  CASOS.forEach((caso, i) => {
    const r = IVA.estimar(archivos(caso), PROPIO.toLowerCase() + ' ', PERIODO, V.listado_prueba);
    assert.equal(r.ok, true);
    assert.equal(r.cerrado, false, `caso ${i}`);
    for (const k of CAMPOS) assert.equal(r.resultado[k], caso.salida[k], `caso ${i} ${k}`);
    assert.equal(r.ppd_sin_cobrar.length, caso.salida.pendiente_causado.length);
  });
});

test('iva: lo que no se soporta deja la estimacion SIN cifra y lo enumera (falla cerrado)', () => {
  const base = CASOS.find(c => c.xml.length >= 2 && c.xml.every(x => x.includes('TipoDeComprobante="I"')));
  assert.ok(base);
  const cambios = [
    ['nota de credito', x => x.replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"')],
    ['relacionados', x => x.replace('<cfdi:Emisor', '<cfdi:CfdiRelacionados TipoRelacion="04"><cfdi:CfdiRelacionado UUID="X"/></cfdi:CfdiRelacionados><cfdi:Emisor')],
    ['IEPS', x => x.replace('Impuesto="002"', 'Impuesto="003"')],
    ['version 3.3', x => x.replace('http://www.sat.gob.mx/cfd/4', 'http://www.sat.gob.mx/cfd/3')],
    ['sin Total', x => x.replace(/ Total="[^"]*"/, '')],
    ['importe ilegible', x => x.replace(/ SubTotal="[^"]*"/, ' SubTotal="diez"')],
    ['XML roto', x => x.slice(0, 200)],
  ];
  for (const [n, f] of cambios) {
    // el caso se elige donde el cambio OCURRE: un reemplazo que no encuentra su patron no probaria nada
    const caso = CASOS.find(c => c.xml.length >= 2 && c.xml.every(x => x.includes('TipoDeComprobante="I"')) && f(c.xml[0]) !== c.xml[0]);
    assert.ok(caso, `${n}: el cambio no ocurre en ningun caso`);
    const a = archivos(caso);
    a[0] = { nombre: 'malo.xml', texto: f(a[0].texto) };
    const r = IVA.estimar(a, PROPIO, PERIODO, V.listado_prueba);
    assert.equal(r.cerrado, true, n);
    assert.equal(r.resultado, undefined, `${n}: no da cifra`);
    assert.equal(r.no_soportados.length + r.ilegibles.length, 1, n);
  }
});

test('iva: otro mes, repetidos y XML ajenos se enumeran y no suman', () => {
  const base = CASOS.find(c => c.xml.length >= 2 && c.xml.every(x => x.includes('TipoDeComprobante="I"')));
  const a = archivos(base);
  const sin = IVA.estimar(a.slice(1), PROPIO, PERIODO, V.listado_prueba);
  const otro = a.map((x, i) => i ? x : { nombre: x.nombre, texto: x.texto.replace(/Fecha="2026-05-/, 'Fecha="2026-06-') });
  assert.notEqual(otro[0].texto, a[0].texto, 'calibracion: el cambio de mes ocurre');
  const r1 = IVA.estimar(otro, PROPIO, PERIODO, V.listado_prueba);
  assert.equal(r1.otro_mes.length, 1);
  assert.equal(r1.usados, a.length - 1, 'el de otro mes no entra al calculo');
  assert.deepEqual(r1.resultado.iva_neto, sin.resultado.iva_neto, 'el de otro mes no suma');
  // y con un documento que SI mueve la cifra: una PUE con IVA, puesta en otro mes
  const pue = CASOS.flatMap(c => c.xml).find(x => x.includes('TipoDeComprobante="I"') && x.includes('MetodoPago="PUE"') && x.includes('Emisor Rfc="' + PROPIO) && /TotalImpuestosTrasladados="[1-9]/.test(x) && !x.includes('Moneda="USD"'));
  const solo = IVA.estimar([{ nombre: 'p.xml', texto: pue }], PROPIO, PERIODO, V.listado_prueba);
  assert.notEqual(solo.resultado.iva_causado_total, '0.00', 'calibracion: la PUE causa IVA en su mes');
  const fuera = IVA.estimar([{ nombre: 'p.xml', texto: pue.replace(/Fecha="2026-05-/, 'Fecha="2026-04-') }], PROPIO, PERIODO, V.listado_prueba);
  assert.equal(fuera.resultado.iva_causado_total, '0.00', 'la misma PUE de otro mes no causa');
  const r2 = IVA.estimar(a.concat([{ nombre: 'copia.xml', texto: a[1].texto }]), PROPIO, PERIODO, V.listado_prueba);
  assert.equal(r2.repetidos.length, 1);
  assert.equal(r2.resultado.iva_neto, IVA.estimar(a, PROPIO, PERIODO, V.listado_prueba).resultado.iva_neto, 'el repetido cuenta una vez');
  const r3 = IVA.estimar(a, 'XAXX010101000', PERIODO, V.listado_prueba);
  assert.equal(r3.ajenos.length, a.length);
  assert.equal(r3.resultado.iva_neto, '0.00');
  assert.deepEqual(IVA.estimar(a, 'NO-ES-RFC', PERIODO, V.listado_prueba), { ok: false, motivo: 'RFC' });
  assert.deepEqual(IVA.estimar(a, PROPIO, '2026-13', V.listado_prueba), { ok: false, motivo: 'PERIODO' });
  assert.equal(IVA.estimar(new Array(501).fill(a[0]), PROPIO, PERIODO, V.listado_prueba).motivo, 'DEMASIADOS');
});

test('iva: un pago de un mes POSTERIOR se enumera y no suma; 08 y 31 recibidos no se soportan', () => {
  const conRep = CASOS.find(c => c.xml.some(x => x.includes('pago20:Pago ') && x.includes('RECEPTOR ' + PROPIO) === false));
  assert.ok(conRep);
  const a = archivos(conRep);
  const i = a.findIndex(x => x.texto.includes('pago20:Pago '));
  const fut = a.map((x, j) => j === i ? { nombre: x.nombre, texto: x.texto.replace(/FechaPago="2026-0[45]-/g, 'FechaPago="2026-06-') } : x);
  const r = IVA.estimar(fut, PROPIO, PERIODO, V.listado_prueba);
  assert.ok(r.pagos_otro_mes.length >= 1);
  const recibida = CASOS.flatMap(c => c.xml).find(x => x.includes('TipoDeComprobante="I"') && x.includes('MetodoPago="PUE"') && x.includes('Receptor Rfc="' + PROPIO));
  const r8 = IVA.estimar([{ nombre: 'v.xml', texto: recibida.replace(/FormaPago="[^"]*"/, 'FormaPago="08"') }], PROPIO, PERIODO, V.listado_prueba);
  assert.equal(r8.cerrado, true);
  assert.match(r8.no_soportados[0].detalle, /08/);
});

test('iva: el 69-B avisa en rojo solo presunto y definitivo; desvirtuado sale neutro con su fecha', () => {
  const hechos = { 'HHHH080808HH8': true, 'GGG070707GG7': true, 'III090909II9': false };
  const plantilla = CASOS.flatMap(c => c.xml).find(x => x.includes('TipoDeComprobante="I"') && x.includes('Receptor Rfc="' + PROPIO));
  const em = /Emisor Rfc="([^"]+)"/.exec(plantilla)[1];
  for (const [rfc, rojo] of Object.entries(hechos)) {
    const x = plantilla.split('Emisor Rfc="' + em + '"').join('Emisor Rfc="' + rfc + '"').replace(/UUID="[^"]+"/, 'UUID="' + rfc + '"');
    const r = IVA.estimar([{ nombre: 'p.xml', texto: x }], PROPIO, PERIODO, V.listado_prueba);
    assert.equal(r.avisos_69b.length, 1, rfc);
    assert.equal(r.avisos_69b[0].rojo, rojo, rfc);
  }
  const r = IVA.estimar([{ nombre: 'p.xml', texto: plantilla.split('Emisor Rfc="' + em + '"').join('Emisor Rfc="III090909II9"') }], PROPIO, PERIODO, V.listado_prueba);
  assert.equal(r.avisos_69b[0].fechas.desvirtuado, '2025-06-01');
});

test('iva: las constantes publicadas son las del programa, tal cual', () => {
  const PUB = require(path.join(RAIZ, 'herramientas', 'iva-del-mes', 'iva-datos.js'));
  const sin = o => { const c = Object.assign({}, o); delete c._nota; return c; };
  assert.deepEqual(sin(PUB), sin(DATOS));
  assert.equal(DATOS.umbral_efectivo_mxn, '2000');
  assert.deepEqual(DATOS.formas_pago_en_dinero, ['01', '02', '03', '04', '05', '06', '28', '29']);
  for (const f of Object.values(DATOS.fuentes)) assert.match(f.url, /^https:\/\/www\.diputados\.gob\.mx\//);
});

test('iva: el decimal da lo mismo que el modulo decimal de Python (28 digitos, al par, con empates)', () => {
  assert.ok(V.decimal.length > 1600);
  for (const [op, a, b, e] of V.decimal) {
    const r = op === 'centavos' ? Dm.centavos(a) : Dm[op](a, b);
    assert.equal(Dm.comparar(r, e), 0, `${op}(${a}, ${b}) = ${Dm.texto(r)}, Python ${e}`);
  }
});
