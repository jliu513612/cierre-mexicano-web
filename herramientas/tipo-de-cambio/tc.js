/* Tipo de cambio para efectos fiscales de taxcerteza.mx. Toda la logica vive aqui; la pagina solo pinta. No consulta
   ningun servidor fuera del propio sitio. Pruebas: .herramientas/pruebas/tipo-cambio.test.js, contra vectores generados
   EJECUTANDO scripts/banxico_fix.py del programa para cada dia del calendario cargado.

   Mismas fechas que el programa (banxico_fix):
     dia habil bancario ......... lunes a viernes fuera de los inhabiles que la CNBV publica en el DOF para ESE ano; un
                                  ano sin calendario cargado NO se responde (falla cerrado: CalendarioNoCubierto)
     para una obligacion del dia C (tc_para_obligaciones -> fecha_determinacion_para):
                                  P = ultimo dia habil <= C-1 (la publicacion del DOF que ya aplica)
                                  D = dia habil anterior a P; el tipo es el FIX determinado en D
     publicado en el DOF el dia C (fecha_fix_publicado_en_dof):
                                  P = dia habil <= C; D = dia habil anterior a P
     FIX determinado el dia C (tc_fix_determinado): el del dia habil <= C
   La serie es la del programa: SIE de Banxico SF43718 (FIX USD/MXN). */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCTipoCambio = fabrica();
})(this, function () {
  'use strict';

  var MS = 86400000, HORA_ESPERADA = 14;
  function NoCubierto(anios) { this.anios = anios; }
  function aDia(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t / MS : null;
  }
  function iso(n) { return new Date(n * MS).toISOString().slice(0, 10); }
  function anio(n) { return new Date(n * MS).getUTCFullYear(); }

  function crear(datos) {
    var cal = {};
    Object.keys(datos.calendarios).forEach(function (a) {
      cal[a] = {};
      datos.calendarios[a].forEach(function (f) { cal[a][f] = true; });
    });
    function esHabil(n) {
      var a = String(anio(n));
      if (!cal[a]) throw new NoCubierto([+a]);
      var s = new Date(n * MS).getUTCDay();
      if (s === 0 || s === 6) return false;
      return !cal[a][iso(n)];
    }
    function habilAnterior(n) { var d = n - 1; while (!esHabil(d)) d -= 1; return d; }
    function habilOAnterior(n) { while (!esHabil(n)) n -= 1; return n; }
    function exigir(desde, hasta) {
      if (hasta < desde) { var x = desde; desde = hasta; hasta = x; }
      var faltan = [];
      for (var a = anio(desde); a <= anio(hasta); a++) if (!cal[String(a)]) faltan.push(a);
      if (faltan.length) throw new NoCubierto(faltan);
    }
    function publicacionQueAplica(c) { var pub = habilOAnterior(c - 1); exigir(pub, c - 1); return pub; }
    function paraObligaciones(c) { var pub = publicacionQueAplica(c), det = habilAnterior(pub); exigir(det, pub); return det; }
    function dofDelDia(c) { var pub = habilOAnterior(c), det = habilAnterior(pub); exigir(det, c); return det; }
    function determinado(c) { return habilOAnterior(c); }

    /* Envuelve una fecha: 'AAAA-MM-DD', o 'NO_CUBIERTO' si la cadena recorre un ano sin calendario. */
    function fecha(fn, c) {
      try { return iso(fn(c)); } catch (e) { if (e instanceof NoCubierto) return 'NO_CUBIERTO'; throw e; }
    }
    var api = {
      esHabil: function (f) { var n = aDia(f); try { return esHabil(n); } catch (e) { if (e instanceof NoCubierto) return 'NO_CUBIERTO'; throw e; } },
      paraObligaciones: function (f) { return fecha(paraObligaciones, aDia(f)); },
      publicacionQueAplica: function (f) { return fecha(publicacionQueAplica, aDia(f)); },
      dofDelDia: function (f) { return fecha(dofDelDia, aDia(f)); },
      determinado: function (f) { return fecha(determinado, aDia(f)); },
      anios: Object.keys(cal).map(Number).sort()
    };

    /* El ultimo FIX que YA debe estar cargado en el instante `ms` (milisegundos UTC): el de hoy si hoy es habil
       bancario y en el centro de Mexico ya son las 14:00 (Banxico lo publica hacia las 12:00 y la actualizacion corre
       a las 13:15); si no, el del ultimo dia habil anterior. 'NO_CUBIERTO' si falta el calendario: entonces no se
       puede saber si los datos estan al dia, y quien lo use lo tiene que decir. */
    api.ultimoEsperado = function (ms) {
      var mx = new Date(ms - 6 * 3600000), hoy = mx.toISOString().slice(0, 10), h = api.esHabil(hoy);
      if (h === 'NO_CUBIERTO') return 'NO_CUBIERTO';
      if (h && mx.getUTCHours() >= HORA_ESPERADA) return hoy;
      return api.determinado(iso(aDia(hoy) - 1));
    };

    /* Lo que la pagina necesita para una fecha. `serie` = {AAAA-MM-DD: '17.1234'} (FIX determinado por dia).
       Cada bloque trae la fecha de determinacion, la de publicacion cuando aplica, y el valor o el motivo de no tenerlo. */
    api.consultar = function (f, serie) {
      if (aDia(f) === null) return { ok: false, motivo: 'FECHA' };
      function bloque(det, extra) {
        var b = Object.assign({ determinado: det }, extra || {});
        if (det === 'NO_CUBIERTO') b.motivo = 'NO_CUBIERTO';
        else if (!serie || !Object.prototype.hasOwnProperty.call(serie, det)) b.motivo = 'SIN_DATO';
        else b.valor = serie[det];
        return b;
      }
      return {
        ok: true, fecha: f, habil: api.esHabil(f),
        obligaciones: bloque(api.paraObligaciones(f), { publicado_dof: api.publicacionQueAplica(f) }),
        dof_del_dia: bloque(api.dofDelDia(f)),
        determinado_del_dia: bloque(api.determinado(f))
      };
    };
    return api;
  }

  return { crear: crear };
});
