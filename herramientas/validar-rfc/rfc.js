/* Validador de RFC de taxcerteza.mx. Toda la logica vive aqui; la pagina solo pinta el resultado.
   No consulta ningun servidor. Pruebas: .herramientas/pruebas/rfc.test.js

   Formato y tipo: el MISMO criterio que el programa (validadores_sat.validar_rfc).
   Fecha y digito verificador: comprobaciones adicionales de esta pagina. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCRfc = fabrica();
})(this, function () {
  'use strict';

  var RE_FISICA = /^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/;
  var RE_MORAL = /^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$/;
  var GENERICO_NACIONAL = 'XAXX010101000';
  var GENERICO_EXTRANJERO = 'XEXX010101000';
  // Tabla de valores del algoritmo publico: 0-9, A-N, &, O-Z, espacio, Ñ.
  var ALFABETO = '0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ';
  var DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function normalizar(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto).trim().toUpperCase().replace(/ /g, '').replace(/-/g, '');
  }

  /* Modulo 11: el cuerpo (todo menos el ultimo caracter) se rellena a 12 posiciones con un espacio a la
     izquierda; cada caracter vale su posicion en ALFABETO y se multiplica por 13, 12, ... 2. */
  function digitoVerificador(rfc) {
    var cuerpo = rfc.slice(0, -1);
    while (cuerpo.length < 12) cuerpo = ' ' + cuerpo;
    var suma = 0;
    for (var i = 0; i < 12; i++) {
      var valor = ALFABETO.indexOf(cuerpo.charAt(i));
      if (valor < 0) return null;
      suma += valor * (13 - i);
    }
    var resto = suma % 11;
    if (resto === 0) return '0';
    return 11 - resto === 10 ? 'A' : String(11 - resto);
  }

  /* El ano va con dos digitos: la fecha se acepta si existe en 19AA o en 20AA.
     El 29 de febrero existe cuando AA es multiplo de 4 (2000 fue bisiesto). */
  function fechaValida(aammdd) {
    var aa = parseInt(aammdd.slice(0, 2), 10);
    var mm = parseInt(aammdd.slice(2, 4), 10);
    var dd = parseInt(aammdd.slice(4, 6), 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > DIAS_MES[mm - 1]) return false;
    if (mm === 2 && dd === 29 && aa % 4 !== 0) return false;
    return true;
  }

  function validar(entrada) {
    var rfc = normalizar(entrada);
    var r = { rfc: rfc, tipo: 'INVALIDO', formato: false, resultado: 'FORMATO_INVALIDO',
              fecha: null, fechaValida: null, digitoRecibido: null, digitoEsperado: null, detalle: [] };
    if (!rfc) { r.resultado = 'VACIO'; return r; }
    if (rfc === GENERICO_NACIONAL || rfc === GENERICO_EXTRANJERO) {
      r.tipo = rfc === GENERICO_NACIONAL ? 'GENERICO_NAC' : 'GENERICO_EXT';
      r.formato = true;
      r.resultado = 'GENERICO';
      return r;
    }
    if (RE_FISICA.test(rfc)) r.tipo = 'PF';
    else if (RE_MORAL.test(rfc)) r.tipo = 'PM';
    else { r.detalle = diagnosticoFormato(rfc); return r; }
    r.formato = true;
    r.fecha = rfc.slice(-9, -3);
    r.fechaValida = fechaValida(r.fecha);
    r.digitoRecibido = rfc.slice(-1);
    r.digitoEsperado = digitoVerificador(rfc);
    if (!r.fechaValida) r.resultado = 'FECHA_INVALIDA';
    else if (r.digitoEsperado !== r.digitoRecibido) r.resultado = 'DIGITO_NO_COINCIDE';
    else r.resultado = 'CORRECTO';
    return r;
  }

  /* Por que no cumple el formato. Son pistas para corregir la captura; el veredicto ya esta dado. */
  function diagnosticoFormato(rfc) {
    var d = [];
    if (rfc.length !== 12 && rfc.length !== 13) d.push({ codigo: 'LONGITUD', largo: rfc.length });
    var raros = rfc.replace(/[A-ZÑ&0-9]/g, '');
    if (raros) d.push({ codigo: 'CARACTERES', cuales: raros });
    if (!d.length) d.push({ codigo: 'ORDEN' });
    return d;
  }

  return { validar: validar, normalizar: normalizar, digitoVerificador: digitoVerificador, fechaValida: fechaValida };
});
