/* Valor de la UMA y conversor de taxcerteza.mx. Toda la logica vive aqui; los numeros llegan en uma-datos.js,
   que se GENERA desde el registro del programa (no se teclean). No consulta ningun servidor.
   Pruebas: .herramientas/pruebas/uma.test.js

   Vigencia: Ley UMA, articulo 5. El valor del ano A rige del 1 de febrero de A al 31 de enero de A+1.
   Fuera de la tabla la pagina NO devuelve un numero: ni antes del primer valor cargado, ni despues del
   ultimo (un valor nuevo que nadie ha confirmado aqui no se supone). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCUma = fabrica();
})(this, function () {
  'use strict';

  var RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
  var RE_CANTIDAD = /^\d{1,12}(\.\d{1,6})?$/;
  var PERIODOS = ['diario', 'mensual', 'anual'];

  function fechaExiste(iso) {
    var m = RE_FECHA.exec(String(iso === null || iso === undefined ? '' : iso));
    if (!m) return false;
    var f = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return f.getUTCFullYear() === +m[1] && f.getUTCMonth() === +m[2] - 1 && f.getUTCDate() === +m[3];
  }

  /* Decimales exactos con enteros grandes: '12.5' con escala 6 -> 12500000n. */
  function aEntero(texto, escala) {
    var p = texto.split('.');
    var dec = (p[1] || '');
    while (dec.length < escala) dec += '0';
    return BigInt(p[0] + dec);
  }
  function aTexto(entero, escala) {
    var s = entero.toString();
    while (s.length <= escala) s = '0' + s;
    return s.slice(0, s.length - escala) + '.' + s.slice(s.length - escala);
  }
  /* Division entera redondeando la mitad hacia arriba (numeros no negativos). */
  function dividir(a, b) { return (a * 2n + b) / (b * 2n); }

  /* Acepta '1,234.50', '$ 1234.5' y '15'. Devuelve el texto limpio o null. */
  function leerCantidad(texto) {
    var t = String(texto === null || texto === undefined ? '' : texto).trim().replace(/^\$\s*/, '');
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    return RE_CANTIDAD.test(t) ? t : null;
  }

  function crear(datos) {
    var valores = datos.valores;
    var primero = valores[0], ultimo = valores[valores.length - 1];

    /* Las fechas ISO se comparan como texto. */
    function vigenteEn(fecha) {
      if (!fechaExiste(fecha)) return { estado: 'FECHA_INVALIDA', valor: null };
      if (fecha < primero.desde) return { estado: 'ANTERIOR_A_TABLA', valor: null, desde: primero.desde };
      if (fecha > ultimo.hasta) return { estado: 'SIN_CONFIRMAR', valor: null, ultimo: ultimo };
      for (var i = 0; i < valores.length; i++) {
        if (fecha >= valores[i].desde && fecha <= valores[i].hasta) return { estado: 'VIGENTE', valor: valores[i] };
      }
      return { estado: 'SIN_CONFIRMAR', valor: null, ultimo: ultimo };
    }

    /* Que debe avisar la pagina hoy.
       AL_DIA ........ el valor mostrado rige y no hay cambio a la vista.
       ENERO ......... rige hasta el 31 de enero; el INEGI publica el nuevo en los primeros diez dias de enero
                       y esta pagina aun no lo tiene confirmado.
       SIN_CONFIRMAR . ya paso el 31 de enero y nadie ha confirmado aqui el valor nuevo: no se muestra como vigente. */
    function estadoPagina(hoy) {
      var v = vigenteEn(hoy);
      if (v.estado !== 'VIGENTE') return v.estado;
      if (v.valor === ultimo && hoy.slice(0, 4) === ultimo.hasta.slice(0, 4)) return 'ENERO';
      return 'AL_DIA';
    }

    /* sentido: 'VECES_A_PESOS' (2 decimales) | 'PESOS_A_VECES' (4 decimales). */
    function convertir(p) {
      p = p || {};
      if (PERIODOS.indexOf(p.periodo) < 0) return { ok: false, motivo: 'PERIODO' };
      if (p.sentido !== 'VECES_A_PESOS' && p.sentido !== 'PESOS_A_VECES') return { ok: false, motivo: 'SENTIDO' };
      var cantidad = leerCantidad(p.cantidad);
      if (cantidad === null) return { ok: false, motivo: 'CANTIDAD' };
      var v = vigenteEn(p.fecha);
      if (v.estado !== 'VIGENTE') return { ok: false, motivo: v.estado };
      var q = aEntero(cantidad, 6);                      // escala 6
      var uma = aEntero(v.valor[p.periodo], 2);          // escala 2
      var resultado;
      if (p.sentido === 'VECES_A_PESOS') resultado = aTexto(dividir(q * uma, 1000000n), 2);
      else resultado = aTexto(dividir(q * 100n * 10000n, uma * 1000000n), 4);
      return { ok: true, resultado: resultado, cantidad: cantidad, valor: v.valor, periodo: p.periodo, sentido: p.sentido };
    }

    return { vigenteEn: vigenteEn, estadoPagina: estadoPagina, convertir: convertir, valores: valores,
             ultimo: ultimo, primero: primero, verificado: datos.verificado, ley: datos.ley };
  }

  return { crear: crear, leerCantidad: leerCantidad, fechaExiste: fechaExiste };
});
