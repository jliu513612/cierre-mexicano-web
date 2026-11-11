/* Cuenta las VISITAS RECURRENTES de taxcerteza.mx, en conjunto y por mes: visitantes nuevos, visitantes que vuelven y
   cuantas visitas hace cada uno que vuelve. Para eso guarda en el almacenamiento del navegador (localStorage, clave
   «tc_visitante») un identificador ALEATORIO, que no contiene nada de la persona, el mes de su primera visita y el ultimo
   dia que se conto. Manda como mucho una visita al dia, y solo {visitante, desde}: ni la pagina, ni la hora, ni nada de
   lo que la persona escribe. La IP y el pais no los guarda el servidor (netlify/lib/descargas.mjs, visitaDe).
   Con «No rastrear» (Do Not Track) o Global Privacy Control activados NO crea el identificador ni manda nada. Si el
   almacenamiento no se puede usar (navegacion privada, bloqueado), tampoco: sin el, cada pagina seria un «nuevo».
   Se borra borrando los datos del sitio en el navegador. Lo explica el aviso de privacidad (/privacidad/, apartado 4).
   Pruebas: .herramientas/pruebas/visita.test.js y .herramientas/prueba_navegador.mjs (mira lo que SALE por la red). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCVisita = fabrica(raiz);
})(this, function (ventana) {
  'use strict';

  var RUTA = '/descargar/visita', CLAVE = 'tc_visitante', RE_ID = /^[0-9a-f]{32}$/, RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

  /* ¿Pide el navegador que no se le cuente? «No rastrear» o Global Privacy Control. */
  function noRastrear(nav, win) {
    return !!((nav && (nav.doNotTrack === '1' || nav.doNotTrack === 'yes' || nav.globalPrivacyControl === true)) ||
              (win && win.doNotTrack === '1'));
  }

  /* 16 bytes al azar del generador criptografico del navegador, en hexadecimal: 32 caracteres sin nada de la persona. */
  function idAleatorio(cripto) {
    var b = new Uint8Array(16), s = '';
    cripto.getRandomValues(b);
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  /* Que hacer hoy (`hoy` = AAAA-MM-DD en UTC, igual que el servidor) con lo guardado: {guardar, enviar}, los dos null si
     hoy ya se conto. Lo guardado que no tiene la forma esperada se trata como si no hubiera nada. */
  function decidir(guardado, hoy, nuevoId) {
    var g = guardado && typeof guardado === 'object' && RE_ID.test(guardado.id) && RE_MES.test(guardado.desde) ? guardado : null;
    if (g && g.dia === hoy) return { guardar: null, enviar: null };
    var n = g ? { id: g.id, desde: g.desde, dia: hoy } : { id: nuevoId(), desde: hoy.slice(0, 7), dia: hoy };
    return { guardar: n, enviar: { visitante: n.id, desde: n.desde } };
  }

  var api = { noRastrear: noRastrear, idAleatorio: idAleatorio, decidir: decidir, RUTA: RUTA, CLAVE: CLAVE };
  if (!ventana || !ventana.fetch) return api;

  try {
    if (noRastrear(ventana.navigator, ventana)) return api;
    var ls = ventana.localStorage, guardado = null;
    try { guardado = JSON.parse(ls.getItem(CLAVE) || 'null'); } catch (x) { guardado = null; }
    var d = decidir(guardado, new Date().toISOString().slice(0, 10), function () { return idAleatorio(ventana.crypto); });
    if (d.enviar) {
      var txt = JSON.stringify(d.guardar);
      ls.setItem(CLAVE, txt);
      if (ls.getItem(CLAVE) !== txt) return api;   // no se guardo: no se cuenta
      ventana.fetch(RUTA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d.enviar),
                            keepalive: true, credentials: 'same-origin' }).catch(function () {});
    }
  } catch (x) { /* contar nunca rompe la pagina */ }
  return api;
});
