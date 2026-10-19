/* Pinta el IVA del mes. La logica esta en iva.js (y decimal.js); los XML se leen con el lector de cfdi.js; el 69-B usa el
   listado.json de la pagina 69-B. Los XML y el RFC no salen del navegador. */
(function () {
  'use strict';
  var Dm = window.TCDecimal, C = window.TCCfdi, F = window.TCIva, D = window.TCIvaDatos, L = window.TCLista69b;
  var form = document.getElementById('f-iva'), res = document.getElementById('res-iva');
  var fman = document.getElementById('f-man'), rman = document.getElementById('res-man');
  if (!Dm || !C || !F || !D || !L || !form || !res) return;
  var IVA = F(Dm, C.leerXml);
  IVA.configurar(D);
  var xml = document.getElementById('xml'), soltar = document.getElementById('soltar');
  var mesM = document.getElementById('mes-m'), mesA = document.getElementById('mes-a');
  var mes = { get value() { return mesA.value + '-' + mesM.value; } };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MAX_BYTES = 2 * 1024 * 1024;
  var soltados = null, listado = null, cargando = null;

  (function () {  // anos desde 2022 y, por omision, el mes anterior, que es el que se suele declarar
    var h = new Date(), a = h.getFullYear(), m = h.getMonth();
    for (var x = a; x >= 2022; x--) { var o = document.createElement('option'); o.value = o.textContent = String(x); mesA.appendChild(o); }
    if (m === 0) { a -= 1; m = 12; }
    mesA.value = String(a); mesM.value = (m < 10 ? '0' : '') + m;
  })();

  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }
  function miles(t) {
    var neg = String(t).charAt(0) === '-', s = neg ? String(t).slice(1) : String(t), p = s.split('.');
    return (neg ? '−' : '') + '$' + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] !== undefined ? '.' + p[1] : '');
  }
  function larga(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function nombreMes(p) { var x = p.split('-'); return MESES[parseInt(x[1], 10) - 1] + ' de ' + x[0]; }
  function leerArchivo(f) {
    if (f.text) return f.text();
    return new Promise(function (ok, mal) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = mal; r.readAsText(f); });
  }
  function cargarListado() {
    if (!cargando) {
      cargando = fetch('/herramientas/lista-69b/listado.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { listado = d; return d; })
        .catch(function (e) { cargando = null; throw e; });
    }
    return cargando;
  }
  function lista(titulo, filas) {
    if (!filas.length) return;
    res.appendChild(el('h4', '', titulo));
    var ul = el('ul', 'lista-plana');
    filas.forEach(function (t) { ul.appendChild(el('li', '', t)); });
    res.appendChild(ul);
  }
  function filasRes(cont, filas) {
    var ul = el('ul', 'lista-res');
    filas.forEach(function (f) { var li = el('li'); li.appendChild(el('span', '', f[0])); li.appendChild(el('span', '', f[1])); ul.appendChild(li); });
    cont.appendChild(ul);
  }
  var EXCL = {
    efectivo_no_deducible: 'pagados en efectivo por más de $2,000: su IVA no se acredita',
    efos_no_acreditable: 'de emisores con resolución definitiva en la lista 69-B, con fecha posterior a su publicación: su IVA no se acredita',
    efos_definitivo_sin_fecha: 'de un emisor definitivo en la lista 69-B sin fecha de publicación en el listado: se acreditó; revisa con tu contador',
    deduccion_personal: 'con uso de CFDI de deducción personal (D): no se acreditan en el IVA del mes',
    rep_otro_mes: 'pagos con fecha de un mes anterior: cuentan en el mes del pago',
    rep_sobre_pue: 'pagos de facturas PUE: su IVA ya se contó con la factura',
    libro_de_pagos: 'pagos con saldos que no cuadran, parcialidades repetidas o que exceden el total de la factura: no se suman',
    formas_pago_sin_confirmar: 'con una forma de pago que no es dinero (compensación, condonación u otra): se sumó, pero la cifra queda sin determinar',
    efectivo_importe_sin_determinar: 'pagos en efectivo sin un importe legible: la cifra queda sin determinar',
    tc_faltante: 'en moneda extranjera sin tipo de cambio: no se suman y la cifra queda sin determinar',
    rep_tc_faltante: 'pagos en moneda extranjera sin tipo de cambio: no se suman y la cifra queda sin determinar'
  };
  var MOTIVO_ILEGIBLE = { XML_MAL_FORMADO: 'el XML está mal formado', NO_ES_CFDI: 'no es un CFDI', IMPORTE_ILEGIBLE: 'un importe no se puede leer', SIN_TIMBRE: 'no trae el timbre fiscal (UUID)' };

  function pintar(r) {
    res.textContent = '';
    if (!r.ok) {
      res.className = 'res bad';
      res.appendChild(el('h3', '', r.motivo === 'RFC' ? 'Escribe tu RFC' : r.motivo === 'PERIODO' ? 'Elige el mes' :
        r.motivo === 'SIN_ARCHIVOS' ? 'Selecciona los XML del mes' : 'Son más de ' + r.maximo + ' archivos'));
      if (r.motivo === 'RFC') res.appendChild(el('p', '', 'Doce caracteres si es persona moral o trece si es persona física, sin guiones.'));
      return 'ERROR_' + r.motivo;
    }
    var clase;
    if (r.cerrado) {
      res.className = 'res bad';
      res.appendChild(el('span', 'etq', 'Sin estimación'));
      res.appendChild(el('h3', '', 'No se puede estimar el IVA con estos archivos'));
      res.appendChild(el('p', '', 'Una estimación sin estos comprobantes daría una cifra equivocada. Quítalos de la selección si no son del mes, o revisa el mes con tu contador.'));
      lista('Archivos que la página todavía no calcula', r.no_soportados.map(function (x) { return x.nombre + ': ' + x.detalle; }));
      lista('Archivos que no se pudieron leer', r.ilegibles.map(function (x) { return x.nombre + ': ' + (MOTIVO_ILEGIBLE[x.motivo] || x.motivo) + (x.detalle && x.motivo === 'IMPORTE_ILEGIBLE' ? ' (' + x.detalle + ')' : ''); }));
      clase = 'SIN_ESTIMACION';
    } else {
      var e = r.resultado, sinDet = e.iva_estado === 'NO_DETERMINADO';
      res.className = 'res ' + (sinDet ? 'bad' : 'ok');
      res.appendChild(el('span', 'etq', sinDet ? 'Cifra sin determinar' : 'Estimación'));
      res.appendChild(el('h3', '', e.tipo === 'a_cargo' ? 'IVA a cargo de ' + nombreMes(r.periodo) + ': ' + miles(e.iva_neto) :
        e.tipo === 'a_favor' ? 'IVA a favor de ' + nombreMes(r.periodo) + ': ' + miles(e.iva_neto.replace('-', '')) :
          'Sin IVA a cargo ni a favor en ' + nombreMes(r.periodo)));
      if (sinDet) res.appendChild(el('p', 'aviso', 'Hay comprobantes que no permiten dar la cifra por buena (abajo se dice cuáles). La estimación los incluye como el programa, pero queda sin determinar: revisa esos comprobantes con tu contador.'));
      var f = [['IVA trasladado cobrado al 16 %', miles(e.iva_causado_16)]];
      if (e.iva_causado_8 !== '0.00') f.push(['IVA trasladado cobrado al 8 %', miles(e.iva_causado_8)]);
      f.push(['IVA acreditable de gastos pagados', '−' + miles(e.iva_acreditable)]);
      f.push([e.tipo === 'a_favor' ? 'IVA a favor del mes' : 'IVA del mes', miles(e.iva_neto)]);
      if (e.iva_retenido_al_contribuyente !== '0.00') f.push(['IVA que te retuvieron (aplicado)', '−' + miles(e.iva_retenido_al_contribuyente_aplicado)]);
      if (e.iva_retenido_a_terceros !== '0.00') f.push(['IVA que retuviste a proveedores (se paga aparte)', miles(e.entero_retenciones)]);
      f.push(['Total a pagar en el mes', miles(e.monto_a_pagar)]);
      if (e.saldo_a_favor_para_arrastrar !== '0.00') f.push(['Saldo a favor', miles(e.saldo_a_favor_para_arrastrar)]);
      filasRes(res, f);
      if (e.iva_acreditable_retirado_por_retencion !== '0.00') {
        res.appendChild(el('p', '', 'Del IVA acreditable se quitaron ' + miles(e.iva_acreditable_retirado_por_retencion) + ' que retuviste a tus proveedores: esa parte se acredita después de enterarla al SAT.'));
      }
      if (e.iva_retenido_al_contribuyente_remanente !== '0.00') {
        res.appendChild(el('p', '', 'Lo que te retuvieron y no cupo en el IVA a cargo (' + miles(e.iva_retenido_al_contribuyente_remanente) + ') queda en el saldo a favor.'));
      }
      r.avisos_69b.forEach(function (a) {
        var sit = L.SITUACION[{ presunto: 'P', definitivo: 'D', desvirtuado: 'V', sentencia_favorable: 'S' }[a.situacion]] || a.situacion;
        var fecha = a.fechas[a.situacion];
        var t = 'El emisor ' + a.rfc + ' aparece en la lista 69-B como ' + sit.toLowerCase() + (fecha ? ' (DOF ' + larga(fecha) + ')' : '') + '.';
        res.appendChild(el('p', a.rojo ? 'aviso' : 'neutro-69b', a.rojo ? t + ' El IVA de sus facturas podría no ser acreditable; revisa con tu contador.' : t));
      });
      lista('PPD emitidas sin cobrar en el mes (su IVA no se paga todavía)', r.ppd_sin_cobrar.map(function (x) { return x.contraparte + ', ' + larga(x.fecha) + ': total ' + miles(x.total) + ', IVA ' + miles(x.iva); }));
      lista('PPD recibidas sin pagar en el mes (su IVA no se acredita todavía)', r.ppd_sin_pagar.map(function (x) { return x.contraparte + ', ' + larga(x.fecha) + ': total ' + miles(x.total) + ', IVA ' + miles(x.iva); }));
      lista('Comprobantes y pagos que no suman o que dejan la cifra sin determinar', Object.keys(e.exclusiones).map(function (k) { return e.exclusiones[k] + ' ' + (EXCL[k] || k); }));
      clase = sinDet ? 'NO_DETERMINADO' : (e.tipo === 'a_cargo' ? 'A_CARGO' : e.tipo === 'a_favor' ? 'A_FAVOR' : 'NEUTRO');
    }
    lista('De otro mes (no suman)', r.otro_mes.map(function (x) { return x.nombre + ': ' + larga(x.fecha); }).concat(r.pagos_otro_mes.map(function (x) { return x.nombre + ': pago del ' + larga(x.fecha_pago); })));
    lista('Repetidos (cuentan una vez)', r.repetidos.map(function (x) { return x.nombre + ' es el mismo comprobante que ' + x.igual_a; }));
    lista('No son tuyos (no aparece tu RFC como emisor ni como receptor)', r.ajenos.map(function (x) { return x.nombre; }));
    var pie = 'Leídos ' + r.leidos + (r.leidos === 1 ? ' archivo' : ' archivos') + '; usados en la estimación ' + r.usados + '.';
    if (listado && listado.fecha_info) pie += ' Listado 69-B del SAT al ' + larga(listado.fecha_info) + (L.estado(listado) === 'NO_SE_PUDO_ACTUALIZAR' ? ' (la última actualización falló).' : '.');
    res.appendChild(el('p', 'vigencia', pie));
    res.appendChild(el('p', '', 'Es una estimación: no incluye la proporción de acreditamiento, saldos a favor anteriores ni complementarias. Revisa el resultado con tu contador.'));
    return clase;
  }

  function archivosElegidos() { return soltados || Array.prototype.slice.call(xml.files || []); }
  xml.addEventListener('change', function () { soltados = null; });
  ['dragenter', 'dragover'].forEach(function (ev) { soltar.addEventListener(ev, function (e) { e.preventDefault(); soltar.classList.add('encima'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { soltar.addEventListener(ev, function () { soltar.classList.remove('encima'); }); });
  soltar.addEventListener('drop', function (e) {
    e.preventDefault();
    soltados = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (window.TCSelector) window.TCSelector.indicar(xml, soltados.length);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fs = archivosElegidos();
    var grandes = fs.filter(function (f) { return f.size > MAX_BYTES; });
    var previo = IVA.validar(form.elements.rfc.value, mes.value);
    if (previo) { pintar(previo); return; }
    if (!fs.length) { pintar({ ok: false, motivo: 'SIN_ARCHIVOS' }); return; }
    if (fs.length > IVA.MAX_ARCHIVOS) { pintar({ ok: false, motivo: 'DEMASIADOS', maximo: IVA.MAX_ARCHIVOS }); return; }
    res.className = 'res'; res.textContent = 'Leyendo ' + fs.length + (fs.length === 1 ? ' archivo…' : ' archivos…');
    Promise.all([cargarListado(), Promise.all(fs.map(function (f) {
      return f.size > MAX_BYTES ? Promise.resolve(null) : leerArchivo(f).then(function (t) { return { nombre: f.name, texto: t }; });
    }))]).then(function (x) {
      var arch = x[1].map(function (a, i) { return a || { nombre: fs[i].name, texto: '' }; });
      var r = IVA.estimar(arch, form.elements.rfc.value, mes.value, x[0]);
      if (r.ok && grandes.length) {
        r.cerrado = true; delete r.resultado;
        grandes.forEach(function (g) { r.ilegibles.push({ nombre: g.name, motivo: 'GRANDE', detalle: '' }); });
      }
      var clase = pintar(r);
      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'iva-del-mes', clase);
    }).catch(function () {
      res.className = 'res bad'; res.textContent = '';
      res.appendChild(el('h3', '', 'No se pudo cargar el listado 69-B'));
      res.appendChild(el('p', '', 'Sin el listado la página no puede revisar a tus proveedores, así que no da la estimación. Inténtalo de nuevo en un momento.'));
    });
  });
  MOTIVO_ILEGIBLE.GRANDE = 'pesa más de 2 MB';

  if (fman && rman) fman.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = {}; ['cobrado', 'pagado', 'retuviste', 'teRetuvieron'].forEach(function (k) { v[k] = fman.elements[k].value; });
    var r = IVA.manual(v);
    rman.textContent = '';
    if (!r.ok) {
      rman.className = 'res bad';
      rman.appendChild(el('h3', '', 'Revisa el importe de «' + fman.querySelector('label[for=' + r.campo + ']').textContent + '»'));
      rman.appendChild(el('p', '', 'Usa solo números, con hasta dos decimales; por ejemplo 16,000 o 2500.50.'));
      return;
    }
    rman.className = 'res ok';
    rman.appendChild(el('span', 'etq', 'Estimación'));
    rman.appendChild(el('h3', '', r.tipo === 'a_cargo' ? 'IVA a cargo: ' + miles(r.iva_neto) : r.tipo === 'a_favor' ? 'IVA a favor: ' + miles(r.iva_neto.replace('-', '')) : 'Sin IVA a cargo ni a favor'));
    var f = [['IVA cobrado', miles(r.iva_causado_total)], ['IVA acreditable', '−' + miles(r.iva_acreditable)], ['IVA del mes', miles(r.iva_neto)]];
    if (r.iva_retenido_al_contribuyente !== '0.00') f.push(['IVA que te retuvieron (aplicado)', '−' + miles(r.iva_retenido_al_contribuyente_aplicado)]);
    if (r.iva_retenido_a_terceros !== '0.00') f.push(['IVA que retuviste (se paga aparte)', miles(r.entero_retenciones)]);
    f.push(['Total a pagar en el mes', miles(r.monto_a_pagar)]);
    if (r.saldo_a_favor_para_arrastrar !== '0.00') f.push(['Saldo a favor', miles(r.saldo_a_favor_para_arrastrar)]);
    filasRes(rman, f);
    if (r.iva_acreditable_retirado_por_retencion !== '0.00') rman.appendChild(el('p', '', 'Del IVA acreditable se quitaron ' + miles(r.iva_acreditable_retirado_por_retencion) + ' que retuviste: esa parte se acredita después de enterarla al SAT.'));
    rman.appendChild(el('p', '', 'Es una estimación con los totales que escribiste. Revisa el resultado con tu contador.'));
    if (window.TCOpinion) window.TCOpinion.mostrar(rman, 'iva-del-mes', 'MANUAL');
  });
})();
