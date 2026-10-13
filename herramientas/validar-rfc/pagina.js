/* Pinta el resultado del validador de RFC. La logica esta en rfc.js. Nada de lo escrito se envia ni se guarda. */
(function () {
  'use strict';
  var form = document.getElementById('f-rfc');
  var campo = document.getElementById('rfc');
  var res = document.getElementById('res-rfc');
  if (!form || !window.TCRfc) return;

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  function fila(lista, nombre, valor, clase) {
    var li = el('li');
    li.appendChild(el('span', '', nombre));
    li.appendChild(el('span', clase, valor));
    lista.appendChild(li);
  }
  function partes(r) {
    var caja = el('div', 'rfc-partes');
    var letras = r.tipo === 'PF' ? 4 : 3;
    var trozos = [[r.rfc.slice(0, letras), 'Letras'], [r.rfc.slice(letras, letras + 6), 'Fecha'],
                  [r.rfc.slice(letras + 6, letras + 8), 'Homoclave'], [r.rfc.slice(-1), 'Dígito verificador']];
    trozos.forEach(function (t) {
      var d = el('div');
      d.appendChild(el('b', '', t[0]));
      d.appendChild(el('small', '', t[1]));
      caja.appendChild(d);
    });
    caja.setAttribute('aria-hidden', 'true');
    return caja;
  }

  function pintar(r) {
    res.textContent = '';
    res.className = 'res';
    if (r.resultado === 'VACIO') {
      res.appendChild(el('h3', '', 'Escribe un RFC para validarlo'));
      return;
    }
    var persona = r.tipo === 'PF' ? 'persona física (13 caracteres)' : 'persona moral (12 caracteres)';
    if (r.resultado === 'GENERICO') {
      res.classList.add('ok');
      res.appendChild(el('span', 'etq', 'Clave genérica'));
      res.appendChild(el('h3', '', r.rfc + ' es una clave genérica'));
      res.appendChild(el('p', '', r.tipo === 'GENERICO_NAC'
        ? 'Es la clave genérica para operaciones con el público en general. La página la reconoce y no le calcula dígito verificador.'
        : 'Es la clave genérica para extranjeros. La página la reconoce y no le calcula dígito verificador.'));
      return;
    }
    if (r.resultado === 'FORMATO_INVALIDO') {
      res.classList.add('bad');
      res.appendChild(el('span', 'etq', 'No válido'));
      res.appendChild(el('h3', '', 'No tiene la estructura de un RFC'));
      r.detalle.forEach(function (d) {
        if (d.codigo === 'LONGITUD') res.appendChild(el('p', '', 'Tiene ' + d.largo + (d.largo === 1 ? ' carácter' : ' caracteres') + '. Un RFC lleva 13 si es de persona física o 12 si es de persona moral.'));
        if (d.codigo === 'CARACTERES') res.appendChild(el('p', '', 'Contiene caracteres que un RFC no admite: ' + d.cuales.split('').join(' ') + '. Solo se aceptan letras sin acento, la Ñ, el signo & y dígitos.'));
        if (d.codigo === 'ORDEN') res.appendChild(el('p', '', 'Las partes no están en el orden esperado: tres o cuatro letras, seis dígitos de fecha y tres caracteres de homoclave (letras o dígitos).'));
      });
      return;
    }
    var lista = el('ul', 'lista-res');
    fila(lista, 'Estructura', 'Correcta, de ' + persona, 'si');
    fila(lista, 'Fecha (año, mes, día)', r.fechaValida ? 'Existe' : 'No existe', r.fechaValida ? 'si' : 'no');
    if (r.resultado === 'FECHA_INVALIDA') {
      res.classList.add('bad');
      res.appendChild(el('span', 'etq', 'No válido'));
      res.appendChild(el('h3', '', 'La fecha del RFC no existe'));
      res.appendChild(el('p', '', 'Los seis dígitos ' + r.fecha + ' se leen como año ' + r.fecha.slice(0, 2) + ', mes ' + r.fecha.slice(2, 4) +
        ' y día ' + r.fecha.slice(4, 6) + ', y esa fecha no existe. Revisa la captura.'));
      fila(lista, 'Dígito verificador', 'No se evalúa', 'na');
    } else if (r.resultado === 'DIGITO_NO_COINCIDE') {
      res.classList.add('warn');
      res.appendChild(el('span', 'etq', 'Revisar'));
      res.appendChild(el('h3', '', 'El dígito verificador no coincide'));
      res.appendChild(el('p', '', 'El último carácter es ' + r.digitoRecibido + ' y el cálculo da ' + r.digitoEsperado +
        '. Lo más frecuente es un error de captura en alguna letra o número. Compara el RFC con la Constancia de Situación Fiscal.'));
      fila(lista, 'Dígito verificador', 'Escrito ' + r.digitoRecibido + ', calculado ' + r.digitoEsperado, 'no');
    } else {
      res.classList.add('ok');
      res.appendChild(el('span', 'etq', 'Estructura correcta'));
      res.appendChild(el('h3', '', 'El RFC está bien formado'));
      res.appendChild(el('p', '', 'Tiene la estructura de un RFC de ' + persona + ', la fecha existe y el dígito verificador coincide con el cálculo.'));
      fila(lista, 'Dígito verificador', 'Coincide (' + r.digitoEsperado + ')', 'si');
    }
    res.appendChild(partes(r));
    res.appendChild(lista);
    res.appendChild(el('p', '', 'Este resultado no indica si el RFC existe o está activo: eso solo se confirma con el SAT.'));
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    pintar(window.TCRfc.validar(campo.value));
  });
  form.addEventListener('reset', function () {
    res.textContent = '';
    res.className = 'res';
    campo.focus();
  });
})();
