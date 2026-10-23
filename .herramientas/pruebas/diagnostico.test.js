'use strict';
// Diagnostico del mes: el MISMO XML por las tres herramientas (iva-del-mes, lista-69b, complemento-de-pago) y por el
// diagnostico da las mismas cifras y los mismos hallazgos. Los XML son los vectores INVENTADOS del IVA del mes (generados
// ejecutando la cadena del programa, ver iva.test.js); ninguno sale de datos de cliente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const RAIZ = path.join(__dirname, '..', '..');
const Dm = require(path.join(RAIZ, 'herramientas', 'iva-del-mes', 'decimal.js'));
const CFDI = require(path.join(RAIZ, 'herramientas', 'verificar-factura', 'cfdi.js'));
const IVA = require(path.join(RAIZ, 'herramientas', 'iva-del-mes', 'iva.js'))(Dm, CFDI.leerXml);
IVA.configurar(require(path.join('..', 'datos', 'iva.json')));
const L = require(path.join(RAIZ, 'herramientas', 'lista-69b', 'lista69b.js'));
const REP = require(path.join(RAIZ, 'herramientas', 'complemento-de-pago', 'rep.js'));
const DG = require(path.join(RAIZ, 'herramientas', 'diagnostico-del-mes', 'diagnostico.js'))(IVA, L, REP);
const V = require(path.join('..', 'vectores', 'iva.json'));
const CASOS = JSON.parse(zlib.gunzipSync(Buffer.from(V.casos_gz, 'base64')).toString('utf8'));
const archivos = caso => caso.xml.map((x, i) => ({ nombre: `f${i}.xml`, texto: x }));

test('diagnostico: el mismo XML da las mismas cifras y hallazgos que las tres herramientas', () => {
  let con69 = 0, conRep = 0;
  CASOS.forEach((caso, i) => {
    const a = archivos(caso);
    const d = DG.diagnosticar(a, V.propio, V.periodo, V.listado_prueba);
    // (1) IVA del mes: la estimacion de iva-del-mes, entera
    const iva = IVA.estimar(a, V.propio, V.periodo, V.listado_prueba);
    assert.equal(d.ok, true);
    assert.deepEqual(d.iva, iva.resultado, `caso ${i}: IVA`);
    // (2) lista 69-B: los emisores de las facturas recibidas, consultados uno por uno en la herramienta 69-B
    const leidos = caso.xml.map(x => IVA.leer(x).m);
    const emisores = L.leerRfcs(leidos.filter(m => m.receptor_rfc === V.propio && m.emisor_rfc !== V.propio).map(m => m.emisor_rfc).join(' ')).validos;
    const enLista = emisores.filter(r => L.consultar(V.listado_prueba, r).aparece).sort();
    assert.deepEqual(d.efos.map(e => e.rfc).sort(), enLista, `caso ${i}: emisores en la 69-B`);
    for (const e of d.efos) {
      const c = L.consultar(V.listado_prueba, e.rfc);
      assert.ok(c.registros.some(x => x.codigo === e.codigo), `caso ${i}: la situacion de ${e.rfc} es la del listado`);
      const suyas = leidos.filter(m => m.emisor_rfc === e.rfc && m.receptor_rfc === V.propio).map(m => m.uuid.toUpperCase()).sort();
      assert.deepEqual(e.facturas.map(f => String(f.uuid).toUpperCase()).sort(), suyas, `caso ${i}: las facturas de ${e.rfc}`);
      for (const f of e.facturas) {  // el importe que se ensena de cada factura es el de su XML
        const m = leidos.find(x => x.uuid.toUpperCase() === String(f.uuid).toUpperCase());
        assert.equal(f.total, Dm.texto(Dm.centavos(m.total)), `caso ${i}: total de ${f.uuid}`);
        assert.equal(f.iva, Dm.texto(Dm.centavos(m.iva_total_traslados)), `caso ${i}: IVA de ${f.uuid}`);
      }
      con69++;
    }
    // (3) complemento de pago: cada factura sin complemento es PPD, y la herramienta del REP dice que lleva complemento
    const porUuid = {};
    leidos.forEach(m => { porUuid[m.uuid.toUpperCase()] = m; });
    assert.deepEqual(d.rep.emitidas, iva.ppd_sin_cobrar, `caso ${i}: PPD emitidas sin complemento`);
    assert.deepEqual(d.rep.recibidas, iva.ppd_sin_pagar, `caso ${i}: PPD recibidas sin complemento`);
    for (const f of d.rep.emitidas.concat(d.rep.recibidas)) {
      const m = porUuid[String(f.uuid).toUpperCase()];
      assert.equal(m.metodo_pago, 'PPD', `caso ${i}: ${f.uuid} es PPD`);
      assert.equal(REP.llevaRep({ metodo: m.metodo_pago, forma: m.forma_pago === '99' ? '99' : 'OTRA' }).resultado, 'SI');
      conRep++;
    }
    assert.deepEqual(d.rep.fundamento, REP.llevaRep({ metodo: 'PPD', forma: '99' }).fundamento);
  });
  assert.ok(con69 >= 100 && conRep >= 100, `calibracion: los vectores ejercitan los dos hallazgos (${con69} de 69-B, ${conRep} PPD)`);
});

