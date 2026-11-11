'use strict';
// Aviso de privacidad (/privacidad/ y /privacidad/en/). El TEXTO es provisional (se sustituira entero por el de un despacho),
// asi que esta prueba NO depende de la redaccion. Coteja tres cosas contra un INVENTARIO maquina,
// .herramientas/privacidad/datos_recogidos.json:
//   1. codigo <-> inventario: se construye cada evento REAL (netlify/lib/descargas.mjs, herramientas/opinion.js) y sus campos
//      tienen que ser exactamente las entradas `se_guarda: true` de ese evento; lo `no_guardado` (IP, user-agent, lo
//      tecleado) se busca en los eventos y no puede estar. Una entrada con un cotejo desconocido, o 'declarado' sin razon, es
//      roja (falla cerrado).
//   2. texto <-> inventario: cada fichero de texto (aviso_es.html, aviso_en.html) nombra cada id con data-datos="..." y cada
//      finalidad con data-finalidad="..."; ni de menos ni de mas. Con el texto de un abogado, la prueba sigue mordiendo si le
//      falta algo, sin exigir nuestras palabras.
//   3. publicacion: version y fecha visibles, URL estable, cada version en /privacidad/vN/, la nota interna de la cabecera no
//      se publica, ningun otro fichero copia frases del aviso, y rojo mientras quede [POR COMPLETAR].
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const CARPETA = path.join(RAIZ, '.herramientas', 'privacidad');
const url = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:');
const L = () => import(url(path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs')));
const INV = JSON.parse(fs.readFileSync(path.join(CARPETA, 'datos_recogidos.json'), 'utf8'));
const TEXTOS = { es: path.join(CARPETA, 'aviso_es.html'), en: path.join(CARPETA, 'aviso_en.html') };
const PAGINAS = { es: path.join(RAIZ, 'privacidad', 'index.html'), en: path.join(RAIZ, 'privacidad', 'en', 'index.html') };
const IP = '203.0.113.77', UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) prueba-aviso', TECLEADO = 'EKU9003173C9';
// lo que delata cada entrada no_guardado si apareciera en un evento; una entrada no_guardado sin centinela = rojo
const CENTINELAS = { 'conexion.ip': IP, 'conexion.user_agent': 'prueba-aviso', 'herramienta.contenido': TECLEADO };

const leer = (p) => fs.readFileSync(p, 'utf8');
const cabecera = (t) => { const m = /^\s*<!--([\s\S]*?)-->/.exec(t); return m ? m[1] : ''; };
const meta = (t) => Object.fromEntries(cabecera(t).split(/\r?\n/).map((l) => /^\s*([a-z]+):\s*(.+?)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2]]));
const marcados = (t, attr) => new Set([...t.matchAll(new RegExp(`\\b${attr}="([^"]*)"`, 'g'))].flatMap((m) => m[1].split(/\s+/).filter(Boolean)));

async function eventosReales() {
  const D = await L();
  const ts = '2026-10-28T12:00:00.000Z';
  const descarga = D.evento({ ts, contexto: 'production', version: '1.0.47', archivo: 'x.zip', origen: 'portada', pais: 'MX',
    metodo: 'GET', ua: UA, ip: IP, sal: 'sal-de-prueba', interno: false });
  const H = await import(url(path.join(RAIZ, 'netlify', 'lib', 'herramientas.mjs')));
  const conAccion = Object.keys(H.ACCIONES).find((h) => (H.ACCIONES[h] || []).length);
  const uso = D.eventoUso({ ts, contexto: 'production', cuerpo: { herramienta: conAccion, n: 3, accion: H.ACCIONES[conAccion][0], rfc: TECLEADO },
    pais: 'MX', metodo: 'POST', ua: UA, interno: false });
  const embudo = (await import(url(path.join(RAIZ, 'netlify', 'embudo.mjs')))).default;
  const clic = D.clicDe({ ruta: D.PREFIJO_IR + Object.keys(embudo)[0], tabla: embudo, referer: 'https://taxcerteza.mx/',
    host: 'taxcerteza.mx', ts, contexto: 'production', pais: 'MX', metodo: 'GET', ua: UA, interno: false }).evento;
  const O = require(path.join(RAIZ, 'herramientas', 'opinion.js'));
  const op = O.construir({ herramienta: 'validar-rfc', clase: 'DIGITO_NO_COINCIDE', voto: 'NO', motivo: 'no me cuadra ' + TECLEADO, fecha: '2026-10-28' });
  assert.ok(op.ok, 'calibracion: el envio de opinion de prueba es valido');
  const opinion = Object.assign({}, op.campos);
  delete opinion['form-name'];   // el nombre del formulario de Netlify, no es un dato de la persona
  assert.ok(uso && clic, 'calibracion: el uso y el clic de prueba son validos');
  return { descarga, uso, clic, opinion };
}

