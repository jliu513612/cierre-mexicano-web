// Prueba en un navegador de verdad (Chrome sin ventana, sin dependencias) de la opinion sobre el resultado.
// Asevera sobre lo que SALE por la red, no sobre el codigo:
//   A. se teclea un RFC, se vota «No» y se escribe un motivo que REPITE ese RFC -> el cuerpo enviado no lo contiene;
//   B. el voto «Si» en la UMA y en el REP no lleva la cantidad ni la fecha tecleadas;
//   C. el servidor contesta 500 -> la pagina lo dice y el calculo sigue funcionando;
//   D. opinion.js no carga (404) -> el calculo sigue funcionando y no se envia nada;
//   E. el campo trampa relleno -> no sale ninguna peticion;
//   F. mas envios que el tope en una misma carga -> no pasan del tope;
//   G. con las cabeceras de `_headers` puestas (la politica de contenido), portada, blog y herramientas cargan,
//      calculan y votan con CERO violaciones. Limite: en local se quita `upgrade-insecure-requests`, porque el
//      servidor de prueba es http; esa directiva solo se puede comprobar en la vista previa de Netlify.
// Uso: node .herramientas/prueba_navegador.mjs        (CHROME=ruta para indicar otro navegador)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATOS = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
const CHROME = CANDIDATOS.find(c => c && fs.existsSync(c));
if (!CHROME) { console.error('no encuentro Chrome: indica la ruta en CHROME'); process.exit(2); }
const PUERTO = 8751, DEPURA = 9381;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// Cabeceras de `_headers` (bloque `/*`), las mismas que Netlify aplicara a todas las rutas.
const CABECERAS = {};
if (fs.existsSync(path.join(RAIZ, '_headers'))) {
  for (const l of fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').split(/\r?\n/)) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(l);
    if (m) CABECERAS[m[1]] = m[2].replace(/;\s*upgrade-insecure-requests/, '');
  }
}
const recibidos = [];           // cuerpos de los POST, tal como llegan
let modo = 'OK';                // 'OK' | 'FALLA_500' | 'SIN_OPINION'
const servidor = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      recibidos.push({ url: req.url, cuerpo, tipo: req.headers['content-type'] });
      res.writeHead(modo === 'FALLA_500' ? 500 : 200); res.end('x');
    });
    return;
  }
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(RAIZ, ruta);
  if (modo === 'LISTADO_FALLO' && ruta.endsWith('/lista-69b/listado.json')) {
    const d = JSON.parse(fs.readFileSync(path.join(RAIZ, ruta), 'utf8'));
    d.estado = 'NO_SE_PUDO_ACTUALIZAR';
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CABECERAS)); res.end(JSON.stringify(d)); return;
  }
  if ((modo === 'SIN_OPINION' && ruta.endsWith('/opinion.js')) || !archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, CABECERAS));
  res.end(fs.readFileSync(archivo));
});

const espera = ms => new Promise(r => setTimeout(r, ms));
let ws, sig = 0;
const pendientes = new Map(), eventos = [];
function cdp(metodo, params = {}, sesion) {
  const id = ++sig;
  ws.send(JSON.stringify({ id, method: metodo, params, sessionId: sesion }));
  return new Promise((ok, mal) => pendientes.set(id, { ok, mal, metodo }));
}

const fallos = [];
let comprobaciones = 0;
function exige(cond, texto) { comprobaciones++; if (!cond) fallos.push(texto); console.log((cond ? '  ok    ' : '  FALLA ') + texto); }

async function abrir(ruta) {
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  await cdp('Page.enable', {}, s); await cdp('Runtime.enable', {}, s);
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'en linea')))" }, s);
  eventos.length = 0;
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PUERTO}${ruta}` }, s);
  for (let i = 0; i < 100 && !eventos.some(e => e.method === 'Page.loadEventFired' && e.sessionId === s); i++) await espera(50);
  await espera(200);
  const js = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, s);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // Escribir como una persona: foco y texto por el teclado del navegador.
  const teclea = async (sel, texto) => { await js(`document.querySelector(${JSON.stringify(sel)}).focus()`); await cdp('Input.insertText', { text: texto }, s); };
  const pulsa = sel => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
  const texto = sel => js(`(document.querySelector(${JSON.stringify(sel)})||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  const pon = (sel, v) => js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const excepciones = () => eventos.filter(e => e.sessionId === s && e.method === 'Runtime.exceptionThrown').length;
  const violaciones = () => js('window.__csp.join(" | ")');
  return { js, teclea, pulsa, texto, pon, excepciones, violaciones, cerrar: () => cdp('Target.closeTarget', { targetId }) };
}
const campos = c => Object.fromEntries(new URLSearchParams(c));

