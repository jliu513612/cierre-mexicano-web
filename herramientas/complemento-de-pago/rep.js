/* Asistente del complemento de pago (REP) de taxcerteza.mx. Toda la logica vive aqui.
   No consulta ningun servidor. Pruebas: .herramientas/pruebas/rep.test.js

   Reglas que aplica, y ninguna mas:
     RMF 2026, regla 2.7.1.32 .. plazo: quinto dia natural del mes inmediato siguiente al del pago.
     CFF, articulo 29-A, fr. VII . a) una sola exhibicion al expedir; b) parcialidades o pago posterior:
                                  un CFDI por el total y un CFDI por cada pago.
     RMF 2026, regla 2.7.1.39 .. PUE sin cobrar: vale si se cobra completa a mas tardar el ultimo dia del
                                  mes de expedicion; si no, cancelar y emitir con forma 99 y metodo PPD.
   Mismo criterio que el programa: complemento_pago_monitor.fecha_limite_complemento,
   .clasificar_severidad y .estado_rep. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCRep = fabrica();
})(this, function () {
  'use strict';

  var EJERCICIO_DE_LA_REGLA = 2026;
  var MS_DIA = 86400000;

  /* 'AAAA-MM-DD' estricto -> {a, m, d} o null si la fecha no existe. */
  function leerFecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso === null || iso === undefined ? '' : iso));
    if (!m) return null;
    var a = +m[1], mes = +m[2], d = +m[3];
    var f = new Date(Date.UTC(a, mes - 1, d));
    if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
    return { a: a, m: mes, d: d };
  }

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function aIso(a, m, d) { return a + '-' + dos(m) + '-' + dos(d); }
  function aDias(f) { return Math.round(Date.UTC(f.a, f.m - 1, f.d) / MS_DIA); }

  /* Quinto dia natural del mes inmediato siguiente al del pago. Dia natural: no se recorre. */
  function fechaLimite(fechaPago) {
    var f = leerFecha(fechaPago);
    if (!f) return null;
    return f.m === 12 ? aIso(f.a + 1, 1, 5) : aIso(f.a, f.m + 1, 5);
  }

  /* dias = limite - hoy. VENCIDO si ya paso; URGENTE si quedan 3 o menos; NORMAL en otro caso. */
  function estadoPlazo(fechaPago, hoy) {
    var lim = leerFecha(fechaLimite(fechaPago)), h = leerFecha(hoy);
    if (!lim || !h) return null;
    var dias = aDias(lim) - aDias(h);
    return { estado: dias < 0 ? 'VENCIDO' : (dias <= 3 ? 'URGENTE' : 'NORMAL'), dias: dias };
  }

  /* ¿El dia limite cae en un dia que el CFF, articulo 12, primer parrafo, no cuenta en los plazos fijados en dias?
     Sabado, domingo, 1 de enero, primer lunes de febrero, tercer lunes de marzo, 1 y 5 de mayo, 16 de septiembre,
     tercer lunes de noviembre, 25 de diciembre y el 1 de diciembre de cada 6 anos (cambio del Poder Ejecutivo:
     2024, 2030...). NO decide si el plazo del REP se recorre: la regla 2.7.1.32 habla de dia natural y no remite
     a ese articulo. Solo sirve para AVISAR de la duda. No conoce las vacaciones generales de las autoridades. */
  function nLunes(a, m, n) {
    var primero = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
    return 1 + ((8 - primero) % 7) + 7 * (n - 1);
  }
  function diaNoComputable(iso) {
    var f = leerFecha(iso);
    if (!f) return null;
    var dow = new Date(Date.UTC(f.a, f.m - 1, f.d)).getUTCDay();
    if (dow === 6) return 'SABADO';
    if (dow === 0) return 'DOMINGO';
    var md = f.m * 100 + f.d;
    if (md === 101 || md === 501 || md === 505 || md === 916 || md === 1225) return 'FESTIVO';
    if ((f.m === 2 && f.d === nLunes(f.a, 2, 1)) || (f.m === 3 && f.d === nLunes(f.a, 3, 3)) ||
        (f.m === 11 && f.d === nLunes(f.a, 11, 3))) return 'FESTIVO';
    if (md === 1201 && (f.a - 2024) % 6 === 0) return 'FESTIVO';
    return null;
  }

  function consultarPlazo(fechaPago, hoy) {
    var f = leerFecha(fechaPago);
    if (!f) return { ok: false, motivo: 'FECHA_INVALIDA' };
    // La regla citada es la de 2026. Para pagos de otro ejercicio la herramienta no afirma nada.
    if (f.a !== EJERCICIO_DE_LA_REGLA) return { ok: false, motivo: 'FUERA_DE_EJERCICIO', ejercicio: f.a };
    var limite = fechaLimite(fechaPago);
    var r = { ok: true, fechaPago: fechaPago, limite: limite,
              limiteEnOtroEjercicio: leerFecha(limite).a !== EJERCICIO_DE_LA_REGLA, plazo: null, pagoFuturo: false,
              limiteNoComputable: diaNoComputable(limite) };
    var h = leerFecha(hoy);
    if (h) {
      r.plazo = estadoPlazo(fechaPago, hoy);
      r.pagoFuturo = aDias(f) > aDias(h);
    }
    return r;
  }

  /* Solo el metodo PPD lleva complemento (igual que estado_rep del programa). */
  function metodoLlevaRep(metodo) {
    return String(metodo === null || metodo === undefined ? '' : metodo).toUpperCase() === 'PPD';
  }

  /* metodo: 'PUE' | 'PPD'.  forma: '99' | 'OTRA'.
     cobro (solo PUE): 'COBRADA' (completa, a mas tardar el ultimo dia del mes de expedicion)
                       'MES_ABIERTO' (aun no se cobra y el mes de expedicion no ha terminado)
                       'NO_COBRADA' (termino el mes de expedicion sin cobrarse completa)
     Devuelve { resultado, fundamento[], avisos[] }.
     resultado: 'SI' | 'NO' | 'NO_POR_AHORA' | 'SUSTITUIR' | 'NO_CUBIERTO' | 'FALTAN_DATOS' */
  function llevaRep(datos) {
    datos = datos || {};
    var metodo = datos.metodo, forma = datos.forma, cobro = datos.cobro;
    if ((metodo !== 'PUE' && metodo !== 'PPD') || (forma !== '99' && forma !== 'OTRA')) {
      return { resultado: 'FALTAN_DATOS', fundamento: [], avisos: [] };
    }
    if (metodoLlevaRep(metodo)) {
      return { resultado: 'SI', fundamento: ['cff-29-a', 'rmf-2.7.1.32'],
               avisos: forma === '99' ? [] : ['FORMA_NO_EVALUADA'] };
    }
    // PUE
    if (forma === '99') return { resultado: 'NO_CUBIERTO', fundamento: [], avisos: ['PUE_CON_99'] };
    if (cobro === 'COBRADA') return { resultado: 'NO', fundamento: ['cff-29-a', 'rmf-2.7.1.39'], avisos: [] };
    if (cobro === 'MES_ABIERTO') return { resultado: 'NO_POR_AHORA', fundamento: ['rmf-2.7.1.39'], avisos: [] };
    if (cobro === 'NO_COBRADA') return { resultado: 'SUSTITUIR', fundamento: ['rmf-2.7.1.39', 'cff-29-a'], avisos: [] };
    return { resultado: 'FALTAN_DATOS', fundamento: [], avisos: [] };
  }

  return { fechaLimite: fechaLimite, estadoPlazo: estadoPlazo, consultarPlazo: consultarPlazo, diaNoComputable: diaNoComputable,
           metodoLlevaRep: metodoLlevaRep, llevaRep: llevaRep, leerFecha: leerFecha,
           EJERCICIO_DE_LA_REGLA: EJERCICIO_DE_LA_REGLA };
});
