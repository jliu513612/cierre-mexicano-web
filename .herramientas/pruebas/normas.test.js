'use strict';
// Pie «Fundamento y revision» de cada herramienta: (1) toda herramienta publicada declara sus normas, (2) cada norma
// tiene URL oficial y FECHA DE REVISION, del registro del programa o de una lectura propia con la huella del documento,
// (3) la pagina muestra exactamente esas normas con esas fechas, el aviso de que no es un servicio del SAT y lo que se
// guarda y lo que no, (4) el hueco de las condiciones de la prueba sigue vacio y no pinta nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const CFG = require(path.join('..', 'normas_por_herramienta.json'));
const DATOS = require(path.join('..', 'datos', 'normas.json'));
const MESES = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
const larga = iso => { const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const enDisco = () => fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'pagina.js'))).map(d => d.name).sort();

test('normas: toda herramienta publicada declara sus normas, y los datos salen de esa declaracion', () => {
  assert.deepEqual(Object.keys(CFG.herramientas).sort(), enDisco());
  assert.deepEqual(DATOS.herramientas, CFG.herramientas, 'datos/normas.json se regenero desde normas_por_herramienta.json');
  for (const ids of Object.values(CFG.herramientas)) assert.ok(ids.length > 0);
});

test('normas: cada una con cita, URL oficial y fecha de revision; las de fuera del registro, con su lectura', () => {
  const usadas = new Set(Object.values(CFG.herramientas).flat());
  assert.deepEqual(Object.keys(DATOS.normas).sort(), [...usadas].sort());
  for (const [k, n] of Object.entries(DATOS.normas)) {
    assert.equal(n.cita, CFG.citas[k], k);
    assert.match(n.url, /^https:\/\/(www\.diputados\.gob\.mx|www\.sat\.gob\.mx|dof\.gob\.mx)\//, k);
    assert.match(n.revisado, /^20\d\d-\d\d-\d\d$/, k);
    if (!n.en_registro) {
      const f = CFG.fuera_del_registro[k];
      assert.ok(f && f.revisado === n.revisado && /sha256 [0-9a-f]{64}/.test(f.lectura) && /«.+»/.test(f.lectura), `${k}: lectura propia con huella y cita textual`);
    }
  }
});

test('normas: cada pagina muestra su pie con esas normas y esas fechas, el aviso y lo que se guarda', () => {
  for (const h of enDisco()) {
    const html = fs.readFileSync(path.join(RAIZ, 'herramientas', h, 'index.html'), 'utf8');
    const m = /<div class="pie-herramienta">([\s\S]*?)<\/div>/.exec(html);
    assert.ok(m, `${h}: tiene el pie`);
    const pie = m[1];
    const lis = [...pie.matchAll(/<li><a href="([^"]+)" rel="noopener">([^<]+)<\/a>: revisada el ([^.]+)\.<\/li>/g)];
    assert.deepEqual(lis.map(x => x[2]), CFG.herramientas[h].map(k => DATOS.normas[k].cita), `${h}: las normas, en orden`);
    assert.deepEqual(lis.map(x => x[3]), CFG.herramientas[h].map(k => larga(DATOS.normas[k].revisado)), `${h}: las fechas de revision`);
    assert.ok(pie.includes('no un servicio oficial del SAT') && pie.includes('Revisa con tu contador'), `${h}: el aviso`);
    assert.ok(/Sin registro/.test(pie) && /no guarda lo que escribes o subes/.test(pie) && /se cuenta que se usó la herramienta/.test(pie)
      && /se cuenta el clic/.test(pie) && /se guardan tu voto y tu comentario/.test(pie), `${h}: lo que se guarda y lo que no, completo`);
    assert.ok(html.lastIndexOf('pie-herramienta') > html.lastIndexOf('class="programa"'), `${h}: el pie va al final`);
  }
});

test('normas: las condiciones de la prueba son solo lo medido en 1.0.48 (30 dias, sin registro, datos en tu equipo)', () => {
  const CTA = require(path.join(RAIZ, 'herramientas', 'cta.js'));
  assert.equal(CTA.CONDICIONES_PRUEBA, 'Pruébalo 30 días gratis, sin registro. Tus datos se quedan en tu equipo.');
  // ni en el bloque ni en las paginas se promete lo que la prueba no es
  const paginas = ['index.html', ...fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => path.join('herramientas', d.name, 'index.html')), path.join('herramientas', 'index.html')]
    .filter(f => fs.existsSync(path.join(RAIZ, f)));
  assert.ok(paginas.length >= 11, 'calibracion: portada, indice y las herramientas');
  for (const f of ['herramientas/cta.js', ...paginas]) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.doesNotMatch(t, /para siempre|sin tarjeta|ilimitad|No hay modo de prueba/i, f);
    if (f !== 'herramientas/cta.js') assert.match(t, /30 días gratis/, `${f}: dice la prueba de 30 dias`);
  }
});
