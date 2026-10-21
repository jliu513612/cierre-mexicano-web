/* Pinta el tipo de cambio para efectos fiscales. Las fechas las da tc.js (la regla del programa) y los valores salen de
   /herramientas/tipo-de-cambio/fix.json, que se actualiza a diario solo si cuadra con la tabla oficial de Banxico.
   La fecha elegida no se envia a ningun servidor: se descarga la serie completa y se busca aqui. */
(function () {
  'use strict';
  var T = window.TCTipoCambio, D = window.TCTipoCambioDatos;
  var form = document.getElementById('f-tc');
  var res = document.getElementById('res-tc');
  if (!T || !D || !form || !res) return;
  var tc = T.crear(D);
  var selD = document.getElementById('tc-d'), selM = document.getElementById('tc-m'), selA = document.getElementById('tc-a');
  var MESES = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
  var DIAS = 'domingo lunes martes miércoles jueves viernes sábado'.split(' ');
  var cargando = null;

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hoyIso() { var h = new Date(); return h.getFullYear() + '-' + dos(h.getMonth() + 1) + '-' + dos(h.getDate()); }
  function larga(iso) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return DIAS[d.getUTCDay()] + ' ' + (+p[2]) + ' de ' + MESES[+p[1] - 1] + ' de ' + p[0];
  }
  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }
  function limpiar(clase) { res.textContent = ''; res.className = 'res' + (clase ? ' ' + clase : ''); }
  function cargar() {
    if (!cargando) {
      cargando = fetch('/herramientas/tipo-de-cambio/fix.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          if (!j || j.serie !== D.serie || !j.valores || !j.cotejo || j.cotejo.ok !== true) throw new Error('datos no validos');
          return j;
        });
      cargando.catch(function () { cargando = null; });
    }
    return cargando;
  }

  // dias del 1 al 31; el dia de hoy elegido de entrada si su ano esta en la lista
  for (var i = 1; i <= 31; i++) { var o = document.createElement('option'); o.value = dos(i); o.textContent = String(i); selD.appendChild(o); }
  (function () {
    var h = hoyIso().split('-');
    selD.value = h[2]; selM.value = h[1];
    if ([].some.call(selA.options, function (x) { return x.value === h[0]; })) selA.value = h[0];
  })();

  function noCubierto(fecha) {
    limpiar('bad');
    res.appendChild(el('span', 'etq', 'Sin calendario'));
    res.appendChild(el('h3', '', 'La página no responde para el ' + larga(fecha)));
    res.appendChild(el('p', '', 'Para saber qué FIX aplica hace falta el calendario de días inhábiles bancarios que la CNBV publica en el DOF, y para esa fecha no está cargado (la página tiene ' +
      tc.anios.join(', ') + '). Consulta la tabla oficial de Banxico.'));
  }

  function pintar(fecha, j) {
    var r = tc.consultar(fecha, j.valores);
    var ob = r.obligaciones;
    if (ob.motivo === 'NO_CUBIERTO') { noCubierto(fecha); return 'TC_NO_CUBIERTO'; }
    if (ob.motivo === 'SIN_DATO') {
      limpiar('warn');
      res.appendChild(el('span', 'etq', 'Sin dato'));
      // la misma regla que la descarga del rango: o Banxico aun no lo determina, o los datos no estan al dia, o no esta
      var clase = { AUN_SIN_PUBLICAR: 'TC_AUN_SIN_DATO', NO_AL_DIA: 'TC_NO_AL_DIA', SIN_DATO: 'TC_SIN_DATO' }[tc.estado(ob, j, Date.now())];
      res.appendChild(el('h3', '', clase === 'TC_AUN_SIN_DATO' ? 'Todavía no hay FIX para el ' + larga(fecha) :
        clase === 'TC_NO_AL_DIA' ? 'Los datos de esta página no están al día para el ' + larga(fecha) : 'No hay dato del FIX para el ' + larga(fecha)));
      res.appendChild(el('p', '', 'A esa fecha le corresponde el FIX determinado el ' + larga(ob.determinado) + ' y publicado en el DOF el ' +
        larga(ob.publicado_dof) + '. ' + (clase === 'TC_AUN_SIN_DATO' ? 'Banco de México todavía no lo determina; los datos de esta página llegan hasta el ' + larga(j.ultimo_dato) + '.' :
        clase === 'TC_NO_AL_DIA' ? 'Los datos de esta página llegan hasta el ' + larga(j.ultimo_dato) + ' y no traen ese. Consulta la tabla oficial de Banxico.' :
        'La serie cargada no lo trae; consulta la tabla oficial de Banxico.')));
      return clase;
    }
    limpiar('ok');
    res.appendChild(el('span', 'etq', 'Para obligaciones del ' + larga(fecha)));
    res.appendChild(el('p', 'grande', '$' + ob.valor + ' pesos por dólar'));
    // lo que cae despues de hoy (centro de Mexico) todavia no ocurre: se dice en futuro, nunca como ya publicado
    var hoyMx = new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10), futura = fecha > hoyMx;
    var pubFutura = ob.publicado_dof > hoyMx;
    res.appendChild(el('p', '', 'Es el FIX que Banco de México determinó el ' + larga(ob.determinado) + (pubFutura ?
      '. Se publica en el DOF el ' + larga(ob.publicado_dof) + ', día hábil bancario siguiente.' : ' y publicó en el DOF el ' + larga(ob.publicado_dof) + '.')));
    var anterior = new Date(Date.parse(fecha + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
    if (ob.publicado_dof !== anterior) {
      res.appendChild(el('p', '', 'El ' + larga(anterior) + (anterior > hoyMx ? ' no hay' : ' no hubo') +
        ' publicación del FIX en el DOF, así que aplica la última publicada antes.'));
    }
    var info = el('ul');
    var dof = r.dof_del_dia, det = r.determinado_del_dia;
    if (r.habil === true && dof.valor) info.appendChild(el('li', '', (futura ? 'Se publica en el DOF ese día' : 'Publicado en el DOF ese mismo día') +
      ' (el FIX determinado el ' + larga(dof.determinado) + '): $' + dof.valor + '. Ese aplica a partir del día siguiente.'));
    if (r.habil === true && det.valor) info.appendChild(el('li', '', 'FIX determinado ese día: $' + det.valor + '. Se publica en el DOF el día hábil siguiente.'));
    if (r.habil === false) info.appendChild(el('li', '', 'Ese día no es hábil bancario: Banco de México no determina FIX.'));
    if (info.childNodes.length) { res.appendChild(el('p', '', 'Solo como información:')); res.appendChild(info); }
    res.appendChild(el('p', 'aviso', 'Si la moneda se adquirió, el artículo 20 del Código Fiscal toma el tipo de cambio al que se adquirió y no este. Revisa con tu contador cuál aplica a tu operación.'));
    return 'TC_PARA_OBLIGACIONES';
  }

  function pie(j, caja) {
    caja = caja || res;
    var p = el('p', 'ayuda', 'Datos: Banco de México, serie ' + j.serie + ', hasta el ' + larga(j.ultimo_dato) +
      '. Cotejados con la tabla oficial de Banxico del ' + larga(j.cotejo.desde) + ' al ' + larga(j.cotejo.hasta) + '.');
    caja.appendChild(p);
    // Frescura: el ultimo FIX que ya debe estar a esta hora. Un valor de una fecha pasada no cambia, pero si faltan
    // los recientes se dice; nunca se muestra el ultimo valor como si fuera el de hoy.
    var esperado = tc.ultimoEsperado(Date.now());
    if (esperado === 'NO_CUBIERTO') {
      caja.appendChild(el('p', 'aviso', 'No se puede comprobar si los datos están al día: falta el calendario de días inhábiles bancarios de este año. Para fechas recientes consulta la tabla oficial de Banxico.'));
    } else if (!(j.ultimo_dato >= esperado)) {
      caja.appendChild(el('p', 'aviso', 'Los datos de esta página no están al día: el último FIX cargado es el determinado el ' + larga(j.ultimo_dato) +
        ' y Banco de México ya determinó el del ' + larga(esperado) + '. Para fechas recientes consulta la tabla oficial de Banxico.'));
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fecha = selA.value + '-' + selM.value + '-' + selD.value;
    var r = tc.consultar(fecha, {});
    if (!r.ok) {
      limpiar('bad');
      res.appendChild(el('h3', '', 'Esa fecha no existe'));
      res.appendChild(el('p', '', 'El ' + (+selD.value) + ' de ' + MESES[+selM.value - 1] + ' de ' + selA.value + ' no es una fecha del calendario.'));
      return;
    }
    if (r.obligaciones.motivo === 'NO_CUBIERTO') {
      noCubierto(fecha);
      if (window.TCUso) window.TCUso.registrar('tipo-de-cambio');
      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'tipo-de-cambio', 'TC_NO_CUBIERTO');
      return;
    }
    limpiar();
    res.appendChild(el('p', '', 'Cargando los datos de Banxico...'));
    cargar().then(function (j) {
      var clase = pintar(fecha, j);
      pie(j);
      if (window.TCUso) window.TCUso.registrar('tipo-de-cambio');
      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'tipo-de-cambio', clase);
      if (clase === 'TC_PARA_OBLIGACIONES' && window.TCCta) window.TCCta.mostrar(res, 'tipo-de-cambio');   // solo con un valor
    }, function () {
      limpiar('bad');
      res.appendChild(el('h3', '', 'No se pudieron cargar los datos de Banxico'));
      res.appendChild(el('p', '', 'Vuelve a intentarlo en un momento. Mientras tanto, el dato está en la tabla oficial de Banxico.'));
    });
  });

  /* Descarga de un rango: el archivo se arma aqui con la serie ya cargada (tc.rango y tc.csv, la misma regla que la
     consulta). Al servidor solo va el uso «descarga_rango» y cuantos dias, nunca las fechas. */
  var fRango = document.getElementById('f-rango'), resRango = document.getElementById('res-rango');
  if (!fRango || !resRango) return;
  var sel = function (id) { return document.getElementById(id); };
  ['rd', 'rh'].forEach(function (p) {
    for (var d = 1; d <= 31; d++) { var o = document.createElement('option'); o.value = dos(d); o.textContent = String(d); sel(p + '-d').appendChild(o); }
    sel(p + '-m').innerHTML = selM.innerHTML;
    sel(p + '-a').innerHTML = selA.innerHTML;
  });
  (function () {   // de entrada: del primer dia del mes a hoy
    var h = hoyIso().split('-');
    sel('rd-d').value = '01'; sel('rd-m').value = h[1]; sel('rh-d').value = h[2]; sel('rh-m').value = h[1];
    if ([].some.call(selA.options, function (x) { return x.value === h[0]; })) { sel('rd-a').value = h[0]; sel('rh-a').value = h[0]; }
  })();
  function rLimpiar(clase) { resRango.textContent = ''; resRango.className = 'res' + (clase ? ' ' + clase : ''); }
  /* La fecha elegida en los tres selectores. Un dia que no existe en ese mes (31 de abril, 30 de febrero) se toma como
     el ultimo dia de ese mes y se dice: nunca un error que pare. */
  function fechaDe(p) {
    var a = +sel(p + '-a').value, m = +sel(p + '-m').value, d = +sel(p + '-d').value;
    var ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate(), ajustada = d > ultimo;
    return { iso: a + '-' + dos(m) + '-' + dos(ajustada ? ultimo : d), ajustada: ajustada, pedido: d };
  }
  // Aviso de UNA linea encima del boton, solo cuando el rango se sale de las fechas con dato
  var aviso = document.getElementById('rango-aviso');
  function actualizarAviso() {
    if (!aviso) return;
    cargar().then(function (j) {
      var c = tc.cobertura(j), d = fechaDe('rd').iso, h = fechaDe('rh').iso;
      if (d > h) { var x = d; d = h; h = x; }
      var fuera = !c || d < c.desde || h > c.hasta;
      aviso.hidden = !fuera;
      aviso.textContent = !fuera ? '' : (c ? 'Hay tipo de cambio del ' + larga(c.desde) + ' al ' + larga(c.hasta) +
        '; los días fuera de ese tramo salen en el archivo con su motivo y sin número.' : 'Todavía no hay datos cargados.');
    }, function () {});
  }
  ['rd-d', 'rd-m', 'rd-a', 'rh-d', 'rh-m', 'rh-a'].forEach(function (id) { sel(id).addEventListener('change', actualizarAviso); });
  fRango.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = fechaDe('rd'), fh = fechaDe('rh'), desde = fd.iso, hasta = fh.iso;
    rLimpiar();
    resRango.appendChild(el('p', '', 'Cargando los datos de Banxico...'));
    cargar().then(function (j) {
      var r = tc.rango(desde, hasta, j, Date.now());
      desde = r.desde; hasta = r.hasta;
      var con = r.filas.filter(function (x) { return x.estado === 'CON_VALOR'; }).length;
      var blob = new Blob(['\ufeff' + tc.csv(r.filas)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tipo-de-cambio_' + desde + '_' + hasta + '.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
      rLimpiar(con === r.filas.length ? 'ok' : 'warn');
      resRango.appendChild(el('h3', '', 'Archivo descargado: ' + r.filas.length + (r.filas.length === 1 ? ' día' : ' días')));
      resRango.appendChild(el('p', '', con + ' con tipo de cambio' + (con === r.filas.length ? '.' :
        '; ' + (r.filas.length - con) + ' sin dato, con su motivo en la columna «Estado» y sin ningún número.')));
      var notas = [];
      [fd, fh].forEach(function (f) { if (f.ajustada) notas.push('El día ' + f.pedido + ' no existe en ese mes: tomé el ' + larga(f.iso) + '.'); });
      if (r.invertido) notas.push('Las fechas venían al revés: el archivo va del ' + larga(desde) + ' al ' + larga(hasta) + '.');
      notas.forEach(function (n) { resRango.appendChild(el('p', '', n)); });
      pie(j, resRango);
      if (window.TCUso) window.TCUso.registrar('tipo-de-cambio', r.filas.length, 'descarga_rango');
    }, function () {
      rLimpiar('bad');
      resRango.appendChild(el('h3', '', 'No se pudieron cargar los datos de Banxico'));
      resRango.appendChild(el('p', '', 'Vuelve a intentarlo en un momento.'));
    });
  });
})();
