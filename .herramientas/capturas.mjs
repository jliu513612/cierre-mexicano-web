// Capturas de /herramientas/ con un Chrome sin ventana, sin dependencias (protocolo de depuracion por WebSocket).
// Uso: node .herramientas/capturas.mjs <carpeta_de_salida> [ruta_a_chrome.exe]
// De paso comprueba, en cada pagina: que no hay errores de consola, que no sale NINGUNA peticion fuera del
// servidor local, y que a 390 px no hay desborde horizontal.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.resolve(process.argv[2] || 'capturas');
const CHROME = process.argv[3] || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = 8747, DEPURA = 9377;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain' };

const servidor = http.createServer((req, res) => {
  let ruta = decodeURIComponent(req.url.split('?')[0]);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(RAIZ, ruta);
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
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

const DESKTOP = { nombre: 'escritorio', width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false };
const MOVIL = { nombre: 'movil', width: 375, height: 844, deviceScaleFactor: 2, mobile: true };
const escribe = (sel, v) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.focus();e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`;
const marca = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));})()`;
const envia = sel => `document.querySelector(${JSON.stringify(sel)}).requestSubmit()`;
const a = sel => `document.querySelector(${JSON.stringify(sel)}).scrollIntoView({block:'start'});window.scrollBy(0,-90)`;

// [archivo, ruta, pasos, {completa, reloj, teclado}]
const TOMAS = [
  ['indice', '/herramientas/', [], { completa: true }],
  ['rfc_valido', '/herramientas/validar-rfc/', [], { teclado: { sel: '#rfc', texto: 'eku-900317-3c9' } }],
  ['rfc_invalido_digito', '/herramientas/validar-rfc/', [escribe('#rfc', 'EKU9003173C8'), envia('#f-rfc')]],
  ['opinion_formulario_abierto', '/herramientas/validar-rfc/', [escribe('#rfc', 'EKU9003173C8'), envia('#f-rfc'), "document.querySelector('#res-rfc .op-botones button:nth-child(2)').click()", escribe('#res-rfc .op-forma textarea', 'Esperaba que dijera en qué posición está el error')]],
  ['rfc_invalido_formato', '/herramientas/validar-rfc/', [escribe('#rfc', 'EKU90O3173C'), envia('#f-rfc')]],
  ['rfc_invalido_fecha', '/herramientas/validar-rfc/', [escribe('#rfc', 'XIQB890230QE4'), envia('#f-rfc')]],
  ['rfc_generico', '/herramientas/validar-rfc/', [escribe('#rfc', 'XAXX010101000'), envia('#f-rfc')]],
  ['rfc_pagina_completa', '/herramientas/validar-rfc/', [escribe('#rfc', 'XIQB891116QE4'), envia('#f-rfc')], { completa: true }],
  ['uma_valido', '/herramientas/valor-uma/', [escribe('#cantidad', '25'), envia('#f-uma')]],
  ['uma_valido_pesos_a_veces', '/herramientas/valor-uma/', [marca('input[value=PESOS_A_VECES]'), escribe('#cantidad', '10,000'), escribe('#periodo', 'mensual'), escribe('#fecha', '2026-01-15'), envia('#f-uma'), a('#t-conv')]],
  ['uma_invalido_cantidad', '/herramientas/valor-uma/', [escribe('#cantidad', 'veinte'), envia('#f-uma'), a('#t-conv')]],
  ['uma_invalido_fecha_anterior', '/herramientas/valor-uma/', [escribe('#cantidad', '25'), escribe('#fecha', '2021-06-01'), envia('#f-uma'), a('#t-conv')]],
  ['uma_aviso_enero_2027', '/herramientas/valor-uma/', [], { reloj: '2027-01-12T12:00:00' }],
  ['uma_sin_confirmar_feb_2027', '/herramientas/valor-uma/', [escribe('#cantidad', '25'), envia('#f-uma')], { reloj: '2027-02-03T12:00:00' }],
  ['uma_pagina_completa', '/herramientas/valor-uma/', [escribe('#cantidad', '25'), envia('#f-uma')], { completa: true }],
  ['rep_valido_en_plazo', '/herramientas/complemento-de-pago/', [escribe('#fecha-pago', '2026-10-08'), envia('#f-plazo')], { reloj: '2026-10-13T12:00:00' }],
  ['rep_aviso_dia_inhabil', '/herramientas/complemento-de-pago/', [escribe('#fecha-pago', '2026-03-17'), envia('#f-plazo')], { reloj: '2026-03-20T12:00:00' }],
  ['rep_vencido', '/herramientas/complemento-de-pago/', [escribe('#fecha-pago', '2026-08-15'), envia('#f-plazo')], { reloj: '2026-10-13T12:00:00' }],
  ['rep_invalido_otro_ejercicio', '/herramientas/complemento-de-pago/', [escribe('#fecha-pago', '2025-12-31'), envia('#f-plazo')], { reloj: '2026-10-13T12:00:00' }],
  ['rep_lleva_si_ppd', '/herramientas/complemento-de-pago/', [marca('input[name=metodo][value=PPD]'), marca('input[name=forma][value="99"]'), envia('#f-lleva'), a('#t-lleva')]],
  ['rep_pue_no_cobrada', '/herramientas/complemento-de-pago/', [marca('input[name=metodo][value=PUE]'), marca('input[name=forma][value=OTRA]'), marca('input[name=cobro][value=NO_COBRADA]'), envia('#f-lleva'), a('#t-lleva')]],
  ['rep_invalido_faltan_datos', '/herramientas/complemento-de-pago/', [marca('input[name=metodo][value=PUE]'), envia('#f-lleva'), a('#t-lleva')]],
  ['rep_pagina_completa', '/herramientas/complemento-de-pago/', [escribe('#fecha-pago', '2026-10-08'), envia('#f-plazo')], { completa: true, reloj: '2026-10-13T12:00:00' }],
  ['factura_lote_valido', '/herramientas/verificar-factura/', [], { archivos: { sel: '#xml', lista: ['01_cfdi40_ingreso.xml', '05_receptor_con_ampersand.xml', '11_enie_en_rfc.xml'] } }],
  ['factura_lote_con_invalidos', '/herramientas/verificar-factura/', [], { archivos: { sel: '#xml', lista: ['01_cfdi40_ingreso.xml', '04_sin_timbre.xml', '15_xml_roto.xml', '14_no_es_cfdi.xml'] } }],
  ['lista69b_aparece', '/herramientas/lista-69b/', [escribe('#rfcs', 'AABL9902181Q7\nEKU9003173C9'), envia('#f-69b')]],
  ['lista69b_lote_xml_sin_coincidencias', '/herramientas/lista-69b/', [], { archivos: { sel: '#xml69', lista: ['01_cfdi40_ingreso.xml', '11_enie_en_rfc.xml'] } }],
  ['lista69b_invalido', '/herramientas/lista-69b/', [escribe('#rfcs', 'hola 12345'), envia('#f-69b')]],
  ['retenciones_honorarios', '/herramientas/factura-con-retenciones/', ["(()=>{const e=document.querySelector('#subtotal');e.value='10,000';e.dispatchEvent(new Event('input',{bubbles:true}));})()", envia('#f-ret')]],
  ['retenciones_resico', '/herramientas/factura-con-retenciones/', [escribe('#regimen', '626'), "(()=>{const e=document.querySelector('#subtotal');e.value='10,000';e.dispatchEvent(new Event('input',{bubbles:true}));})()", envia('#f-ret')]],
  ['retenciones_invalido', '/herramientas/factura-con-retenciones/', [escribe('#subtotal', 'diez mil'), envia('#f-ret')]],
  ['calendario_2026', '/herramientas/calendario-dia-17/', []],
  ['calendario_2027_rfc', '/herramientas/calendario-dia-17/', [escribe('#anio', '2027'), escribe('#rfc', 'XIQB891116QE4'), envia('#f-cal')]],
  ['factura_pagina_completa', '/herramientas/verificar-factura/', [], { completa: true, archivos: { sel: '#xml', lista: ['01_cfdi40_ingreso.xml', '04_sin_timbre.xml'] } }],
];

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  await new Promise(r => servidor.listen(PUERTO, '127.0.0.1', r));
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-capturas-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEPURA}`, `--user-data-dir=${perfil}`, '--no-first-run',
    '--disable-gpu', '--hide-scrollbars', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  let info;
  for (let i = 0; i < 50 && !info; i++) {
    await espera(200);
    try { info = await (await fetch(`http://127.0.0.1:${DEPURA}/json/version`)).json(); } catch { /* aun no arranca */ }
  }
  if (!info) throw new Error('Chrome no arranco');
  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pendientes.has(d.id)) {
      const p = pendientes.get(d.id); pendientes.delete(d.id);
      d.error ? p.mal(new Error(p.metodo + ': ' + d.error.message)) : p.ok(d.result);
    } else if (d.method) eventos.push(d);
  };
  const problemas = [], informe = [];
  for (const disp of [DESKTOP, MOVIL]) {
    for (const [nombre, ruta, pasos, op = {}] of TOMAS) {
      const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
      const { sessionId: s } = await cdp('Target.attachToTarget', { targetId, flatten: true });
      eventos.length = 0;
      await cdp('Page.enable', {}, s); await cdp('Runtime.enable', {}, s); await cdp('Network.enable', {}, s); await cdp('Log.enable', {}, s);
      await cdp('Emulation.setDeviceMetricsOverride', { width: disp.width, height: disp.height, deviceScaleFactor: disp.deviceScaleFactor, mobile: disp.mobile }, s);
      if (op.reloj) {
        await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const R=Date,t=new R(${JSON.stringify(op.reloj)}).getTime();
          class F extends R{constructor(...x){x.length?super(...x):super(t);}static now(){return t;}};window.Date=F;})()` }, s);
      }
      await cdp('Page.navigate', { url: `http://127.0.0.1:${PUERTO}${ruta}` }, s);
      for (let i = 0; i < 100 && !eventos.some(e => e.method === 'Page.loadEventFired' && e.sessionId === s); i++) await espera(50);
      await espera(250);
      if (op.archivos) {  // elegir archivos en el selector, como lo haria una persona
        await cdp('DOM.enable', {}, s);
        const { root } = await cdp('DOM.getDocument', {}, s);
        const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: op.archivos.sel }, s);
        await cdp('DOM.setFileInputFiles', { nodeId, files: op.archivos.lista.map(f => path.join(RAIZ, '.herramientas', 'fixtures', 'cfdi', f)) }, s);
        await espera(700);
      }
      if (op.teclado) {  // foco, texto y Enter como lo haria una persona con el teclado
        await cdp('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(op.teclado.sel)}).focus()` }, s);
        await cdp('Input.insertText', { text: op.teclado.texto }, s);
        for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined }, s);
      }
      for (const p of pasos) {
        const r = await cdp('Runtime.evaluate', { expression: p, awaitPromise: true }, s);
        if (r.exceptionDetails) problemas.push(`${disp.nombre}/${nombre}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      }
      await espera(200);
      const med = (await cdp('Runtime.evaluate', { returnByValue: true, expression: `({ancho:document.documentElement.scrollWidth,vista:window.innerWidth,alto:document.documentElement.scrollHeight,
        corte:(()=>{const t=[...document.querySelectorAll('.tool')];const c=t.filter(x=>x.querySelector('.res')&&x.querySelector('.res').innerText.trim()).pop()||t[0];return c?Math.ceil(c.getBoundingClientRect().bottom+window.scrollY+28):0;})(),
        res:[...document.querySelectorAll('.res')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).filter(Boolean).join(' || '),
        aviso:(document.querySelector('#uma-aviso:not([hidden])')||{}).innerText||''})` }, s)).result.value;
      if (med.ancho > med.vista) problemas.push(`${disp.nombre}/${nombre}: desborde horizontal (${med.ancho} > ${med.vista})`);
      for (const e of eventos.filter(e => e.sessionId === s)) {
        if (e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith(`http://127.0.0.1:${PUERTO}/`)) problemas.push(`${disp.nombre}/${nombre}: peticion externa ${e.params.request.url}`);
        if (e.method === 'Network.loadingFailed') problemas.push(`${disp.nombre}/${nombre}: no cargo un recurso (${e.params.errorText})`);
        if (e.method === 'Network.responseReceived' && e.params.response.status >= 400) problemas.push(`${disp.nombre}/${nombre}: ${e.params.response.status} ${e.params.response.url}`);
        if (e.method === 'Runtime.exceptionThrown') problemas.push(`${disp.nombre}/${nombre}: excepcion ${e.params.exceptionDetails.text}`);
        if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') problemas.push(`${disp.nombre}/${nombre}: consola ${e.params.entry.text}`);
      }
      // En la captura larga la barra fija se pinta fuera de sitio: se deja estatica solo para la foto.
      await cdp('Runtime.evaluate', { expression: "document.querySelector('body>nav').style.position='static';window.scrollTo(0,0)" }, s);
      await espera(120);
      const params = { format: 'png' };
      // Pagina entera, o desde arriba hasta el final de la tarjeta que tiene el resultado.
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: disp.width, height: op.completa || !med.corte ? med.alto : Math.max(med.corte, 600), scale: 1 };
      const { data } = await cdp('Page.captureScreenshot', params, s);
      const archivo = `${nombre}_${disp.nombre}.png`;
      fs.writeFileSync(path.join(SALIDA, archivo), Buffer.from(data, 'base64'));
      informe.push(`${archivo}\n    ${med.res || med.aviso || '(sin resultado en pantalla)'}${med.aviso && med.res ? '\n    AVISO: ' + med.aviso : ''}`);
      await cdp('Target.closeTarget', { targetId });
    }
  }
  fs.writeFileSync(path.join(SALIDA, 'LEEME_capturas.txt'), informe.join('\n') + '\n\nPROBLEMAS: ' + (problemas.length ? '\n' + problemas.join('\n') : 'ninguno') + '\n');
  console.log(informe.join('\n'));
  console.log('\nPROBLEMAS:', problemas.length ? '\n' + problemas.join('\n') : 'ninguno');
  ws.close(); chrome.kill(); servidor.close();
  await espera(500);
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* Chrome aun suelta el perfil */ }
  process.exit(problemas.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
