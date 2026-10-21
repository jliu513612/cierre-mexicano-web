'use strict';
// Llamada a la accion despues del resultado (herramientas/cta.js): (1) cada herramienta publicada DECIDE: o tiene frase
// o esta declarada sin frase (una nueva sin decidir sale roja); (2) las que tienen frase la muestran tras el resultado y
// cargan cta.js; (3) las frases cumplen la vara: una linea por parte, sin precio, sin factura, sin nombrar al CPA y sin
// presentar como hecho lo que esta en desarrollo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const CTA = require(path.join(RAIZ, 'herramientas', 'cta.js'));

// Herramientas SIN frase, con su razon (se quitan de aqui cuando tengan una frase honesta)
const SIN_FRASE = {
};

const enDisco = () => fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'pagina.js'))).map(d => d.name).sort();

test('cta: cada herramienta publicada tiene frase o esta declarada sin frase, con su razon', () => {
  const disco = enDisco();
  assert.ok(disco.length >= 9, 'calibracion: hay herramientas');
  for (const h of disco) assert.ok(h in CTA.TEXTOS !== h in SIN_FRASE, `${h}: decidir si lleva frase (y solo una de las dos)`);
  for (const h of Object.keys(CTA.TEXTOS)) assert.ok(disco.includes(h), `${h}: frase de una herramienta que no existe`);
  for (const [h, razon] of Object.entries(SIN_FRASE)) assert.ok(razon.length > 20, `${h}: la razon va escrita`);
});

test('cta: las que tienen frase la muestran tras el resultado y cargan cta.js; las demas no', () => {
  for (const h of enDisco()) {
    const pag = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'pagina.js'), 'utf8');
    const html = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'index.html'), 'utf8');
    const llama = new RegExp(`window\\.TCCta\\.mostrar\\([a-zA-Z]+, '${h}'\\)`).test(pag);
    const carga = html.includes('<script src="/herramientas/cta.js" defer></script>');
    if (h in CTA.TEXTOS) {
      assert.ok(llama && carga, `${h}: llama a TCCta.mostrar y carga cta.js`);
      // va DESPUES de la opinion, en la misma caja: cada llamada sigue a una de TCOpinion.mostrar
      for (const m of pag.matchAll(/window\.TCCta\.mostrar\(([a-zA-Z]+),/g)) {
        const antes = pag.slice(0, m.index).split('\n').slice(-2).join('\n');
        assert.ok(new RegExp(`TCOpinion\\.mostrar\\(${m[1]},`).test(antes), `${h}: el bloque va justo despues de la opinion de ${m[1]}`);
      }
    } else {
      assert.ok(!llama && !carga, `${h}: sin frase, sin bloque`);
    }
  }
});

test('cta: el tipo de cambio solo promete dolares (funciones.json, tc-facturas-dolares: «solo dolares»)', () => {
  const f = CTA.TEXTOS['tipo-de-cambio'].join(' ');
  assert.ok(/facturas en dólares/.test(f) && !/moneda extranjera|otras monedas|euros?\b/i.test(f), f);
});

test('cta: las frases cumplen la vara', () => {
  const PROHIBIDO = /precio|cuesta|costo|\$|gratis|pesos al mes|suscrip|factura(mos|r[eé]) |te facturamos|cpa|contador p[uú]blico|beta|pr[oó]ximamente|en desarrollo|pronto|tiempo real|sin l[ií]mite|ilimitad|importaci[oó]n directa|contpaqi|varios equipos|en red|timbra|presenta la declaraci/i;
  for (const [h, [hizo, programa]] of Object.entries(CTA.TEXTOS)) {
    assert.match(hizo, /^Aquí [A-Za-z0-9áéíóúñÁÉÍÓÚÑ -]+\.$/,`${h}: lo que hizo, en una frase que empieza con «Aquí»`);
    assert.match(programa, /^El programa [^.]+\.$/, `${h}: lo que hace el programa, en una frase`);
    assert.ok(programa.length <= 140, `${h}: una linea (${programa.length} caracteres)`);
    assert.ok(!PROHIBIDO.test(hizo + ' ' + programa), `${h}: palabra fuera de la vara en «${hizo} ${programa}»`);
    assert.ok(!/—|–|!|¡/.test(hizo + programa), `${h}: sin rayas ni exclamaciones`);
  }
});
