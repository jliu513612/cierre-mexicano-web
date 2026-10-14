/* Pinta los resultados del asistente del complemento de pago. La logica esta en rep.js.
   Nada de lo escrito se envia ni se guarda. */
(function () {
  'use strict';
  var REP = window.TCRep;
  var fPlazo = document.getElementById('f-plazo');
  var fLleva = document.getElementById('f-lleva');
  if (!REP || !fPlazo || !fLleva) return;
  var resPlazo = document.getElementById('res-plazo');
  var resLleva = document.getElementById('res-lleva');
  var gCobro = document.getElementById('g-cobro');
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var R32 = 'regla 2.7.1.32 de la RMF 2026';
  var R39 = 'regla 2.7.1.39 de la RMF 2026';

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hoyIso() {
    var h = new Date();
    return h.getFullYear() + '-' + dos(h.getMonth() + 1) + '-' + dos(h.getDate());
  }
  function larga(iso) {
    var p = iso.split('-');
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function dias(n) { return n === 1 ? '1 día' : n + ' días'; }
  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  function limpiar(caja, clase) {
    caja.textContent = '';
    caja.className = 'res' + (clase ? ' ' + clase : '');
  }

  fPlazo.addEventListener('submit', function (e) {
    e.preventDefault();
    var r = REP.consultarPlazo(document.getElementById('fecha-pago').value, hoyIso());
    if (!r.ok) {
      limpiar(resPlazo, 'bad');
      if (r.motivo === 'FUERA_DE_EJERCICIO') {
        resPlazo.appendChild(el('h3', '', 'La página solo calcula pagos recibidos en 2026'));
        resPlazo.appendChild(el('p', '', 'El plazo que aplica es el de la ' + R32 + '. Para un pago de ' + r.ejercicio + ' consulta la resolución miscelánea de ese ejercicio.'));
        if (window.TCOpinion) window.TCOpinion.mostrar(resPlazo, 'complemento-de-pago', 'PLAZO_FUERA_DE_EJERCICIO');
      } else {
        resPlazo.appendChild(el('h3', '', 'Indica la fecha en que se recibió el pago'));
        resPlazo.appendChild(el('p', '', 'Con esa fecha la página calcula el día límite para emitir el complemento.'));
      }
      return;
    }
    var p = r.plazo;
    limpiar(resPlazo, p.estado === 'VENCIDO' ? 'bad' : (p.estado === 'URGENTE' ? 'warn' : 'ok'));
    resPlazo.appendChild(el('span', 'etq', p.estado === 'VENCIDO' ? 'Plazo vencido' : (p.estado === 'URGENTE' ? 'Por vencer' : 'En plazo')));
    resPlazo.appendChild(el('h3', '', 'El REP se puede emitir a más tardar el'));
    resPlazo.appendChild(el('p', 'grande', larga(r.limite)));
    var cuenta;
    if (p.dias < 0) cuenta = 'El plazo venció hace ' + dias(-p.dias) + '. Esta página no evalúa las consecuencias de emitirlo fuera de plazo.';
    else if (p.dias === 0) cuenta = 'El plazo vence hoy.';
    else cuenta = (p.dias === 1 ? 'Falta ' : 'Faltan ') + dias(p.dias) + ', contando desde hoy.';
    resPlazo.appendChild(el('p', '', cuenta));
    resPlazo.appendChild(el('p', '', 'Pago recibido el ' + larga(r.fechaPago) + '. La ' + R32 + ' da hasta el quinto día natural del mes inmediato siguiente al del pago. Todos los pagos recibidos en ese mes tienen el mismo día límite.'));
    if (r.pagoFuturo) resPlazo.appendChild(el('p', '', 'La fecha indicada es posterior a hoy: el cálculo supone que el pago se recibe ese día.'));
    if (r.limiteNoComputable) {
      var cae = r.limiteNoComputable === 'SABADO' ? 'en sábado' : (r.limiteNoComputable === 'DOMINGO' ? 'en domingo' : 'en un día festivo del artículo 12 del CFF');
      resPlazo.appendChild(el('p', 'op-nota-plazo', 'El ' + larga(r.limite) + ' cae ' + cae + '. La página no recorre la fecha porque la regla habla de día natural; si el artículo 12 del CFF permite pasarla al siguiente día hábil es un punto que conviene confirmar con tu contador.'));
    }
    if (r.limiteEnOtroEjercicio) resPlazo.appendChild(el('p', '', 'El día límite cae en ' + r.limite.slice(0, 4) + '. La página aplica la regla de 2026: confirma el plazo en la resolución miscelánea de ' + r.limite.slice(0, 4) + ' cuando se publique.'));
    if (window.TCOpinion) window.TCOpinion.mostrar(resPlazo, 'complemento-de-pago', 'PLAZO_' + p.estado);
  });

  function valor(nombre) {
    var c = fLleva.elements[nombre];
    return c && c.value ? c.value : null;
  }
  fLleva.addEventListener('change', function () {
    gCobro.hidden = valor('metodo') !== 'PUE';
  });

  fLleva.addEventListener('submit', function (e) {
    e.preventDefault();
    var metodo = valor('metodo');
    var r = REP.llevaRep({ metodo: metodo, forma: valor('forma'), cobro: metodo === 'PUE' ? valor('cobro') : null });
    var t;
    if (r.resultado === 'FALTAN_DATOS') {
      limpiar(resLleva, 'bad');
      resLleva.appendChild(el('h3', '', 'Faltan datos'));
      resLleva.appendChild(el('p', '', metodo === 'PUE'
        ? 'Elige la forma de pago e indica cómo va el cobro de la factura.'
        : 'Elige el método y la forma de pago de la factura.'));
      return;
    }
    if (r.resultado === 'SI') {
      limpiar(resLleva, 'ok');
      resLleva.appendChild(el('span', 'etq', 'Sí lleva REP'));
      resLleva.appendChild(el('h3', '', 'Se emite un complemento por cada pago recibido'));
      resLleva.appendChild(el('p', '', 'Cuando la contraprestación no se paga en una sola exhibición, o se paga después de expedir el comprobante, se emite un CFDI por el valor total de la operación y un CFDI por cada pago que se reciba (CFF, artículo 29-A, fracción VII, inciso b).'));
      resLleva.appendChild(el('p', '', 'La ' + R32 + ' permite emitir uno por cada pago o uno solo por todos los pagos del mes de un mismo receptor, a más tardar el quinto día natural del mes siguiente al del pago.'));
    } else if (r.resultado === 'NO') {
      limpiar(resLleva, 'ok');
      resLleva.appendChild(el('span', 'etq', 'No lleva REP'));
      resLleva.appendChild(el('h3', '', 'La factura se pagó en una sola exhibición'));
      resLleva.appendChild(el('p', '', 'El complemento corresponde al caso en que la contraprestación no se paga en una sola exhibición (CFF, artículo 29-A, fracción VII). Una factura PUE cobrada completa a más tardar el último día del mes en que se expidió no lleva REP (' + R39 + ').'));
    } else if (r.resultado === 'NO_POR_AHORA') {
      limpiar(resLleva, 'warn');
      resLleva.appendChild(el('span', 'etq', 'Por ahora no lleva REP'));
      resLleva.appendChild(el('h3', '', 'Depende de que se cobre completa antes de que termine el mes'));
      resLleva.appendChild(el('p', '', 'La ' + R39 + ' permite emitir la factura como PUE sin haber recibido el pago, siempre que el total se cobre a más tardar el último día del mes en que se expidió.'));
      resLleva.appendChild(el('p', '', 'Si termina el mes y no se cobró completa, el resultado cambia: vuelve a consultar con la tercera opción de cobro.'));
    } else if (r.resultado === 'SUSTITUIR') {
      limpiar(resLleva, 'warn');
      resLleva.appendChild(el('span', 'etq', 'La regla prevé sustituirla'));
      resLleva.appendChild(el('h3', '', 'Esta factura PUE no lleva REP; los pagos posteriores sí'));
      resLleva.appendChild(el('p', '', 'Para una factura PUE que no se cobró completa a más tardar el último día del mes de expedición, la ' + R39 + ' indica cancelar ese CFDI y emitir uno nuevo con forma de pago 99 y método PPD, relacionado con el original como sustitución. Los pagos que se reciban después se documentan con REP.'));
      resLleva.appendChild(el('p', '', 'La cancelación tiene sus propias condiciones en el artículo 29-A del CFF. Antes de cancelar conviene confirmar que la factura de verdad no se cobró.'));
    } else {
      limpiar(resLleva, 'warn');
      resLleva.appendChild(el('span', 'etq', 'Sin resultado'));
      resLleva.appendChild(el('h3', '', 'La página no cubre esta combinación'));
      resLleva.appendChild(el('p', '', 'Las reglas que aplica esta página no describen una factura con método PUE y forma de pago 99. Revisa la guía de llenado del CFDI.'));
    }
    if (r.avisos.indexOf('FORMA_NO_EVALUADA') >= 0) {
      t = 'El resultado sale del método de pago. Esta página no evalúa si la clave de forma de pago elegida es compatible con el método PPD: revísalo en la guía de llenado del CFDI.';
      resLleva.appendChild(el('p', '', t));
    }
    if (window.TCOpinion) window.TCOpinion.mostrar(resLleva, 'complemento-de-pago', 'LLEVA_' + r.resultado);
  });
})();
