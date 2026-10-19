'use strict';
// Pruebas de «verificar factura» contra los XML inventados y los vectores generados ejecutando el programa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const CFDI = require(path.join(RAIZ, 'herramientas', 'verificar-factura', 'cfdi.js'));
const V = require(path.join('..', 'vectores', 'cfdi.json'));
const leer = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'cfdi', n), 'utf8');
const params = url => Object.fromEntries(new URL(url).searchParams);

test('cfdi: hay vectores de todas las clases', () => {
  assert.ok(V.casos.length >= 18);
  assert.ok(V.casos.filter(c => c.enlace_producto).length >= 10);
  assert.ok(V.casos.filter(c => !c.producto_lee).length >= 4);
});

test('cfdi: el programa y la pagina leen los mismos datos de cada XML que el programa acepta', () => {
  for (const c of V.casos.filter(x => x.producto_lee)) {
    const r = CFDI.analizar(leer(c.archivo));
    const p = c.producto;
    assert.equal(r.version, p.version, c.archivo);
    assert.equal(r.uuid, p.uuid || '', c.archivo);
    assert.equal(r.rfcEmisor, p.emisor_rfc, c.archivo);
    assert.equal(r.rfcReceptor, p.receptor_rfc, c.archivo);
    assert.equal(r.fecha, p.fecha, c.archivo);
    assert.equal(r.tipo, p.tipo, c.archivo);
    if (r.total) assert.equal(Number(r.total), Number(p.total), c.archivo);
  }
});

test('cfdi: el enlace de verificacion lleva los mismos cinco datos que el QR del programa', () => {
  for (const c of V.casos.filter(x => x.enlace_producto)) {
    const r = CFDI.analizar(leer(c.archivo));
    assert.ok(r.enlace, c.archivo);
    assert.ok(r.enlace.startsWith('https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?'), c.archivo);
    assert.deepEqual(params(r.enlace), c.enlace_producto, c.archivo);
  }
});

test('cfdi: un RFC con & o con Ñ no rompe el enlace', () => {
  const amp = CFDI.analizar(leer('05_receptor_con_ampersand.xml'));
  assert.ok(amp.enlace.includes('rr=H%26E951128469'));
  assert.equal(params(amp.enlace).rr, 'H&E951128469');
  const enie = CFDI.analizar(leer('11_enie_en_rfc.xml'));
  assert.equal(params(enie.enlace).re, 'OÑO120726RX3');
});

test('cfdi: estado de cada XML de prueba', () => {
  const esperado = {
    '01_cfdi40_ingreso.xml': 'COMPLETO', '02_cfdi33_ingreso.xml': 'COMPLETO', '03_pago20_total_cero.xml': 'COMPLETO',
    '04_sin_timbre.xml': 'INCOMPLETO', '05_receptor_con_ampersand.xml': 'COMPLETO', '06_total_sin_decimales.xml': 'COMPLETO',
    '07_total_con_seis_decimales.xml': 'COMPLETO', '08_uuid_minusculas.xml': 'COMPLETO', '09_con_bom.xml': 'COMPLETO',
    '10_receptor_extranjero_generico.xml': 'COMPLETO', '11_enie_en_rfc.xml': 'COMPLETO', '12_falta_sello_y_total.xml': 'INCOMPLETO',
    '13_sin_receptor.xml': 'INCOMPLETO', '14_no_es_cfdi.xml': 'NO_ES_CFDI', '15_xml_roto.xml': 'ILEGIBLE', '16_retenciones.xml': 'NO_ES_CFDI',
    '17_vacio.xml': 'ILEGIBLE', '18_sello_corto.xml': 'COMPLETO', '19_atributos_con_comillas_simples.xml': 'COMPLETO',
    '20_entidad_numerica.xml': 'COMPLETO',
  };
  assert.equal(Object.keys(esperado).length, V.casos.length, 'cada XML de prueba tiene su estado esperado');
  for (const [n, e] of Object.entries(esperado)) assert.equal(CFDI.analizar(leer(n)).estado, e, n);
});

test('cfdi: deben FALLAR, lo incompleto dice que falta y no inventa un enlace', () => {
  const s = CFDI.analizar(leer('04_sin_timbre.xml'));
  assert.deepEqual(s.faltan, ['timbre fiscal digital (UUID)']);
  assert.equal(s.enlace, null);
  const f = CFDI.analizar(leer('12_falta_sello_y_total.xml'));
  assert.deepEqual(f.faltan, ['total', 'sello del emisor']);
  assert.equal(f.enlace, null);
  assert.deepEqual(CFDI.analizar(leer('13_sin_receptor.xml')).faltan, ['receptor']);
  for (const n of ['14_no_es_cfdi.xml', '15_xml_roto.xml', '16_retenciones.xml', '17_vacio.xml']) assert.equal(CFDI.analizar(leer(n)).enlace, null, n);
  assert.equal(CFDI.analizar(leer('20_entidad_numerica.xml')).nombreEmisor, 'ESCUELA KEMPER URGATE');
});

test('cfdi: total con seis decimales exactos, sin coma flotante', () => {
  const t = CFDI.totalSeisDecimales;
  assert.equal(t('1160'), '1160.000000');
  assert.equal(t('0.1'), '0.100000');
  assert.equal(t('00012.5'), '12.500000');
  assert.equal(t('99999999999999999.99'), '99999999999999999.990000');
  for (const x of ['', '-1', '1.1234567', '1,000.00', 'abc', null]) assert.equal(t(x), null, String(x));
});

test('cfdi: el lector de XML rechaza documentos mal formados', () => {
  for (const x of ['<a><b></a>', '<a><b></c></a>', '<a>', '<a/><b/>', '<!DOCTYPE a><a/>', '<a x="1></a>', 'texto', '<!-- sin cerrar <a/>'])
    assert.throws(() => CFDI.leerXml(x), undefined, x);
  assert.equal(CFDI.leerXml('<a:b xmlns:a="u"><c d="&lt;&#65;&#x42;&amp;"/></a:b>').hijos[0].attrs.d, '<AB&');
});
