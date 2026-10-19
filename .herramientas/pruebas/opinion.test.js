'use strict';
// Pruebas de lo que la opinion puede enviar. La prueba de lo que de verdad SALE por la red esta en prueba_navegador.mjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const OP = require(path.join(RAIZ, 'herramientas', 'opinion.js'));

const BASE = { herramienta: 'validar-rfc', clase: 'DIGITO_NO_COINCIDE', voto: 'NO', motivo: 'El resultado no es claro', fecha: '2026-10-13' };
const con = extra => Object.assign({}, BASE, extra);
const CLAVES = ['clase', 'correo', 'fecha', 'form-name', 'herramienta', 'motivo', 'voto'];

test('opinion: el envio lleva exactamente siete campos y ninguno mas', () => {
  const e = OP.construir(BASE);
  assert.equal(e.ok, true);
  assert.deepEqual(Object.keys(e.campos).sort(), CLAVES);
  assert.deepEqual(e.campos, { 'form-name': 'opinion-herramientas', herramienta: 'validar-rfc', clase: 'DIGITO_NO_COINCIDE',
    voto: 'NO', motivo: 'El resultado no es claro', correo: '', fecha: '2026-10-13' });
  assert.deepEqual(new URLSearchParams(e.cuerpo).get('motivo'), 'El resultado no es claro');
  assert.deepEqual([...new URLSearchParams(e.cuerpo).keys()].sort(), CLAVES);
});

test('opinion: lo tecleado en la herramienta no viaja aunque alguien lo pase', () => {
  const e = OP.construir(con({ rfc: 'EKU9003173C8', entrada: 'EKU9003173C8', tecleado: 'EKU9003173C8', cantidad: '987654.32', fechaPago: '2026-03-17' }));
  assert.equal(e.ok, true);
  assert.deepEqual(Object.keys(e.campos).sort(), CLAVES);
  for (const x of ['EKU9003173C8', '987654', '2026-03-17']) assert.ok(!decodeURIComponent(e.cuerpo).includes(x), x);
});

test('opinion: un RFC escrito en el motivo se quita antes de enviar', () => {
  for (const [escrito, limpio] of [
    ['mi RFC EKU9003173C8 esta bien', 'mi RFC [RFC omitido] esta bien'],
    ['es xiqb891116qe4, de persona fisica', 'es [RFC omitido], de persona fisica'],
    ['EKU-900317-3C9 y H&E951128469', '[RFC omitido] y [RFC omitido]'],
    ['OÑO 120726 RX3', '[RFC omitido]'],
  ]) {
    assert.equal(OP.limpiarMotivo(escrito), limpio);
    const e = OP.construir(con({ motivo: escrito }));
    assert.equal(e.campos.motivo, limpio);
    assert.ok(!/[A-ZÑ&]{3,4}[ -]?\d{6}[ -]?[A-Z0-9]{3}/i.test(decodeURIComponent(e.cuerpo)), escrito);
  }
  assert.equal(OP.limpiarMotivo('El plazo de 2026 no me cuadra, son 5 dias'), 'El plazo de 2026 no me cuadra, son 5 dias');
});

test('opinion: tope de longitud del motivo y espacios', () => {
  assert.equal(OP.construir(con({ motivo: 'x'.repeat(5000) })).campos.motivo.length, 500);
  assert.equal(OP.construir(con({ motivo: '  dos\n\nlineas \t ' })).campos.motivo, 'dos lineas');
  for (const m of [null, undefined, '']) assert.equal(OP.construir(con({ motivo: m })).campos.motivo, '');
});

test('opinion: el voto positivo no lleva motivo ni correo', () => {
  const e = OP.construir(con({ voto: 'SI', motivo: 'algo', correo: 'a@b.mx' }));
  assert.equal(e.campos.motivo, '');
  assert.equal(e.campos.correo, '');
});

test('opinion: el correo es opcional y, si viene, tiene que parecer un correo', () => {
  assert.equal(OP.construir(con({ correo: ' ana@despacho.mx ' })).campos.correo, 'ana@despacho.mx');
  assert.equal(OP.construir(con({ correo: '' })).ok, true);
  for (const c of ['ana', 'ana@', '@x.mx', 'a b@x.mx', 'a@b', 'x'.repeat(120) + '@b.mx']) {
    assert.deepEqual(OP.construir(con({ correo: c })), { ok: false, motivo: 'CORREO' }, c);
  }
});

test('opinion: deben FALLAR el campo trampa relleno y los datos fuera de la lista', () => {
  assert.deepEqual(OP.construir(con({ trampa: 'http://spam' })), { ok: false, motivo: 'TRAMPA' });
  assert.deepEqual(OP.construir(con({ herramienta: 'otra' })), { ok: false, motivo: 'HERRAMIENTA' });
  for (const c of ['EKU9003173C8', 'digito', 'CON ESPACIO', '', null, 'A', 'X'.repeat(41), 'CLASE<script>']) {
    assert.deepEqual(OP.construir(con({ clase: c })), { ok: false, motivo: 'CLASE' }, String(c));
  }
  for (const v of ['si', 'QUIZA', '', null, true]) assert.deepEqual(OP.construir(con({ voto: v })), { ok: false, motivo: 'VOTO' }, String(v));
  for (const f of ['13/10/2026', '', null, '2026-10-13T10:00']) assert.deepEqual(OP.construir(con({ fecha: f })), { ok: false, motivo: 'FECHA' }, String(f));
  assert.equal(OP.construir().ok, false);
});

test('opinion: los scripts de pagina solo le pasan la herramienta y la clase del resultado', () => {
  // Trinquete sobre el fuente (el sujeto ES el fuente): la prueba de comportamiento esta en prueba_navegador.mjs.
  let llamadas = 0;
  for (const h of ['validar-rfc', 'valor-uma', 'complemento-de-pago', 'verificar-factura', 'lista-69b']) {
    const s = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'pagina.js'), 'utf8');
    for (const m of s.matchAll(/TCOpinion\.mostrar\(([^;]*)\);/g)) {
      llamadas++;
      const args = m[1].split(',').map(x => x.trim());
      assert.equal(args.length, 3, m[0]);
      assert.equal(args[1], `'${h}'`, m[0]);
      assert.ok(!/\.value|campo|cantidad|fecha/i.test(args[2]), `el tercer argumento parece lo tecleado: ${m[0]}`);
    }
  }
  assert.equal(llamadas, 8);
});

test('opinion: el formulario estatico que detecta Netlify tiene los mismos campos que el envio', () => {
  for (const h of ['validar-rfc', 'valor-uma', 'complemento-de-pago', 'verificar-factura', 'lista-69b']) {
    const html = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'index.html'), 'utf8');
    const f = /<form name="opinion-herramientas"[^>]*>(.*?)<\/form>/s.exec(html);
    assert.ok(f, h);
    assert.match(f[0], /data-netlify="true"/);
    assert.match(f[0], /netlify-honeypot="sitio"/);
    const nombres = [...f[1].matchAll(/name="([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(nombres, CLAVES.filter(k => k !== 'form-name').concat('sitio').sort(), h);
  }
  assert.ok(!fs.readFileSync(path.join(RAIZ, 'herramientas', 'index.html'), 'utf8').includes('opinion-herramientas'));
});
