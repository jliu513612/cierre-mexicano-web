/* IVA del mes de taxcerteza.mx: estimacion del IVA a cargo o a favor de un mes a partir de los XML, leidos EN EL
   NAVEGADOR. Toda la logica vive aqui; la pagina solo pinta. No consulta ningun servidor.
   Pruebas: .herramientas/pruebas/iva.test.js, contra vectores generados EJECUTANDO la cadena del programa
   (enriquecedor_v2.parse_cfdi_v2 -> calculador_iva_v2.cargar_cfdis_enriquecidos -> calculador_iva_v2.calcular).

   Tres capas, en este orden:
     leer(xml)          lo mismo que parse_cfdi_v2 extrae, con los mismos importes (incluido su paso por float);
     calcular(...)      la parte de calculador_iva_v2.calcular que este corte soporta, regla por regla;
     estimar(...)       lo propio de la pagina: RFC del contribuyente, mes, repetidos y lo que NO se soporta, que
                        se enumera y deja la estimacion SIN cifra (falla cerrado). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica;
  else raiz.TCIva = fabrica;
})(this, function (Dm, leerXml) {
  'use strict';

  var D = Dm.de, sum = Dm.sumar, res = Dm.restar, mul = Dm.multiplicar, cmp = Dm.comparar, CERO = Dm.CERO;
  var NS4 = 'http://www.sat.gob.mx/cfd/4', NS3 = 'http://www.sat.gob.mx/cfd/3';
  var NS_P20 = 'http://www.sat.gob.mx/Pagos20', NS_P10 = 'http://www.sat.gob.mx/Pagos';
  var NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital';
  var NS_RET = 'http://www.sat.gob.mx/esquemas/retencionpago/2', NS_RET1 = 'http://www.sat.gob.mx/esquemas/retencionpago/1';

  function NoSoportado(motivo) { this.motivo = motivo; }

  /* ------------------------------------------------------------------ arbol con espacios de nombres resueltos */
  function resolver(el, ambito) {
    var a = Object.create(ambito);
    for (var k in el.attrs) {
      if (k === 'xmlns') a[''] = el.attrs[k];
      else if (k.indexOf('xmlns:') === 0) a[k.slice(6)] = el.attrs[k];
    }
    var pref = el.nombre.indexOf(':') >= 0 ? el.nombre.split(':')[0] : '';
    el.ns = a[pref] === undefined ? '' : a[pref];
    el.hijos.forEach(function (h) { resolver(h, a); });
    return el;
  }
  function es(el, ns, local) { return el.ns === ns && el.local === local; }
  function hijo(el, ns, local) {
    for (var i = 0; i < el.hijos.length; i++) if (es(el.hijos[i], ns, local)) return el.hijos[i];
    return null;
  }
  function hijos(el, ns, local) { return el.hijos.filter(function (h) { return es(h, ns, local); }); }
  /* Como Element.iter(tag) de Python: el propio elemento y todos sus descendientes, en orden de documento. */
  function iter(el, ns, local, out) {
    out = out || [];
    if (es(el, ns, local)) out.push(el);
    el.hijos.forEach(function (h) { iter(h, ns, local, out); });
    return out;
  }
  function attr(el, k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; }

  /* `_dec` del programa: ausente o vacio -> el default; solo espacios, texto o NaN/Infinity -> el fichero entero se
     rechaza (ValorNoNumerico). */
  function Ilegible(campo, valor) { this.campo = campo; this.valor = valor; }
  function dec(valor, campo, def) {
    if (valor === null || valor === undefined || valor === '') return D(def);
    var d = Dm.leer(String(valor).trim());
    if (String(valor).trim() === '' || d === null) throw new Ilegible(campo, valor);
    return d;
  }
  var fl = Dm.porFloat;

  /* --------------------------------------------------------------------------------------------- leer(xml) */
  function leer(texto) {
    var raiz;
    try { raiz = resolver(leerXml(texto), { xml: 'http://www.w3.org/XML/1998/namespace' }); }
    catch (e) { return { ok: false, motivo: 'XML_MAL_FORMADO' }; }
    if (raiz.local === 'Retenciones' && (raiz.ns === NS_RET || raiz.ns === NS_RET1)) return { ok: false, motivo: 'NO_SOPORTADO', detalle: 'CFDI de retenciones' };
    if (raiz.local !== 'Comprobante' || (raiz.ns !== NS4 && raiz.ns !== NS3)) return { ok: false, motivo: 'NO_ES_CFDI' };
    if (raiz.ns === NS3) return { ok: false, motivo: 'NO_SOPORTADO', detalle: 'CFDI versión 3.3' };
    try { return { ok: true, m: cuerpo(raiz) }; }
    catch (e) {
      if (e instanceof Ilegible) return { ok: false, motivo: 'IMPORTE_ILEGIBLE', detalle: e.campo };
      if (e instanceof NoSoportado) return { ok: false, motivo: 'NO_SOPORTADO', detalle: e.motivo };
      return { ok: false, motivo: 'IMPORTE_ILEGIBLE', detalle: String(e && e.message || e) };
    }
  }

  function cuerpo(r) {
    var tipo = attr(r, 'TipoDeComprobante');
    if (tipo !== 'I' && tipo !== 'P') throw new NoSoportado(tipo === 'E' ? 'nota de crédito (tipo E)' : tipo === 'N' ? 'recibo de nómina' : 'comprobante de tipo ' + (tipo || '(vacío)'));
    ['SubTotal', 'Total'].forEach(function (k) {
      if (attr(r, k) === null || String(attr(r, k)).trim() === '') throw new NoSoportado('le falta el ' + k);
    });
    if (hijos(r, NS4, 'CfdiRelacionados').length) throw new NoSoportado('trae CFDI relacionados (sustitución, anticipo u otra relación)');
    var m = {
      uuid: null, fecha: (attr(r, 'Fecha') || '').slice(0, 10), subtotal: dec(attr(r, 'SubTotal'), 'SubTotal', '0'),
      descuento: dec(attr(r, 'Descuento'), 'Descuento', '0'), total: dec(attr(r, 'Total'), 'Total', '0'),
      metodo_pago: attr(r, 'MetodoPago'), forma_pago: attr(r, 'FormaPago'), tipo_comprobante: tipo, moneda: attr(r, 'Moneda'),
      tipo_cambio: fl(dec(attr(r, 'TipoCambio'), 'TipoCambio', '1')), tipo_cambio_raw: attr(r, 'TipoCambio'),
      emisor_rfc: null, emisor_nombre: null, receptor_rfc: null, receptor_nombre: null, uso_cfdi: null,
      conceptos: [], tasas_unicas: [], iva_total_traslados: CERO, iva_total_retenido: CERO, es_efectivo_sobre_2k: false,
      es_complemento_pago: tipo === 'P', complemento_pago: null
    };
    var em = hijo(r, NS4, 'Emisor'), re = hijo(r, NS4, 'Receptor');
    if (em) { m.emisor_rfc = attr(em, 'Rfc'); m.emisor_nombre = attr(em, 'Nombre'); }
    if (re) { m.receptor_rfc = attr(re, 'Rfc'); m.receptor_nombre = attr(re, 'Nombre'); m.uso_cfdi = attr(re, 'UsoCFDI'); }
    var comp = hijo(r, NS4, 'Complemento');
    if (comp) for (var i = 0; i < comp.hijos.length; i++) if (comp.hijos[i].local === 'TimbreFiscalDigital') { m.uuid = attr(comp.hijos[i], 'UUID'); break; }
    var tasas = {};
    iter(r, NS4, 'Concepto').forEach(function (k) {
      var c = { importe: dec(attr(k, 'Importe'), 'Importe', '0'), objeto_imp: attr(k, 'ObjetoImp'), descuento: fl(dec(attr(k, 'Descuento'), 'Descuento', '0')), tasas: [] };
      dec(attr(k, 'Cantidad'), 'Cantidad', '0'); dec(attr(k, 'ValorUnitario'), 'ValorUnitario', '0');
      iter(k, NS4, 'Traslado').forEach(function (t) {
        var tasa = attr(t, 'TasaOCuota') === null ? '' : attr(t, 'TasaOCuota');
        if (attr(t, 'Impuesto') !== '002') throw new NoSoportado('trae IEPS u otro impuesto distinto del IVA');
        c.tasas.push({ impuesto: attr(t, 'Impuesto'), tasa: tasa, tipo_factor: attr(t, 'TipoFactor') === null ? '' : attr(t, 'TipoFactor'),
                       base: fl(dec(attr(t, 'Base'), 'Base', '0')), importe_iva: fl(dec(attr(t, 'Importe'), 'Importe', '0')) });
        tasas[tasa] = true;
      });
      m.conceptos.push(c);
    });
    var imp = hijo(r, NS4, 'Impuestos');
    if (imp) {
      if (attr(imp, 'TotalImpuestosTrasladados') !== null) m.iva_total_traslados = dec(attr(imp, 'TotalImpuestosTrasladados'), 'TotalImpuestosTrasladados', '0');
      iter(imp, NS4, 'Retencion').forEach(function (x) {
        var v = dec(attr(x, 'Importe'), 'Importe', '0');
        if (attr(x, 'Impuesto') === '002') m.iva_total_retenido = sum(m.iva_total_retenido, v);
      });
      iter(imp, NS4, 'Traslado').forEach(function (t) {
        if (attr(t, 'Impuesto') !== '002') throw new NoSoportado('trae IEPS u otro impuesto distinto del IVA');
      });
    }
    m.tasas_unicas = Object.keys(tasas).sort();
    if (tipo === 'P') {
      if (iter(r, NS_P10, 'Pagos').length || !iter(r, NS_P20, 'Pagos').length) throw new NoSoportado('complemento de pago que no es Pagos 2.0');
      m.complemento_pago = { documentos_relacionados: pagos20(r) };
    }
    if (m.forma_pago === '01') {
      var f = factor(m.moneda, m.tipo_cambio);
      if (cmp(mul(m.total, f), UMBRAL_EFECTIVO) > 0) m.es_efectivo_sobre_2k = true;
    }
    // el enriquecido guarda estos como float (descuento no)
    m.subtotal = fl(m.subtotal); m.total = fl(m.total); m.iva_total_traslados = fl(m.iva_total_traslados);
    m.iva_total_retenido = fl(m.iva_total_retenido);
    m.conceptos.forEach(function (c) { c.importe = fl(c.importe); });
    return m;
  }

  function pagos20(r) {
    var drs = [];
    iter(r, NS_P20, 'Pagos').forEach(function (pp) {
      iter(pp, NS_P20, 'Pago').forEach(function (p) {
        var mp = attr(p, 'MonedaP'), tcpRaw = attr(p, 'TipoCambioP');
        var fp = attr(p, 'FormaDePagoP');
        var monto = fl(dec(attr(p, 'Monto'), 'Monto', '0'));
        var sumImp = CERO, docs = iter(p, NS_P20, 'DoctoRelacionado');
        docs.forEach(function (d) { sumImp = sum(sumImp, dec(attr(d, 'ImpPagado'), 'ImpPagado', '0')); });
        var equivImpl = cmp(sumImp, CERO) > 0 ? Dm.dividir(monto, sumImp) : CERO;
        var tcp = Dm.leer(tcpRaw === null || tcpRaw === '' ? '1' : tcpRaw);
        if (tcp === null) throw new Ilegible('TipoCambioP', tcpRaw);
        docs.forEach(function (d) {
          var iva = CERO, base = CERO, tras = [], ivaRet = CERO;
          iter(d, NS_P20, 'TrasladoDR').forEach(function (t) {
            if ((attr(t, 'ImpuestoDR') || '').trim() !== '002') throw new NoSoportado('un pago trae IEPS u otro impuesto distinto del IVA');
            var b = dec(attr(t, 'BaseDR'), 'BaseDR', '0'), i = dec(attr(t, 'ImporteDR'), 'ImporteDR', '0');
            iva = sum(iva, i); base = sum(base, b);
            tras.push([b, i, (attr(t, 'ImpuestoDR') || '').trim(), attr(t, 'TipoFactorDR'), attr(t, 'TasaOCuotaDR')]);
          });
          iter(d, NS_P20, 'RetencionDR').forEach(function (t) {
            var v = dec(attr(t, 'ImporteDR'), 'ImporteDR', '0');
            if ((attr(t, 'ImpuestoDR') || '').trim() === '002') ivaRet = sum(ivaRet, v);
          });
          var equiv = dec(attr(d, 'EquivalenciaDR'), 'EquivalenciaDR', '1'), mdr = attr(d, 'MonedaDR');
          if (mdr && mp && mdr !== mp && cmp(equivImpl, CERO) > 0 &&
              (cmp(equiv, mul(equivImpl, '5')) > 0 || cmp(equiv, Dm.dividir(equivImpl, '5')) < 0)) equiv = equivImpl;
          var fPago = (mp && mp !== 'MXN') ? tcp : D('1'), f = mul(equiv, fPago);
          drs.push({
            uuid_original: attr(d, 'IdDocumento'), metodo_pago_dr: attr(d, 'MetodoDePagoDR'), moneda_p: mp, tipo_cambio_p: tcpRaw,
            forma_pago_p: fp, monto_pago_mxn: fl(mul(monto, fPago)), num_parcialidad: attr(d, 'NumParcialidad'),
            imp_saldo_anterior: fl(dec(attr(d, 'ImpSaldoAnt'), 'ImpSaldoAnt', '0')), imp_pagado: fl(dec(attr(d, 'ImpPagado'), 'ImpPagado', '0')),
            imp_saldo_insoluto: fl(dec(attr(d, 'ImpSaldoInsoluto'), 'ImpSaldoInsoluto', '0')), objeto_imp_dr: attr(d, 'ObjetoImpDR'),
            base_iva_dr: fl(mul(base, f)), iva_dr: fl(mul(iva, f)), equivalencia_dr: fl(equiv),
            traslados_dr: tras.map(function (t) { return { base_dr: fl(mul(t[0], f)), importe_dr: fl(mul(t[1], f)), impuesto_dr: t[2], tipo_factor_dr: t[3], tasa_o_cuota_dr: t[4] }; }),
            iva_ret_dr: fl(mul(ivaRet, f)), fecha_pago: (attr(p, 'FechaPago') || '').slice(0, 10)
          });
        });
      });
    });
    return drs;
  }

  /* ----------------------------------------------------------------------------- dinero (money.py del programa) */
  var UMBRAL_EFECTIVO = null, FORMAS_DINERO = null, TOL_PAGOS = null;
  function factor(moneda, tc) {
    var m = String(moneda || 'MXN').toUpperCase(), t = D(tc === null || tc === undefined || tc === '' ? '1' : tc);
    return (m !== 'MXN' && m !== 'XXX' && cmp(t, CERO) > 0) ? t : D('1');
  }
  function tcFaltante(moneda, raw) {
    var m = String(moneda || 'MXN').toUpperCase();
    if (m === 'MXN' || m === 'XXX') return false;
    if (raw === null || raw === undefined || raw === '') return true;
    var t = Dm.leer(String(raw));
    return t === null || cmp(t, CERO) <= 0;
  }

  /* -------------------------------------------------- cargar_cfdis_enriquecidos (sobre lo que devuelve leer) */
  function cargar(m, direccion, efos) {
    var conv = factor(m.moneda, m.tipo_cambio);
    var raw = m.tipo_cambio_raw;
    return {
      tc_faltante: tcFaltante(m.moneda, raw), uuid: m.uuid, direccion: direccion, fecha: m.fecha,
      moneda: String(m.moneda || 'MXN').toUpperCase(), tipo_cambio: conv,
      subtotal: mul(m.subtotal, conv), descuento: mul(m.descuento, conv), total: mul(m.total, conv),
      iva: mul(m.iva_total_traslados, conv), iva_retenido: mul(m.iva_total_retenido, conv),
      metodo_pago: m.metodo_pago, forma_pago: m.forma_pago, uso_cfdi: m.uso_cfdi, tasas_unicas: m.tasas_unicas,
      es_efectivo_sobre_2k: m.es_efectivo_sobre_2k, emisor_rfc: m.emisor_rfc, emisor_nombre: m.emisor_nombre,
      receptor_rfc: m.receptor_rfc, receptor_nombre: m.receptor_nombre,
      efos_status: efos ? efos.status : 'limpio', efos_fecha_definitivo: efos ? efos.definitivo : '',
      conceptos: m.conceptos, es_complemento_pago: m.es_complemento_pago, complemento_pago: m.complemento_pago
    };
  }

  /* ------------------------------------------------------------- 69-B: la fila que elige el programa */
  var PRIORIDAD = { definitivo: 4, presunto: 3, no_localizado: 2, otro: 1, desvirtuado: 0, sentencia_favorable: 0 };
  var SIT = { P: 'presunto', D: 'definitivo', V: 'desvirtuado', S: 'sentencia_favorable' };
  /* Filas del listado.json de la pagina 69-B -> {status, definitivo, fila}. Gana la PEOR situacion y, empatadas, la
     PRIMERA (efos_scraper.actualizar_cache). null si el RFC no esta. */
  function efosDe(listado, rfc) {
    var filas = listado && listado.r && Object.prototype.hasOwnProperty.call(listado.r, rfc) ? listado.r[rfc] : null;
    if (!filas || !filas.length) return null;
    var elegida = filas[0];
    for (var i = 1; i < filas.length; i++) {
      if ((PRIORIDAD[SIT[filas[i][0]]] || 0) > (PRIORIDAD[SIT[elegida[0]]] || 0)) elegida = filas[i];
    }
    return { status: SIT[elegida[0]], definitivo: elegida[4] || '', fila: elegida };
  }
  function fechaEfos(s) {
    s = String(s || '').trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return s.slice(0, 10);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return null;
  }
  /* decision_efos del programa: solo EXCLUYE al definitivo con el CFDI posterior a la fecha del definitivo. */
  function decisionEfos(status, fechaCfdi, fechaDef) {
    if (String(status || '').trim().toLowerCase() !== 'definitivo') return 'deducible';
    var fd = fechaEfos(fechaDef), fc = fechaEfos(fechaCfdi);
    if (fd === null || fc === null) return 'definitivo_sin_fecha';
    return fc > fd ? 'excluir' : 'deducible';
  }

  /* ------------------------------------------------------------------------- reparto por tasa (Q-216, Q-353) */
  function tasaDe(v) { return v === null || v === undefined || v === '' ? null : Dm.leer(String(v)); }
  function tieneTasa(tasas, valor) { return (tasas || []).some(function (t) { var x = tasaDe(t); return x !== null && cmp(x, valor) === 0; }); }
  function basesExentaNoObjeto(c) {
    var conv = c.tipo_cambio || D('1'), ex = CERO, no = CERO;
    (c.conceptos || []).forEach(function (k) {
      var oi = k.objeto_imp || '', ts = k.tasas || [], imp = mul(k.importe || 0, conv);
      var grav = ts.some(function (t) { return t.tipo_factor === 'Tasa' || t.tipo_factor === 'Cuota'; });
      var exe = ts.some(function (t) { return t.tipo_factor === 'Exento'; });
      if (oi === '01') no = sum(no, imp);
      else if (exe && !grav) ex = sum(ex, imp);
      else if ((oi === '02' || oi === '03') && !ts.length) ex = sum(ex, imp);
    });
    return [ex, no];
  }
  function repartoPorTasa(c) {
    var out = {}, orden = [];
    function add(bk, b, i) {
      if (!out[bk]) { out[bk] = { base: CERO, iva: CERO }; orden.push(bk); }
      out[bk].base = sum(out[bk].base, b); out[bk].iva = sum(out[bk].iva, i);
    }
    var conv = c.tipo_cambio || D('1'), visto = false;
    (c.conceptos || []).forEach(function (k) {
      (k.tasas || []).forEach(function (t) {
        visto = true;
        var b = mul(t.base || 0, conv), i = mul(t.importe_iva || 0, conv);
        if ((t.tipo_factor || 'Tasa') === 'Exento') { add('exento', b, CERO); return; }
        if (cmp(i, CERO) > 0) add(t.tasa === '0.080000' ? '8' : '16', b, i);
        else add('0', b, CERO);
      });
    });
    if (!visto) {
      var ts = c.tasas_unicas || [], b = c.subtotal, i = c.iva;
      if (cmp(i, CERO) > 0) add(ts.indexOf('0.080000') >= 0 && ts.indexOf('0.160000') < 0 ? '8' : '16', b, i);
      else if (ts.indexOf('0.000000') >= 0) add('0', b, CERO);
      else add('exento', b, CERO);
    }
    return { mapa: out, orden: orden };
  }
  /* _bucket_diot: con IVA, 16 u 8; sin IVA, la tasa declarada. (contradiccion_traslado del programa lee claves que el
     enriquecido no escribe -tasa_o_cuota/importe- y nunca dispara: aqui tampoco.) */
  function bucketDominante(c) {
    var ts = c.tasas_unicas || [];
    if (c.iva && cmp(c.iva, CERO) > 0) return tieneTasa(ts, D('0.08')) && !tieneTasa(ts, D('0.16')) ? '8' : '16';
    if (tieneTasa(ts, D('0.16'))) return '16';
    if (tieneTasa(ts, D('0.08'))) return '8';
    if (tieneTasa(ts, CERO)) return '0';
    return 'exento';
  }
  function repartirConservando(rep, dom, baseTotal, ivaTotal) {
    var out = {};
    ['16', '8', '0', 'exento', 'contradictorio'].forEach(function (k) { out[k] = { base: CERO, iva: CERO }; });
    var suma = CERO;
    rep.orden.forEach(function (k) { suma = sum(suma, rep.mapa[k].base); });
    if (cmp(suma, CERO) > 0) {
      var rb = baseTotal, ri = ivaTotal;
      rep.orden.forEach(function (k) {
        if (k === dom) return;
        var v = rep.mapa[k];
        var b = Dm.cuantizar(Dm.dividir(mul(baseTotal, v.base), suma), -2);
        var i = Dm.esCero(ivaTotal) ? CERO : v.iva;
        out[k].base = sum(out[k].base, b); out[k].iva = sum(out[k].iva, i);
        rb = res(rb, b); ri = res(ri, i);
      });
      out[dom].base = sum(out[dom].base, rb); out[dom].iva = sum(out[dom].iva, ri);
    } else {
      out[dom].base = sum(out[dom].base, baseTotal); out[dom].iva = sum(out[dom].iva, ivaTotal);
    }
    return out;
  }

  /* --------------------------------------------------------------------- IVA cero declarado (_marca_bloqueo) */
  /* Un importe del enriquecido (Decimal ya leido) o un texto -> Decimal, o null si no se lee como numero. */
  function num(x) {
    if (x && typeof x === 'object' && typeof x.c === 'bigint') return x;
    return x === null || x === undefined ? null : Dm.leer(String(x));
  }
  function esCeroTxt(x) { var d = num(x); return d !== null && Dm.esCero(d); }
  function trasladoCero(importe, tf, tasa) {
    if (!esCeroTxt(importe)) return false;
    tf = String(tf || '').trim();
    if (tf === 'Exento') return true;
    return tf === 'Tasa' && esCeroTxt(tasa);
  }
  function ivaCeroDeclarado(c, dr) {
    if (dr) {
      if (!esCeroTxt(dr.iva_dr) || !esCeroTxt(dr.iva_ret_dr || 0)) return false;
      var tras = dr.traslados_dr;
      if (tras === null || tras === undefined) return false;
      var tiva = tras.filter(function (x) { return String(x.impuesto_dr || '') === '002'; });
      if (!tiva.length) return String(dr.objeto_imp_dr || '').trim() === '01';
      return tiva.every(function (x) { return trasladoCero(x.importe_dr, x.tipo_factor_dr, x.tasa_o_cuota_dr); });
    }
    if (!esCeroTxt(c.iva) || !esCeroTxt(c.iva_retenido || CERO)) return false;
    var ks = c.conceptos || [];
    if (!ks.length) return false;
    return ks.every(function (k) {
      var ts = k.tasas || [];
      if (!ts.length) return String(k.objeto_imp || '').trim() === '01';
      return ts.every(function (x) { return trasladoCero(x.importe_iva, x.tipo_factor, x.tasa); });
    });
  }

  /* ------------------------------------------------------------- libro_de_pagos (sat_truth_invariants) */
  function libroDePagos(cfdis) {
    var total = {}, entradas = [];
    cfdis.forEach(function (c) {
      if (c.es_complemento_pago || !c.uuid) return;
      total[String(c.uuid).trim().toUpperCase()] = c.total;
    });
    cfdis.forEach(function (c) {
      if (!c.es_complemento_pago) return;
      var u = String(c.uuid || '').trim().toUpperCase();
      ((c.complemento_pago || {}).documentos_relacionados || []).forEach(function (dr, i) { entradas.push([u, i, dr]); });
    });
    function parc(dr) { var n = parseInt(String(dr.num_parcialidad || '0').trim() || '0', 10); return /^\s*[+-]?\d+\s*$/.test(String(dr.num_parcialidad || '0')) ? n : 0; }
    entradas.sort(function (a, b) {
      var fa = String(a[2].fecha_pago || ''), fb = String(b[2].fecha_pago || '');
      if (fa !== fb) return fa < fb ? -1 : 1;
      var pa = parc(a[2]), pb = parc(b[2]);
      if (pa !== pb) return pa - pb;
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      return a[1] - b[1];
    });
    var veredictos = {}, acumulado = {}, ultParc = {}, ultIns = {};
    entradas.forEach(function (en) {
      var dr = en[2], orig = String(dr.uuid_original || '').trim().toUpperCase();
      var pagado = D(dr.imp_pagado === null || dr.imp_pagado === undefined || dr.imp_pagado === '' ? 0 : dr.imp_pagado);
      var leidoP = !(dr.imp_pagado === null || dr.imp_pagado === undefined || dr.imp_pagado === '');
      var ant = dr.imp_saldo_anterior, ins = dr.imp_saldo_insoluto;
      var leidoA = !(ant === null || ant === undefined || ant === ''), leidoI = !(ins === null || ins === undefined || ins === '');
      var sAnt = leidoA ? D(ant) : CERO, sIns = leidoI ? D(ins) : CERO;
      var prev = acumulado[orig] || CERO, tot = Object.prototype.hasOwnProperty.call(total, orig) ? total[orig] : null;
      var p = /^\s*[+-]?\d+\s*$/.test(String(dr.num_parcialidad === null || dr.num_parcialidad === undefined ? '' : dr.num_parcialidad)) ? parseInt(dr.num_parcialidad, 10) : null;
      var motivo = 'ADMITE';
      if (leidoP && leidoA && leidoI && cmp(Dm.max(res(res(sAnt, pagado), sIns), Dm.negar(res(res(sAnt, pagado), sIns))), TOL_PAGOS) > 0) motivo = 'SALDO_INCOHERENTE';
      else if (tot !== null && cmp(tot, CERO) > 0 && cmp(sum(prev, pagado), sum(tot, TOL_PAGOS)) > 0) motivo = 'EXCEDE_TOTAL_DEL_ORIGINAL';
      else if (p !== null && Object.prototype.hasOwnProperty.call(ultParc, orig) && p <= ultParc[orig]) motivo = 'PARCIALIDAD_REPETIDA_O_EN_RETROCESO';
      else if (Object.prototype.hasOwnProperty.call(ultIns, orig) && leidoA && cmp(Dm.max(res(sAnt, ultIns[orig]), res(ultIns[orig], sAnt)), TOL_PAGOS) > 0) motivo = 'CADENA_DE_SALDOS_ROTA_ENTRE_REP';
      else {
        acumulado[orig] = sum(prev, pagado);
        if (p !== null) ultParc[orig] = p;
        if (leidoI) ultIns[orig] = sIns;
      }
      veredictos[en[0] + '|' + en[1]] = motivo;
    });
    return veredictos;
  }

  /* ----------------------------------------------------------------------------------------- calcular() */
  function calcular(cfdis, periodo) {
    var cau16 = CERO, cau8 = CERO, acr = CERO, retTer = CERO, acrConRet = CERO, retCon = CERO;
    var pendCau = [], pendAcr = [], ex = {}, noDet = [];
    function excluir(k, x) { (ex[k] = ex[k] || []).push(x); }
    var mpPorUuid = {}, usoPorUuid = {};
    cfdis.forEach(function (c) {
      if (c.es_complemento_pago || !c.uuid) return;
      mpPorUuid[String(c.uuid).trim().toUpperCase()] = c.metodo_pago;
    });
    cfdis.forEach(function (c) {
      if (c.es_complemento_pago || !c.uuid) return;
      usoPorUuid[String(c.uuid).trim().toUpperCase()] = String(c.uso_cfdi || '').trim().toUpperCase();
    });
    var libro = libroDePagos(cfdis);
    var tcFaltan = [], repTcFaltan = [], fpSinConf = [], efSinDet = [];

    cfdis.forEach(function (c) {
      if (c.tc_faltante) { tcFaltan.push({ uuid: c.uuid, moneda: c.moneda }); return; }
      if (c.es_complemento_pago) {
        ((c.complemento_pago || {}).documentos_relacionados || []).forEach(function (dr, idx) {
          var ivaDr = D(dr.iva_dr || 0), baseDr = D(dr.base_iva_dr || 0);
          var mesFp = String(dr.fecha_pago || '').slice(0, 7);
          var otroMes = mesFp.length === 7 && !!periodo && mesFp < periodo;
          var mpRel = (dr.metodo_pago_dr || '').trim().toUpperCase();
          if (!mpRel) {
            var u = String(dr.uuid_original || '').trim().toUpperCase();
            mpRel = u && Object.prototype.hasOwnProperty.call(mpPorUuid, u) ? String(mpPorUuid[u] || '').trim().toUpperCase() : null;
          }
          var ficha = { uuid: c.uuid, uuid_original: dr.uuid_original, fecha_pago: dr.fecha_pago, iva: Dm.texto(Dm.centavos(ivaDr)), direccion: c.direccion };
          if (mpRel === 'PUE') { excluir('rep_sobre_pue', ficha); return; }
          var v = libro[String(c.uuid || '').trim().toUpperCase() + '|' + idx];
          if (v && v !== 'ADMITE') { excluir('libro_de_pagos', Object.assign({ motivo: v }, ficha)); return; }
          if (tcFaltante(dr.moneda_p, dr.tipo_cambio_p)) { repTcFaltan.push(ficha); return; }
          if (c.direccion === 'emitido') {
            if (otroMes) { excluir('rep_otro_mes', ficha); return; }
            var tras = dr.traslados_dr;
            if (tras && tras.length) {
              tras.forEach(function (t) {
                if ((t.impuesto_dr || '002') !== '002') return;
                var ti = D(t.importe_dr || 0), tasa = String(t.tasa_o_cuota_dr || '');
                if (cmp(ti, CERO) > 0) { if (tasa === '0.080000') cau8 = sum(cau8, ti); else cau16 = sum(cau16, ti); }
              });
            } else {
              cau16 = sum(cau16, ivaDr);
            }
            var retE = D(dr.iva_ret_dr || 0);
            if (cmp(retE, CERO) > 0) retCon = sum(retCon, retE);
          } else if (c.direccion === 'recibido') {
            var uso = usoPorUuid[String(dr.uuid_original || '').trim().toUpperCase()] || '';
            if (uso.charAt(0) === 'D') { excluir('deduccion_personal', ficha); return; }
            var de = decisionEfos(c.efos_status, c.fecha, c.efos_fecha_definitivo);
            if (de === 'excluir') { excluir('efos_no_acreditable', ficha); return; }
            if (de === 'definitivo_sin_fecha') excluir('efos_definitivo_sin_fecha', ficha);
            var fp = String(dr.forma_pago_p || '').trim(), crudo = dr.monto_pago_mxn;
            var pagoLeido = num(crudo);
            var pagoPos = pagoLeido !== null && cmp(pagoLeido, CERO) > 0 ? pagoLeido : null;
            var pago = fp === '01' ? (pagoPos || CERO) : D(crudo || 0);
            if (fp === '01' && !otroMes && pagoPos === null) efSinDet.push(Object.assign({ bloquea: !ivaCeroDeclarado(c, dr) }, ficha));
            if (fp && FORMAS_DINERO.indexOf(fp) < 0) fpSinConf.push(Object.assign({ forma_pago: fp, bloquea: !ivaCeroDeclarado(c, dr) }, ficha));
            if ((fp === '01' && cmp(pago, UMBRAL_EFECTIVO) > 0) || c.es_efectivo_sobre_2k) { excluir('efectivo_no_deducible', ficha); return; }
            if (otroMes) { excluir('rep_otro_mes', ficha); return; }
            acr = sum(acr, ivaDr);
            var retR = D(dr.iva_ret_dr || 0);
            if (cmp(retR, CERO) > 0) { retTer = sum(retTer, retR); acrConRet = sum(acrConRet, ivaDr); }
          }
        });
        return;
      }
      if (c.direccion === 'emitido') {
        if (c.metodo_pago === 'PUE') {
          var desc = c.descuento || CERO, be = basesExentaNoObjeto(c), exento = sum(be[0], be[1]);
          if (cmp(exento, c.subtotal) > 0) exento = c.subtotal;
          var grav = res(res(c.subtotal, desc), exento);
          if (cmp(grav, CERO) < 0) grav = CERO;
          if (cmp(c.iva, CERO) > 0) {
            var rep = repartirConservando(repartoPorTasa(c), bucketDominante(c), grav, c.iva);
            cau16 = sum(cau16, rep['16'].iva); cau8 = sum(cau8, rep['8'].iva);
          }
          if (cmp(c.iva_retenido, CERO) > 0) retCon = sum(retCon, c.iva_retenido);
        } else {
          pendCau.push(c.uuid);
        }
        return;
      }
      if (c.direccion === 'recibido') {
        var fichaR = { uuid: c.uuid, iva: Dm.texto(Dm.centavos(c.iva)), emisor_rfc: c.emisor_rfc };
        if (String(c.uso_cfdi || '').trim().toUpperCase().charAt(0) === 'D') { excluir('deduccion_personal', fichaR); return; }
        if (c.es_efectivo_sobre_2k) { excluir('efectivo_no_deducible', fichaR); return; }
        var d2 = decisionEfos(c.efos_status, c.fecha, c.efos_fecha_definitivo);
        if (d2 === 'excluir') { excluir('efos_no_acreditable', fichaR); return; }
        if (d2 === 'definitivo_sin_fecha') excluir('efos_definitivo_sin_fecha', fichaR);
        if (c.metodo_pago === 'PUE') {
          var fpc = String(c.forma_pago || '').trim();
          if (fpc && FORMAS_DINERO.indexOf(fpc) < 0) fpSinConf.push(Object.assign({ forma_pago: fpc, bloquea: !ivaCeroDeclarado(c, null) }, fichaR));
          acr = sum(acr, c.iva);
          retTer = sum(retTer, c.iva_retenido);
          if (cmp(c.iva_retenido, CERO) > 0) acrConRet = sum(acrConRet, c.iva);
        } else {
          pendAcr.push(c.uuid);
        }
      }
    });

    if (tcFaltan.length) { ex.tc_faltante = tcFaltan; noDet.push('TC_FALTANTE'); }
    if (repTcFaltan.length) { ex.rep_tc_faltante = repTcFaltan; noDet.push('REP_TC_FALTANTE'); }
    var sale = Dm.min(retTer, acrConRet);
    acr = res(acr, sale);
    var neto = res(sum(cau16, cau8), acr);
    if (fpSinConf.length) ex.formas_pago_sin_confirmar = fpSinConf;
    if (fpSinConf.some(function (x) { return x.bloquea; })) noDet.push('FORMA_DE_PAGO');
    if (efSinDet.length) ex.efectivo_importe_sin_determinar = efSinDet;
    if (efSinDet.some(function (x) { return x.bloquea; })) noDet.push('EFECTIVO_SIN_IMPORTE');
    var aplicado = Dm.min(Dm.max(neto, CERO), retCon), remanente = res(retCon, aplicado);
    var c2 = Dm.centavos, t = Dm.texto;
    var conteo = {};
    Object.keys(ex).sort().forEach(function (k) { if (ex[k].length) conteo[k] = ex[k].length; });
    return {
      iva_estado: noDet.length ? 'NO_DETERMINADO' : 'DETERMINADO', motivos_no_determinado: noDet,
      iva_causado_16: t(c2(cau16)), iva_causado_8: t(c2(cau8)), iva_causado_total: t(c2(sum(cau16, cau8))),
      iva_acreditable: t(c2(acr)), iva_retenido_a_terceros: t(c2(retTer)), entero_retenciones: t(c2(retTer)),
      iva_acreditable_retirado_por_retencion: t(c2(sale)),
      iva_retenido_al_contribuyente: t(c2(retCon)), iva_retenido_al_contribuyente_aplicado: t(c2(aplicado)),
      iva_retenido_al_contribuyente_remanente: t(c2(remanente)), iva_neto: t(c2(neto)),
      tipo: cmp(neto, CERO) > 0 ? 'a_cargo' : (cmp(neto, CERO) < 0 ? 'a_favor' : 'neutro'),
      monto_a_pagar: t(c2(sum(res(Dm.max(neto, CERO), aplicado), retTer))),
      saldo_a_favor_para_arrastrar: t(c2(sum(Dm.max(Dm.negar(neto), CERO), remanente))),
      pendiente_causado: pendCau.map(String).sort(), pendiente_acreditable: pendAcr.map(String).sort(),
      exclusiones: conteo, detalle: ex
    };
  }

  /* ------------------------------------------------------------------------------ modo manual (totales) */
  /* Los cuatro totales pasan por el MISMO calcular(), como dos comprobantes PUE sinteticos: uno emitido (IVA cobrado
     y el IVA que te retuvieron) y uno recibido (IVA de gastos pagados y el que retuviste). Asi la aritmetica final
     (retencion que sale del acreditable, aplicacion de lo que te retuvieron, saldo a favor) es la del programa. */
  var RE_IMPORTE = /^\d{1,12}(\.\d{1,2})?$/;
  function importe(texto) {
    var t = String(texto === null || texto === undefined ? '' : texto).trim().replace(/^\$\s*/, '');
    if (t === '') return CERO;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    return RE_IMPORTE.test(t) ? D(t) : null;
  }
  function manual(v) {
    var k = ['cobrado', 'pagado', 'retuviste', 'teRetuvieron'], x = {};
    for (var i = 0; i < k.length; i++) { x[k[i]] = importe(v[k[i]]); if (x[k[i]] === null) return { ok: false, campo: k[i] }; }
    var base = { tc_faltante: false, es_complemento_pago: false, metodo_pago: 'PUE', forma_pago: '03', descuento: CERO,
                 tasas_unicas: ['0.160000'], conceptos: [], es_efectivo_sobre_2k: false, efos_status: 'limpio',
                 efos_fecha_definitivo: '', uso_cfdi: 'G03', fecha: '' };
    var emitido = Object.assign({}, base, { uuid: 'MANUAL-EMITIDO', direccion: 'emitido', subtotal: x.cobrado, total: x.cobrado,
                                           iva: x.cobrado, iva_retenido: x.teRetuvieron });
    var recibido = Object.assign({}, base, { uuid: 'MANUAL-RECIBIDO', direccion: 'recibido', subtotal: x.pagado, total: x.pagado,
                                            iva: x.pagado, iva_retenido: x.retuviste });
    var r = calcular([emitido, recibido], '');
    r.ok = true;
    return r;
  }

  /* ---------------------------------------------------------------- estimar(): lo propio de la pagina */
  var RE_RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
  var MAX_ARCHIVOS = 500;

  /* Las constantes del programa (iva-datos.js, generado desde el programa). */
  function configurar(datos) {
    UMBRAL_EFECTIVO = D(datos.umbral_efectivo_mxn);
    FORMAS_DINERO = datos.formas_pago_en_dinero.slice();
    TOL_PAGOS = D(datos.tolerancia_pagos);
  }
  /* archivos: [{nombre, texto}]. Devuelve la estimacion, o la lista de lo que impide darla (falla cerrado). */
  /* El RFC y el mes, antes de leer nada: null si estan bien, o el error. */
  function validar(rfcPropio, periodo) {
    if (!RE_RFC.test(String(rfcPropio || '').trim().toUpperCase())) return { ok: false, motivo: 'RFC' };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(periodo || ''))) return { ok: false, motivo: 'PERIODO' };
    return null;
  }
  function estimar(archivos, rfcPropio, periodo, listado) {
    var rfc = String(rfcPropio || '').trim().toUpperCase();
    var v = validar(rfc, periodo);
    if (v) return v;
    if (!archivos || !archivos.length) return { ok: false, motivo: 'SIN_ARCHIVOS' };
    if (archivos.length > MAX_ARCHIVOS) return { ok: false, motivo: 'DEMASIADOS', maximo: MAX_ARCHIVOS };
    var out = { ok: true, cerrado: false, rfc: rfc, periodo: periodo, leidos: archivos.length, usados: 0,
                no_soportados: [], ilegibles: [], ajenos: [], otro_mes: [], pagos_otro_mes: [], repetidos: [], avisos_69b: [] };
    var vistos = {}, cfdis = [], avisados = {};
    archivos.forEach(function (a) {
      var r = leer(a.texto);
      if (!r.ok) {
        if (r.motivo === 'NO_SOPORTADO') out.no_soportados.push({ nombre: a.nombre, detalle: r.detalle });
        else out.ilegibles.push({ nombre: a.nombre, motivo: r.motivo, detalle: r.detalle || '' });
        return;
      }
      var m = r.m, uuid = String(m.uuid || '').trim().toUpperCase();
      if (!uuid) { out.ilegibles.push({ nombre: a.nombre, motivo: 'SIN_TIMBRE', detalle: '' }); return; }
      if (vistos[uuid]) { out.repetidos.push({ nombre: a.nombre, uuid: uuid, igual_a: vistos[uuid] }); return; }
      vistos[uuid] = a.nombre;
      var em = String(m.emisor_rfc || '').trim().toUpperCase(), rc = String(m.receptor_rfc || '').trim().toUpperCase();
      var dir = null;
      if (em === rfc && rc === rfc) { out.no_soportados.push({ nombre: a.nombre, detalle: 'el emisor y el receptor son el mismo RFC' }); return; }
      if (em === rfc) dir = 'emitido';
      else if (rc === rfc) dir = 'recibido';
      else { out.ajenos.push({ nombre: a.nombre, uuid: uuid, emisor: em, receptor: rc }); return; }
      var drs = m.complemento_pago ? m.complemento_pago.documentos_relacionados : null;
      if (dir === 'recibido') {
        var formas = drs ? drs.map(function (d) { return String(d.forma_pago_p || '').trim(); }) : (m.metodo_pago === 'PUE' ? [String(m.forma_pago || '').trim()] : []);
        var rara = formas.filter(function (f) { return f === '08' || f === '31'; })[0];
        if (rara) { out.no_soportados.push({ nombre: a.nombre, detalle: 'forma de pago ' + rara + (rara === '08' ? ' (vales de despensa)' : ' (intermediario pagos)') }); return; }
      }
      if (drs) {
        if (drs.some(function (d) { return !/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha_pago || '')); })) {
          out.no_soportados.push({ nombre: a.nombre, detalle: 'un pago no trae FechaPago' }); return;
        }
        var futuros = drs.filter(function (d) { return d.fecha_pago.slice(0, 7) > periodo; });
        futuros.forEach(function (d) { out.pagos_otro_mes.push({ nombre: a.nombre, uuid: uuid, uuid_original: d.uuid_original, fecha_pago: d.fecha_pago }); });
        m.complemento_pago.documentos_relacionados = drs.filter(function (d) { return d.fecha_pago.slice(0, 7) <= periodo; });
      } else if (m.fecha.slice(0, 7) !== periodo) {
        out.otro_mes.push({ nombre: a.nombre, uuid: uuid, fecha: m.fecha }); return;
      }
      var efos = null;
      if (dir === 'recibido') {
        efos = efosDe(listado, em);
        if (efos && !avisados[em]) {
          avisados[em] = true;
          out.avisos_69b.push({ rfc: em, situacion: efos.status, rojo: efos.status === 'presunto' || efos.status === 'definitivo',
                                fechas: { presunto: efos.fila[2], desvirtuado: efos.fila[3], definitivo: efos.fila[4], sentencia_favorable: efos.fila[5] } });
        }
      }
      cfdis.push({ c: cargar(m, dir, efos), nombre: a.nombre, total: m.total, iva: m.iva_total_traslados,
                   contraparte: dir === 'emitido' ? rc : em, fecha: m.fecha, metodo: m.metodo_pago });
    });
    out.usados = cfdis.length;
    if (out.no_soportados.length || out.ilegibles.length) { out.cerrado = true; return out; }
    out.resultado = calcular(cfdis.map(function (x) { return x.c; }), periodo);
    var porUuid = {};
    cfdis.forEach(function (x) { porUuid[String(x.c.uuid).toUpperCase()] = x; });
    function ficha(u) { var x = porUuid[String(u).toUpperCase()]; return { uuid: u, nombre: x.nombre, contraparte: x.contraparte, fecha: x.fecha, total: Dm.texto(Dm.centavos(x.total)), iva: Dm.texto(Dm.centavos(x.iva)) }; }
    out.ppd_sin_cobrar = out.resultado.pendiente_causado.map(ficha);
    out.ppd_sin_pagar = out.resultado.pendiente_acreditable.map(ficha);
    return out;
  }

  return { configurar: configurar, leer: leer, cargar: cargar, calcular: calcular, efosDe: efosDe, decisionEfos: decisionEfos,
           manual: manual, importe: importe, validar: validar, estimar: estimar, MAX_ARCHIVOS: MAX_ARCHIVOS };
});