async function main() {
  await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-nav-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEPURA}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-sandbox', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 75 && !info; i++) { await espera(200); try { info = await (await fetch(`http://127.0.0.1:${DEPURA}/json/version`)).json(); } catch { /* aun no arranca */ } }
  if (!info) throw new Error('Chrome no arranco');
  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) { const p = pendientes.get(d.id); pendientes.delete(d.id); d.error ? p.mal(new Error(p.metodo + ': ' + d.error.message)) : p.ok(d.result); }
    else if (d.method) eventos.push(d);
  };

  const RFC = 'EKU9003173C8';
  console.log('A. RFC tecleado, voto «No», y el motivo repite el RFC');
  let p = await abrir('/herramientas/validar-rfc/');
  await p.teclea('#rfc', RFC); await p.pulsa('#f-rfc button[type=submit]');
  exige((await p.texto('#res-rfc')).includes('El dígito verificador no coincide'), 'calibracion: el resultado se pinta');
  exige((await p.texto('#res-rfc .op-pregunta')) === '¿Te sirvió este resultado?', 'aparece la pregunta bajo el resultado');
  exige(recibidos.length === 0, 'calcular no envia nada');
  await p.pulsa('#res-rfc .op-botones button:nth-child(2)');
  await p.teclea('#res-rfc .op-forma textarea', `mi RFC ${RFC} si es correcto, y tambien eku-900317-3c8`);
  await p.teclea('#res-rfc .op-forma input[type=email]', 'ana@despacho.mx');
  await p.pulsa('#res-rfc .op-enviar'); await espera(400);
  exige(recibidos.length === 1, `sale exactamente una peticion (salieron ${recibidos.length})`);
  let c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  const crudo = recibidos[0] ? decodeURIComponent(recibidos[0].cuerpo.replace(/\+/g, ' ')) : '';
  exige(!/EKU9003173C8|900317|3C8/i.test(crudo), 'el cuerpo enviado NO contiene el RFC tecleado ni sus partes');
  exige(c.herramienta === 'validar-rfc' && c.clase === 'DIGITO_NO_COINCIDE' && c.voto === 'NO', `lleva herramienta, clase y voto (${c.herramienta}, ${c.clase}, ${c.voto})`);
  exige(c.motivo === 'mi RFC [RFC omitido] si es correcto, y tambien [RFC omitido]', `el motivo llega con el RFC omitido («${c.motivo}»)`);
  exige(c.correo === 'ana@despacho.mx' && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha || ''), 'lleva el correo opcional y la fecha');
  exige(Object.keys(c).sort().join() === 'clase,correo,fecha,form-name,herramienta,motivo,voto', `solo los siete campos (${Object.keys(c).sort().join()})`);
  exige(recibidos[0] && recibidos[0].url === '/' && /x-www-form-urlencoded/.test(recibidos[0].tipo), 'va a la raiz del propio sitio, como formulario');
  exige((await p.texto('#res-rfc .op-estado')).startsWith('Gracias'), 'la pagina da las gracias');
  await p.cerrar();

  console.log('B. voto «Si» en la UMA y en el REP');
  recibidos.length = 0;
  p = await abrir('/herramientas/valor-uma/');
  await p.teclea('#cantidad', '987654.32'); await p.pulsa('#f-uma button[type=submit]');
  await p.pulsa('#res-uma .op-botones button:nth-child(1)'); await espera(400);
  c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  exige(recibidos.length === 1 && c.herramienta === 'valor-uma' && c.clase === 'VECES_A_PESOS' && c.voto === 'SI', `UMA: un envio con su clase (${c.clase})`);
  exige(recibidos[0] && !/987654|115860/.test(recibidos[0].cuerpo), 'UMA: no viaja la cantidad tecleada ni el resultado');
  await p.cerrar();
  recibidos.length = 0;
  p = await abrir('/herramientas/complemento-de-pago/');
  await p.pon('#fecha-pago', '2026-03-17'); await p.pulsa('#f-plazo button[type=submit]');
  await p.pulsa('#res-plazo .op-botones button:nth-child(1)'); await espera(400);
  c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  exige(recibidos.length === 1 && c.herramienta === 'complemento-de-pago' && /^PLAZO_(NORMAL|URGENTE|VENCIDO)$/.test(c.clase || ''), `REP: un envio con su clase (${c.clase})`);
  exige(recibidos[0] && !/2026-03-17|2026-04-05|03-17/.test(decodeURIComponent(recibidos[0].cuerpo)), 'REP: no viaja la fecha del pago ni la fecha limite');
  await p.cerrar();

  console.log('C. el servidor contesta 500');
  recibidos.length = 0; modo = 'FALLA_500';
  p = await abrir('/herramientas/validar-rfc/');
  await p.teclea('#rfc', 'XIQB891116QE4'); await p.pulsa('#f-rfc button[type=submit]');
  await p.pulsa('#res-rfc .op-botones button:nth-child(1)'); await espera(400);
  exige((await p.texto('#res-rfc .op-estado')).startsWith('No se pudo enviar'), 'la pagina dice que no se pudo enviar');
  await p.js(`document.querySelector('#rfc').value='EKU9003173C9'`); await p.pulsa('#f-rfc button[type=submit]');
  exige((await p.texto('#res-rfc')).includes('El RFC está bien formado'), 'despues del fallo el calculo sigue funcionando');
  exige(p.excepciones() === 0, 'sin excepciones en la pagina');
  await p.cerrar();

  console.log('D. opinion.js no carga');
  recibidos.length = 0; modo = 'SIN_OPINION';
  for (const [ruta, pasos, sel, esperado] of [
    ['/herramientas/validar-rfc/', async q => { await q.teclea('#rfc', 'EKU9003173C9'); await q.pulsa('#f-rfc button[type=submit]'); }, '#res-rfc', 'El RFC está bien formado'],
    ['/herramientas/valor-uma/', async q => { await q.teclea('#cantidad', '25'); await q.pulsa('#f-uma button[type=submit]'); }, '#res-uma', 'veces la UMA diaria'],
    ['/herramientas/complemento-de-pago/', async q => { await q.pon('#fecha-pago', '2026-03-17'); await q.pulsa('#f-plazo button[type=submit]'); }, '#res-plazo', '5 de abril de 2026'],
  ]) {
    p = await abrir(ruta); await pasos(p);
    exige((await p.texto(sel)).includes(esperado), `${ruta}: calcula sin opinion.js`);
    exige((await p.texto(sel + ' .opinion')) === '' && p.excepciones() === 0, `${ruta}: sin pregunta y sin excepciones`);
    await p.cerrar();
  }
  exige(recibidos.length === 0, 'no sale ninguna peticion');

  console.log('E. campo trampa relleno');
  recibidos.length = 0; modo = 'OK';
  p = await abrir('/herramientas/validar-rfc/');
  await p.teclea('#rfc', 'EKU9003173C9'); await p.pulsa('#f-rfc button[type=submit]');
  await p.pulsa('#res-rfc .op-botones button:nth-child(2)');
  await p.js(`document.querySelector('#res-rfc .op-trampa').value='http://spam.example'`);
  await p.pulsa('#res-rfc .op-enviar'); await espera(400);
  exige(recibidos.length === 0, 'con la trampa rellena no sale ninguna peticion');

  console.log('F. tope de envios por carga de pagina');
  for (let i = 0; i < 9; i++) {
    await p.js(`document.querySelector('#rfc').value='EKU9003173C9'`); await p.pulsa('#f-rfc button[type=submit]');
    await p.pulsa('#res-rfc .op-botones button:nth-child(1)'); await espera(120);
  }
  await espera(300);
  exige(recibidos.length === 5, `de 9 votos seguidos salen 5, el tope (salieron ${recibidos.length})`);
  await p.cerrar();

  console.log('I. lista 69-B: la consulta se hace en el navegador');
  {
    const V69 = JSON.parse(fs.readFileSync(path.join(RAIZ, '.herramientas', 'vectores', 'lista69b.json'), 'utf8'));
    const DAT = JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas', 'lista-69b', 'listado.json'), 'utf8'));
    const enLista = Object.keys(V69.muestra).find(r => DAT.r[r]) || Object.keys(DAT.r)[0];
    const fueraDeLista = 'EKU9003173C9';
    recibidos.length = 0; modo = 'OK';
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Page.enable', {}, s); await cdp('Runtime.enable', {}, s); await cdp('DOM.enable', {}, s); await cdp('Network.enable', {}, s);
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))" }, s);
    const desde = eventos.length;
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PUERTO}/herramientas/lista-69b/` }, s);
    for (let i = 0; i < 100 && !eventos.slice(desde).some(e => e.method === 'Page.loadEventFired' && e.sessionId === s); i++) await espera(50);
    await espera(900);
    const js = async e => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true }, s)).result.value;
    const fechaLarga = (() => { const [a, m, d] = DAT.fecha_info.split('-'); return `${+d} de ${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m - 1]} de ${a}`; })();
    exige((await js("document.querySelector('#estado-listado').innerText")).includes(fechaLarga), `la pagina dice la fecha del listado (${fechaLarga})`);
    await js(`document.querySelector('#rfcs').focus()`);
    await cdp('Input.insertText', { text: `${enLista.toLowerCase()}\n${fueraDeLista}` }, s);
    await js("document.querySelector('#f-69b').requestSubmit()");
    await espera(600);
    const t = await js("document.querySelector('#res-69b').innerText");
    exige(t.includes('1 de 2 RFC aparece'), 'cuenta 1 de 2 en el listado');
    exige(t.includes(enLista) && t.includes(DAT.r[enLista][0][0] === 'D' ? 'Definitivo' : DAT.r[enLista][0][0] === 'P' ? 'Presunto' : DAT.r[enLista][0][0] === 'V' ? 'Desvirtuado' : 'Sentencia favorable'), 'muestra el RFC listado con su situacion');
    const { root } = await cdp('DOM.getDocument', {}, s);
    const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#xml69' }, s);
    await js("document.querySelector('#rfcs').value=''");
    await cdp('DOM.setFileInputFiles', { nodeId, files: ['01_cfdi40_ingreso.xml', '11_enie_en_rfc.xml'].map(f => path.join(RAIZ, '.herramientas', 'fixtures', 'cfdi', f)) }, s);
    await espera(800);
    exige((await js("document.querySelector('#res-69b').innerText")).includes('emisores tomados de 2 XML'), 'toma los emisores de los XML');
    exige((await js("document.querySelector('#xml69-estado').textContent")) === '2 archivos seleccionados', 'el selector del 69-B dice cuantos archivos hay');
    const fuera = eventos.slice(desde).filter(e => e.sessionId === s && e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(`http://127.0.0.1:${PUERTO}/`) && !e.params.request.url.startsWith('data:'));
    const conRfc = eventos.slice(desde).filter(e => e.sessionId === s && e.method === 'Network.requestWillBeSent' && (e.params.request.url + (e.params.request.postData || '')).toUpperCase().includes(enLista));
    exige(fuera.length === 0 && recibidos.length === 0 && conRfc.length === 0, `consultar no envia los RFC (${fuera.length} fuera, ${recibidos.length} POST, ${conRfc.length} con el RFC)`);
    exige((await js("window.__csp.join('|')")) === '', 'cero violaciones de la politica');
    await cdp('Target.closeTarget', { targetId });
    modo = 'LISTADO_FALLO';
    p = await abrir('/herramientas/lista-69b/');
    await espera(700);
    exige((await p.texto('#estado-listado')).startsWith('No se pudo actualizar el listado; los datos son al ' + fechaLarga), 'si la actualizacion fallo, la pagina lo dice con la fecha de los datos');
    await p.cerrar();
    modo = 'OK';
  }

  console.log('H. verificar factura: XML elegidos en el navegador, nada sale');
  recibidos.length = 0;
  {
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Page.enable', {}, s); await cdp('Runtime.enable', {}, s); await cdp('DOM.enable', {}, s); await cdp('Network.enable', {}, s);
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))" }, s);
    const desde = eventos.length;
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PUERTO}/herramientas/verificar-factura/` }, s);
    for (let i = 0; i < 100 && !eventos.slice(desde).some(e => e.method === 'Page.loadEventFired' && e.sessionId === s); i++) await espera(50);
    await espera(300);
    const js = async e => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true }, s)).result.value;
    const FIX = path.join(RAIZ, '.herramientas', 'fixtures', 'cfdi');
    const { root } = await cdp('DOM.getDocument', {}, s);
    const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#xml' }, s);
    await cdp('DOM.setFileInputFiles', { nodeId, files: ['01_cfdi40_ingreso.xml', '05_receptor_con_ampersand.xml', '04_sin_timbre.xml', '15_xml_roto.xml'].map(f => path.join(FIX, f)) }, s);
    await espera(800);
    const v = await js(`({n:document.querySelectorAll('#res-xml .factura').length, enlaces:[...document.querySelectorAll('#res-xml a.fac-sat')].map(a=>a.href), titulo:(document.querySelector('#res-xml h3')||{}).textContent, csp:window.__csp.join('|')})`);
    exige(v.n === 4, `lista las 4 facturas (${v.n})`);
    const sel = await js(`({estado:document.querySelector('#xml-estado').textContent, nativos:document.querySelectorAll('input[type=file]:not(.oculto-accesible)').length, ancho:document.querySelector('#xml').getBoundingClientRect().width, boton:document.querySelector('label[for=xml].sel-boton').textContent})`);
    exige(sel.estado === '4 archivos seleccionados' && sel.boton === 'Seleccionar archivos', `el selector habla en español sea cual sea el idioma del navegador («${sel.boton}», «${sel.estado}»)`);
    exige(sel.nativos === 0 && sel.ancho <= 1, `el input nativo queda oculto a la vista (${sel.nativos} visibles, ancho ${sel.ancho})`);
    exige(v.enlaces.length === 2 && v.enlaces.every(h => h.startsWith('https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=')), `arma 2 enlaces al SAT (${v.enlaces.length})`);
    exige(v.enlaces.some(h => h.includes('rr=H%26E951128469')), 'el RFC con & va codificado en el enlace');
    exige(/2 completos/.test(v.titulo || ''), `resumen del lote: «${v.titulo}»`);
    const salidas = eventos.slice(desde).filter(e => e.sessionId === s && e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(`http://127.0.0.1:${PUERTO}/`) && !e.params.request.url.startsWith('data:'));
    exige(salidas.length === 0 && recibidos.length === 0, `leer los XML no envia nada (${salidas.length} fuera, ${recibidos.length} POST)`);
    exige(v.csp === '', `cero violaciones de la politica (${v.csp})`);
    await cdp('Target.closeTarget', { targetId });
  }

  console.log('G. politica de contenido de _headers');
  exige(/script-src 'self'/.test(CABECERAS['Content-Security-Policy'] || ''), 'calibracion: el servidor de prueba manda la politica de _headers');
  p = await abrir('/herramientas/validar-rfc/');
  await p.js(`(()=>{const s=document.createElement('script');s.textContent='window.__colado=1';document.body.appendChild(s);})()`);
  await espera(150);
  exige((await p.js('window.__colado')) !== 1 && /script-src/.test(await p.violaciones()), 'calibracion: la politica bloquea un script en linea y el detector lo ve');
  await p.cerrar();
  recibidos.length = 0;
  const articulo = '/blog/' + fs.readdirSync(path.join(RAIZ, 'blog')).filter(d => fs.existsSync(path.join(RAIZ, 'blog', d, 'index.html')))[0] + '/';
  for (const [ruta, pasos] of [
    ['/', null], ['/blog/', null], [articulo, null], ['/herramientas/', null], ['/herramientas/verificar-factura/', null], ['/herramientas/lista-69b/', null],
    ['/herramientas/validar-rfc/', async q => { await q.teclea('#rfc', 'EKU9003173C9'); await q.pulsa('#f-rfc button[type=submit]'); await q.pulsa('#res-rfc .op-botones button:nth-child(1)'); }],
    ['/herramientas/valor-uma/', async q => { await q.teclea('#cantidad', '25'); await q.pulsa('#f-uma button[type=submit]'); await q.pulsa('#res-uma .op-botones button:nth-child(1)'); }],
    ['/herramientas/complemento-de-pago/', async q => { await q.pon('#fecha-pago', '2026-03-17'); await q.pulsa('#f-plazo button[type=submit]'); await q.pulsa('#res-plazo .op-botones button:nth-child(1)'); }],
  ]) {
    p = await abrir(ruta);
    if (pasos) { await pasos(p); await espera(400); }
    const v = await p.violaciones();
    exige(v === '' && p.excepciones() === 0, `${ruta}: cero violaciones de la politica${v ? ' (' + v + ')' : ''}`);
    await p.cerrar();
  }
  exige(recibidos.length === 3, `con la politica puesta los tres votos salen (salieron ${recibidos.length})`);

  ws.close(); chrome.kill(); servidor.close();
  await espera(400);
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome aun suelta el perfil */ }
  console.log(`\n${comprobaciones} comprobaciones, ${fallos.length} fallos`);
  process.exit(fallos.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
