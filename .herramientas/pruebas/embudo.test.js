'use strict';
// Pasos del embudo (/descargar/ir/<destino>): (1) el destino sale solo de la tabla (sin redireccion abierta), (2) la
// pagina de origen sale del Referer del PROPIO sitio en una lista cerrada, (3) el evento no guarda nada mas, (4) el
// resumen cuenta clics reales por destino y por origen sin mezclarlos con las descargas, (5) las herramientas enlazan
// sus pasos del embudo por la ruta que cuenta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const imp = rel => import(path.join(RAIZ, rel).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const HOST = 'taxcerteza.mx';

test('embudo: la tabla de destinos es cerrada y solo lleva a sitios propios', async () => {
  const { default: embudo } = await imp('netlify/embudo.mjs');
  assert.deepEqual(Object.keys(embudo).sort(), ['demo', 'descargar', 'video', 'whatsapp']);
  for (const [d, u] of Object.entries(embudo)) assert.match(u, /^(\/#[a-z]+|https:\/\/wa\.me\/528125834137(\?text=[^"<> ]+)?)$/, d);
  const { eventoClic } = await imp('netlify/lib/descargas.mjs');
  for (const malo of ['otro', 'https://evil.example', '../descargar', '', 'constructor', 'toString', '__proto__'])
    assert.equal(eventoClic({ ts: 't', contexto: 'production', destino: malo, tabla: embudo }), null, `destino no permitido: ${malo}`);
});

test('embudo: la ruta /descargar/ir/<destino> redirige solo a la tabla y 404 a lo demas', async () => {
  const { default: embudo } = await imp('netlify/embudo.mjs');
  const { clicDe } = await imp('netlify/lib/descargas.mjs');
  const base = { tabla: embudo, host: HOST, ts: '2026-10-20T10:00:00Z', contexto: 'production', ua: 'Mozilla/5.0' };
  const r = clicDe(Object.assign({ ruta: '/descargar/ir/whatsapp', referer: 'https://taxcerteza.mx/herramientas/valor-uma/' }, base));
  assert.equal(r.location, 'https://wa.me/528125834137?text=' +
    encodeURIComponent('Hola, vengo de la herramienta «Valor de la UMA y conversor» de taxcerteza.mx y quiero probar el programa.'));
  assert.deepEqual([r.evento.destino, r.evento.origen], ['whatsapp', 'herramienta:valor-uma']);
  assert.equal(clicDe(Object.assign({ ruta: '/descargar/ir/whatsapp' }, base)).location, 'https://wa.me/528125834137', 'sin origen, sin texto');
  assert.equal(clicDe(Object.assign({ ruta: '/descargar/ir/demo', referer: 'https://taxcerteza.mx/blog/' }, base)).location, embudo.demo, 'la demo lleva su propio texto');
  assert.equal(clicDe(Object.assign({ ruta: '/descargar/ir/descargar' }, base)).location, '/#descargar');
  for (const ruta of ['/descargar/ir/', '/descargar/ir/https://evil.example', '/descargar/ir/whatsapp/x', '/descargar/ir/__proto__', '/descargar', '/otra/ir/whatsapp'])
    assert.equal(clicDe(Object.assign({ ruta }, base)), null, ruta);
});

test('embudo: el WhatsApp prellenado dice solo de que pagina viene, nada de la persona', async () => {
  const { default: embudo } = await imp('netlify/embudo.mjs');
  const { clicDe, textoWhatsapp } = await imp('netlify/lib/descargas.mjs');
  const { HERRAMIENTAS, NOMBRES } = await imp('netlify/lib/herramientas.mjs');
  // los nombres son los titulos cortos de las plantillas, uno por herramienta
  assert.deepEqual(Object.keys(NOMBRES).sort(), [...HERRAMIENTAS].sort());
  for (const h of HERRAMIENTAS) {
    const pl = fs.readFileSync(path.join(RAIZ, '.herramientas', 'plantillas', h + '.html'), 'utf8');
    assert.equal(NOMBRES[h], /^@@TITULO_CORTO\r?\n(.+)$/m.exec(pl)[1].trim(), h);
    assert.match(textoWhatsapp('herramienta:' + h), /^Hola, vengo de la herramienta «[^»]+» de taxcerteza\.mx y quiero probar el programa\.$/);
  }
  for (const o of ['otra', 'sin_origen', 'herramienta:no-existe', 'herramienta:', '', undefined]) assert.equal(textoWhatsapp(o), '', String(o));
  // lo que venga en la URL de la pagina (por ejemplo un RFC en la consulta) jamas llega al texto
  const base = { tabla: embudo, host: HOST, ts: 't', contexto: 'production', ua: 'Mozilla/5.0' };
  const r = clicDe(Object.assign({ ruta: '/descargar/ir/whatsapp', referer: 'https://taxcerteza.mx/herramientas/lista-69b/?rfc=XAXX010101000&x=<b>' }, base));
  const texto = decodeURIComponent(r.location.split('?text=')[1]);
  assert.equal(texto, 'Hola, vengo de la herramienta «Consulta de la lista 69-B (EFOS)» de taxcerteza.mx y quiero probar el programa.');
  assert.ok(!r.location.includes('XAXX') && !r.location.includes('%3Cb'));
});

test('embudo: la pagina de origen sale del Referer del propio sitio, en una lista cerrada', async () => {
  const { origenDe } = await imp('netlify/lib/descargas.mjs');
  const casos = [
    ['https://taxcerteza.mx/', 'portada'], ['https://taxcerteza.mx/index.html', 'portada'], ['https://taxcerteza.mx/?x=1#descargar', 'portada'],
    ['https://taxcerteza.mx/herramientas/', 'herramientas'],
    ['https://taxcerteza.mx/herramientas/verificar-factura/', 'herramienta:verificar-factura'],
    ['https://taxcerteza.mx/herramientas/tipo-de-cambio/?tc-a=2026', 'herramienta:tipo-de-cambio'],
    ['https://taxcerteza.mx/herramientas/no-existe/', 'herramientas'],
    ['https://taxcerteza.mx/blog/', 'blog'], ['https://taxcerteza.mx/blog/diot-como-se-calcula-y-se-presenta/', 'blog'],
    ['https://taxcerteza.mx/ayuda/calculos/ope-056/', 'ayuda'],
    ['https://taxcerteza.mx/otra-cosa', 'otra'],
    ['https://evil.example/herramientas/verificar-factura/', 'sin_origen'],
    ['https://taxcerteza.mx.evil.example/', 'sin_origen'],
    ['', 'sin_origen'], [null, 'sin_origen'], ['no es una url', 'sin_origen'],
  ];
  for (const [ref, esperado] of casos) assert.equal(origenDe(ref, HOST), esperado, String(ref));
  assert.equal(origenDe('https://deploy-preview-9--taxcerteza.netlify.app/blog/', 'deploy-preview-9--taxcerteza.netlify.app'), 'blog',
    'en la vista previa cuenta su propio host');
});

test('embudo: el clic guarda solo destino, origen y lo mismo que una descarga', async () => {
  const { default: embudo } = await imp('netlify/embudo.mjs');
  const { eventoClic } = await imp('netlify/lib/descargas.mjs');
  const ev = eventoClic({ ts: '2026-10-20T10:00:00Z', contexto: 'production', destino: 'whatsapp', tabla: embudo, origen: 'herramienta:iva-del-mes',
    pais: 'MX', metodo: 'GET', ua: 'Mozilla/5.0', interno: false, ip: '1.2.3.4' });
  assert.deepEqual(Object.keys(ev).sort(), ['bot', 'contexto', 'destino', 'interno', 'origen', 'pais', 'tipo', 'ts']);
  assert.ok(!JSON.stringify(ev).includes('1.2.3.4') && !JSON.stringify(ev).includes('Mozilla'));
  assert.equal(eventoClic({ ts: 't', contexto: 'production', destino: 'video', tabla: embudo, ua: 'Googlebot' }).bot, true);
});

test('embudo: el resumen cuenta clics reales por destino y por origen, aparte de las descargas', async () => {
  const { default: embudo } = await imp('netlify/embudo.mjs');
  const { eventoClic, evento, resumir } = await imp('netlify/lib/descargas.mjs');
  const ts = '2026-10-14T10:00:00Z', ua = 'Mozilla/5.0';
  const c = (destino, origen, extra = {}) => eventoClic(Object.assign({ ts, contexto: 'production', destino, tabla: embudo, origen, ua }, extra));
  const eventos = [
    c('whatsapp', 'herramienta:verificar-factura'), c('whatsapp', 'herramienta:verificar-factura'), c('descargar', 'herramienta:verificar-factura'),
    c('video', 'blog'), c('demo', 'portada'),
    c('demo', 'portada', { ua: 'Googlebot' }), c('video', 'blog', { interno: true }),
    evento({ ts, contexto: 'production', version: '1.0.47', archivo: 'windows', ua, origen: 'portada' }),
    evento({ ts, contexto: 'production', version: '1.0.47', archivo: 'windows', ua }),
    { tipo: 'uso', ts, contexto: 'production', herramienta: 'valor-uma', n: null, bot: false, interno: false },
    c('whatsapp', 'portada', { contexto: 'deploy-preview' }),
  ];
  const r = resumir(eventos, { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.equal(r.descargas_total, 2, 'los clics y los usos no cuentan como descargas');
  assert.deepEqual(r.descargas_reales_por_origen, { portada: 1, sin_origen: 1 });
  assert.deepEqual([r.clics.total, r.clics.bots, r.clics.internos, r.clics.reales], [7, 1, 1, 5]);
  assert.deepEqual(r.clics.reales_por_destino, { whatsapp: 2, demo: 1, descargar: 1, video: 1 });
  assert.deepEqual(r.clics.reales_por_origen, { 'herramienta:verificar-factura': { whatsapp: 2, descargar: 1 }, blog: { video: 1 }, portada: { demo: 1 } });
  assert.equal(r.usos.reales, 1);
});

test('embudo: las herramientas enlazan sus pasos del embudo por la ruta que cuenta', () => {
  const dir = path.join(RAIZ, 'herramientas');
  const paginas = [path.join(dir, 'index.html')].concat(fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => path.join(dir, d.name, 'index.html')).filter(f => fs.existsSync(f)));
  assert.ok(paginas.length >= 10, 'calibracion: hay paginas de herramientas');
  for (const f of paginas) {
    const h = fs.readFileSync(f, 'utf8'), rel = path.relative(RAIZ, f);
    assert.ok(!/href="https:\/\/wa\.me\//.test(h), `${rel}: WhatsApp directo, sin contar`);
    assert.ok(!/href="\/#descargar"/.test(h), `${rel}: Descargar directo, sin contar`);
    assert.ok(h.includes('href="/descargar/ir/descargar"') && h.includes('href="/descargar/ir/whatsapp"'), `${rel}: lleva los pasos por la ruta`);
  }
});

test('embudo: la portada lleva la demo y el WhatsApp por la ruta que cuenta', () => {
  const h = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.equal((h.match(/href="\/descargar\/ir\/demo"/g) || []).length, 2, 'los dos botones de la demo');
  assert.equal((h.match(/href="\/descargar\/ir\/whatsapp"/g) || []).length, 1, 'el WhatsApp del pie');
  assert.ok(!/href="https:\/\/wa\.me\/528125834137"/.test(h), 'ningun WhatsApp directo sin contar');
  assert.ok(!/href="https:\/\/wa\.me\/[^"]*demo/.test(h), 'ninguna demo directa sin contar');
  // se quedan directos, a proposito: el soporte de activacion (no es paso del embudo) y los anclajes internos de la
  // propia portada (#descargar), que llevarlos por la ruta recargaria la pagina; la descarga misma se cuenta en /descargar
  assert.equal((h.match(/href="https:\/\/wa\.me\/528125834137\?text=Hola,%20quiero%20activar/g) || []).length, 2);
});