test('privacidad: el inventario esta bien formado (falla cerrado)', () => {
  const ids = INV.datos.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, 'hay ids repetidos en el inventario');
  for (const d of INV.datos) {
    assert.match(d.id, /^[a-z_]+\.[a-z_]+$/, `${d.id}: el id es evento.campo`);
    assert.ok(['evento', 'no_guardado', 'declarado'].includes(d.cotejo), `${d.id}: cotejo desconocido «${d.cotejo}»`);
    assert.equal(typeof d.se_guarda, 'boolean', `${d.id}: se_guarda tiene que ser true o false`);
    if (d.cotejo === 'declarado' || d.cotejo === 'no_guardado') assert.ok(d.razon && d.razon.length > 10, `${d.id}: ${d.cotejo} sin razon escrita`);
    if (d.cotejo === 'no_guardado') { assert.equal(d.se_guarda, false, `${d.id}: no_guardado con se_guarda=true`); assert.ok(CENTINELAS[d.id], `${d.id}: no_guardado sin centinela en la prueba`); }
    if (d.cotejo === 'evento') assert.equal(d.se_guarda, true, `${d.id}: cotejo evento con se_guarda=false`);
    if (d.finalidad !== null) assert.ok(Object.prototype.hasOwnProperty.call(INV.finalidades, d.finalidad), `${d.id}: finalidad «${d.finalidad}» que no existe`);
  }
});

test('privacidad: cada evento que construye el codigo guarda exactamente lo que dice el inventario', async () => {
  const r = await eventosReales();
  const porEvento = {};
  for (const d of INV.datos.filter((x) => x.cotejo === 'evento')) (porEvento[d.id.split('.')[0]] = porEvento[d.id.split('.')[0]] || []).push(d.id.split('.')[1]);
  assert.deepEqual(Object.keys(porEvento).sort(), Object.keys(r).sort(), 'cada evento del codigo tiene su grupo en el inventario, y al reves');
  for (const [ev, campos] of Object.entries(porEvento)) {
    assert.deepEqual(Object.keys(r[ev]).sort(), campos.sort(), `${ev}: lo que el codigo guarda != lo que dice el inventario`);
  }
  for (const d of INV.datos.filter((x) => x.cotejo === 'no_guardado')) {
    for (const [ev, e] of Object.entries(r)) {
      if (d.id === 'herramienta.contenido' && ev === 'opinion') continue;   // el motivo es texto libre; lo de forma de RFC se quita (opinion.test.js)
      assert.ok(!JSON.stringify(e).includes(CENTINELAS[d.id]), `${ev}: guarda ${d.id}, y el inventario dice que no se guarda`);
    }
  }
  assert.ok(!JSON.stringify(r.opinion).includes(TECLEADO), 'opinion: el RFC escrito en el motivo llega al envio');
  const D = await L();
  assert.ok(!('huella' in D) || D.UNICOS_ACTIVOS === false, 'la huella de IP esta encendida: el inventario dice que la IP no se guarda');
});

for (const [idioma, archivo] of Object.entries(TEXTOS)) {
  test(`privacidad ${idioma}: el texto nombra cada entrada del inventario y cada finalidad, por id, ni de menos ni de mas`, () => {
    const t = leer(archivo).replace(/^\s*<!--[\s\S]*?-->/, '');   // la cabecera interna explica las marcas: no cuenta
    const datos = marcados(t, 'data-datos'), fines = marcados(t, 'data-finalidad');
    const inv = new Set(INV.datos.map((d) => d.id));
    assert.deepEqual([...inv].filter((x) => !datos.has(x)).sort(), [], `${idioma}: el aviso no nombra estas entradas del inventario`);
    assert.deepEqual([...datos].filter((x) => !inv.has(x)).sort(), [], `${idioma}: el aviso nombra entradas que el inventario no tiene`);
    const fi = new Set(Object.keys(INV.finalidades));
    assert.deepEqual([...fi].filter((x) => !fines.has(x)).sort(), [], `${idioma}: el aviso no nombra estas finalidades`);
    assert.deepEqual([...fines].filter((x) => !fi.has(x)).sort(), [], `${idioma}: el aviso nombra finalidades que el inventario no tiene`);
  });
}

