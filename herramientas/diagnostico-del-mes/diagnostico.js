/* Diagnostico del mes de taxcerteza.mx: los XML de un mes, leidos EN EL NAVEGADOR, en tres resultados. NO tiene logica
   fiscal propia: compone las tres herramientas que ya existen y que estan cotejadas contra el programa.
     IVA del mes .......... iva-del-mes/iva.js     (estimar: IVA trasladado, acreditable y a pagar; PPD sin complemento)
     Lista 69-B ........... lista-69b/lista69b.js  (consultar: situacion y fechas de cada emisor)
     Complemento de pago .. complemento-de-pago/rep.js (llevaRep: una PPD lleva complemento, y su fundamento)
   Lo unico propio es deducir el RFC y el mes a partir de los propios XML, para no pedirlos antes del primer resultado;
   si no se pueden deducir sin ambiguedad, se piden (no se adivina).
   Pruebas: .herramientas/pruebas/diagnostico.test.js (el MISMO XML por las tres herramientas y por el diagnostico). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica;
  else raiz.TCDiagnostico = fabrica;
})(this, function (IVA, Lista, Rep) {
  'use strict';

  var RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;
  var CODIGO = { presunto: 'P', definitivo: 'D', desvirtuado: 'V', sentencia_favorable: 'S' };

  function mayor(cuentas) {
    var ks = Object.keys(cuentas).sort(function (a, b) { return cuentas[b] - cuentas[a] || (a < b ? -1 : 1); });
    if (!ks.length) return { valor: null, empate: [] };
    var top = cuentas[ks[0]], empate = ks.filter(function (k) { return cuentas[k] === top; });
    return { valor: empate.length === 1 ? ks[0] : null, empate: empate.length > 1 ? empate : [], veces: top };
  }

  /* archivos [{nombre, texto}] -> { rfc, periodo, legibles, rfc_empate[], periodo_empate[], rfc_en_todos }.
     RFC: el que aparece (como emisor o receptor) en mas comprobantes; el propio aparece en todos los suyos.
     Mes: el de la fecha de mas comprobantes que no son de pago; si solo hay pagos, el de mas fechas de pago.
     Un empate deja el valor en null: la pagina lo pregunta. Lo ilegible no cuenta aqui (lo enumera estimar). */
  function deducir(archivos) {
    var rfcs = {}, meses = {}, mesesPago = {}, legibles = 0;
    (archivos || []).forEach(function (a) {
      var r = IVA.leer(a.texto);
      if (!r.ok || !String(r.m.uuid || '').trim()) return;
      legibles++;
      var m = r.m, vistos = {};
      [m.emisor_rfc, m.receptor_rfc].forEach(function (x) {
        x = String(x || '').trim().toUpperCase();
        if (x && !vistos[x]) { vistos[x] = true; rfcs[x] = (rfcs[x] || 0) + 1; }
      });
      var drs = m.complemento_pago ? m.complemento_pago.documentos_relacionados : null;
      if (drs) drs.forEach(function (d) { var p = String(d.fecha_pago || '').slice(0, 7); if (RE_PERIODO.test(p)) mesesPago[p] = (mesesPago[p] || 0) + 1; });
      else { var p = String(m.fecha || '').slice(0, 7); if (RE_PERIODO.test(p)) meses[p] = (meses[p] || 0) + 1; }
    });
    var r = mayor(rfcs), p = mayor(Object.keys(meses).length ? meses : mesesPago);
    return { rfc: r.valor, rfc_empate: r.empate, rfc_en_todos: r.valor !== null && r.veces === legibles,
             periodo: p.valor, periodo_empate: p.empate, legibles: legibles };
  }

  /* El diagnostico: estimar de iva-del-mes y, encima, lo que cada resultado necesita de las otras dos herramientas. */
  function diagnosticar(archivos, rfc, periodo, listado) {
    var r = IVA.estimar(archivos, rfc, periodo, listado);
    if (!r.ok) return { ok: false, motivo: r.motivo, maximo: r.maximo };
    var porEmisor = {};
    (r.facturas_69b || []).forEach(function (f) { (porEmisor[f.emisor] = porEmisor[f.emisor] || []).push(f); });
    var efos = r.avisos_69b.map(function (a) {
      var c = Lista.consultar(listado, a.rfc);
      return { rfc: a.rfc, situacion: a.situacion, codigo: CODIGO[a.situacion] || '', rojo: a.rojo, fechas: a.fechas,
               nombre: c.registros.length ? c.registros[0].nombre : '', facturas: porEmisor[a.rfc] || [] };
    });
    var lleva = Rep.llevaRep({ metodo: 'PPD', forma: '99' });
    return {
      ok: true, estimacion: r, rfc: r.rfc, periodo: r.periodo,
      iva: r.cerrado ? null : r.resultado,
      efos: efos,
      fecha_listado: listado && listado.fecha_info ? listado.fecha_info : null,
      estado_listado: Lista.estado(listado),
      rep: r.cerrado ? null : { emitidas: r.ppd_sin_cobrar, recibidas: r.ppd_sin_pagar, fundamento: lleva.fundamento },
      leidos: r.leidos, usados: r.usados,
    };
  }

  return { deducir: deducir, diagnosticar: diagnosticar };
});
