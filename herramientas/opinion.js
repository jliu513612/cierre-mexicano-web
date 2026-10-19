/* «¿Te sirvió este resultado?» de las herramientas de taxcerteza.mx.

   QUE SE ENVIA, y nada mas: la herramienta, la CLASE del resultado (por ejemplo «DIGITO_NO_COINCIDE»), el voto,
   el motivo que la persona escriba, su correo si lo da y la fecha. Lo que se tecleo en la herramienta (un RFC, una
   cantidad, una fecha) NO se envia: `construir` no lo recibe, asi que no puede mandarlo.
   Si el envio falla, la herramienta sigue funcionando igual; este archivo puede incluso no cargar.
   Pruebas: .herramientas/pruebas/opinion.test.js y .herramientas/prueba_navegador.mjs (mira lo que SALE por la red). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCOpinion = fabrica(raiz);
})(this, function (ventana) {
  'use strict';

  var FORMULARIO = 'opinion-herramientas';
  var HERRAMIENTAS = ['validar-rfc', 'valor-uma', 'complemento-de-pago', 'verificar-factura'];
  var RE_CLASE = /^[A-Z][A-Z_]{1,39}$/;
  var RE_CORREO = /^[^\s@]{1,64}@[^\s@]{1,80}\.[^\s@]{2,20}$/;
  // Algo con forma de RFC dentro del motivo se quita antes de enviar, aunque la persona lo haya escrito.
  var RE_RFC = /[A-ZÑ&]{3,4}[ -]?\d{6}[ -]?[A-Z0-9]{3}/gi;
  var MAX_MOTIVO = 500, MAX_CORREO = 120, MAX_ENVIOS = 5;

  function limpiarMotivo(texto) {
    var t = String(texto === null || texto === undefined ? '' : texto).replace(/\s+/g, ' ').trim();
    return t.replace(RE_RFC, '[RFC omitido]').slice(0, MAX_MOTIVO);
  }

  /* Devuelve { ok:true, campos, cuerpo } o { ok:false, motivo }.
     Solo acepta las claves de abajo: cualquier otra cosa que llegue en `d` se ignora. */
  function construir(d) {
    d = d || {};
    if (d.trampa) return { ok: false, motivo: 'TRAMPA' };  // campo que una persona no ve ni rellena
    if (HERRAMIENTAS.indexOf(d.herramienta) < 0) return { ok: false, motivo: 'HERRAMIENTA' };
    if (!RE_CLASE.test(String(d.clase))) return { ok: false, motivo: 'CLASE' };
    if (d.voto !== 'SI' && d.voto !== 'NO') return { ok: false, motivo: 'VOTO' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha))) return { ok: false, motivo: 'FECHA' };
    var correo = String(d.correo === null || d.correo === undefined ? '' : d.correo).trim();
    if (correo && (correo.length > MAX_CORREO || !RE_CORREO.test(correo))) return { ok: false, motivo: 'CORREO' };
    var campos = { 'form-name': FORMULARIO, herramienta: d.herramienta, clase: d.clase, voto: d.voto,
                   motivo: d.voto === 'NO' ? limpiarMotivo(d.motivo) : '', correo: d.voto === 'NO' ? correo : '', fecha: d.fecha };
    var pares = [];
    for (var k in campos) pares.push(encodeURIComponent(k) + '=' + encodeURIComponent(campos[k]));
    return { ok: true, campos: campos, cuerpo: pares.join('&') };
  }

  var api = { construir: construir, limpiarMotivo: limpiarMotivo, FORMULARIO: FORMULARIO, MAX_ENVIOS: MAX_ENVIOS };
  if (!ventana || !ventana.document) return api;

  // ---------------------------------------------------------------- en la pagina
  var doc = ventana.document;
  var envios = 0;

  function el(etiqueta, clase, texto) {
    var n = doc.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  function hoy() {
    var h = new Date(), m = h.getMonth() + 1, d = h.getDate();
    return h.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  function enviar(datos, alTerminar) {
    var e = construir(datos);
    if (!e.ok) { alTerminar(e.motivo === 'TRAMPA' ? 'OK' : e.motivo); return; }
    if (envios >= MAX_ENVIOS) { alTerminar('TOPE'); return; }
    envios++;
    try {
      ventana.fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: e.cuerpo })
        .then(function (r) { alTerminar(r && r.ok ? 'OK' : 'FALLO'); })
        .catch(function () { alTerminar('FALLO'); });
    } catch (x) { alTerminar('FALLO'); }
  }

  /* Pone el bloque de opinion al final de `caja` (la tarjeta del resultado). `clase` es la clase del resultado.
     No recibe lo tecleado. */
  function mostrar(caja, herramienta, clase) {
    try {
      var b = el('div', 'opinion');
      var id = 'op-' + herramienta + '-' + Math.random().toString(36).slice(2, 8);
      var pregunta = el('p', 'op-pregunta', '¿Te sirvió este resultado?');
      pregunta.id = id + '-p';
      var botones = el('div', 'op-botones');
      botones.setAttribute('role', 'group');
      botones.setAttribute('aria-labelledby', pregunta.id);
      var si = el('button', 'op-btn', 'Sí'), no = el('button', 'op-btn', 'No');
      si.type = no.type = 'button';
      botones.appendChild(si); botones.appendChild(no);
      var estado = el('p', 'op-estado');
      estado.setAttribute('role', 'status');
      b.appendChild(pregunta); b.appendChild(botones);

      var forma = el('div', 'op-forma');
      forma.hidden = true;
      var lm = el('label', '', 'Qué esperabas o qué está mal (opcional)');
      var motivo = el('textarea');
      motivo.id = id + '-m'; lm.htmlFor = motivo.id; motivo.maxLength = MAX_MOTIVO; motivo.rows = 3;
      var aviso = el('p', 'op-nota', 'No escribas RFC, nombres ni otros datos personales. No se envía lo que tecleaste en la herramienta: solo tu voto, el tipo de resultado y este comentario.');
      aviso.id = id + '-a'; motivo.setAttribute('aria-describedby', aviso.id);
      var lc = el('label', '', 'Correo, solo si quieres que te respondamos (opcional)');
      var correo = el('input');
      correo.type = 'email'; correo.id = id + '-c'; lc.htmlFor = correo.id; correo.maxLength = MAX_CORREO; correo.autocomplete = 'email';
      var trampa = el('input', 'op-trampa');  // campo trampa: fuera de la vista y del orden de tabulacion
      trampa.type = 'text'; trampa.tabIndex = -1; trampa.autocomplete = 'off'; trampa.setAttribute('aria-hidden', 'true');
      var mandar = el('button', 'btn btn-ghost op-enviar', 'Enviar comentario');
      mandar.type = 'button';
      [lm, motivo, aviso, lc, correo, trampa, mandar].forEach(function (n) { forma.appendChild(n); });
      b.appendChild(forma); b.appendChild(estado);
      caja.appendChild(b);

      var fin = function (r) {
        botones.hidden = true; forma.hidden = true; pregunta.hidden = true;
        if (r === 'OK') estado.textContent = 'Gracias. Tu opinión quedó registrada.';
        else if (r === 'CORREO') { forma.hidden = false; estado.textContent = 'Revisa el correo: no parece una dirección válida. Puedes dejarlo vacío.'; }
        else estado.textContent = 'No se pudo enviar tu opinión. El resultado de arriba no cambia.';
      };
      si.addEventListener('click', function () {
        si.disabled = no.disabled = true;
        enviar({ herramienta: herramienta, clase: clase, voto: 'SI', fecha: hoy() }, fin);
      });
      no.addEventListener('click', function () {
        botones.hidden = true; forma.hidden = false; motivo.focus();
      });
      mandar.addEventListener('click', function () {
        mandar.disabled = true;
        enviar({ herramienta: herramienta, clase: clase, voto: 'NO', motivo: motivo.value, correo: correo.value, trampa: trampa.value, fecha: hoy() },
          function (r) { mandar.disabled = false; fin(r); });
      });
    } catch (x) { /* la opinion nunca rompe la herramienta */ }
  }

  api.mostrar = mostrar;
  return api;
});
