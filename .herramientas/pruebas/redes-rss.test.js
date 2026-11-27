'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', '..');
const imp = rel => import(path.join(RAIZ, rel).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));

test('redes-rss: agenda.json es valida y todas sus imagenes existen en disco', () => {
  const agenda = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'redes', 'agenda.json'), 'utf8'));
  assert.ok(Array.isArray(agenda) && agenda.length >= 1, 'agenda tiene entradas');
  for (const e of agenda) {
    assert.match(e.fecha, /^\d{4}-\d{2}-\d{2}$/, `fecha valida: ${e.fecha}`);
    for (const k of ['titulo', 'facebook_texto', 'facebook_link', 'facebook_image', 'x_texto', 'x_link', 'x_image']) {
      assert.ok(typeof e[k] === 'string' && e[k].length > 0, `${e.fecha} trae ${k}`);
    }
    for (const img of [e.facebook_image, e.x_image]) {
      assert.ok(img.startsWith('https://taxcerteza.mx/assets/redes/'), `imagen propia: ${img}`);
      const rel = img.replace('https://taxcerteza.mx/', '');
      assert.ok(fs.existsSync(path.join(RAIZ, rel)), `existe en disco: ${rel}`);
    }
  }
});

test('redes-rss: desbloquea el dia programado a las 08:00 CDMX y mantiene bloqueados los futuros', async () => {
  const { elementosActivos, construirRss } = await imp('netlify/lib/redes-rss.mjs');
  const agenda = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'redes', 'agenda.json'), 'utf8'));

  // 2026-11-27 07:59 CDMX = 2026-11-27T13:59:00Z -> aun NO se desbloquea 2026-11-27
  const antes = elementosActivos(agenda, new Date('2026-11-27T13:59:00Z'));
  assert.deepEqual(antes.map(x => x.fecha), ['2026-11-25']);

  // 2026-11-27 08:00 CDMX = 2026-11-27T14:00:00Z -> se desbloquea 2026-11-27, pero 2026-11-30 sigue bloqueado
  const justo = elementosActivos(agenda, new Date('2026-11-27T14:00:00Z'));
  assert.deepEqual(justo.map(x => x.fecha), ['2026-11-27', '2026-11-25']);

  const xmlFb = construirRss('facebook', agenda, new Date('2026-11-27T14:00:00Z'));
  assert.ok(xmlFb.includes('<guid isPermaLink="false">taxcerteza-facebook-2026-11-27</guid>'));
  assert.ok(xmlFb.includes('<guid isPermaLink="false">taxcerteza-facebook-2026-11-25</guid>'));
  assert.ok(!xmlFb.includes('2026-11-30'));
  assert.ok(xmlFb.includes('type="image/jpeg"'));
  assert.ok(xmlFb.includes('&amp;utm_medium=social'), 'escapa & en enlaces XML');

  const xmlX = construirRss('x', agenda, new Date('2026-11-27T14:00:00Z'));
  assert.ok(xmlX.includes('<guid isPermaLink="false">taxcerteza-x-2026-11-27</guid>'));
  assert.ok(xmlX.includes('type="image/png"'));
  assert.equal(construirRss('otra', agenda, new Date('2026-11-27T14:00:00Z')), null);
});

test('redes-rss: no existen archivos estaticos que hagan sombra a la funcion', () => {
  assert.ok(!fs.existsSync(path.join(RAIZ, 'assets', 'redes', 'feed-facebook.xml')), 'sin feed-facebook.xml estatico');
  assert.ok(!fs.existsSync(path.join(RAIZ, 'assets', 'redes', 'feed-x.xml')), 'sin feed-x.xml estatico');
});
