'use strict';
// _redirects: cada regla apunta a algo que EXISTE en disco, y su origen NO existe (si existiera, Netlify serviria el
// fichero y la regla no actuaria nunca).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const enDisco = r => {
  const p = path.join(RAIZ, r.replace(/^\//, ''));
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
};

test('redirecciones: el destino existe y el origen no', () => {
  const reglas = fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8').split('\n')
    .map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/\s+/));
  assert.ok(reglas.length >= 2, 'calibracion: hay reglas');
  for (const [origen, destino, codigo] of reglas) {
    assert.match(codigo || '', /^(301|302|200|404)$/, origen);
    assert.ok(enDisco(destino), `${origen}: el destino ${destino} no existe`);
    assert.ok(!enDisco(origen), `${origen}: existe en disco, la regla no actuaria`);
  }
  assert.ok(reglas.some(r => r[0] === '/blog/conciliacion-bancaria-contra-cfdi/' && r[2] === '301'));
  assert.ok(reglas.some(r => r[0] === '/blog/descarga-masiva-cfdi-sat/' && r[1] === '/ayuda/calculos/ope-056/' && r[2] === '301'));
  assert.ok(reglas.some(r => r[0] === '/ayuda/img/favicon.ico' && r[1] === '/favicon.ico' && r[2] === '200'));
});
