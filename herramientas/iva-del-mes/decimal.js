/* Decimal minimo de taxcerteza.mx con la aritmetica del modulo decimal de Python: contexto de 28 digitos significativos,
   redondeo al par (ROUND_HALF_EVEN) en cada operacion y en quantize. Lo usa iva.js, que reproduce un calculo del
   programa hecho con Decimal. Valor = c * 10^e, con c BigInt. No consulta ningun servidor. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.TCDecimal = fabrica();
})(this, function () {
  'use strict';

  var PREC = 28;
  var RE = /^[+-]?((\d(_?\d)*)(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/;

  function nuevo(c, e) { return { c: c, e: e }; }
  function abs(b) { return b < 0n ? -b : b; }
  function digitos(b) { return abs(b).toString().length; }
  function p10(n) { return 10n ** BigInt(n); }

  /* c / 10^k redondeado al par. */
  function dividirPar(c, k) {
    if (k <= 0) return c;
    var d = p10(k), q = c / d, r = c - q * d;
    if (r === 0n) return q;
    var dos = abs(r) * 2n, neg = c < 0n;
    if (dos > d || (dos === d && (abs(q) % 2n) === 1n)) q += neg ? -1n : 1n;
    return q;
  }
  /* Aplica la precision del contexto (28 digitos), como hace Python tras cada operacion. */
  function contexto(x) {
    var n = digitos(x.c);
    if (n <= PREC || x.c === 0n) return x;
    var k = n - PREC, c = dividirPar(x.c, k), e = x.e + k;
    if (digitos(c) > PREC) { c = dividirPar(c, 1); e += 1; }
    return nuevo(c, e);
  }
  /* Texto con la sintaxis de Decimal de Python (incluye exponente y guiones bajos). null si no es un numero finito. */
  function leer(texto) {
    var s = String(texto).trim().replace(/_/g, '');
    if (!RE.test(String(texto).trim())) return null;
    var exp = 0, m = /[eE]/.exec(s);
    if (m) { exp = parseInt(s.slice(m.index + 1), 10); s = s.slice(0, m.index); }
    var neg = s.charAt(0) === '-';
    if (s.charAt(0) === '-' || s.charAt(0) === '+') s = s.slice(1);
    var p = s.split('.'), ent = p[0] || '', frac = p[1] || '';
    var c = BigInt((ent + frac) || '0');
    return nuevo(neg ? -c : c, exp - frac.length);
  }
  function de(v) {
    if (v && typeof v === 'object' && typeof v.c === 'bigint') return v;
    var d = leer(v === null || v === undefined ? '0' : v);
    if (!d) throw new Error('no es un numero: ' + v);
    return d;
  }
  function alinear(a, b) {
    var e = Math.min(a.e, b.e);
    return [a.c * p10(a.e - e), b.c * p10(b.e - e), e];
  }
  function sumar(a, b) { a = de(a); b = de(b); var x = alinear(a, b); return contexto(nuevo(x[0] + x[1], x[2])); }
  function restar(a, b) { a = de(a); b = de(b); var x = alinear(a, b); return contexto(nuevo(x[0] - x[1], x[2])); }
  function multiplicar(a, b) { a = de(a); b = de(b); return contexto(nuevo(a.c * b.c, a.e + b.e)); }
  /* a / b a 28 digitos significativos, redondeo al par (como Decimal.__truediv__). */
  function dividir(a, b) {
    a = de(a); b = de(b);
    if (b.c === 0n) throw new Error('division entre cero');
    if (a.c === 0n) return nuevo(0n, a.e - b.e);
    // se escala el dividendo para tener de sobra digitos y un resto para redondear
    var extra = PREC + 3 + digitos(b.c) - digitos(a.c);
    if (extra < 0) extra = 0;
    var num = a.c * p10(extra), q = num / b.c, r = num - q * b.c, e = a.e - b.e - extra;
    // exacto: Python devuelve el exponente ideal (el mayor posible sin perder digitos)
    if (r === 0n) {
      var ideal = a.e - b.e;
      while (e < ideal && q % 10n === 0n) { q /= 10n; e += 1; }
      return contexto(nuevo(q, e));
    }
    // inexacto: q tiene PREC+2 digitos o mas (por `extra`) y debajo queda un resto r != 0. Se recorta a PREC
    // digitos: si lo que se quita es >= la mitad, el valor verdadero (con el resto) esta POR ENCIMA de la mitad, asi
    // que sube; si es menor, baja. Nunca hay empate exacto con resto distinto de cero.
    var k = digitos(q) - PREC, d = p10(k), qq = q / d, rr = abs(q - qq * d);
    if (rr * 2n >= d) qq += ((a.c < 0n) !== (b.c < 0n)) ? -1n : 1n;
    var res = nuevo(qq, e + k);
    if (digitos(res.c) > PREC) res = nuevo(dividirPar(res.c, 1), res.e + 1);
    return res;
  }
  function comparar(a, b) { a = de(a); b = de(b); var x = alinear(a, b); return x[0] < x[1] ? -1 : (x[0] > x[1] ? 1 : 0); }
  function esCero(a) { return de(a).c === 0n; }
  function negar(a) { a = de(a); return nuevo(-a.c, a.e); }
  function max(a, b) { return comparar(a, b) >= 0 ? de(a) : de(b); }
  function min(a, b) { return comparar(a, b) <= 0 ? de(a) : de(b); }
  /* quantize a 10^e (e negativo: decimales), redondeo al par. */
  function cuantizar(a, e) {
    a = de(a);
    if (a.e >= e) return nuevo(a.c * p10(a.e - e), e);
    return nuevo(dividirPar(a.c, e - a.e), e);
  }
  function centavos(a) { return cuantizar(a, -2); }
  function texto(a) {
    a = de(a);
    var neg = a.c < 0n, s = abs(a.c).toString();
    if (a.e >= 0) return (neg ? '-' : '') + s + '0'.repeat(a.e);
    var k = -a.e;
    while (s.length <= k) s = '0' + s;
    return (neg ? '-' : '') + s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
  }
  /* El viaje Decimal -> float -> Decimal(str(float)) del programa (el enriquecido se guarda como float).
     El float mas cercano es el mismo en JS y en Python, y los dos lo escriben con el texto mas corto que lo
     reconstruye, asi que el valor que vuelve es el mismo. */
  function porFloat(a) {
    var n = Number(texto(a));
    if (!isFinite(n)) throw new Error('importe que no cabe en un float');
    return de(String(n));
  }
  return { leer: leer, de: de, sumar: sumar, restar: restar, multiplicar: multiplicar, dividir: dividir, comparar: comparar,
           esCero: esCero, negar: negar, max: max, min: min, cuantizar: cuantizar, centavos: centavos, texto: texto,
           porFloat: porFloat, CERO: nuevo(0n, 0) };
});
