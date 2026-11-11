'use strict';
// El titulo de cada pagina de /ayuda/ sale de lo que la gente BUSCA, medido en Google Trends, no adivinado (June
// 2026-10-27). .ayuda/busqueda/medicion.json guarda la medicion por tema; .ayuda/busqueda/paginas.json, cada pagina
// publicada con su titulo y UNA de cuatro cosas: la expresion medida que lleva, por que conserva su titulo, que su
// titulo lo fija el producto (pendiente), o que es una pagina del producto sin tema de busqueda.
// Falla CERRADO: una pagina publicada sin registro, un registro sin pagina, un titulo cambiado sin volver a medir
// (publicado != registrado, o conceptos.json != registrado), una expresion que no esta medida en su tema o que el
// titulo no lleva, y una pagina «del producto» que no esta en la lista nominal de abajo = rojo.
// Comparacion como la de un buscador: sin acentos ni signos, sin palabras vacias («de», «por»...), singular = plural.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const BUSQ = path.join(RAIZ, '.ayuda', 'busqueda');
const leer = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const medicion = leer(path.join(BUSQ, 'medicion.json'));
const paginas = leer(path.join(BUSQ, 'paginas.json'));
const conceptos = leer(path.join(RAIZ, '.ayuda', 'fuente', 'conceptos.json')).conceptos;

// Lista NOMINAL de pauta (2026-10-28): las unicas paginas que pueden quedar fuera de la medicion. Esta aqui y no en
// el registro para que marcar «producto» en paginas.json no baste para sacar una pagina de la regla.
const PRODUCTO = [
  'ayuda/', 'ayuda/alcance/', 'ayuda/calculos/', 'ayuda/fuentes/', 'ayuda/leyes/', 'ayuda/leyes/mapa/',
  'ayuda/primeros-pasos/', 'ayuda/uso/01_instalacion/', 'ayuda/uso/02_activacion/', 'ayuda/uso/03_alta_cliente/',
  'ayuda/uso/04_carpeta_trabajo/', 'ayuda/uso/05_carga_datos/', 'ayuda/uso/06_tablero/', 'ayuda/uso/20_parametros/',
  'ayuda/uso/21_actualizacion_soporte/',
];
const CLASES = ['expresion', 'conserva', 'fijado_por_producto', 'producto'];
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'en', 'por', 'para', 'y', 'o', 'con', 'su',
  'sus', 'un', 'una']);
function lema(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').filter((w) => w && !VACIAS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('es') && 'lrnd'.includes(w[w.length - 3]) ? w.slice(0, -2)
      : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}
const contiene = (titulo, expr) => ` ${lema(titulo)} `.includes(` ${lema(expr)} `);

const publicadas = () => [...fs.readFileSync(path.join(RAIZ, 'ayuda', 'sitemap.xml'), 'utf8')
  .matchAll(/<loc>https:\/\/taxcerteza\.mx\/(ayuda\/[^<]*)<\/loc>/g)].map((m) => m[1]).sort();
