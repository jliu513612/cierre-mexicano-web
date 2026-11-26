/* Convertir XML (CFDI 3.3 / 4.0) a CSV para Excel en el navegador. Toda la logica vive aqui; pagina.js solo pinta.
   Reutiliza el lector XML sin dependencias de verificar-factura/cfdi.js (TCCfdi.leerXml). Nada sale del equipo.
   Pruebas: .herramientas/pruebas/xml_excel.test.js. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('../verificar-factura/cfdi.js'));
  else raiz.TCXmlExcel = fabrica(raiz.TCCfdi);
})(this, function (Cfdi) {
  'use strict';

  var ENCABEZADOS = [
    'Archivo', 'Estado', 'Versión', 'Tipo', 'Fecha', 'Fecha de timbrado', 'UUID',
    'Serie', 'Folio', 'RFC emisor', 'Nombre emisor', 'Régimen emisor',
    'RFC receptor', 'Nombre receptor', 'Uso CFDI', 'Método de pago', 'Forma de pago',
    'Moneda', 'Tipo de cambio', 'Subtotal', 'Descuento', 'IVA trasladado',
    'Total impuestos trasladados', 'Total impuestos retenidos', 'Total', 'Observación',
  ];

  function hijo(el, local) {
    for (var k = 0; k < el.hijos.length; k++) if (el.hijos[k].local === local) return el.hijos[k];
    return null;
  }

  function hijos(el, local) {
    var out = [];
    for (var k = 0; k < el.hijos.length; k++) if (el.hijos[k].local === local) out.push(el.hijos[k]);
    return out;
  }

  function impuestosNivelComprobante(el) {
    var imp = hijo(el, 'Impuestos');
    if (!imp) return { ivaTrasladado: '', totalTrasladados: '', totalRetenidos: '' };
    var totalTras = imp.attrs.TotalImpuestosTrasladados || '';
    var totalRet = imp.attrs.TotalImpuestosRetenidos || '';
    var trasCont = hijo(imp, 'Traslados');
    var sumaIva = 0, hayIva = false;
    if (trasCont) {
      var lista = hijos(trasCont, 'Traslado');
      for (var i = 0; i < lista.length; i++) {
        var a = lista[i].attrs;
        if (a.Impuesto === '002' && a.Importe !== undefined && a.Importe !== '') {
          var v = Number(a.Importe);
          if (!isNaN(v)) { sumaIva += v; hayIva = true; }
        }
      }
    }
    return {
      ivaTrasladado: hayIva ? sumaIva.toFixed(2) : '',
      totalTrasladados: totalTras,
      totalRetenidos: totalRet,
    };
  }

  /* Extrae una fila plana de un archivo XML CFDI 3.3 o 4.0. */
  function leerFila(nombreArchivo, texto) {
    var base = {
      archivo: String(nombreArchivo || ''), estado: 'ILEGIBLE', version: '', tipo: '',
      fecha: '', fechaTimbrado: '', uuid: '', serie: '', folio: '',
      rfcEmisor: '', nombreEmisor: '', regimenEmisor: '',
      rfcReceptor: '', nombreReceptor: '', usoCfdi: '',
      metodoPago: '', formaPago: '', moneda: '', tipoCambio: '',
      subtotal: '', descuento: '', ivaTrasladado: '',
      totalTrasladados: '', totalRetenidos: '', total: '', observacion: '',
    };
    var el;
    try { el = Cfdi.leerXml(texto); } catch (e) { base.observacion = e && e.message ? e.message : 'XML mal formado'; return base; }
    if (el.local !== 'Comprobante') {
      base.estado = 'NO_ES_CFDI';
      base.observacion = 'Elemento raíz: ' + el.local;
      return base;
    }
    var at = el.attrs;
    var em = hijo(el, 'Emisor'), rec = hijo(el, 'Receptor');
    var comp = hijo(el, 'Complemento'), tfd = comp ? hijo(comp, 'TimbreFiscalDigital') : null;
    var imp = impuestosNivelComprobante(el);
    base.estado = 'OK';
    base.version = at.Version || '';
    base.tipo = at.TipoDeComprobante || '';
    base.fecha = at.Fecha || '';
    base.fechaTimbrado = tfd ? (tfd.attrs.FechaTimbrado || '') : '';
    base.uuid = tfd ? (tfd.attrs.UUID || '') : '';
    base.serie = at.Serie || '';
    base.folio = at.Folio || '';
    base.rfcEmisor = em ? (em.attrs.Rfc || '') : '';
    base.nombreEmisor = em ? (em.attrs.Nombre || '') : '';
    base.regimenEmisor = em ? (em.attrs.RegimenFiscal || '') : '';
    base.rfcReceptor = rec ? (rec.attrs.Rfc || '') : '';
    base.nombreReceptor = rec ? (rec.attrs.Nombre || '') : '';
    base.usoCfdi = rec ? (rec.attrs.UsoCFDI || '') : '';
    base.metodoPago = at.MetodoPago || '';
    base.formaPago = at.FormaPago || '';
    base.moneda = at.Moneda || '';
    base.tipoCambio = at.TipoCambio || '';
    base.subtotal = at.SubTotal || '';
    base.descuento = at.Descuento || '';
    base.ivaTrasladado = imp.ivaTrasladado;
    base.totalTrasladados = imp.totalTrasladados;
    base.totalRetenidos = imp.totalRetenidos;
    base.total = at.Total || '';
    if (!base.uuid) base.observacion = 'Sin timbre fiscal digital (UUID)';
    return base;
  }

  function celda(v) {
    var s = String(v === null || v === undefined ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* Genera CSV RFC 4180 con CRLF. El llamador antepone BOM UTF-8 (\ufeff) al crear el Blob para Excel. */
  function csv(filas) {
    var lineas = [ENCABEZADOS.map(celda).join(',')];
    for (var i = 0; i < filas.length; i++) {
      var f = filas[i];
      lineas.push([
        f.archivo, f.estado, f.version, f.tipo, f.fecha, f.fechaTimbrado, f.uuid,
        f.serie, f.folio, f.rfcEmisor, f.nombreEmisor, f.regimenEmisor,
        f.rfcReceptor, f.nombreReceptor, f.usoCfdi, f.metodoPago, f.formaPago,
        f.moneda, f.tipoCambio, f.subtotal, f.descuento, f.ivaTrasladado,
        f.totalTrasladados, f.totalRetenidos, f.total, f.observacion,
      ].map(celda).join(','));
    }
    return lineas.join('\r\n') + '\r\n';
  }

  return { ENCABEZADOS: ENCABEZADOS, leerFila: leerFila, csv: csv };
});
