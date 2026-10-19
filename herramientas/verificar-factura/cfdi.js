/* Verificar factura (CFDI) de taxcerteza.mx. Toda la logica vive aqui; la pagina solo pinta.
   Lee el XML EN EL NAVEGADOR y arma el enlace de verificacion del SAT (el mismo del codigo QR). NO consulta al SAT.
   Pruebas: .herramientas/pruebas/cfdi.test.js (vectores generados ejecutando el programa: clasificar.parse_cfdi y
   representacion_impresa._qr_datauri).

   El lector de XML es propio y minimo, para que el navegador y las pruebas de node ejecuten EXACTAMENTE el mismo
   codigo (node no trae DOMParser). Solo necesita elementos y atributos: un CFDI no usa DTD. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCCfdi = fabrica();
})(this, function () {
  'use strict';

  var BASE_SAT = 'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx';
  var ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function desescapar(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function (todo, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(n) ? todo : String.fromCodePoint(n);
      }
      return Object.prototype.hasOwnProperty.call(ENTIDADES, e) ? ENTIDADES[e] : todo;
    });
  }

  /* Devuelve el elemento raiz {nombre, local, attrs, hijos} o lanza Error si el XML no esta bien formado. */
  function leerXml(texto) {
    var s = String(texto).replace(/^﻿/, '');
    var i = 0, pila = [], raizEl = null;
    var RE_ATR = /([^\s=\/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    while (i < s.length) {
      var lt = s.indexOf('<', i);
      if (lt < 0) { if (s.slice(i).trim() && !pila.length) throw new Error('texto fuera del elemento raiz'); break; }
      if (s.startsWith('<!--', lt)) { var fc = s.indexOf('-->', lt + 4); if (fc < 0) throw new Error('comentario sin cerrar'); i = fc + 3; continue; }
      if (s.startsWith('<?', lt)) { var fp = s.indexOf('?>', lt + 2); if (fp < 0) throw new Error('instruccion sin cerrar'); i = fp + 2; continue; }
      if (s.startsWith('<![CDATA[', lt)) { var fd = s.indexOf(']]>', lt); if (fd < 0) throw new Error('CDATA sin cerrar'); i = fd + 3; continue; }
      if (s.startsWith('<!', lt)) throw new Error('declaracion no admitida');
      var gt = lt + 1, comilla = null;
      for (; gt < s.length; gt++) {
        var c = s.charAt(gt);
        if (comilla) { if (c === comilla) comilla = null; }
        else if (c === '"' || c === "'") comilla = c;
        else if (c === '>') break;
      }
      if (gt >= s.length) throw new Error('etiqueta sin cerrar');
      var dentro = s.slice(lt + 1, gt);
      i = gt + 1;
      if (dentro.charAt(0) === '/') {
        var cierra = dentro.slice(1).trim(), abierto = pila.pop();
        if (!abierto || abierto.nombre !== cierra) throw new Error('cierre que no corresponde: ' + cierra);
        continue;
      }
      var autocierre = /\/\s*$/.test(dentro);
      if (autocierre) dentro = dentro.replace(/\/\s*$/, '');
      var m = /^([^\s\/>]+)/.exec(dentro);
      if (!m) throw new Error('etiqueta sin nombre');
      var el = { nombre: m[1], local: m[1].split(':').pop(), attrs: {}, hijos: [] };
      var resto = dentro.slice(m[1].length), a;
      RE_ATR.lastIndex = 0;
      while ((a = RE_ATR.exec(resto))) el.attrs[a[1]] = desescapar(a[3] !== undefined ? a[3] : a[4]);
      if (pila.length) pila[pila.length - 1].hijos.push(el);
      else if (raizEl) throw new Error('mas de un elemento raiz');
      else raizEl = el;
      if (!autocierre) pila.push(el);
    }
    if (pila.length) throw new Error('elemento sin cerrar: ' + pila[pila.length - 1].nombre);
    if (!raizEl) throw new Error('documento vacio');
    return raizEl;
  }

  function hijo(el, local) {
    for (var k = 0; k < el.hijos.length; k++) if (el.hijos[k].local === local) return el.hijos[k];
    return null;
  }

  /* El total con 6 decimales, como lo arma el programa (representacion_impresa: Decimal(total) con :.6f).
     Texto exacto, sin pasar por numeros de coma flotante. */
  function totalSeisDecimales(t) {
    var m = /^\s*(\d+)(?:\.(\d*))?\s*$/.exec(String(t === undefined || t === null ? '' : t));
    if (!m) return null;
    var dec = (m[2] || '');
    if (dec.length > 6) return null;
    while (dec.length < 6) dec += '0';
    return m[1].replace(/^0+(?=\d)/, '') + '.' + dec;
  }

  /* Parametros del codigo QR: id (UUID), re y rr (RFC emisor y receptor), tt (total) y fe (8 ultimos caracteres del
     sello). Los valores van codificados para que un RFC con & o con Ñ no rompa el enlace. */
  function enlaceSat(p) {
    return BASE_SAT + '?id=' + encodeURIComponent(p.uuid) + '&re=' + encodeURIComponent(p.rfcEmisor) +
      '&rr=' + encodeURIComponent(p.rfcReceptor) + '&tt=' + encodeURIComponent(p.tt) + '&fe=' + encodeURIComponent(p.fe);
  }

  var REQUERIDOS = [
    ['Version', 'version del comprobante'], ['Fecha', 'fecha'], ['Total', 'total'], ['Sello', 'sello del emisor'],
    ['NoCertificado', 'numero de certificado'], ['TipoDeComprobante', 'tipo de comprobante'],
  ];

  /* Resultado: { estado, motivo, version, uuid, rfcEmisor, nombreEmisor, rfcReceptor, nombreReceptor, total, moneda,
                  fecha, fechaTimbrado, tipo, faltan[], enlace }
     estado: 'COMPLETO' (trae todo lo necesario para el enlace) | 'INCOMPLETO' (es CFDI pero falta algo) |
             'NO_ES_CFDI' | 'ILEGIBLE' */
  function analizar(texto) {
    var r = { estado: 'ILEGIBLE', motivo: '', faltan: [], enlace: null };
    var el;
    try { el = leerXml(texto); } catch (e) { r.motivo = e.message; return r; }
    if (el.local !== 'Comprobante') { r.estado = 'NO_ES_CFDI'; r.motivo = el.local; return r; }
    var at = el.attrs;
    r.version = at.Version || '';
    if (r.version !== '4.0' && r.version !== '3.3') r.faltan.push('version 3.3 o 4.0');
    var em = hijo(el, 'Emisor'), rec = hijo(el, 'Receptor');
    var comp = hijo(el, 'Complemento'), tfd = comp ? hijo(comp, 'TimbreFiscalDigital') : null;
    r.rfcEmisor = em ? (em.attrs.Rfc || '') : '';
    r.nombreEmisor = em ? (em.attrs.Nombre || '') : '';
    r.rfcReceptor = rec ? (rec.attrs.Rfc || '') : '';
    r.nombreReceptor = rec ? (rec.attrs.Nombre || '') : '';
    r.total = at.Total || '';
    r.moneda = at.Moneda || '';
    r.fecha = at.Fecha || '';
    r.tipo = at.TipoDeComprobante || '';
    r.uuid = tfd ? (tfd.attrs.UUID || '') : '';
    r.fechaTimbrado = tfd ? (tfd.attrs.FechaTimbrado || '') : '';
    REQUERIDOS.forEach(function (q) { if (!at[q[0]] && q[0] !== 'Version') r.faltan.push(q[1]); });
    if (!em) r.faltan.push('emisor'); else if (!r.rfcEmisor) r.faltan.push('RFC del emisor');
    if (!rec) r.faltan.push('receptor'); else if (!r.rfcReceptor) r.faltan.push('RFC del receptor');
    if (!tfd) r.faltan.push('timbre fiscal digital (UUID)');
    else {
      if (!r.uuid) r.faltan.push('UUID');
      if (!r.fechaTimbrado) r.faltan.push('fecha de timbrado');
      if (!tfd.attrs.SelloSAT) r.faltan.push('sello del SAT');
    }
    var tt = totalSeisDecimales(r.total);
    if (r.total && tt === null) r.faltan.push('total con formato valido');
    if (r.uuid && r.rfcEmisor && r.rfcReceptor && tt !== null && at.Sello) {
      r.enlace = enlaceSat({ uuid: r.uuid, rfcEmisor: r.rfcEmisor, rfcReceptor: r.rfcReceptor, tt: tt, fe: at.Sello.slice(-8) });
    }
    r.estado = r.faltan.length ? 'INCOMPLETO' : 'COMPLETO';
    return r;
  }

  return { analizar: analizar, leerXml: leerXml, enlaceSat: enlaceSat, totalSeisDecimales: totalSeisDecimales, BASE_SAT: BASE_SAT };
});
