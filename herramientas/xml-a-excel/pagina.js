/* Pinta la vista previa y descarga el CSV para Excel. La logica esta en xml_excel.js; nada sale del navegador. */
(function () {
  'use strict';
  var X = window.TCXmlExcel;
  var entrada = document.getElementById('xml-excel');
  var zona = document.getElementById('soltar-excel');
  var res = document.getElementById('res-xml-excel');
  if (!X || !entrada || !res) return;
  var MAX_ARCHIVOS = 500, MAX_BYTES = 2 * 1024 * 1024, MAX_VISTA = 50;

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function hoyIso() {
    var h = new Date();
    var m = h.getMonth() + 1, d = h.getDate();
    return h.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function leerTexto(f) {
    if (f.text) return f.text();
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = mal;
      r.readAsText(f);
    });
  }

  function descargarCsv(filas) {
    var blob = new Blob(['\ufeff' + X.csv(filas)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cfdi-xml-a-excel_' + hoyIso() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
    if (window.TCUso) window.TCUso.registrar('xml-a-excel', filas.length, 'descarga_csv');
  }

  function procesar(lista) {
    var archivos = Array.prototype.slice.call(lista || []);
    res.className = 'res';
    res.textContent = '';
    if (!archivos.length) return;
    var omitidos = archivos.length > MAX_ARCHIVOS ? archivos.length - MAX_ARCHIVOS : 0;
    archivos = archivos.slice(0, MAX_ARCHIVOS);
    Promise.all(archivos.map(function (f) {
      if (f.size > MAX_BYTES) {
        var grande = X.leerFila(f.name, '');
        grande.observacion = 'Archivo de más de 2 MB';
        return Promise.resolve(grande);
      }
      return leerTexto(f).then(
        function (t) { return X.leerFila(f.name, t); },
        function () { var err = X.leerFila(f.name, ''); err.observacion = 'No se pudo abrir'; return err; }
      );
    })).then(function (filas) { pintar(filas, omitidos); });
  }

  function pintar(filas, omitidos) {
    var ok = 0, otros = 0;
    filas.forEach(function (f) { if (f.estado === 'OK') ok++; else otros++; });
    res.className = 'res ' + (otros === 0 ? 'ok' : (ok > 0 ? 'warn' : 'bad'));
    res.appendChild(el('span', 'etq', otros === 0 ? 'Listo para Excel' : (ok > 0 ? 'Revisar' : 'Sin CFDI válidos')));
    res.appendChild(el('h3', '', filas.length + (filas.length === 1 ? ' archivo leído' : ' archivos leídos') + ': ' +
      ok + (ok === 1 ? ' CFDI listo' : ' CFDI listos') +
      (otros ? ', ' + otros + (otros === 1 ? ' que no es CFDI o no se pudo leer' : ' que no son CFDI o no se pudieron leer') : '')));
    if (omitidos) res.appendChild(el('p', '', 'Se leyeron los primeros ' + MAX_ARCHIVOS + ' archivos; ' + omitidos + ' quedaron fuera.'));

    var boton = el('button', 'btn btn-primary op-enviar', 'Descargar archivo para Excel (.csv)');
    boton.type = 'button';
    var estadoDescarga = el('p', 'op-estado');
    estadoDescarga.setAttribute('role', 'status');
    boton.addEventListener('click', function () {
      descargarCsv(filas);
      estadoDescarga.textContent = 'Archivo descargado (' + filas.length + (filas.length === 1 ? ' fila' : ' filas') + '). Ábrelo en Excel.';
    });
    res.appendChild(boton);
    res.appendChild(estadoDescarga);

    var wrap = el('div', 'tabla-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Vista previa de CFDI leídos');
    var tabla = el('table');
    var thead = el('thead'), trHead = el('tr');
    ['Archivo', 'Tipo', 'Fecha', 'RFC emisor', 'RFC receptor', 'Subtotal', 'IVA', 'Total', 'Estado'].forEach(function (c) {
      var th = el('th', '', c);
      th.scope = 'col';
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    tabla.appendChild(thead);
    var tbody = el('tbody');
    var limite = Math.min(filas.length, MAX_VISTA);
    for (var i = 0; i < limite; i++) {
      var f = filas[i], tr = el('tr');
      [f.archivo, f.tipo || '-', f.fecha ? f.fecha.slice(0, 10) : '-', f.rfcEmisor || '-', f.rfcReceptor || '-',
        f.subtotal || '-', f.ivaTrasladado || '-', f.total || '-', f.estado === 'OK' ? 'OK' : f.estado].forEach(function (v) {
        tr.appendChild(el('td', '', v));
      });
      tbody.appendChild(tr);
    }
    tabla.appendChild(tbody);
    wrap.appendChild(tabla);
    res.appendChild(wrap);
    if (filas.length > MAX_VISTA) {
      res.appendChild(el('p', 'ayuda', 'Se muestran las primeras ' + MAX_VISTA + ' filas; el archivo descargado incluye las ' + filas.length + ' filas.'));
    }

    if (window.TCUso) window.TCUso.registrar('xml-a-excel', filas.length);
    if (window.TCOpinion) window.TCOpinion.mostrar(res, 'xml-a-excel', otros === 0 ? 'LOTE_COMPLETO' : (ok > 0 ? 'LOTE_CON_AVISOS' : 'SIN_CFDI'));
    if (window.TCCta) window.TCCta.mostrar(res, 'xml-a-excel');
  }

  entrada.addEventListener('change', function () { procesar(entrada.files); });
  if (zona) {
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
  }
})();
