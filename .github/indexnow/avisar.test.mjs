// Pruebas del aviso a IndexNow: que URL se avisan (solo paginas de los sitemaps), la clave y su archivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { urlDe, locs, urlsCambiadas, clave } from './avisar.mjs';

const S = u => new Set(u.map(x => 'https://taxcerteza.mx/' + x));

test('indexnow: archivo -> URL publicada', () => {
  assert.equal(urlDe('index.html'), 'https://taxcerteza.mx/');
  assert.equal(urlDe('herramientas/tipo-de-cambio/index.html'), 'https://taxcerteza.mx/herramientas/tipo-de-cambio/');
  assert.equal(urlDe('ayuda/404.html'), 'https://taxcerteza.mx/ayuda/404.html');
  assert.deepEqual([...locs('<urlset><url><loc>https://taxcerteza.mx/a/</loc></url><url><loc> https://taxcerteza.mx/b/ </loc></url></urlset>')],
    ['https://taxcerteza.mx/a/', 'https://taxcerteza.mx/b/']);
});

test('indexnow: solo paginas de los sitemaps, nuevas, cambiadas o borradas', () => {
  const antes = S(['', 'herramientas/', 'blog/viejo/']);
  const despues = S(['', 'herramientas/', 'herramientas/tipo-de-cambio/']);
  const r = urlsCambiadas([
    { estado: 'M', archivo: 'herramientas/index.html' },
    { estado: 'A', archivo: 'herramientas/tipo-de-cambio/index.html' },
    { estado: 'A', archivo: 'herramientas/tipo-de-cambio/tc.js' },
    { estado: 'M', archivo: '.herramientas/plantillas/indice.html' },
    { estado: 'M', archivo: 'google1aafe978078609e5.html' },
    { estado: 'M', archivo: 'ayuda/404.html' },
    { estado: 'D', archivo: 'blog/viejo/index.html' },
    { estado: 'D', archivo: 'blog/nunca-en-sitemap/index.html' },
  ], antes, despues);
  assert.deepEqual(r.urls, ['https://taxcerteza.mx/blog/viejo/', 'https://taxcerteza.mx/herramientas/',
    'https://taxcerteza.mx/herramientas/tipo-de-cambio/']);
  assert.deepEqual(r.verificar.map(v => v.archivo), ['herramientas/index.html', 'herramientas/tipo-de-cambio/index.html'],
    'lo borrado no se espera en el sitio');
  assert.deepEqual(urlsCambiadas([{ estado: 'M', archivo: 'herramientas/lista-69b/listado.json' }], antes, despues).urls, []);
});

test('indexnow: la clave es el unico <32 hex>.txt de la raiz cuyo contenido es su nombre', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'inx-'));
  const k = '0123456789abcdef0123456789abcdef';
  assert.throws(() => clave(d), /hay 0/);
  fs.writeFileSync(path.join(d, k + '.txt'), k + '\n');
  assert.equal(clave(d), k);
  fs.writeFileSync(path.join(d, 'fedcba9876543210fedcba9876543210.txt'), 'otra cosa');
  assert.equal(clave(d), k, 'un .txt cuyo contenido no es su nombre no cuenta');
  fs.writeFileSync(path.join(d, 'fedcba9876543210fedcba9876543210.txt'), 'fedcba9876543210fedcba9876543210');
  assert.throws(() => clave(d), /hay 2/);
  fs.rmSync(d, { recursive: true });
  assert.match(clave(), /^[0-9a-f]{32}$/, 'el repo tiene su archivo de clave');
});

test('indexnow: la pagina servida se compara sin el script que Netlify inyecta, y nada mas', async () => {
  const { sinInyectado } = await import('./avisar.mjs');
  const repo = '<html><body><p>hola</p>\n</body></html>\n';
  // la forma MEDIDA en produccion: una linea en blanco y el script, antes del salto que precede a </body>
  const rum = '<script async id="netlify-rum-container" src="/.netlify/scripts/rum" data-netlify-deploy-context="production" data-netlify-cwv-token="x.y.z"></script>';
  const servida = repo.replace('\n</body>', '\n\n' + rum + '\n</body>').replace(/\n/g, '\r\n');
  assert.equal(sinInyectado(servida), sinInyectado(repo), 'con el script de medicion de Netlify es la misma pagina');
  assert.notEqual(sinInyectado(servida.replace('hola', 'adios')), sinInyectado(repo), 'un cambio de contenido sigue contando');
  assert.notEqual(sinInyectado(repo.replace('</body>', '<script src="/otro.js"></script></body>')), sinInyectado(repo), 'otro script no se quita');
  // Netlify Forms reescribe la etiqueta del formulario y anade form-name (forma medida en /herramientas/)
  const conForm = '<p>x</p>\n<form name="opinion-herramientas" method="POST" data-netlify="true" hidden><input type="hidden" name="voto"></form>\n';
  const formServida = "<p>x</p>\n<form aria-hidden='true' hidden method='POST' name='opinion-herramientas'><input type='hidden' name='form-name' value='opinion-herramientas' /><input type=\"hidden\" name=\"voto\"></form>\n";
  assert.equal(sinInyectado(formServida), sinInyectado(conForm), 'el formulario reescrito por Netlify es la misma pagina');
  assert.notEqual(sinInyectado(formServida.replace('name="voto"', 'name="otro"')), sinInyectado(conForm), 'un campo distinto sigue contando');
});
