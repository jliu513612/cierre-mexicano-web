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
import { createRequire } from 'node:module';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATOS = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
const CHROME = CANDIDATOS.find(c => c && fs.existsSync(c));
if (!CHROME) { console.error('no encuentro Chrome: indica la ruta en CHROME'); process.exit(2); }
const PUERTO = 8751, DEPURA = 9381;
const requerir = createRequire(import.meta.url);
const TC = requerir(path.join(RAIZ, 'herramientas', 'tipo-de-cambio', 'tc.js')).crear(requerir(path.join(RAIZ, 'herramientas', 'tipo-de-cambio', 'tipo-cambio-datos.js')));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// Cabeceras de `_headers` (bloque `/*`), las mismas que Netlify aplicara a todas las rutas.
const CABECERAS = {};
if (fs.existsSync(path.join(RAIZ, '_headers'))) {
  for (const l of fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').split(/\r?\n/)) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(l);
    if (m) CABECERAS[m[1]] = m[2].replace(/;\s*upgrade-insecure-requests/, '');
  }
}
const recibidos = [];           // cuerpos de los POST de OPINION, tal como llegan
const usos = [];                // cuerpos de los POST a /descargar/uso (usos de las herramientas), aparte
let modo = 'OK';                // 'OK' | 'FALLA_500' | 'SIN_OPINION'
const servidor = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      if (req.url === '/descargar/uso') { usos.push({ cuerpo, ts: Date.now() }); res.writeHead(204); res.end(); return; }
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
  // Datos del tipo de cambio: en el sitio los sirve el actualizador diario; aqui, el recorte fijo de la tabla oficial.
  if (ruta === '/herramientas/tipo-de-cambio/fix.json' && !fs.existsSync(archivo)) {
    if (modo === 'TC_FALLA') { res.writeHead(503); res.end('x'); return; }
    const d = JSON.parse(fs.readFileSync(path.join(RAIZ, '.herramientas', 'fixtures', 'tipo-cambio', 'fix.json'), 'utf8'));
    if (modo === 'TC_SIN_COTEJO') d.cotejo.ok = false;
    if (modo === 'TC_VIEJO') {
      // se quitan los ultimos tres dias del recorte: los datos quedan atrasados respecto de cualquier fecha real
      for (const f of ['2026-10-16', '2026-10-19', '2026-10-20']) delete d.valores[f];
      d.ultimo_dato = '2026-10-15';
    } else {
      // al dia: desde el recorte hasta el dato que ya debe existir hoy se rellena con un valor FALSO (20.0000) que solo
      // vive en esta prueba; las fechas calibradas son anteriores y salen del recorte oficial
      const esperado = TC.ultimoEsperado(Date.now());
      for (let x = Date.parse(d.ultimo_dato + 'T00:00:00Z') + 86400000; esperado !== 'NO_CUBIERTO' && x <= Date.parse(esperado + 'T00:00:00Z'); x += 86400000) {
        const f = new Date(x).toISOString().slice(0, 10);
        if (TC.esHabil(f) === true) { d.valores[f] = '20.0000'; d.ultimo_dato = f; }
      }
    }
    d.generado = new Date().toISOString();
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CABECERAS)); res.end(JSON.stringify(d)); return;
  }
  if ((modo === 'SIN_OPINION' && ruta.endsWith('/opinion.js')) || !archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, Object.assign({ 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' }, CABECERAS));
  res.end(fs.readFileSync(archivo));
});

const espera = ms => new Promise(r => setTimeout(r, ms));
/* Espera a que lleguen `n` envios (con tope) y luego un poco mas, para ver si llega alguno DE MAS. Una espera fija
   fallaba bajo carga: el envio llegaba despues de los 400 ms y la prueba lo leia como «no salio». */
async function esperaEnvios(n, tope = 8000) {
  for (let t = 0; t < tope && recibidos.length < n; t += 50) await espera(50);
  await espera(250);
}
/* Espera a que el texto de `sel` cumpla `cond` (con tope); devuelve el ultimo texto leido. */
async function esperaTexto(p, sel, cond, tope = 8000) {
  let x = '';
  for (let t = 0; t < tope; t += 50) { x = await p.texto(sel); if (cond(x)) break; await espera(50); }
  return x;
}
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
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEPURA}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 300 && !info; i++) { await espera(200); try { info = await (await fetch(`http://127.0.0.1:${DEPURA}/json/version`)).json(); } catch { /* aun no arranca */ } }
  if (!info) throw new Error('Chrome no arranco en 60 s (' + CHROME + ')');
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
  exige((await p.js("document.querySelectorAll('#res-rfc .op-forma input[type=email], #res-rfc .op-forma input:not(.op-trampa)').length")) === 0, 'el bloque de opinion no pide correo');
  await p.pulsa('#res-rfc .op-enviar'); await esperaEnvios(1);
  exige(recibidos.length === 1, `sale exactamente una peticion (salieron ${recibidos.length})`);
  let c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  const crudo = recibidos[0] ? decodeURIComponent(recibidos[0].cuerpo.replace(/\+/g, ' ')) : '';
  exige(!/EKU9003173C8|900317|3C8/i.test(crudo), 'el cuerpo enviado NO contiene el RFC tecleado ni sus partes');
  exige(c.herramienta === 'validar-rfc' && c.clase === 'DIGITO_NO_COINCIDE' && c.voto === 'NO', `lleva herramienta, clase y voto (${c.herramienta}, ${c.clase}, ${c.voto})`);
  exige(c.motivo === 'mi RFC [RFC omitido] si es correcto, y tambien [RFC omitido]', `el motivo llega con el RFC omitido («${c.motivo}»)`);
  exige(!('correo' in c) && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha || ''), 'lleva la fecha y ningun correo');
  exige(Object.keys(c).sort().join() === 'clase,fecha,form-name,herramienta,motivo,voto', `solo los seis campos (${Object.keys(c).sort().join()})`);
  exige(recibidos[0] && recibidos[0].url === '/' && /x-www-form-urlencoded/.test(recibidos[0].tipo), 'va a la raiz del propio sitio, como formulario');
  exige((await esperaTexto(p, '#res-rfc .op-estado', x => x.startsWith('Gracias'))).startsWith('Gracias'), 'la pagina da las gracias');
  await p.cerrar();

  console.log('B. voto «Si» en la UMA y en el REP');
  recibidos.length = 0;
  p = await abrir('/herramientas/valor-uma/');
  await p.teclea('#cantidad', '987654.32'); await p.pulsa('#f-uma button[type=submit]');
  await p.pulsa('#res-uma .op-botones button:nth-child(1)'); await esperaEnvios(1);
  c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  exige(recibidos.length === 1 && c.herramienta === 'valor-uma' && c.clase === 'VECES_A_PESOS' && c.voto === 'SI', `UMA: un envio con su clase (${c.clase})`);
  exige(recibidos[0] && !/987654|115860/.test(recibidos[0].cuerpo), 'UMA: no viaja la cantidad tecleada ni el resultado');
  await p.cerrar();
  recibidos.length = 0;
  p = await abrir('/herramientas/complemento-de-pago/');
  await p.pon('#fecha-pago', '2026-03-17'); await p.pulsa('#f-plazo button[type=submit]');
  await p.pulsa('#res-plazo .op-botones button:nth-child(1)'); await esperaEnvios(1);
  c = recibidos[0] ? campos(recibidos[0].cuerpo) : {};
  exige(recibidos.length === 1 && c.herramienta === 'complemento-de-pago' && /^PLAZO_(NORMAL|URGENTE|VENCIDO)$/.test(c.clase || ''), `REP: un envio con su clase (${c.clase})`);
  exige(recibidos[0] && !/2026-03-17|2026-04-05|03-17/.test(decodeURIComponent(recibidos[0].cuerpo)), 'REP: no viaja la fecha del pago ni la fecha limite');
  await p.cerrar();

  console.log('C. el servidor contesta 500');
  recibidos.length = 0; modo = 'FALLA_500';
  p = await abrir('/herramientas/validar-rfc/');
  await p.teclea('#rfc', 'XIQB891116QE4'); await p.pulsa('#f-rfc button[type=submit]');
  await p.pulsa('#res-rfc .op-botones button:nth-child(1)'); await esperaEnvios(1);
  exige((await esperaTexto(p, '#res-rfc .op-estado', x => x.startsWith('No se pudo enviar'))).startsWith('No se pudo enviar'), 'la pagina dice que no se pudo enviar');
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
  await p.pulsa('#res-rfc .op-enviar'); await espera(1500);
  exige(recibidos.length === 0, 'con la trampa rellena no sale ninguna peticion');

  console.log('F. tope de envios por carga de pagina');
  for (let i = 0; i < 9; i++) {
    await p.js(`document.querySelector('#rfc').value='EKU9003173C9'`); await p.pulsa('#f-rfc button[type=submit]');
    await p.pulsa('#res-rfc .op-botones button:nth-child(1)'); await espera(120);
  }
  await esperaEnvios(5); await espera(1000);
  exige(recibidos.length === 5, `de 9 votos seguidos salen 5, el tope (salieron ${recibidos.length})`);
  await p.cerrar();

  console.log('J. factura con retenciones');
  recibidos.length = 0; modo = 'OK';
  p = await abrir('/herramientas/factura-con-retenciones/');
  await p.teclea('#subtotal', '10,000');
  exige((await p.js("document.querySelector('#iva').value")) === '1,600.00', 'el IVA se rellena al 16 % del subtotal');
  await p.pulsa('#f-ret button[type=submit]');
  exige((await p.texto('#res-ret h3')) === 'Se cobra $9,533.33 después de retenciones', `honorarios PF a PM: ${await p.texto('#res-ret h3')}`);
  await p.pon('#regimen', '626'); await p.pulsa('#f-ret button[type=submit]');
  exige((await p.texto('#res-ret')).includes('ISR retenido (1.25 %)'), 'RESICO 626: 1.25 % de ISR');
  await p.js("document.querySelector('input[name=receptor][value=PF]').click()"); await p.pulsa('#f-ret button[type=submit]');
  exige((await p.texto('#res-ret h3')).startsWith('Si paga una persona física'), 'receptor persona fisica: no aplica');
  await p.js("document.querySelector('input[name=receptor][value=PM]').click()");
  await p.js("document.querySelector('#iva').value=''"); await p.teclea('#iva', '1500'); await p.pulsa('#f-ret button[type=submit]');
  exige((await p.texto('#res-ret')).includes('IVA trasladado (escrito)'), 'el IVA escrito a mano se respeta');
  exige(recibidos.length === 0 && p.excepciones() === 0 && (await p.violaciones()) === '', 'calcular no envia nada, sin excepciones ni violaciones');
  await p.cerrar();

  console.log('K. calendario del dia 17');
  recibidos.length = 0; modo = 'OK';
  p = await abrir('/herramientas/calendario-dia-17/');
  exige((await p.js("document.querySelectorAll('#res-cal tbody tr').length")) === 12, 'al abrir, el calendario de 2026 ya tiene 12 meses');
  exige((await p.texto('#res-cal tbody tr:nth-child(9)')) === 'septiembre lun 19 oct el 17 cae en sábado lun 2 nov el 31 cae en sábado', `septiembre 2026: ${await p.texto('#res-cal tbody tr:nth-child(9)')}`);
  exige((await p.texto('#res-cal tbody tr:nth-child(12)')).includes('mar 2 feb 2027 el 31 cae en domingo'), 'DIOT de diciembre 2026 al 2 de febrero de 2027');
  exige(!(await p.texto('#res-cal')).includes('facilidad'), 'sin RFC no se habla de la facilidad');
  await p.pon('#anio', '2027');
  exige((await p.texto('#res-cal h3')) === 'Fechas límite de los periodos de 2027', 'cambiar el ano repinta');
  await p.teclea('#rfc', 'XIQB891116QE4'); await p.pulsa('#f-cal button[type=submit]');
  exige((await p.texto('#res-cal thead')).includes('Con la facilidad (3 días)'), 'sexto digito 6: 3 dias');
  exige((await p.texto('#res-cal')).includes('sábado 1 de mayo de 2027 (1 de mayo)') && !(await p.texto('#res-cal')).includes('undefined'), 'un dia inhabil que cae en sabado se nombra');
  exige((await p.texto('#res-cal tbody tr:nth-child(1)')).endsWith('lun 22 feb'), `facilidad enero 2027: ${await p.texto('#res-cal tbody tr:nth-child(1)')}`);
  exige((await p.texto('#res-cal .aviso')).includes('Revisa con tu contador si te aplica'), 'la facilidad va en condicional y remite al contador');
  exige((await p.texto('#res-cal .op-pregunta')) === '¿Te sirvió este resultado?', 'al pedir el calendario aparece la opinion');
  await p.js("document.querySelector('#rfc').value=''"); await p.teclea('#rfc', 'ABC12'); await p.pulsa('#f-cal button[type=submit]');
  exige((await p.texto('#res-cal .aviso')).includes('no tiene seis dígitos'), 'RFC sin seis digitos: se dice');
  exige(recibidos.length === 0 && p.excepciones() === 0 && (await p.violaciones()) === '', 'el calendario no envia nada, sin excepciones ni violaciones');
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

  console.log('L. IVA del mes: XML en el navegador, el 69-B del propio sitio y nada mas');
  recibidos.length = 0;
  {
    const zlib = await import('node:zlib');
    const V = JSON.parse(fs.readFileSync(path.join(RAIZ, '.herramientas', 'vectores', 'iva.json'), 'utf8'));
    const CASOS = JSON.parse(zlib.gunzipSync(Buffer.from(V.casos_gz, 'base64')).toString('utf8'));
    const real = JSON.parse(fs.readFileSync(path.join(RAIZ, 'herramientas', 'lista-69b', 'listado.json'), 'utf8'));
    // un caso con IVA a cargo, determinado, y sin emisores del 69-B inventado ni del real: el sitio usa el listado REAL
    const caso = CASOS.find(c => c.salida.tipo === 'a_cargo' && c.salida.iva_estado === 'DETERMINADO' && c.xml.length >= 3 &&
      c.xml.every(x => { const e = /Emisor Rfc="([^"]+)"/.exec(x)[1]; return !V.listado_prueba.r[e] && !real.r[e]; }));
    exige(!!caso, 'calibracion: hay un caso de prueba a cargo y sin 69-B');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-iva-'));
    const rutas = caso.xml.map((x, i) => { const f = path.join(dir, `f${i}.xml`); fs.writeFileSync(f, x); return f; });
    const malo = path.join(dir, 'nota.xml');
    fs.writeFileSync(malo, caso.xml[0].replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"'));
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId: s } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Page.enable', {}, s); await cdp('Runtime.enable', {}, s); await cdp('DOM.enable', {}, s); await cdp('Network.enable', {}, s);
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective))" }, s);
    const desde = eventos.length;
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PUERTO}/herramientas/iva-del-mes/` }, s);
    for (let i = 0; i < 100 && !eventos.slice(desde).some(e => e.method === 'Page.loadEventFired' && e.sessionId === s); i++) await espera(50);
    await espera(300);
    const js = async e => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true }, s)).result.value;
    const subir = async files => {
      const { root } = await cdp('DOM.getDocument', {}, s);
      const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '#xml' }, s);
      await cdp('DOM.setFileInputFiles', { nodeId, files }, s);
    };
    await js(`document.querySelector('#rfc').value=${JSON.stringify(V.propio)};document.querySelector('#mes-a').value=${JSON.stringify(V.periodo.slice(0, 4))};document.querySelector('#mes-m').value=${JSON.stringify(V.periodo.slice(5))}`);
    await subir(rutas);
    await js("document.querySelector('#f-iva').requestSubmit()");
    for (let i = 0; i < 60 && !(await js("!!document.querySelector('#res-iva h3')")); i++) await espera(100);
    const miles = t => '$' + t.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + t.split('.')[1];
    const h3 = await js("(document.querySelector('#res-iva h3')||{}).textContent");
    exige(h3 === 'IVA a cargo de mayo de 2026: ' + miles(caso.salida.iva_neto), `la cifra es la del programa: «${h3}» (programa ${caso.salida.iva_neto})`);
    exige((await js("document.querySelector('#res-iva').innerText")).includes('Total a pagar en el mes'), 'muestra el total a pagar');
    exige((await js("(document.querySelector('#res-iva .op-pregunta')||{}).textContent")) === '¿Te sirvió este resultado?', 'aparece la opinion');
    await subir(rutas.concat([malo]));
    await js("document.querySelector('#f-iva').requestSubmit()");
    await espera(800);
    exige((await js("(document.querySelector('#res-iva h3')||{}).textContent")) === 'No se puede estimar el IVA con estos archivos', 'una nota de credito deja la estimacion sin cifra');
    exige((await js("document.querySelector('#res-iva').innerText")).includes('nota.xml: nota de crédito'), 'y dice que archivo y por que');
    await js("document.querySelector('#rfc').value='NO ES RFC';document.querySelector('#f-iva').requestSubmit()");
    await espera(200);
    exige((await js("(document.querySelector('#res-iva h3')||{}).textContent")) === 'Escribe tu RFC', 'sin RFC valido no lee nada');
    await js("for(const [k,v] of [['cobrado','16,000'],['pagado','6,000'],['retuviste',''],['teRetuvieron','']]) document.querySelector('#'+k).value=v; document.querySelector('#f-man').requestSubmit()");
    await espera(200);
    exige((await js("(document.querySelector('#res-man h3')||{}).textContent")) === 'IVA a cargo: $10,000.00', 'modo manual: 16,000 menos 6,000');
    const fuera = eventos.slice(desde).filter(e => e.sessionId === s && e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(`http://127.0.0.1:${PUERTO}/`) && !e.params.request.url.startsWith('data:'));
    const listados = eventos.slice(desde).filter(e => e.sessionId === s && e.method === 'Network.requestWillBeSent' && e.params.request.url.endsWith('/herramientas/lista-69b/listado.json'));
    exige(fuera.length === 0 && recibidos.length === 0, `estimar no envia nada (${fuera.length} fuera, ${recibidos.length} POST)`);
    exige(listados.length === 1, `el listado 69-B se descarga una vez del propio sitio (${listados.length})`);
    exige((await js('window.__csp.join("|")')) === '', 'cero violaciones de la politica');
    await cdp('Target.closeTarget', { targetId });
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('N. tipo de cambio: el FIX que aplica a la fecha, falla cerrado y lo dice');
  {
    p = await abrir('/herramientas/tipo-de-cambio/');
    const consulta = async (f, espera = 'Para obligaciones') => {
      const [a, m, d] = f.split('-');
      await p.pon('#tc-a', a); await p.pon('#tc-m', m); await p.pon('#tc-d', d);
      await p.pulsa('#f-tc button[type=submit]');
      return esperaTexto(p, '#res-tc', x => !/Cargando/.test(x) && x.length > 0 && (espera === null || x.includes(espera)));
    };
    exige((await p.js("document.querySelector('#tc-d').value.length")) === 2, 'calibracion: los selectores de fecha se llenan');
    const usosAntes = usos.length;
    let x = await consulta('2026-03-10');
    for (let i = 0; i < 60 && usos.length === usosAntes; i++) await espera(50);
    exige(usos.slice(usosAntes).some(u => JSON.parse(u.cuerpo).herramienta === 'tipo-de-cambio'), 'el resultado con valor cuenta su uso');
    exige(x.includes('$17.7962'), `martes 10 de marzo de 2026: $17.7962, el valor de la tabla oficial (${x.slice(0, 80)})`);
    exige(x.includes('determinó el viernes 6 de marzo de 2026') && x.includes('DOF el lunes 9 de marzo de 2026'), 'dice cuando se determino y cuando se publico');
    exige(x.includes('$17.7687') && x.includes('$17.5037'), 'como informacion: lo publicado ese dia y lo determinado ese dia');
    exige(/se adquirió/.test(x) && /Revisa con tu contador/.test(x), 'dice la regla de la moneda adquirida y no decide por el contador');
    exige(/Cotejados con la tabla oficial/.test(x) && !/no están al día/.test(x), 'dice de donde salen los datos; al dia, no avisa');
    x = await consulta('2026-03-09');
    exige(x.includes('$17.6770') && /domingo 8 de marzo de 2026 no hubo publicación/.test(x), 'lunes 9 de marzo: $17.6770 (tabla oficial), la publicacion del viernes, y lo explica');
    x = await consulta('2026-09-06');
    exige(x.includes('$16.9560') && /no es hábil bancario/.test(x), 'domingo 6 de septiembre: $16.9560 y dice que no es habil');
    x = await consulta('2026-09-16');
    exige(x.includes('$17.1277'), '16 de septiembre (inhabil bancario): $17.1277');
    x = await consulta('2026-12-31', null);
    exige(/Todavía no hay FIX/.test(x) && !/pesos por dólar/.test(x), 'una fecha sin dato todavia: lo dice y no da un valor');
    x = await consulta('2024-01-02', null);
    exige(/no responde/.test(x) && /CNBV/.test(x) && !/pesos por dólar/.test(x), '2 de enero de 2024 (el FIX cae en 2023, sin calendario de la CNBV): no responde y dice por que');
    x = await consulta('2026-02-30', null);
    exige(/no existe/.test(x), 'una fecha que no existe');
    exige(usos.some(u => JSON.parse(u.cuerpo).herramienta === 'tipo-de-cambio'), 'cuenta su uso');
    exige((await p.violaciones()) === '' && p.excepciones() === 0, 'sin violaciones de la politica de contenido ni errores');
    await p.cerrar();
    modo = 'TC_VIEJO';
    p = await abrir('/herramientas/tipo-de-cambio/');
    x = await consulta('2026-03-10');
    exige(/no están al día/.test(x) && x.includes('$17.7962'), 'datos atrasados: una fecha pasada da su valor (no cambia) y avisa que no estan al dia');
    x = await consulta('2026-10-21', null);
    exige(/no están al día para el miércoles 21 de octubre de 2026/.test(x) && !/pesos por dólar/.test(x) && !/Todavía no hay/.test(x),
      'datos atrasados: la fecha que falta dice que no estan al dia, sin dar el ultimo valor como si fuera el suyo');
    await p.cerrar();
    modo = 'TC_SIN_COTEJO';
    p = await abrir('/herramientas/tipo-de-cambio/');
    x = await consulta('2026-03-10', null);
    exige(/No se pudieron cargar/.test(x) && !/pesos por dólar/.test(x), 'datos sin cotejo en verde: no se usan');
    await p.cerrar();
    modo = 'TC_FALLA';
    p = await abrir('/herramientas/tipo-de-cambio/');
    x = await consulta('2026-03-10', null);
    exige(/No se pudieron cargar/.test(x) && !/pesos por dólar/.test(x), 'sin datos: lo dice y no inventa');
    await p.cerrar();
    modo = 'OK';
  }

  console.log('M. usos de las herramientas: cuentan al ejecutar, una vez por accion y sin datos');
  {
    // en todo lo anterior se ejecutaron todas las herramientas: cada envio de uso lleva SOLO {herramienta, n}
    const tecleado = /EKU|XIQB|900317|987654|10,000|2026-03-17|XAXX|TCE160101|ana@|<cfdi|1600/i;
    const malos = usos.filter(u => { let x; try { x = JSON.parse(u.cuerpo); } catch (e) { return true; }
      return Object.keys(x).some(k => k !== 'herramienta' && k !== 'n') || tecleado.test(u.cuerpo); });
    exige(usos.length > 0 && malos.length === 0, `los envios de uso llevan solo herramienta y n (${usos.length} envios, ${malos.length} con algo mas)`);
    const vistas = new Set(usos.map(u => JSON.parse(u.cuerpo).herramienta));
    const faltan = fs.readdirSync(path.join(RAIZ, 'herramientas'), { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(RAIZ, 'herramientas', d.name, 'pagina.js'))).map(d => d.name).filter(h => !vistas.has(h));
    exige(faltan.length === 0, `cada herramienta conto su uso al ejecutarla (faltan: ${faltan.join(', ') || 'ninguna'})`);
    const antes = usos.length;
    p = await abrir('/herramientas/valor-uma/');
    exige(usos.length === antes, 'abrir la pagina no cuenta un uso');
    await p.teclea('#cantidad', '25'); await p.pulsa('#f-uma button[type=submit]'); await p.pulsa('#f-uma button[type=submit]');
    for (let i = 0; i < 60 && usos.length < antes + 1; i++) await espera(50);
    await espera(400);
    exige(usos.length === antes + 1, `dos calculos seguidos (doble clic) cuentan UNO (contados ${usos.length - antes})`);
    await espera(2100);
    await p.pulsa('#f-uma button[type=submit]');
    for (let i = 0; i < 60 && usos.length < antes + 2; i++) await espera(50);
    exige(usos.length === antes + 2, `pasados 2 s el siguiente calculo vuelve a contar (contados ${usos.length - antes})`);
    exige(JSON.parse(usos[usos.length - 1].cuerpo).herramienta === 'valor-uma', 'el uso es de la herramienta que se ejecuto');
    await p.cerrar();
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
    ['/', null], ['/blog/', null], [articulo, null], ['/herramientas/', null], ['/herramientas/verificar-factura/', null], ['/herramientas/lista-69b/', null], ['/herramientas/factura-con-retenciones/', null], ['/herramientas/calendario-dia-17/', null], ['/herramientas/iva-del-mes/', null],
    ['/herramientas/validar-rfc/', async q => { await q.teclea('#rfc', 'EKU9003173C9'); await q.pulsa('#f-rfc button[type=submit]'); await q.pulsa('#res-rfc .op-botones button:nth-child(1)'); }],
    ['/herramientas/valor-uma/', async q => { await q.teclea('#cantidad', '25'); await q.pulsa('#f-uma button[type=submit]'); await q.pulsa('#res-uma .op-botones button:nth-child(1)'); }],
    ['/herramientas/complemento-de-pago/', async q => { await q.pon('#fecha-pago', '2026-03-17'); await q.pulsa('#f-plazo button[type=submit]'); await q.pulsa('#res-plazo .op-botones button:nth-child(1)'); }],
  ]) {
    p = await abrir(ruta);
    if (pasos) { const antes = recibidos.length; await pasos(p); await esperaEnvios(antes + 1); }
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
