/* Pinta el diagnostico del mes. Las cifras y los hallazgos salen de diagnostico.js, que compone las tres herramientas
   (iva-del-mes, lista-69b y complemento-de-pago); esta pagina solo lee los archivos del disco y pinta. Los XML no salen
   del navegador: lo unico que viaja por la red es el listado 69-B que se DESCARGA del propio sitio, los datos de
   ejemplo si se piden, y el conteo de uso (uso.js: nombre de la herramienta, cuantos archivos y la accion, nada mas). */
(function () {
  'use strict';
  var Dm = window.TCDecimal, C = window.TCCfdi, F = window.TCIva, D = window.TCIvaDatos, L = window.TCLista69b, R = window.TCRep;
  var form = document.getElementById('f-diag'), res = document.getElementById('res-diag');
  if (!Dm || !C || !F || !D || !L || !R || !window.TCDiagnostico || !form || !res) return;
  var IVA = F(Dm, C.leerXml);
  IVA.configurar(D);
  var DG = window.TCDiagnostico(IVA, L, R);
  var xml = document.getElementById('xml'), soltar = document.getElementById('soltar'), ajustes = document.getElementById('ajustes');
  var inRfc = document.getElementById('rfc'), inMes = document.getElementById('mes'), btnEjemplo = document.getElementById('ejemplo');
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MAX_BYTES = 2 * 1024 * 1024;
  var soltados = null, cargando = null, ejemplo = null, usandoEjemplo = false;

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
    var p = String(iso).slice(0, 10).split('-');
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
        .catch(function (e) { cargando = null; throw e; });
    }
    return cargando;
  }
  function lista(cont, titulo, filas) {
    if (!filas.length) return;
    cont.appendChild(el('h4', '', titulo));
    var ul = el('ul', 'lista-plana');
    filas.forEach(function (t) { ul.appendChild(el('li', '', t)); });
    cont.appendChild(ul);
  }
  function filasRes(cont, filas) {
    var ul = el('ul', 'lista-res');
    filas.forEach(function (f) { var li = el('li'); li.appendChild(el('span', '', f[0])); li.appendChild(el('span', '', f[1])); ul.appendChild(li); });
    cont.appendChild(ul);
  }
  /* Un resultado: etiqueta, hallazgo, que significa, que revisar, fundamento (el de la herramienta de origen) y fecha. */
  function bloque(clase, etiqueta, titulo) {
    var b = el('section', 'diag-bloque ' + clase);
    b.appendChild(el('span', 'etq', etiqueta));
    b.appendChild(el('h3', '', titulo));
    res.appendChild(b);
    return b;
  }
  function explicar(b, significa, revisar, plantilla, fecha) {
    var dl = el('dl', 'diag-que');
    dl.appendChild(el('dt', '', 'Qué significa')); dl.appendChild(el('dd', '', significa));
    dl.appendChild(el('dt', '', 'Qué revisar')); dl.appendChild(el('dd', '', revisar));
    b.appendChild(dl);
    var f = el('div', 'diag-fund');
    f.appendChild(el('h4', '', 'Fundamento'));
    var t = document.getElementById(plantilla);
    if (t) f.appendChild(document.importNode(t.content, true));
    b.appendChild(f);
    b.appendChild(el('p', 'vigencia', fecha));
  }
  function ficha(x) { return x.contraparte + ', ' + larga(x.fecha) + ': total ' + miles(x.total) + ', IVA ' + miles(x.iva); }

  var MOTIVO_ILEGIBLE = { XML_MAL_FORMADO: 'el XML está mal formado', NO_ES_CFDI: 'no es un CFDI', IMPORTE_ILEGIBLE: 'un importe no se puede leer',
                          SIN_TIMBRE: 'no trae el timbre fiscal (UUID)', GRANDE: 'pesa más de 2 MB' };
  var SIT = { presunto: 'presunto', definitivo: 'definitivo', desvirtuado: 'desvirtuado', sentencia_favorable: 'con sentencia favorable' };
  function ilegible(x) { return x.nombre + ': ' + (MOTIVO_ILEGIBLE[x.motivo] || x.motivo); }

  function pintarError(motivo, extra) {
    res.className = 'res bad'; res.textContent = '';
    res.appendChild(el('h3', '', motivo === 'RFC' ? 'Escribe tu RFC' : motivo === 'PERIODO' ? 'Elige el mes' :
      motivo === 'SIN_ARCHIVOS' ? 'Selecciona los XML del mes' : motivo === 'DEMASIADOS' ? 'Son más de ' + extra + ' archivos' :
        motivo === 'LISTADO' ? 'No se pudo cargar el listado 69-B' : 'No se pudo hacer el diagnóstico'));
    if (motivo === 'RFC') res.appendChild(el('p', '', 'Doce caracteres si es persona moral o trece si es persona física, sin guiones.'));
    if (motivo === 'LISTADO') res.appendChild(el('p', '', 'Sin el listado la página no puede revisar a tus proveedores, así que no da el diagnóstico. Inténtalo de nuevo en un momento.'));
  }

  function pintar(d) {
    res.textContent = '';
    res.className = 'res diag';
    var r = d.estimacion;
    res.appendChild(el('h3', 'diag-titulo', 'Diagnóstico de ' + nombreMes(d.periodo) + ' para ' + d.rfc));
    if (usandoEjemplo) res.appendChild(el('p', 'aviso neutro', 'Son datos de ejemplo inventados: el RFC y las contrapartes son ficticios.'));
    var fuera = r.ilegibles.length + r.no_soportados.length + r.otro_mes.length + r.repetidos.length + r.ajenos.length;
    res.appendChild(el('p', 'diag-conteo', 'Leídos ' + r.leidos + (r.leidos === 1 ? ' archivo' : ' archivos') + '; usados ' + r.usados +
      (fuera ? '; ' + fuera + ' quedaron fuera (abajo se dice por qué).' : '.')));

    // (1) IVA del mes
    var e = d.iva, b1;
    if (!e) {
      b1 = bloque('bad', 'Sin cifra', 'IVA del mes: sin cifra con estos archivos');
      b1.appendChild(el('p', '', 'Hay archivos que la página todavía no calcula o que no pudo leer. Una cifra sin ellos sería equivocada.'));
      lista(b1, 'Archivos que la página todavía no calcula', r.no_soportados.map(function (x) { return x.nombre + ': ' + x.detalle; }));
      lista(b1, 'Archivos que no se pudieron leer', r.ilegibles.map(ilegible));
    } else {
      var sinDet = e.iva_estado === 'NO_DETERMINADO';
      b1 = bloque(sinDet ? 'bad' : 'ok', sinDet ? 'Cifra sin determinar' : 'Estimación',
        e.tipo === 'a_cargo' ? 'IVA a cargo: ' + miles(e.iva_neto) : e.tipo === 'a_favor' ? 'IVA a favor: ' + miles(e.iva_neto.replace('-', '')) : 'Sin IVA a cargo ni a favor');
      var f = [['IVA trasladado cobrado al 16 %', miles(e.iva_causado_16)]];
      if (e.iva_causado_8 !== '0.00') f.push(['IVA trasladado cobrado al 8 %', miles(e.iva_causado_8)]);
      f.push(['IVA acreditable de gastos pagados', '−' + miles(e.iva_acreditable)]);
      f.push([e.tipo === 'a_favor' ? 'IVA a favor del mes' : 'IVA del mes', miles(e.iva_neto)]);
      if (e.iva_retenido_al_contribuyente !== '0.00') f.push(['IVA que te retuvieron (aplicado)', '−' + miles(e.iva_retenido_al_contribuyente_aplicado)]);
      if (e.iva_retenido_a_terceros !== '0.00') f.push(['IVA que retuviste a proveedores (se paga aparte)', miles(e.entero_retenciones)]);
      f.push(['Total a pagar en el mes', miles(e.monto_a_pagar)]);
      if (e.saldo_a_favor_para_arrastrar !== '0.00') f.push(['Saldo a favor', miles(e.saldo_a_favor_para_arrastrar)]);
      filasRes(b1, f);
      if (sinDet) b1.appendChild(el('p', 'aviso', 'Hay comprobantes que no permiten dar la cifra por buena, por ejemplo en moneda extranjera sin tipo de cambio o con una forma de pago que no es dinero. La herramienta IVA del mes dice cuáles. Revisa esos comprobantes con tu contador.'));
    }
    explicar(b1, 'El IVA se causa sobre lo efectivamente cobrado y se acredita sobre lo efectivamente pagado; por eso una factura PPD cuenta solo por sus complementos de pago del mes. Es la misma estimación que la herramienta IVA del mes.',
      'Revisa la cifra contra tu cálculo del mes. Evalúa con tu contador la proporción de acreditamiento, los saldos a favor anteriores y las complementarias, que esta estimación no incluye.',
      'fund-iva', 'Calculado con los XML que subiste.');

    // (2) lista 69-B
    var rojos = d.efos.filter(function (x) { return x.rojo; });
    var b2 = bloque(rojos.length ? 'warn' : 'ok', d.efos.length ? 'Aparecen en el listado' : 'Sin coincidencias',
      d.efos.length ? (d.efos.length === 1 ? '1 proveedor aparece en la lista 69-B' : d.efos.length + ' proveedores aparecen en la lista 69-B')
        : 'Ningún proveedor de tus facturas recibidas aparece en la lista 69-B');
    d.efos.forEach(function (x) {
      var fecha = x.fechas[x.situacion];
      b2.appendChild(el('p', x.rojo ? 'aviso' : 'neutro-69b', x.rfc + (x.nombre ? ' (' + x.nombre + ')' : '') + ': ' + (SIT[x.situacion] || x.situacion) +
        (fecha ? ', DOF ' + larga(fecha) : '') + '.'));
      lista(b2, x.facturas.length === 1 ? 'Su factura del mes' : 'Sus ' + x.facturas.length + ' facturas del mes', x.facturas.map(function (fa) {
        return larga(fa.fecha) + ': total ' + miles(fa.total) + ', IVA ' + miles(fa.iva) + (fa.metodo ? ' (' + fa.metodo + ')' : '');
      }));
    });
    explicar(b2, 'El listado del artículo 69-B del CFF publica a contribuyentes por operaciones presuntamente inexistentes, en la situación que se indica. Si el proveedor aparece como presunto o como definitivo, el IVA de sus facturas podría no ser acreditable.',
      d.efos.length ? 'Revisa con tu contador tus operaciones con cada proveedor que aparece, y sus fechas frente a las fechas del listado.'
        : 'Nada que revisar en este punto con estos archivos. Que un RFC no aparezca significa que no está en el listado a esa fecha.',
      'fund-69b', 'Listado 69-B del SAT con información al ' + larga(d.fecha_listado) + (d.estado_listado === 'NO_SE_PUDO_ACTUALIZAR' ? ' (la última actualización falló).' : '.'));

    // (3) facturas PPD sin complemento de pago
    var b3, n = d.rep ? d.rep.emitidas.length + d.rep.recibidas.length : 0;
    if (!d.rep) {
      b3 = bloque('bad', 'Sin revisar', 'Facturas PPD sin complemento: sin revisar con estos archivos');
      b3.appendChild(el('p', '', 'La revisión necesita los mismos archivos que el IVA del mes; arriba se dice cuáles faltan.'));
    } else {
      b3 = bloque(n ? 'warn' : 'ok', n ? 'Sin complemento' : 'Completas',
        n ? (n === 1 ? '1 factura PPD sin complemento de pago entre tus XML' : n + ' facturas PPD sin complemento de pago entre tus XML')
          : 'Las facturas PPD del mes tienen su complemento de pago entre tus XML');
      lista(b3, 'Emitidas por ti', d.rep.emitidas.map(ficha));
      lista(b3, 'Recibidas de proveedores', d.rep.recibidas.map(ficha));
    }
    explicar(b3, 'Una factura en parcialidades o con pago posterior (PPD) lleva un complemento de pago por cada pago. Sin su complemento, la estimación del IVA no cuenta esa factura: no suma su IVA cobrado ni su IVA acreditable.',
      'Si ya cobraste o pagaste alguna de estas facturas, revisa que exista su complemento de pago y súbelo con los demás XML; la fecha límite para emitirlo está en la calculadora del complemento de pago. Si todavía no se cobra o no se paga, su IVA cuenta en el mes en que se cobre o se pague.',
      'fund-rep', 'Revisado con los XML que subiste.');

    // lo que quedo fuera, siempre a la vista: no desaparece nada
    var otros = el('section', 'diag-fuera');
    lista(otros, 'De otro mes (no suman)', r.otro_mes.map(function (x) { return x.nombre + ': ' + larga(x.fecha); })
      .concat(r.pagos_otro_mes.map(function (x) { return x.nombre + ': pago del ' + larga(x.fecha_pago); })));
    lista(otros, 'Repetidos (cuentan una vez)', r.repetidos.map(function (x) { return x.nombre + ' es el mismo comprobante que ' + x.igual_a; }));
    lista(otros, 'No son de este RFC (no aparece como emisor ni como receptor)', r.ajenos.map(function (x) { return x.nombre; }));
    if (otros.childNodes.length) res.appendChild(otros);
    res.appendChild(el('p', '', 'Es un diagnóstico con los XML que subiste. Revisa el resultado con tu contador.'));
    return !e ? 'SIN_CIFRA' : (rojos.length || n ? 'CON_HALLAZGOS' : 'SIN_HALLAZGOS');
  }

  /* Pide RFC o mes solo si no se pudieron deducir sin ambiguedad. */
  function preguntar(ded) {
    ajustes.hidden = false;
    res.className = 'res warn'; res.textContent = '';
    res.appendChild(el('h3', '', ded.rfc ? 'Elige el mes' : 'Confirma tu RFC'));
    if (!ded.rfc) res.appendChild(el('p', '', ded.rfc_empate.length ? 'Estos RFC aparecen el mismo número de veces en tus XML: ' + ded.rfc_empate.join(', ') + '. Escribe el tuyo y pulsa «Diagnosticar mi mes».' : 'No se encontró ningún RFC en los XML que se pudieron leer.'));
    if (!ded.periodo) res.appendChild(el('p', '', ded.periodo_empate.length ? 'Tus XML tienen el mismo número de comprobantes de ' + ded.periodo_empate.map(nombreMes).join(' y de ') + '. Elige el mes y pulsa «Diagnosticar mi mes».' : 'Elige el mes y pulsa «Diagnosticar mi mes».'));
    if (ded.rfc) inRfc.value = ded.rfc;
    if (ded.periodo) inMes.value = ded.periodo;
    (ded.rfc ? inMes : inRfc).focus();
  }

  function correr(arch, rfc, periodo) {
    return cargarListado().then(function (lst) {
      var d = DG.diagnosticar(arch, rfc, periodo, lst);
      if (!d.ok) { pintarError(d.motivo, d.maximo); if (window.TCUso && !usandoEjemplo) window.TCUso.registrar('diagnostico-del-mes', arch.length); return; }
      // un archivo de mas de 2 MB entro vacio: estimar lo conto como ilegible; aqui se dice la razon real
      d.estimacion.ilegibles.forEach(function (x) { if (arch.some(function (a) { return a.grande && a.nombre === x.nombre; })) x.motivo = 'GRANDE'; });
      var clase = pintar(d);
      if (window.TCUso) window.TCUso.registrar('diagnostico-del-mes', arch.length, usandoEjemplo ? 'ejemplo_ejecutado' : 'diagnostico_ejecutado');
      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'diagnostico-del-mes', usandoEjemplo ? 'EJEMPLO' : clase);
      if (window.TCCta) window.TCCta.mostrar(res, 'diagnostico-del-mes');
    }, function () { pintarError('LISTADO'); });
  }

  function archivosElegidos() { return soltados || Array.prototype.slice.call(xml.files || []); }

  function leerTodo() {
    var fs = archivosElegidos();
    if (!fs.length) { pintarError('SIN_ARCHIVOS'); return Promise.resolve(null); }
    if (fs.length > IVA.MAX_ARCHIVOS) { pintarError('DEMASIADOS', IVA.MAX_ARCHIVOS); return Promise.resolve(null); }
    res.className = 'res'; res.textContent = 'Leyendo ' + fs.length + (fs.length === 1 ? ' archivo…' : ' archivos…');
    return Promise.all(fs.map(function (f) {
      return f.size > MAX_BYTES ? Promise.resolve({ nombre: f.name, texto: '', grande: true }) : leerArchivo(f).then(function (t) { return { nombre: f.name, texto: t }; });
    }));
  }

  function diagnosticarElegidos(usarCampos) {
    usandoEjemplo = false;
    leerTodo().then(function (arch) {
      if (!arch) return;
      var ded = DG.deducir(arch);
      var rfc = usarCampos && inRfc.value.trim() ? inRfc.value : ded.rfc;
      var periodo = usarCampos && inMes.value ? inMes.value : ded.periodo;
      if (!rfc || !periodo) { preguntar({ rfc: rfc, periodo: periodo, rfc_empate: ded.rfc_empate, periodo_empate: ded.periodo_empate }); return; }
      inRfc.value = String(rfc).trim().toUpperCase(); inMes.value = periodo; ajustes.hidden = false;
      return correr(arch, rfc, periodo);
    });
  }

  xml.addEventListener('change', function () { soltados = null; ajustes.hidden = true; diagnosticarElegidos(false); });
  ['dragenter', 'dragover'].forEach(function (ev) { soltar.addEventListener(ev, function (e) { e.preventDefault(); soltar.classList.add('encima'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { soltar.addEventListener(ev, function () { soltar.classList.remove('encima'); }); });
  soltar.addEventListener('drop', function (e) {
    e.preventDefault();
    soltados = Array.prototype.slice.call(e.dataTransfer.files || []);
    if (window.TCSelector) window.TCSelector.indicar(xml, soltados.length);
    ajustes.hidden = true;
    diagnosticarElegidos(false);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (usandoEjemplo && ejemplo && !archivosElegidos().length) { correr(ejemplo.archivos, inRfc.value || ejemplo.rfc, inMes.value || ejemplo.periodo); return; }
    diagnosticarElegidos(true);
  });
  btnEjemplo.addEventListener('click', function () {
    usandoEjemplo = true;
    res.className = 'res'; res.textContent = 'Cargando los datos de ejemplo…';
    (ejemplo ? Promise.resolve(ejemplo) : fetch('/herramientas/diagnostico-del-mes/ejemplo.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }))
      .then(function (x) {
        ejemplo = x; usandoEjemplo = true;
        inRfc.value = x.rfc; inMes.value = x.periodo; ajustes.hidden = false;
        return correr(x.archivos, x.rfc, x.periodo);
      }, function () { res.className = 'res bad'; res.textContent = 'No se pudieron cargar los datos de ejemplo.'; });
  });
})();
