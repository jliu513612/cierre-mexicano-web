/* Factura con retenciones de taxcerteza.mx. Toda la logica vive aqui; las tasas llegan en retenciones-datos.js, que se
   GENERA desde nomina_tablas del programa. No consulta ningun servidor. Pruebas: .herramientas/pruebas/retenciones.test.js

   Mismas formulas y mismo redondeo que el programa (validador_retenciones.validar_retenciones):
     base de la retencion  = IVA trasladado / tasa de IVA            (la base «probada» por el propio IVA)
     IVA retenido PF       = IVA trasladado x 66.6667 %              (el programa usa 0.666667, no 2/3 exacto)
     ISR retenido PF       = base x 10 %, o x 1.25 % si el emisor declara regimen 626 (RESICO)
     IVA retenido flete    = base x 4 %
     redondeo a centavos   = medio al par (money.quantize_cents)
   Lo unico que el programa NO calcula y aqui si: el IVA a partir del subtotal (subtotal x tasa de IVA, mismo redondeo).
   Solo obligan a un receptor PERSONA MORAL. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCRetenciones = fabrica();
})(this, function () {
  'use strict';

  var RE_IMPORTE = /^\d{1,12}(\.\d{1,2})?$/;

  /* '1,234.5' -> 123450n (centavos) o null. */
  function centavos(texto) {
    var t = String(texto === null || texto === undefined ? '' : texto).trim().replace(/^\$\s*/, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    if (!RE_IMPORTE.test(t)) return null;
    var p = t.split('.');
    return BigInt(p[0]) * 100n + BigInt(((p[1] || '') + '00').slice(0, 2));
  }
  function texto(c) {
    var neg = c < 0n, a = neg ? -c : c, s = a.toString();
    while (s.length < 3) s = '0' + s;
    return (neg ? '-' : '') + s.slice(0, -2) + '.' + s.slice(-2);
  }
  /* Tasa en porcentaje como texto ('66.6667') -> [numerador, denominador] de la FRACCION (0.666667). */
  function fraccion(pct) {
    var p = String(pct).split('.'), dec = p[1] || '';
    return [BigInt(p[0] + dec), 100n * (10n ** BigInt(dec.length))];
  }
  /* round(n / d) medio al par, para n >= 0 y d > 0. */
  function divPar(n, d) {
    var q = n / d, r = n % d;
    if (r * 2n > d || (r * 2n === d && q % 2n === 1n)) q += 1n;
    return q;
  }

  function crear(datos) {
    var IVA = fraccion(datos.iva_tasa_general), AUTO = fraccion(datos.ret_iva_autotransporte),
        PF_IVA = fraccion(datos.ret_iva_pf_pct_del_iva), PF_ISR = fraccion(datos.ret_isr_pf_servicios),
        RESICO = fraccion(datos.ret_isr_resico);

    /* IVA trasladado sugerido para un subtotal, en centavos. */
    function ivaDeSubtotal(subCent) { return divPar(subCent * IVA[0], IVA[1]); }

    /* p: { tipo: 'honorarios'|'arrendamiento'|'autotransporte', receptor: 'PM'|'PF', emisor: 'PF'|'PM',
            regimen: '626'|'otro'|'', subtotal: texto, iva: texto o null (null = calcularlo) }
       Devuelve { ok, estado, ... } con importes como texto '1234.56'. */
    function calcular(p) {
      p = p || {};
      if (['honorarios', 'arrendamiento', 'autotransporte'].indexOf(p.tipo) < 0) return { ok: false, estado: 'TIPO' };
      if (p.receptor !== 'PM' && p.receptor !== 'PF') return { ok: false, estado: 'RECEPTOR' };
      if (p.tipo !== 'autotransporte' && p.emisor !== 'PF' && p.emisor !== 'PM') return { ok: false, estado: 'EMISOR' };
      var sub = centavos(p.subtotal);
      if (sub === null) return { ok: false, estado: 'SUBTOTAL' };
      var ivaEditado = p.iva !== null && p.iva !== undefined && String(p.iva).trim() !== '';
      var iva = ivaEditado ? centavos(p.iva) : ivaDeSubtotal(sub);
      if (iva === null) return { ok: false, estado: 'IVA' };
      var r = { ok: true, tipo: p.tipo, subtotal: texto(sub), iva: texto(iva), ivaCalculado: !ivaEditado,
                retIva: '0.00', retIsr: '0.00', tasaIsr: null, base: null, supuestoRegimen: false };
      if (p.receptor !== 'PM') { r.estado = 'NO_APLICA_RECEPTOR_PF'; r.neto = texto(sub + iva); return r; }
      if (p.tipo !== 'autotransporte' && p.emisor === 'PM') { r.estado = 'NO_APLICA_EMISOR_PM'; r.neto = texto(sub + iva); return r; }
      if (iva <= 0n) { r.estado = 'SIN_IVA'; r.neto = texto(sub); return r; }
      var base = divPar(iva * IVA[1], IVA[0]);
      r.base = texto(base);
      var ri = 0n, rs = 0n;
      if (p.tipo === 'autotransporte') {
        ri = divPar(base * AUTO[0], AUTO[1]);
      } else {
        var esResico = p.regimen === '626';
        var tasa = esResico ? RESICO : PF_ISR;
        ri = divPar(iva * PF_IVA[0], PF_IVA[1]);
        rs = divPar(base * tasa[0], tasa[1]);
        r.tasaIsr = esResico ? datos.ret_isr_resico : datos.ret_isr_pf_servicios;
        r.supuestoRegimen = p.regimen !== '626' && p.regimen !== 'otro';
      }
      r.retIva = texto(ri); r.retIsr = texto(rs);
      r.estado = 'CON_RETENCION';
      r.neto = texto(sub + iva - ri - rs);
      return r;
    }
    return { calcular: calcular, ivaDeSubtotal: function (s) { var c = centavos(s); return c === null ? null : texto(ivaDeSubtotal(c)); } };
  }

  return { crear: crear, centavos: centavos, texto: texto };
});
