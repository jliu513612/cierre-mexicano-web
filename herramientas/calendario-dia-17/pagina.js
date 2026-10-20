/* Pinta el calendario del dia 17. La logica esta en calendario.js y la tabla del sexto digito en calendario-datos.js. */
(function () {
  'use strict';
  var C = window.TCCalendario, D = window.TCCalendarioDatos;
  var form = document.getElementById('f-cal');
  var res = document.getElementById('res-cal');
  if (!C || !D || !form || !res) return;
  var cal = C.crear(D);
  var MESES = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
  var CORTO = 'ene feb mar abr may jun jul ago sep oct nov dic'.split(' ');
  var DIAS = 'domingo lunes martes miércoles jueves viernes sábado'.split(' ');
  var INHABIL = { ANIO_NUEVO: '1 de enero', CONSTITUCION: 'primer lunes de febrero', JUAREZ: 'tercer lunes de marzo',
                  TRABAJO: '1 de mayo', CINCO_DE_MAYO: '5 de mayo', INDEPENDENCIA: '16 de septiembre',
                  REVOLUCION: 'tercer lunes de noviembre', NAVIDAD: '25 de diciembre',
                  TRANSMISION: '1 de diciembre, transmisión del Poder Ejecutivo' };

  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }
  function partes(iso) { var p = iso.split('-'); return { a: +p[0], m: +p[1], d: +p[2] }; }
  /* 'lun 19 oct', con el ano solo si no es el del periodo */
  function corta(iso, anio) {
    var f = partes(iso);
    return DIAS[cal.diaSemana(iso)].slice(0, 3) + ' ' + f.d + ' ' + CORTO[f.m - 1] + (f.a !== anio ? ' ' + f.a : '');
  }
  function larga(iso) { var f = partes(iso); return DIAS[cal.diaSemana(iso)] + ' ' + f.d + ' de ' + MESES[f.m - 1] + ' de ' + f.a; }
  function porque(p) {
    if (!p.motivo) return '';
    var d = partes(p.original).d;
    if (p.motivo === 'SABADO' || p.motivo === 'DOMINGO') return 'el ' + d + ' cae en ' + p.motivo.toLowerCase().replace('sabado', 'sábado');
    return 'el ' + d + ' es inhábil (' + INHABIL[p.motivo] + ')';
  }
  function celda(fila, p, anio) {
    var td = el('td');
    td.appendChild(el('span', '', corta(p.limite, anio)));
    if (p.motivo) { td.appendChild(el('br')); td.appendChild(el('small', '', porque(p))); }
    fila.appendChild(td);
  }

  function pintar(conOpinion) {
    var anio = +form.elements.anio.value, rfc = form.elements.rfc.value;
    var r = cal.calendario(anio, rfc);
    res.textContent = '';
    if (!r.ok) {
      res.className = 'res bad';
      res.appendChild(el('h3', '', 'Elige ' + r.anios.join(' o ')));
      return;
    }
    res.className = 'res ok';
    res.appendChild(el('span', 'etq', 'Calendario'));
    res.appendChild(el('h3', '', 'Fechas límite de los periodos de ' + anio));
    var envoltura = el('div', 'tabla-wrap'), tabla = el('table', 'angosta'), cab = el('tr');
    envoltura.tabIndex = 0;
    envoltura.setAttribute('role', 'region');
    envoltura.setAttribute('aria-label', 'Fechas límite de ' + anio);
    var columnas = ['Periodo', 'Pago mensual (día 17)', 'DIOT'];
    if (r.sextoDigito !== null) columnas.push('Con la facilidad (' + r.diasExtra + (r.diasExtra === 1 ? ' día)' : ' días)'));
    columnas.forEach(function (c) { var th = el('th', '', c); th.scope = 'col'; cab.appendChild(th); });
    var thead = el('thead'), tbody = el('tbody');
    thead.appendChild(cab);
    var ultima = '';
    r.meses.forEach(function (x) {
      var fila = el('tr'), th = el('th', '', MESES[x.periodo - 1]);
      th.scope = 'row';
      fila.appendChild(th);
      celda(fila, x.dia17, anio);
      celda(fila, x.diot, anio);
      if (x.prorroga) fila.appendChild(el('td', '', corta(x.prorroga, anio)));
      tbody.appendChild(fila);
      [x.dia17.limite, x.diot.limite, x.prorroga || ''].forEach(function (f) { if (f > ultima) ultima = f; });
    });
    tabla.appendChild(thead); tabla.appendChild(tbody); envoltura.appendChild(tabla); res.appendChild(envoltura);

    var dias = cal.inhabiles(anio).concat(cal.inhabiles(anio + 1)).filter(function (f) { return f >= anio + '-02-01' && f <= ultima; });
    res.appendChild(el('p', '', 'Días inhábiles del artículo 12 del Código Fiscal en estas fechas, además de sábados y domingos: ' +
      dias.map(function (f) { return larga(f) + ' (' + INHABIL[cal.festivo(f)] + ')'; }).join('; ') + '.'));
    if (r.sextoDigito !== null) {
      res.appendChild(el('p', 'aviso', 'Si te aplica la facilidad del artículo 5.1 del Decreto (DOF 26-12-2013), la fecha del pago mensual se recorre ' +
        r.diasExtra + (r.diasExtra === 1 ? ' día hábil' : ' días hábiles') + ', según el sexto dígito numérico de tu RFC (' + r.sextoDigito +
        '). El artículo tiene supuestos excluidos y esta página no decide si te aplica. Revisa con tu contador si te aplica. La DIOT no cambia.'));
    } else if (r.conRfc) {
      res.appendChild(el('p', 'aviso', 'El RFC escrito no tiene seis dígitos: la página no muestra la fecha con la facilidad del sexto dígito.'));
    }
    res.appendChild(el('p', '', 'Calendario para declaraciones y pagos. Revisa tu caso con tu contador.'));
    if (conOpinion && window.TCUso) window.TCUso.registrar('calendario-dia-17');
    if (conOpinion && window.TCOpinion) window.TCOpinion.mostrar(res, 'calendario-dia-17', r.sextoDigito !== null ? 'CON_FACILIDAD' : (r.conRfc ? 'RFC_SIN_DIGITO' : 'CALENDARIO'));
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); pintar(true); });
  form.elements.anio.addEventListener('change', function () { pintar(false); });
  pintar(false);
})();
