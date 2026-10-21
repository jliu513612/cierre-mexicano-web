/* Cuenta los USOS reales de las herramientas de taxcerteza.mx: se llama cuando la persona EJECUTA el calculo, el cotejo
   o la verificacion (no al abrir la pagina). Envia SOLO el nombre de la herramienta y, si sirve, cuantos elementos se
   procesaron (p. ej. 120 XML). Nada de lo que la persona escribe o sube: `cuerpo` no recibe nada mas, asi que no puede
   mandarlo. Sin la IP ni nada derivado de ella (lo registra la funcion /descargar, ver netlify/lib/descargas.mjs).
   Un uso repetido de la MISMA herramienta en menos de 2 segundos no se vuelve a contar (doble clic, repintado).
   Si el envio falla o este archivo no carga, la herramienta funciona igual.
   Pruebas: .herramientas/pruebas/uso.test.js y .herramientas/prueba_navegador.mjs (mira lo que SALE por la red). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCUso = fabrica(raiz);
})(this, function (ventana) {
  'use strict';

  var RUTA = '/descargar/uso', VENTANA_MS = 2000, MAX_ELEMENTOS = 1000;

  /* El cuerpo del envio: solo {herramienta, n} y, si es una accion aparte (p. ej. «descarga_rango»), su nombre. El
     nombre de la accion tiene forma fija; nada de lo que la persona eligio (fechas, rangos) cabe ahi. */
  function cuerpo(herramienta, n, accion) {
    var c = { herramienta: String(herramienta) };
    if (typeof n === 'number' && isFinite(n) && n > 0) c.n = Math.min(Math.floor(n), MAX_ELEMENTOS);
    if (typeof accion === 'string' && /^[a-z_]{1,30}$/.test(accion)) c.accion = accion;
    return JSON.stringify(c);
  }

  /* Dedupe en el navegador: ¿cuenta este uso? `ahora` en ms; `ultimos` guarda el ultimo uso por herramienta. */
  function cuenta(ultimos, herramienta, ahora) {
    var antes = ultimos[herramienta];
    if (antes !== undefined && ahora - antes < VENTANA_MS) return false;
    ultimos[herramienta] = ahora;
    return true;
  }

  var api = { cuerpo: cuerpo, cuenta: cuenta, RUTA: RUTA, VENTANA_MS: VENTANA_MS };
  if (!ventana || !ventana.fetch) return api;

  var ultimos = {};
  api.registrar = function (herramienta, n, accion) {
    try {
      if (!cuenta(ultimos, herramienta + (accion ? ':' + accion : ''), Date.now())) return;
      ventana.fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo(herramienta, n, accion),
                            keepalive: true, credentials: 'same-origin' }).catch(function () {});
    } catch (x) { /* contar nunca rompe la herramienta */ }
  };
  return api;
});
