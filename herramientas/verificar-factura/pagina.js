/* Pinta la lista de facturas leidas. La logica esta en cfdi.js. Los archivos se leen en el navegador; nada se sube. */
(function () {
  'use strict';
  var C = window.TCCfdi;
  var entrada = document.getElementById('xml');
  var zona = document.getElementById('soltar');
  var res = document.getElementById('res-xml');
  if (!C || !entrada || !res) return;
  var MAX_ARCHIVOS = 500, MAX_BYTES = 2 * 1024 * 1024;
  var ESTADO = { COMPLETO: 'Completo', INCOMPLETO: 'Incompleto', NO_ES_CFDI: 'No es un CFDI', ILEGIBLE: 'No se pudo leer' };

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  function miles(t) {
    var p = String(t).split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] !== undefined ? '.' + p[1] : '');
  }

  function leerTexto(f) {
    if (f.text) return f.text();
    return new Promise(function (ok, mal) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = mal; r.readAsText(f); });
  }

  function procesar(lista) {
    var archivos = Array.prototype.slice.call(lista || []);
    res.className = 'res';
    res.textContent = '';
    if (!archivos.length) return;
    var omitidos = archivos.length > MAX_ARCHIVOS ? archivos.length - MAX_ARCHIVOS : 0;
    archivos = archivos.slice(0, MAX_ARCHIVOS);
    Promise.all(archivos.map(function (f) {
      if (f.size > MAX_BYTES) return Promise.resolve({ nombre: f.name, r: { estado: 'ILEGIBLE', motivo: 'archivo de más de 2 MB', faltan: [], enlace: null } });
      return leerTexto(f).then(function (t) { return { nombre: f.name, r: C.analizar(t) }; },
        function () { return { nombre: f.name, r: { estado: 'ILEGIBLE', motivo: 'no se pudo abrir', faltan: [], enlace: null } }; });
    })).then(function (todos) { pintar(todos, omitidos); });
  }

  function pintar(todos, omitidos) {
    var n = { COMPLETO: 0, INCOMPLETO: 0, NO_ES_CFDI: 0, ILEGIBLE: 0 };
    todos.forEach(function (x) { n[x.r.estado]++; });
    var enlaces = todos.filter(function (x) { return x.r.enlace; }).map(function (x) { return x.r.enlace; });
    res.className = 'res ' + (n.COMPLETO === todos.length ? 'ok' : 'warn');
    res.appendChild(el('span', 'etq', n.COMPLETO === todos.length ? 'Lectura completa' : 'Revisar'));
    res.appendChild(el('h3', '', todos.length + (todos.length === 1 ? ' archivo leído' : ' archivos leídos') + ': ' +
      n.COMPLETO + (n.COMPLETO === 1 ? ' completo' : ' completos') +
      (n.INCOMPLETO ? ', ' + n.INCOMPLETO + (n.INCOMPLETO === 1 ? ' incompleto' : ' incompletos') : '') +
      (n.NO_ES_CFDI + n.ILEGIBLE ? ', ' + (n.NO_ES_CFDI + n.ILEGIBLE) + (n.NO_ES_CFDI + n.ILEGIBLE === 1 ? ' que no es CFDI o no se pudo leer' : ' que no son CFDI o no se pudieron leer') : '')));
    if (omitidos) res.appendChild(el('p', '', 'Se leyeron los primeros ' + MAX_ARCHIVOS + ' archivos; ' + omitidos + ' quedaron fuera.'));
    if (enlaces.length) {
      var copiar = el('button', 'btn btn-ghost op-enviar', enlaces.length === 1 ? 'Copiar el enlace' : 'Copiar los ' + enlaces.length + ' enlaces');
      copiar.type = 'button';
      var aviso = el('p', 'op-estado');
      aviso.setAttribute('role', 'status');
      copiar.addEventListener('click', function () {
        var hecho = function () { aviso.textContent = 'Enlaces copiados, uno por línea.'; };
        try {
          navigator.clipboard.writeText(enlaces.join('\n')).then(hecho, function () { aviso.textContent = 'No se pudieron copiar. Abre cada enlace desde la lista.'; });
        } catch (e) { aviso.textContent = 'No se pudieron copiar. Abre cada enlace desde la lista.'; }
      });
      res.appendChild(copiar);
      res.appendChild(aviso);
    }
    var lista = el('ul', 'facturas');
    todos.forEach(function (x) {
      var r = x.r, li = el('li', 'factura ' + r.estado.toLowerCase());
      var cab = el('div', 'fac-cab');
      cab.appendChild(el('span', 'fac-archivo', x.nombre));
      cab.appendChild(el('span', 'fac-estado', ESTADO[r.estado]));
      li.appendChild(cab);
      if (r.estado === 'COMPLETO' || r.estado === 'INCOMPLETO') {
        var dl = el('dl', 'fac-datos');
        [['UUID', r.uuid || 'sin UUID'], ['Emisor', (r.rfcEmisor || 'sin RFC') + (r.nombreEmisor ? ' · ' + r.nombreEmisor : '')],
          ['Receptor', (r.rfcReceptor || 'sin RFC') + (r.nombreReceptor ? ' · ' + r.nombreReceptor : '')],
          ['Total', r.total ? '$' + miles(r.total) + (r.moneda ? ' ' + r.moneda : '') : 'sin total'],
          ['Tipo y fecha', (r.tipo || '¿?') + ' · ' + (r.fecha ? r.fecha.replace('T', ' ') : 'sin fecha') + (r.version ? ' · versión ' + r.version : '')]
        ].forEach(function (d) { dl.appendChild(el('dt', '', d[0])); dl.appendChild(el('dd', '', d[1])); });
        li.appendChild(dl);
        if (r.faltan.length) li.appendChild(el('p', 'fac-falta', 'Le falta: ' + r.faltan.join(', ') + '.'));
        if (r.enlace) {
          var a = el('a', 'btn btn-primary fac-sat', 'Abrir en el SAT');
          a.href = r.enlace; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.setAttribute('aria-label', 'Abrir en el SAT la factura ' + (r.uuid || x.nombre) + ' (se abre en otra pestaña)');
          li.appendChild(a);
        }
      } else {
        li.appendChild(el('p', 'fac-falta', r.estado === 'NO_ES_CFDI' ? 'El archivo es XML pero no es un CFDI de ingreso, egreso, traslado, nómina o pago.' :
          'El archivo no es un XML bien formado' + (r.motivo ? ' (' + r.motivo + ')' : '') + '.'));
      }
      lista.appendChild(li);
    });
    res.appendChild(lista);
    if (window.TCOpinion) window.TCOpinion.mostrar(res, 'verificar-factura', n.COMPLETO === todos.length ? 'LOTE_COMPLETO' : 'LOTE_CON_PENDIENTES');
  }

  entrada.addEventListener('change', function () { procesar(entrada.files); });
  ['dragenter', 'dragover'].forEach(function (t) {
    zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.add('encima'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    zona.addEventListener(t, function (e) { e.preventDefault(); zona.classList.remove('encima'); });
  });
  zona.addEventListener('drop', function (e) {
    if (!e.dataTransfer) return;
    if (window.TCSelector) window.TCSelector.indicar(entrada, e.dataTransfer.files.length);
    procesar(e.dataTransfer.files);
  });
})();
