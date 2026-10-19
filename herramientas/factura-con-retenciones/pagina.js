/* Pinta la factura con retenciones. La logica esta en retenciones.js y las tasas en retenciones-datos.js. */
(function () {
  'use strict';
  var R = window.TCRetenciones, D = window.TCRetencionesDatos;
  var form = document.getElementById('f-ret');
  var res = document.getElementById('res-ret');
  if (!R || !D || !form || !res) return;
  var ret = R.crear(D);
  var sub = document.getElementById('subtotal'), iva = document.getElementById('iva');
  var gEmisor = document.getElementById('g-emisor'), gRegimen = document.getElementById('g-regimen');
  var ivaEditado = false;

  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }
  function miles(t) {
    var p = String(t).split('.');
    return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (p[1] !== undefined ? '.' + p[1] : '');
  }
  function valor(n) { var c = form.elements[n]; return c ? c.value : ''; }
  function visibles() {
    var flete = valor('tipo') === 'autotransporte';
    gEmisor.hidden = flete;
    gRegimen.hidden = flete || valor('emisor') !== 'PF';
  }
  /* El IVA se rellena del subtotal mientras la persona no lo haya escrito a mano. */
  sub.addEventListener('input', function () {
    if (ivaEditado) return;
    var v = ret.ivaDeSubtotal(sub.value);
    iva.value = v === null ? '' : miles(v);
  });
  iva.addEventListener('input', function () { ivaEditado = iva.value.trim() !== ''; });
  form.addEventListener('change', visibles);
  visibles();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var tipo = valor('tipo');
    var r = ret.calcular({ tipo: tipo, receptor: valor('receptor'), emisor: tipo === 'autotransporte' ? 'PF' : valor('emisor'),
                           regimen: valor('regimen'), subtotal: sub.value, iva: ivaEditado ? iva.value : null });
    res.textContent = '';
    if (!r.ok) {
      res.className = 'res bad';
      res.appendChild(el('h3', '', r.estado === 'IVA' ? 'Escribe un IVA válido' : 'Escribe un subtotal válido'));
      res.appendChild(el('p', '', 'Usa solo números, con hasta dos decimales; por ejemplo 10,000 o 2500.50.'));
      return;
    }
    if (!ivaEditado) iva.value = miles(r.iva);
    var lista = el('ul', 'lista-res');
    function fila(n, v) { var li = el('li'); li.appendChild(el('span', '', n)); li.appendChild(el('span', '', v)); lista.appendChild(li); }
    if (r.estado !== 'CON_RETENCION') {
      res.className = 'res ok';
      res.appendChild(el('span', 'etq', r.estado === 'SIN_IVA' ? 'Sin cifra' : 'Sin retención'));
      res.appendChild(el('h3', '', r.estado === 'NO_APLICA_RECEPTOR_PF' ? 'Si paga una persona física, estas retenciones no aplican'
        : r.estado === 'NO_APLICA_EMISOR_PM' ? 'Si emite una persona moral, no hay retención de honorarios ni de arrendamiento'
          : 'Sin IVA trasladado, la página no calcula la retención'));
      res.appendChild(el('p', '', r.estado === 'SIN_IVA'
        ? 'La página toma como base de la retención el IVA trasladado entre la tasa del IVA, igual que el programa; sin IVA no hay base probada y no da una cifra. Revisa el caso con tu contador.'
        : 'Las retenciones de esta página las hace una persona moral al pagar a una persona física (y, en los fletes, a quien preste el servicio).'));
      fila('Subtotal', '$' + miles(r.subtotal)); fila('IVA trasladado', '$' + miles(r.iva)); fila('Total de la factura', '$' + miles(r.neto));
      res.appendChild(lista);
    } else {
      res.className = 'res ok';
      res.appendChild(el('span', 'etq', 'Resultado'));
      res.appendChild(el('h3', '', 'Se cobra $' + miles(r.neto) + ' después de retenciones'));
      fila('Subtotal', '$' + miles(r.subtotal));
      fila('IVA trasladado' + (r.ivaCalculado ? ' (16 %)' : ' (escrito)'), '$' + miles(r.iva));
      fila(tipo === 'autotransporte' ? 'IVA retenido (4 %)' : 'IVA retenido (66.6667 % del IVA)', '−$' + miles(r.retIva));
      if (tipo !== 'autotransporte') fila('ISR retenido (' + r.tasaIsr + ' %)', '−$' + miles(r.retIsr));
      fila('Se cobra', '$' + miles(r.neto));
      res.appendChild(lista);
      res.appendChild(el('p', '', 'Base de la retención: $' + miles(r.base) + ' (IVA trasladado entre 16 %).'));
      if (r.supuestoRegimen) res.appendChild(el('p', '', 'No indicaste el régimen del emisor: la página aplica el 10 % de ISR. Si el emisor está en el RESICO (régimen 626), la retención de ISR es del 1.25 %.'));
      res.appendChild(el('p', '', 'La retención se hace al pagar y sobre lo efectivamente pagado. Revisa tu caso con tu contador.'));
    }
    if (window.TCOpinion) window.TCOpinion.mostrar(res, 'factura-con-retenciones', r.estado);
  });
})();
