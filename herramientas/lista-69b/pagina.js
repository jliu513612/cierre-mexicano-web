/* Pinta la consulta contra el listado 69-B. La logica esta en lista69b.js; los XML se leen con cfdi.js.
   El listado se descarga del propio sitio al consultar; los RFC escritos y los XML no salen del navegador. */
(function () {
  'use strict';
  var L = window.TCLista69b, C = window.TCCfdi;
  var form = document.getElementById('f-69b');
  var texto = document.getElementById('rfcs');
  var xml = document.getElementById('xml69');
  var res = document.getElementById('res-69b');
  var cab = document.getElementById('estado-listado');
  if (!L || !form || !res) return;
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var datos = null, cargando = null;

  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }
  function larga(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function cargar() {
    if (!cargando) {
      cargando = fetch('/herramientas/lista-69b/listado.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { datos = d; pintarEstado(); return d; })
        .catch(function (e) { cargando = null; throw e; });
    }
    return cargando;
  }
  function pintarEstado() {
    var e = L.estado(datos);
    cab.textContent = '';
    cab.className = 'aviso' + (e === 'ACTUALIZADO' ? ' neutro' : '');
    if (e === 'SIN_DATOS') { cab.textContent = 'No hay un listado con fecha disponible. La herramienta no da resultados sin saber de qué fecha es el listado.'; return; }
    var p = el('p', '', (e === 'NO_SE_PUDO_ACTUALIZAR'
      ? 'No se pudo actualizar el listado; los datos son al ' + larga(datos.fecha_info) + '. Puede haber publicaciones posteriores que esta página no tiene. '
      : 'Listado completo del SAT con información al ' + larga(datos.fecha_info) + '. ') + 'Fuente: ');
    var a = el('a', '', 'datos abiertos del SAT');
    a.href = datos.pagina_sat; a.rel = 'noopener';
    p.appendChild(a); p.appendChild(document.createTextNode('.'));
    cab.appendChild(p);
  }

  function leerXmls(archivos) {
    return Promise.all(Array.prototype.slice.call(archivos || [], 0, 500).map(function (f) {
      return (f.text ? f.text() : Promise.resolve('')).then(function (t) { return C ? C.analizar(t) : null; }, function () { return null; });
    })).then(function (rs) {
      return rs.filter(function (r) { return r && r.rfcEmisor; }).map(function (r) { return r.rfcEmisor; });
    });
  }

  function pintar(consulta, invalidos, recortados, desdeXml) {
    res.textContent = '';
    var hallados = consulta.filter(function (c) { return c.aparece; });
    res.className = 'res ' + (hallados.length ? 'warn' : 'ok');
    res.appendChild(el('span', 'etq', hallados.length ? 'Aparecen en el listado' : 'Sin coincidencias'));
    res.appendChild(el('h3', '', hallados.length
      ? hallados.length + ' de ' + consulta.length + (hallados.length === 1 ? ' RFC aparece' : ' RFC aparecen') + ' en el listado 69-B'
      : 'Ninguno de los ' + consulta.length + ' RFC aparece en el listado 69-B'));
    res.appendChild(el('p', '', 'Cotejado contra el listado del SAT con información al ' + larga(datos.fecha_info) + '. Que un RFC no aparezca significa que no está en ese listado a esa fecha.'));
    if (desdeXml) res.appendChild(el('p', '', 'RFC de emisores tomados de ' + desdeXml + (desdeXml === 1 ? ' XML.' : ' XML.')));
    if (invalidos.length) res.appendChild(el('p', '', 'No tienen forma de RFC y no se consultaron: ' + invalidos.slice(0, 10).join(', ') + (invalidos.length > 10 ? '…' : '') + '.'));
    if (recortados) res.appendChild(el('p', '', 'Se consultaron los primeros ' + L.MAX_RFC + ' RFC; ' + recortados + ' quedaron fuera.'));
    var lista = el('ul', 'facturas');
    hallados.concat(consulta.filter(function (c) { return !c.aparece; }).slice(0, 50)).forEach(function (c) {
      var li = el('li', 'factura ' + (c.aparece ? 'incompleto' : 'completo'));
      var top = el('div', 'fac-cab');
      top.appendChild(el('span', 'fac-archivo', c.rfc));
      top.appendChild(el('span', 'fac-estado', c.aparece ? c.registros.map(function (r) { return r.situacion; }).join(' / ') : 'No aparece'));
      li.appendChild(top);
      c.registros.forEach(function (r) {
        var dl = el('dl', 'fac-datos');
        var filas = [['Nombre en el listado', r.nombre], ['Situación', r.situacion]];
        if (r.fechas.presunto) filas.push(['Presunción, DOF', larga(r.fechas.presunto)]);
        if (r.fechas.desvirtuado) filas.push(['Desvirtuado, DOF', larga(r.fechas.desvirtuado)]);
        if (r.fechas.definitivo) filas.push(['Definitivo, DOF', larga(r.fechas.definitivo)]);
        if (r.fechas.sentenciaFavorable) filas.push(['Sentencia favorable, DOF', larga(r.fechas.sentenciaFavorable)]);
        filas.forEach(function (d) { dl.appendChild(el('dt', '', d[0])); dl.appendChild(el('dd', '', d[1])); });
        li.appendChild(dl);
      });
      lista.appendChild(li);
    });
    res.appendChild(lista);
    if (consulta.length - hallados.length > 50) res.appendChild(el('p', '', 'Se muestran 50 de los RFC que no aparecen.'));
    if (hallados.length) res.appendChild(el('p', '', 'Qué hacer con un proveedor que aparece depende de su situación y de las fechas de tus operaciones con él. Revísalo con tu contador.'));
    if (window.TCOpinion) window.TCOpinion.mostrar(res, 'lista-69b', hallados.length ? 'CONSULTA_CON_COINCIDENCIAS' : 'CONSULTA_SIN_COINCIDENCIAS');
  }

  function error(t) { res.className = 'res bad'; res.textContent = ''; res.appendChild(el('h3', '', t)); }

  function consultar(rfcsXml) {
    var leidos = L.leerRfcs((texto.value || '') + ' ' + (rfcsXml || []).join(' '));
    if (!leidos.validos.length) { error(leidos.invalidos.length ? 'Lo escrito no tiene forma de RFC' : 'Escribe al menos un RFC o elige XML'); return; }
    res.className = 'res'; res.textContent = 'Cargando el listado…';
    cargar().then(function () {
      if (L.estado(datos) === 'SIN_DATOS') { error('No hay un listado con fecha disponible'); return; }
      pintar(leidos.validos.map(function (r) { return L.consultar(datos, r); }), leidos.invalidos, leidos.recortados, rfcsXml ? rfcsXml.length : 0);
    }, function () { error('No se pudo cargar el listado. Vuelve a intentarlo.'); });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); consultar(null); });
  if (xml) xml.addEventListener('change', function () { leerXmls(xml.files).then(consultar); });
  cargar().catch(function () { cab.className = 'aviso'; cab.textContent = 'No se pudo cargar el listado.'; });
})();