test('privacidad: version y fecha en la cabecera de cada texto, iguales en los dos idiomas, y cada version anterior archivada', () => {
  const m = { es: meta(leer(TEXTOS.es)), en: meta(leer(TEXTOS.en)) };
  for (const i of ['es', 'en']) {
    assert.match(m[i].version || '', /^[1-9]\d*$/, `${i}: falta version: N en la cabecera`);
    assert.match(m[i].fecha || '', /^(\d{4}-\d{2}-\d{2}|\[POR COMPLETAR.*)$/, `${i}: falta fecha: AAAA-MM-DD en la cabecera`);
  }
  assert.deepEqual([m.es.version, m.es.fecha], [m.en.version, m.en.fecha], 'el aviso en espanol y en ingles tienen version o fecha distintas');
  const v = Number(m.es.version);
  for (let k = 1; k < v; k++) for (const i of ['es', 'en']) {
    const a = path.join(CARPETA, 'archivo', `v${k}_${i}.html`);
    assert.ok(fs.existsSync(a), `falta la version ${k} archivada (${path.relative(RAIZ, a)}): al publicar una nueva, la anterior se guarda tal cual`);
  }
  for (let k = 1; k <= v; k++) for (const [i, s] of [['es', ''], ['en', 'en/']]) {
    assert.ok(fs.existsSync(path.join(RAIZ, 'privacidad', `v${k}`, s, 'index.html')), `falta /privacidad/v${k}/${s} (${i})`);
  }
  const es = leer(PAGINAS.es), en = leer(PAGINAS.en);
  assert.ok(es.includes(`Versión ${v}, vigente desde el `), 'la version vigente no se ve en /privacidad/');
  assert.ok(en.includes(`Version ${v}, in effect since `), 'la version vigente no se ve en /privacidad/en/');
  assert.ok(es.includes(`href="/privacidad/v${v}/"`) && en.includes(`href="/privacidad/v${v}/en/"`), 'la lista de versiones no enlaza la vigente');
});

test('privacidad: la pagina publicada no lleva la nota interna ni comentarios del texto fuente', () => {
  const nota = cabecera(leer(TEXTOS.es));
  assert.match(nota, /BORRADOR INTERNO SIN REVISION LEGAL/, 'calibracion: la cabecera del texto lleva la nota interna');
  for (const p of [...Object.values(PAGINAS), path.join(RAIZ, 'privacidad', 'v1', 'index.html'), path.join(RAIZ, 'privacidad', 'v1', 'en', 'index.html')]) {
    const h = leer(p);
    assert.ok(!/borrador|revisi[oó]n legal|despacho|data-campos|<!--(?!menu-movil|\/menu-movil|redes|\/redes)/i.test(h), `${path.relative(RAIZ, p)}: se publica la nota interna o un comentario del texto`);
  }
});

test('privacidad: URL estable, versiones con noindex, y las dos versiones se enlazan entre si', () => {
  const es = leer(PAGINAS.es), en = leer(PAGINAS.en);
  assert.match(es, /<html lang="es-MX">/);
  assert.match(en, /<html lang="en">/);
  assert.ok(es.includes('href="/privacidad/en/"') && en.includes('href="/privacidad/"'), 'cada idioma enlaza al otro');
  assert.ok(es.includes('hreflang="en" href="https://taxcerteza.mx/privacidad/en/"'), 'hreflang de la version en ingles');
  assert.ok(es.includes('<link rel="canonical" href="https://taxcerteza.mx/privacidad/">'), 'el canonical es la URL estable');
  const v1 = leer(path.join(RAIZ, 'privacidad', 'v1', 'index.html'));
  assert.match(v1, /<meta name="robots" content="noindex, follow">/, 'el enlace fijo de una version no compite con la URL estable');
  const pie = leer(path.join(RAIZ, 'herramientas', 'index.html'));
  assert.ok(pie.includes('<a href="/privacidad/">Aviso de privacidad</a>'), 'el pie de las herramientas no enlaza el aviso');
});

test('privacidad: ningun otro fichero copia frases del aviso (sustituirlo = cambiar dos ficheros)', () => {
  const frases = new Set();
  for (const t of Object.values(TEXTOS)) {
    for (const m of leer(t).replace(/^\s*<!--[\s\S]*?-->/, '').matchAll(/>([^<>]{70,})</g)) frases.add(m[1].trim().slice(0, 70));
  }
  assert.ok(frases.size > 20, `calibracion: se sacan frases del aviso (${frases.size})`);
  const fuera = [];
  const recorrer = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git'].includes(d.name)) continue;
      const p = path.join(dir, d.name);
      if (p === path.join(RAIZ, 'privacidad') || p === path.join(CARPETA)) continue;   // lo publicado y la fuente misma
      if (d.isDirectory()) recorrer(p);
      else if (/\.(html|js|mjs|py|md|json|txt|xml)$/.test(d.name) && p !== __filename) {
        const t = leer(p);
        for (const f of frases) if (t.includes(f)) fuera.push(`${path.relative(RAIZ, p)}: «${f.slice(0, 40)}...»`);
      }
    }
  };
  recorrer(RAIZ);
  assert.deepEqual(fuera, [], 'otro fichero copia frases del aviso');
});

test('privacidad: no se publica con datos de la empresa [POR COMPLETAR] (los da la duena del sitio)', () => {
  for (const [idioma, archivo] of Object.entries(PAGINAS)) {
    const html = leer(archivo);
    const n = (html.match(/\[POR COMPLETAR/g) || []).length;
    if (n) assert.match(html, /<meta name="robots" content="noindex, follow">/, `${idioma}: con marcadores tiene que ir con noindex`);
    assert.equal(n, 0, `${idioma}: quedan ${n} datos [POR COMPLETAR]: razon social, domicilio, correo ARCO y fecha`);
  }
});
