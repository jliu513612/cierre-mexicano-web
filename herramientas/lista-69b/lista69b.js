/* ¿El emisor esta en la lista 69-B? de taxcerteza.mx. Toda la logica vive aqui; la pagina solo pinta.
   El listado (listado.json) se GENERA desde el archivo oficial del SAT con .herramientas/lista69b.py y se coteja fila a
   fila contra el lector del programa (efos_scraper.parsear_csv_efos). La consulta se hace EN EL NAVEGADOR: los RFC que
   escribe la persona no salen de su equipo. Pruebas: .herramientas/pruebas/lista69b.test.js */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCLista69b = fabrica();
})(this, function () {
  'use strict';

  var SITUACION = { P: 'Presunto', D: 'Definitivo', V: 'Desvirtuado', S: 'Sentencia favorable' };
  var RE_RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;  // el mismo formato que el validador de RFC y que el programa
  var MAX_RFC = 2000;

  /* Texto libre -> { validos: [RFC unicos, en orden], invalidos: [lo que no tiene forma de RFC] }. */
  function leerRfcs(texto) {
    var vistos = {}, validos = [], invalidos = [];
    String(texto === null || texto === undefined ? '' : texto).toUpperCase().split(/[\s,;|]+/).forEach(function (t) {
      t = t.replace(/-/g, '');
      if (!t) return;
      if (!RE_RFC.test(t)) { if (invalidos.indexOf(t) < 0) invalidos.push(t); return; }
      if (!vistos[t]) { vistos[t] = true; validos.push(t); }
    });
    return { validos: validos.slice(0, MAX_RFC), invalidos: invalidos, recortados: Math.max(0, validos.length - MAX_RFC) };
  }

  /* Un RFC contra el listado. Devuelve { rfc, aparece, registros: [{situacion, codigo, nombre, fechas:{...}}] }.
     Un RFC puede aparecer en mas de una fila del listado: se devuelven todas. */
  function consultar(datos, rfc) {
    var filas = (datos && datos.r && Object.prototype.hasOwnProperty.call(datos.r, rfc)) ? datos.r[rfc] : [];
    return {
      rfc: rfc, aparece: filas.length > 0,
      registros: filas.map(function (f) {
        return { codigo: f[0], situacion: SITUACION[f[0]] || '', nombre: f[1],
                 fechas: { presunto: f[2], desvirtuado: f[3], definitivo: f[4], sentenciaFavorable: f[5] } };
      }),
    };
  }

  /* Lo que la pagina tiene que decir sobre el listado antes de cualquier resultado.
     'SIN_DATOS'               no hay listado o no trae fecha: la herramienta no responde.
     'NO_SE_PUDO_ACTUALIZAR'   la ultima actualizacion fallo: se dice, con la fecha de los datos.
     'ACTUALIZADO'             normal. */
  function estado(datos) {
    if (!datos || !/^\d{4}-\d{2}-\d{2}$/.test(String(datos.fecha_info || '')) || !datos.r) return 'SIN_DATOS';
    return datos.estado === 'NO_SE_PUDO_ACTUALIZAR' ? 'NO_SE_PUDO_ACTUALIZAR' : 'ACTUALIZADO';
  }

  return { leerRfcs: leerRfcs, consultar: consultar, estado: estado, SITUACION: SITUACION, MAX_RFC: MAX_RFC };
});
