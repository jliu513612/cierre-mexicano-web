/* Pinta el conversor y los avisos de la pagina de la UMA. La logica esta en uma.js y los numeros en uma-datos.js.
   Nada de lo escrito se envia ni se guarda. */
(function () {
  'use strict';
  var form = document.getElementById('f-uma');
  var res = document.getElementById('res-uma');
  var aviso = document.getElementById('uma-aviso');
  var rotulo = document.getElementById('uma-rotulo');
  if (!form || !window.TCUma || !window.TCUmaDatos) return;
  var uma = window.TCUma.crear(window.TCUmaDatos);
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var NOMBRE = { diario: 'diaria', mensual: 'mensual', anual: 'anual' };

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hoyIso() {
    var h = new Date();
    return h.getFullYear() + '-' + dos(h.getMonth() + 1) + '-' + dos(h.getDate());
  }
  function larga(iso) {
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function miles(t) {
    var p = t.split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] !== undefined ? '.' + p[1] : '');
  }
  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  /* Aviso segun el dia: en enero, que viene un valor nuevo; despues del 31 de enero sin confirmar, que este ya no rige. */
  var hoy = hoyIso();
  var estado = uma.estadoPagina(hoy);
  var ult = uma.ultimo;
  if (estado === 'ENERO') {
    aviso.hidden = false;
    aviso.textContent = 'Estos valores rigen hasta el ' + larga(ult.hasta) + '. El INEGI publica los valores nuevos en los primeros diez días de enero y entran en vigor el 1 de febrero. Esta página todavía no tiene confirmado el valor nuevo.';
  } else if (estado === 'SIN_CONFIRMAR') {
    aviso.hidden = false;
    rotulo.textContent = 'Último valor confirmado de la UMA (ya no vigente)';
    aviso.textContent = 'Estos valores rigieron hasta el ' + larga(ult.hasta) + '. Desde el día siguiente rige un valor nuevo que todavía no está confirmado en esta página. Consulta la publicación del INEGI en el Diario Oficial de la Federación.';
  }

  var fecha = document.getElementById('fecha');
  var cantidad = document.getElementById('cantidad');
  var etiqueta = document.getElementById('l-cantidad');
  fecha.value = hoy;
  fecha.min = uma.primero.desde;

  function sentido() { return form.elements.sentido.value; }
  form.addEventListener('change', function (e) {
    if (e.target.name !== 'sentido') return;
    var pesos = sentido() === 'PESOS_A_VECES';
    etiqueta.textContent = pesos ? 'Pesos' : 'Veces UMA';
    cantidad.placeholder = pesos ? '2,932.75' : '25';
  });

  function error(titulo, texto) {
    res.className = 'res bad';
    res.textContent = '';
    res.appendChild(el('h3', '', titulo));
    res.appendChild(el('p', '', texto));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = uma.convertir({ sentido: sentido(), cantidad: cantidad.value, periodo: form.elements.periodo.value, fecha: fecha.value });
    if (!r.ok) {
      if (r.motivo === 'CANTIDAD') error('Escribe una cantidad válida', 'Usa solo números, por ejemplo 25 o 1,250.50. Se aceptan hasta seis decimales y no se aceptan cantidades negativas.');
      else if (r.motivo === 'FECHA_INVALIDA') error('Indica la fecha de la operación', 'El conversor necesita la fecha para tomar el valor que regía ese día.');
      else if (r.motivo === 'ANTERIOR_A_TABLA') error('La fecha es anterior a los valores de esta página', 'Esta página tiene valores desde el ' + larga(uma.primero.desde) + '. Para una fecha anterior consulta la publicación del INEGI de ese año.');
      else if (r.motivo === 'SIN_CONFIRMAR') error('El valor de esa fecha no está confirmado aquí', 'El último valor de esta página rigió hasta el ' + larga(ult.hasta) + '. Para una fecha posterior consulta la publicación del INEGI en el Diario Oficial de la Federación.');
      else error('No se pudo convertir', 'Revisa los datos e inténtalo de nuevo.');
      if ((r.motivo === 'ANTERIOR_A_TABLA' || r.motivo === 'SIN_CONFIRMAR') && window.TCUso) window.TCUso.registrar('valor-uma');
      if ((r.motivo === 'ANTERIOR_A_TABLA' || r.motivo === 'SIN_CONFIRMAR') && window.TCOpinion) window.TCOpinion.mostrar(res, 'valor-uma', r.motivo);
      return;
    }
    var v = r.valor;
    res.className = 'res ok';
    res.textContent = '';
    res.appendChild(el('span', 'etq', 'Resultado'));
    if (r.sentido === 'VECES_A_PESOS') {
      res.appendChild(el('p', 'grande', '$' + miles(r.resultado)));
      res.appendChild(el('p', '', miles(r.cantidad) + (r.cantidad === '1' ? ' vez' : ' veces') + ' la UMA ' + NOMBRE[r.periodo] + ' de $' + miles(v[r.periodo]) + '.'));
    } else {
      res.appendChild(el('p', 'grande', miles(r.resultado) + ' veces la UMA ' + NOMBRE[r.periodo]));
      res.appendChild(el('p', '', '$' + miles(r.cantidad) + ' entre la UMA ' + NOMBRE[r.periodo] + ' de $' + miles(v[r.periodo]) + '.'));
    }
    var fuente = el('p', '', 'Valor de ' + v.anio + ', vigente del ' + larga(v.desde) + ' al ' + larga(v.hasta) + '. Fuente: ');
    var a = el('a', '', 'INEGI, DOF del ' + larga(v.dof));
    a.href = v.url;
    a.rel = 'noopener';
    a.style.cssText = 'color:var(--brand-d);font-weight:600;text-decoration:underline';
    fuente.appendChild(a);
    fuente.appendChild(document.createTextNode('.'));
    res.appendChild(fuente);
    if (window.TCUso) window.TCUso.registrar('valor-uma');
    if (window.TCOpinion) window.TCOpinion.mostrar(res, 'valor-uma', r.sentido);
  });
})();
