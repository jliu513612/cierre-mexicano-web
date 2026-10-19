/* Calendario del dia 17 de taxcerteza.mx. Toda la logica vive aqui; la tabla del sexto digito y los anos llegan en
   calendario-datos.js, que se GENERA desde calendario_obligaciones del programa. No consulta ningun servidor.
   Pruebas: .herramientas/pruebas/calendario.test.js

   Mismas reglas que el programa (calendario_obligaciones.dias_inhabiles_cff12, recorrer_a_habil, dias_extra_rfc y
   fecha_limite):
     dias inhabiles (CFF 12) .. sabado, domingo, 1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 y 5 de
                                mayo, 16 de septiembre, tercer lunes de noviembre, 25 de diciembre, y el 1 de diciembre
                                solo en los anos de transmision hasta 2018 (datos.transmision_hasta)
     pago mensual ............. dia 17 del mes siguiente; si es inhabil, el siguiente dia habil
     DIOT ..................... ultimo dia del mes siguiente; si es inhabil, el siguiente dia habil
     facilidad del 5.1 ........ dias habiles extra tras el dia 17 recorrido, segun el SEXTO DIGITO numerico del RFC.
                                Solo si se pide: el programa no la da sin un si explicito, y esta pagina no decide si
                                aplica. Nunca a la DIOT. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCCalendario = fabrica();
})(this, function () {
  'use strict';

  var MS_DIA = 86400000;

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function aDias(a, m, d) { return Math.round(Date.UTC(a, m - 1, d) / MS_DIA); }
  function deDias(n) {
    var f = new Date(n * MS_DIA);
    return { a: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() };
  }
  function iso(f) { return f.a + '-' + dos(f.m) + '-' + dos(f.d); }
  function leer(t) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t === null || t === undefined ? '' : t));
    if (!m) return null;
    var f = deDias(aDias(+m[1], +m[2], +m[3]));
    return f.a === +m[1] && f.m === +m[2] && f.d === +m[3] ? f : null;
  }
  function diaSemana(f) { return new Date(Date.UTC(f.a, f.m - 1, f.d)).getUTCDay(); }
  function nLunes(a, m, n) {
    var primero = diaSemana({ a: a, m: m, d: 1 });
    return 1 + ((8 - primero) % 7) + 7 * (n - 1);
  }
  function siguienteMes(a, m) { return m === 12 ? { a: a + 1, m: 1 } : { a: a, m: m + 1 }; }
  function ultimoDia(a, m) { var s = siguienteMes(a, m); return deDias(aDias(s.a, s.m, 1) - 1); }

  function crear(datos) {
    var HASTA = datos.transmision_hasta;

    /* Codigo del dia inhabil del CFF 12 (primer parrafo) que es `f`, o null. Sin sabado ni domingo. */
    function inhabilCff12(f) {
      var md = f.m * 100 + f.d;
      if (md === 101) return 'ANIO_NUEVO';
      if (f.m === 2 && f.d === nLunes(f.a, 2, 1)) return 'CONSTITUCION';
      if (f.m === 3 && f.d === nLunes(f.a, 3, 3)) return 'JUAREZ';
      if (md === 501) return 'TRABAJO';
      if (md === 505) return 'CINCO_DE_MAYO';
      if (md === 916) return 'INDEPENDENCIA';
      if (f.m === 11 && f.d === nLunes(f.a, 11, 3)) return 'REVOLUCION';
      if (md === 1225) return 'NAVIDAD';
      if (md === 1201 && f.a <= HASTA && f.a % 6 === HASTA % 6) return 'TRANSMISION';
      return null;
    }
    /* Por que `f` no es habil: SABADO, DOMINGO, el codigo del CFF 12, o null si es habil. */
    function motivo(f) {
      var s = diaSemana(f);
      if (s === 6) return 'SABADO';
      if (s === 0) return 'DOMINGO';
      return inhabilCff12(f);
    }
    function recorrer(f) {
      var n = aDias(f.a, f.m, f.d);
      while (motivo(deDias(n))) n += 1;
      return deDias(n);
    }
    function masHabiles(f, k) {
      var n = aDias(f.a, f.m, f.d);
      while (k > 0) { n += 1; if (!motivo(deDias(n))) k -= 1; }
      return deDias(n);
    }
    function diasExtraRfc(rfc) {
      var dig = String(rfc === null || rfc === undefined ? '' : rfc).replace(/[^0-9]/g, '');
      return dig.length < 6 ? 0 : datos.dias_por_digito[dig.charAt(5)];
    }
    function sextoDigito(rfc) {
      var dig = String(rfc === null || rfc === undefined ? '' : rfc).replace(/[^0-9]/g, '');
      return dig.length < 6 ? null : dig.charAt(5);
    }
    function plazo(original) {
      var lim = recorrer(original);
      return { original: iso(original), limite: iso(lim), motivo: motivo(original) };
    }
    /* Igual que fecha_limite del programa; `prorroga` true equivale al perfil que confirma el 5.1. */
    function fechaLimite(anio, mes, rfc, obligacion, prorroga) {
      var s = siguienteMes(anio, mes);
      if (obligacion === 'DIOT') return iso(recorrer(ultimoDia(s.a, s.m)));
      var base = recorrer({ a: s.a, m: s.m, d: 17 });
      return iso(prorroga === true ? masHabiles(base, diasExtraRfc(rfc)) : base);
    }
    function inhabiles(anio) {
      var r = [];
      for (var n = aDias(anio, 1, 1), fin = aDias(anio, 12, 31); n <= fin; n++) {
        var f = deDias(n);
        if (inhabilCff12(f)) r.push(iso(f));
      }
      return r;
    }
    /* Los 12 periodos de `anio`. Con un RFC de al menos seis digitos, ademas la fecha si aplicara la facilidad. */
    function calendario(anio, rfc) {
      anio = +anio;
      if (datos.anios.indexOf(anio) < 0) return { ok: false, motivo: 'FUERA_DE_ANIOS', anios: datos.anios.slice() };
      var digito = sextoDigito(rfc), dias = digito === null ? 0 : datos.dias_por_digito[digito];
      var meses = [];
      for (var m = 1; m <= 12; m++) {
        var s = siguienteMes(anio, m);
        var dia17 = plazo({ a: s.a, m: s.m, d: 17 });
        meses.push({ periodo: m, dia17: dia17, diot: plazo(ultimoDia(s.a, s.m)),
                     prorroga: digito === null ? null : iso(masHabiles(leer(dia17.limite), dias)) });
      }
      return { ok: true, anio: anio, sextoDigito: digito, diasExtra: dias, conRfc: String(rfc || '').trim() !== '', meses: meses };
    }
    return {
      calendario: calendario, fechaLimite: fechaLimite, inhabiles: inhabiles, diasExtraRfc: diasExtraRfc,
      esHabil: function (t) { var f = leer(t); return f ? !motivo(f) : null; },
      recorrer: function (t) { var f = leer(t); return f ? iso(recorrer(f)) : null; },
      motivo: function (t) { var f = leer(t); return f ? motivo(f) : null; },
      festivo: function (t) { var f = leer(t); return f ? inhabilCff12(f) : null; },
      diaSemana: function (t) { var f = leer(t); return f ? diaSemana(f) : null; }
    };
  }

  return { crear: crear };
});
