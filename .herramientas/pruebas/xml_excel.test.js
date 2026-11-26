'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../../herramientas/xml-a-excel/xml_excel.js');

const CFDI_EJEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="102"
  Fecha="2026-11-15T10:30:00" FormaPago="03" SubTotal="1000.00" Descuento="50.00"
  Moneda="MXN" Total="1102.00" TipoDeComprobante="I" MetodoPago="PUE">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="PROVEEDOR, S.A. DE C.V." RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB020202BBB" Nombre="CLIENTE &quot;NORTE&quot;" UsoCFDI="G03"/>
  <cfdi:Impuestos TotalImpuestosTrasladados="152.00" TotalImpuestosRetenidos="0.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="950.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="152.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="11111111-2222-3333-4444-555555555555" FechaTimbrado="2026-11-15T10:30:05"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

test('xml-a-excel: extrae todos los campos clave de un CFDI 4.0', () => {
  const f = X.leerFila('factura1.xml', CFDI_EJEMPLO);
  assert.equal(f.estado, 'OK');
  assert.equal(f.version, '4.0');
  assert.equal(f.tipo, 'I');
  assert.equal(f.serie, 'A');
  assert.equal(f.folio, '102');
  assert.equal(f.uuid, '11111111-2222-3333-4444-555555555555');
  assert.equal(f.rfcEmisor, 'AAA010101AAA');
  assert.equal(f.nombreEmisor, 'PROVEEDOR, S.A. DE C.V.');
  assert.equal(f.regimenEmisor, '601');
  assert.equal(f.rfcReceptor, 'BBB020202BBB');
  assert.equal(f.nombreReceptor, 'CLIENTE "NORTE"');
  assert.equal(f.usoCfdi, 'G03');
  assert.equal(f.metodoPago, 'PUE');
  assert.equal(f.formaPago, '03');
  assert.equal(f.subtotal, '1000.00');
  assert.equal(f.descuento, '50.00');
  assert.equal(f.ivaTrasladado, '152.00');
  assert.equal(f.totalTrasladados, '152.00');
  assert.equal(f.total, '1102.00');
  assert.equal(f.observacion, '');
});

test('xml-a-excel: distingue XML que no es CFDI y XML mal formado', () => {
  const noCfdi = X.leerFila('otro.xml', '<Documento id="1"/>');
  assert.equal(noCfdi.estado, 'NO_ES_CFDI');
  const roto = X.leerFila('roto.xml', '<cfdi:Comprobante');
  assert.equal(roto.estado, 'ILEGIBLE');
  assert.ok(roto.observacion.length > 0);
});

test('xml-a-excel: genera CSV RFC 4180 escapando comas y comillas', () => {
  const f = X.leerFila('f1.xml', CFDI_EJEMPLO);
  const out = X.csv([f]);
  const lineas = out.split('\r\n');
  assert.equal(lineas.length, 3); // encabezado, fila, final vacio
  assert.ok(lineas[0].startsWith('Archivo,Estado,Versión,Tipo,Fecha,'));
  assert.ok(lineas[1].includes('"PROVEEDOR, S.A. DE C.V."'));
  assert.ok(lineas[1].includes('"CLIENTE ""NORTE"""'));
  assert.ok(lineas[1].includes(',1000.00,50.00,152.00,152.00,0.00,1102.00,'));
});