test('diagnostico: deduce el RFC y el mes de los propios XML y, si hay empate, no adivina', () => {
  let resueltos = 0;
  CASOS.forEach((caso, i) => {
    const d = DG.deducir(archivos(caso));
    assert.equal(d.periodo, V.periodo, `caso ${i}: mes`);
    if (d.rfc !== null) { assert.equal(d.rfc, V.propio, `caso ${i}: RFC`); resueltos++; }
    else assert.ok(d.rfc_empate.includes(V.propio), `caso ${i}: el propio esta entre los empatados`);
  });
  assert.ok(resueltos >= 140, `calibracion: casi todos los casos se resuelven solos (${resueltos})`);
  // un solo XML: emisor y receptor empatan -> se pregunta
  const uno = CASOS.find(c => c.xml.length === 1);
  assert.equal(DG.deducir(archivos(uno)).rfc, null);
  // dos meses con el mismo numero de comprobantes -> se pregunta el mes
  const pue = CASOS.flatMap(c => c.xml).filter(x => x.includes('TipoDeComprobante="I"') && x.includes('Emisor Rfc="' + V.propio)).slice(0, 2);
  const mezcla = [{ nombre: 'a.xml', texto: pue[0] }, { nombre: 'b.xml', texto: pue[1].replace(/Fecha="2026-05-/, 'Fecha="2026-04-') }];
  assert.equal(DG.deducir(mezcla).periodo, null);
  assert.deepEqual(DG.deducir(mezcla).periodo_empate.sort(), ['2026-04', '2026-05']);
});

test('diagnostico: lo ilegible y lo de otro mes se cuentan y se muestran, no desaparecen', () => {
  const base = archivos(CASOS.find(c => c.xml.length >= 3 && c.xml.every(x => x.includes('TipoDeComprobante="I"'))));
  const roto = base.concat([{ nombre: 'roto.xml', texto: '<cfdi:Comprobante' }]);
  const d = DG.diagnosticar(roto, V.propio, V.periodo, V.listado_prueba);
  assert.equal(d.estimacion.ilegibles.length, 1);
  assert.equal(d.estimacion.ilegibles[0].nombre, 'roto.xml');
  assert.equal(d.iva, null, 'con un archivo ilegible no hay cifra de IVA (falla cerrado)');
  assert.equal(d.leidos, base.length + 1);
  const otro = base.map((a, i) => i === 0 ? { nombre: a.nombre, texto: a.texto.replace(/Fecha="2026-05-/, 'Fecha="2026-04-') } : a);
  const d2 = DG.diagnosticar(otro, V.propio, V.periodo, V.listado_prueba);
  assert.equal(d2.estimacion.otro_mes.length, 1);
  assert.equal(d2.estimacion.otro_mes[0].nombre, base[0].nombre);
});

test('diagnostico: la pagina no tiene logica fiscal propia ni una cuarta lectura de XML', () => {
  const src = fs.readFileSync(path.join(RAIZ, 'herramientas', 'diagnostico-del-mes', 'pagina.js'), 'utf8');
  // SUJETO = el fuente (regla #15): la pagina pinta; las cifras salen de diagnostico.js, que compone las tres herramientas
  assert.doesNotMatch(src, /DOMParser|getElementsByTagName|parseFloat|\* ?0\.16|TrasladosIVA/, 'la pagina no lee XML ni calcula');
  assert.match(src, /TCDiagnostico\(/);
});

test('diagnostico: los datos de ejemplo son inventados y no senalan a nadie del listado 69-B real', () => {
  const EJ = JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas', 'diagnostico-del-mes', 'ejemplo.json'), 'utf8'));
  const REAL = require(path.join(RAIZ, 'herramientas', 'lista-69b', 'listado.json'));
  assert.equal(EJ.rfc, V.propio, 'el RFC del ejemplo es el inventado de los vectores');
  const todos = new Set(CASOS.flatMap(c => c.xml));
  assert.ok(EJ.archivos.length >= 6 && EJ.archivos.every(a => todos.has(a.texto)), 'cada XML del ejemplo es de los vectores inventados');
  const rfcs = new Set(EJ.archivos.flatMap(a => { const m = IVA.leer(a.texto).m; return [m.emisor_rfc, m.receptor_rfc]; }));
  for (const r of rfcs) assert.equal(L.consultar(REAL, r).aparece, false, `${r} no esta en el listado real`);
  const d = DG.diagnosticar(EJ.archivos, EJ.rfc, EJ.periodo, REAL);
  assert.ok(d.iva && d.rep.emitidas.length + d.rep.recibidas.length > 0, 'el ejemplo ensena una cifra y PPD sin complemento');
  assert.equal(DG.deducir(EJ.archivos).rfc, EJ.rfc);
  assert.equal(DG.deducir(EJ.archivos).periodo, EJ.periodo);
});

test('diagnostico: el fundamento de cada resultado es el de la herramienta de la que sale', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'herramientas', 'diagnostico-del-mes', 'index.html'), 'utf8');
  const plantilla = id => { const i = html.indexOf(`<template id="${id}">`); return i < 0 ? '' : html.slice(i, html.indexOf('</template>', i)); };
  // complemento de pago: los dos fundamentos que da rep.llevaRep para una PPD (ids de rep.js -> cita publicada)
  const CITA = { 'cff-29-a': 'Código Fiscal de la Federación, artículo 29-A', 'rmf-2.7.1.32': 'Resolución Miscelánea Fiscal para 2026, regla 2.7.1.32' };
  const rep = plantilla('fund-rep');
  for (const k of REP.llevaRep({ metodo: 'PPD', forma: '99' }).fundamento) assert.ok(rep.includes(CITA[k]), `fund-rep cita ${k}`);
  assert.match(plantilla('fund-69b'), /Código Fiscal de la Federación, artículo 69-B/);
  assert.match(plantilla('fund-iva'), /Ley del IVA, artículo 1o\.-B[\s\S]*Ley del IVA, artículo 5/);
  for (const id of ['fund-iva', 'fund-69b', 'fund-rep']) assert.match(plantilla(id), /Revisada el \d+ de [a-z]+ de \d{4}/, `${id}: con su fecha`);
});