function tituloPublicado(u) {
  const h = fs.readFileSync(path.join(RAIZ, u, 'index.html'), 'utf8');
  return /<title[^>]*>([^<]*)<\/title>/.exec(h)[1].replace(/\s*\|\s*Ayuda · Tax Certeza\s*$/, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

test('busqueda ayuda: calibracion del comparador', () => {
  assert.ok(contiene('Pago provisional de ISR del mes', 'pagos provisionales'), 'singular y plural');
  assert.ok(contiene('ISR por arrendamiento: pago mensual', 'isr arrendamiento'), 'palabras vacias');
  assert.ok(contiene('Retención de IVA a personas físicas', 'retencion de iva'), 'acentos');
  assert.ok(!contiene('Tasas de IVA aplicables', 'tasa 0 iva'), 'una palabra que falta');
  assert.ok(!contiene('IVA retenido', 'retencion de iva'), 'el orden y la palabra cuentan');
});

test('busqueda ayuda: cada pagina publicada tiene su registro, y no hay de mas', () => {
  const pubs = publicadas();
  assert.ok(pubs.length >= 300, `calibracion: el sitemap de la ayuda trae ${pubs.length} paginas`);
  const regs = Object.keys(paginas).sort();
  assert.deepEqual(pubs.filter((u) => !regs.includes(u)), [], 'paginas publicadas SIN registro de busqueda');
  assert.deepEqual(regs.filter((u) => !pubs.includes(u)), [], 'registros de una pagina que no esta publicada');
});

test('busqueda ayuda: la medicion de cada tema esta completa', () => {
  assert.equal(medicion.fuente, 'Google Trends');
  assert.equal(medicion.geo, 'MX');
  assert.match(medicion.fecha, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(medicion.periodo, /^12 meses \(\d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}\)$/);
  for (const [k, t] of Object.entries(medicion.temas)) {
    assert.ok(Array.isArray(t.expresiones) && t.expresiones.length >= 2 && t.expresiones.length <= 5, `${k}: 2 a 5 expresiones`);
    for (const e of t.expresiones) assert.ok(typeof e.texto === 'string' && e.texto.trim() && Number.isInteger(e.media)
      && e.media >= 0 && e.media <= 100, `${k}: expresion sin texto o sin media`);
    assert.ok(t.expresiones.some((e) => e.texto === t.elegida), `${k}: la elegida «${t.elegida}» no esta medida`);
    assert.ok((t.por_que || '').trim().length >= 20, `${k}: sin por que`);
    assert.ok(t.relacionadas && typeof t.relacionadas === 'object', `${k}: sin relacionadas`);
    const max = Math.max(...t.expresiones.map((e) => e.media));
    if (max < 10) assert.ok(t.autocompletado && Object.keys(t.autocompletado).length, `${k}: Trends sin volumen (max ${max}) y sin autocompletado declarado`);
  }
});

test('busqueda ayuda: cada titulo es el registrado y lleva su expresion medida, o dice por que no', () => {
  const marcadasProducto = [];
  for (const [u, e] of Object.entries(paginas)) {
    const clases = CLASES.filter((c) => c in e);
    assert.equal(clases.length, 1, `${u}: tiene que llevar exactamente una de ${CLASES.join(', ')} (lleva ${clases})`);
    assert.equal(tituloPublicado(u), e.titulo, `${u}: el titulo publicado cambio sin volver a medir (.ayuda/busqueda/paginas.json)`);
    const m = /^ayuda\/calculos\/([a-z]{3}-\d{3})\/$/.exec(u);
    if (m) assert.equal(conceptos[m[1].toUpperCase()].titulo_es, e.titulo, `${u}: conceptos.json no dice el titulo registrado`);
    if (e.producto !== undefined) { marcadasProducto.push(u); continue; }
    const t = medicion.temas[e.tema];
    assert.ok(t, `${u}: tema «${e.tema}» sin medicion`);
    if (e.expresion !== undefined) {
      assert.ok(t.expresiones.some((x) => x.texto === e.expresion), `${u}: «${e.expresion}» no esta medida en el tema ${e.tema}`);
      assert.ok(contiene(e.titulo, e.expresion), `${u}: el titulo «${e.titulo}» no lleva «${e.expresion}»`);
    } else {
      const razon = e.conserva !== undefined ? e.conserva : e.fijado_por_producto;
      assert.ok((razon || '').trim().length >= 20, `${u}: conserva su titulo sin decir por que`);
    }
  }
  assert.deepEqual(marcadasProducto.filter((u) => !PRODUCTO.includes(u)), [], 'marcadas «producto» fuera de la lista nominal');
  assert.deepEqual(PRODUCTO.filter((u) => !marcadasProducto.includes(u)), [], 'de la lista nominal sin marcar «producto»');
});
