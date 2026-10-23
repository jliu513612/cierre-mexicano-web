/* Llamada a la accion de las herramientas de taxcerteza.mx: un bloque corto que aparece DESPUES del resultado (al final
   de la tarjeta del resultado, debajo de la opinion), nunca antes ni encima. Conecta lo que la persona acaba de hacer
   con lo que el programa hace en el cierre mensual, y lleva al video y a la descarga por las rutas que cuentan el clic
   (/descargar/ir/<destino>).
   VARA de cada frase: solo lo que el programa YA hace en 1.0.47, segun funciones.json del blog (cotejado contra 1.0.47)
   y E:/tmp/blog/mediciones_programa_2026-10-20.md. Nada en desarrollo presentado como hecho; sin precio ni factura.
   Una herramienta sin frase honesta NO lleva bloque (no esta en TEXTOS).
   Pruebas: .herramientas/pruebas/cta.test.js y .herramientas/prueba_navegador.mjs. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCCta = fabrica();
})(this, function () {
  'use strict';

  // herramienta -> [lo que acaba de hacer, lo que hace el programa]  (fuente: la entrada de funciones.json entre corchetes)
  var TEXTOS = {
    'validar-rfc': ['Aquí revisaste un RFC.',
      'El programa toma los RFC de los CFDI que descargas del SAT y revisa a los proveedores de cada cliente contra la lista 69-B.'],   // [descarga-sat, efos]
    'valor-uma': ['Aquí convertiste veces UMA a pesos.',
      'El programa trae la UMA, el salario mínimo, las tarifas y el subsidio con su fuente en el DOF y su vigencia.'],   // [parametros]
    'complemento-de-pago': ['Aquí revisaste un complemento de pago.',
      'El programa marca en cada factura del mes de tu cliente si sus complementos de pago cubren el total o solo una parte.'],   // [pagado-rep, salud-sin-rep]
    'verificar-factura': ['Aquí revisaste estas facturas una por una.',
      'El programa consulta en el SAT la vigencia de las facturas de cada cliente y la muestra junto a cada una.'],   // [vigencia]
    'lista-69b': ['Aquí consultaste la lista 69-B.',
      'El programa cruza contra ella a los proveedores de las facturas recibidas de cada cliente y deja fuera del cálculo a los definitivos.'],   // [efos]
    'factura-con-retenciones': ['Aquí calculaste las retenciones de una factura.',
      'El programa lleva las retenciones de IVA e ISR del mes de cada cliente al prellenado de su declaración mensual.'],   // [prellenado]
    'calendario-dia-17': ['Aquí viste hasta cuándo puedes declarar.',
      'El programa deja calculados el IVA y el ISR provisional del mes de cada cliente, con su memoria de cálculo en Excel.'],   // [cierre-mensual]
    'iva-del-mes': ['Aquí estimaste el IVA de un mes.',
      'El programa lo calcula cada mes para cada cliente con sus facturas y complementos de pago, y exporta la memoria de cálculo a Excel.'],   // [cierre-mensual, iva-flujo]
    'tipo-de-cambio': ['Aquí consultaste el tipo de cambio de una fecha.',
      'El programa coteja en el cierre el tipo de cambio de las facturas en dólares de cada cliente contra el FIX del DOF.'],   // [tc-facturas-dolares] solo dolares
    'diagnostico-del-mes': ['Aquí revisaste un mes con tus XML.',
      'El programa hace estas revisiones cada mes para cada cliente, con los CFDI que descarga del SAT.'],   // [descarga-sat, cierre-mensual, efos, pagado-rep]
  };

  // Condiciones de la prueba integrada de 1.0.48, MEDIDAS en el programa (license_gate.PRUEBA_DIAS = 30; entra sola al
  // primer arranque sin licencia, sin servidor ni datos personales; al terminar, los datos siguen en el equipo). Solo
  // lo que es verdad, nada que la prueba no sea (lo vigila normas.test.js). Va al sitio vivo el dia del lanzamiento de
  // 1.0.48: antes seria falso, 1.0.47 no tiene prueba.
  var CONDICIONES_PRUEBA = 'Pruébalo 30 días gratis, sin registro. Tus datos se quedan en tu equipo.';

  function el(etiqueta, clase, t) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (t !== undefined) n.textContent = t;
    return n;
  }

  /* Pone el bloque al final de `caja` (la tarjeta del resultado). Si ya habia uno, lo reemplaza. Devuelve el bloque o
     null si la herramienta no tiene frase. */
  function mostrar(caja, herramienta) {
    if (!caja || !Object.prototype.hasOwnProperty.call(TEXTOS, herramienta)) return null;
    var viejo = caja.querySelector('.cta');
    if (viejo) viejo.parentNode.removeChild(viejo);
    var t = TEXTOS[herramienta], b = el('div', 'cta');
    b.appendChild(el('p', 'cta-texto', t[0] + ' ' + t[1]));
    var acciones = el('p', 'cta-acciones');
    var video = el('a', 'cta-video', 'Ver el video de 3 minutos');
    video.href = '/descargar/ir/video';
    video.rel = 'nofollow';
    var boton = el('a', 'btn btn-primary cta-boton', 'Descargar y probar');
    boton.href = '/descargar/ir/descargar';
    boton.rel = 'nofollow';
    acciones.appendChild(boton);
    acciones.appendChild(video);
    b.appendChild(acciones);
    if (CONDICIONES_PRUEBA) b.appendChild(el('p', 'cta-condiciones', CONDICIONES_PRUEBA));
    b.appendChild(el('p', 'cta-nota', 'Para Windows 10 y 11.'));
    caja.appendChild(b);
    return b;
  }

  return { TEXTOS: TEXTOS, CONDICIONES_PRUEBA: CONDICIONES_PRUEBA, mostrar: mostrar };
});
