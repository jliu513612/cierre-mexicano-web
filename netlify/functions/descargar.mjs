// /descargar de taxcerteza.mx: registra la descarga (anonima, ver netlify/lib/descargas.mjs) y redirige (302) al archivo de
// GitHub. Todos los botones del sitio pasan por aqui. Rutas:
//   /descargar                 la descarga (el archivo sale de netlify/descargas.json, nunca de la URL)
//   /descargar/interno?clave=  marca ESTE navegador como interno (demo, VM, equipo): sus descargas no cuentan
//   /descargar/resumen?clave=  resumen JSON de un periodo (?desde=&hasta=, por omision la semana anterior). No es publico.
//   /descargar/uso  (POST)     USO de una herramienta: {herramienta, n}; lo manda herramientas/uso.js al ejecutar el calculo.
//                              Va bajo /descargar para que le llegue la misma cookie de interno (Path=/descargar).
//   /descargar/ir/<destino>    CLIC en un paso del embudo (whatsapp, demo, descargar, video): lo cuenta con la pagina de
//                              origen (cabecera Referer del propio sitio) y redirige (302) al destino de netlify/embudo.mjs.
//                              Un destino que no esta en esa tabla da 404: no hay redireccion abierta.
// La descarga (/descargar) tambien guarda su pagina de origen, igual.
// UNA sola variable de Netlify (la crea la duena del sitio; no va en el repo):
//   DESCARGAS_CLAVE_INTERNA     clave de /descargar/interno y de /descargar/resumen (la tienen las mismas personas).
// Con los unicos encendidos (UNICOS_ACTIVOS, hoy apagado) haria falta ademas DESCARGAS_SAL.
// La descarga entrega una URL FIRMADA de GitHub que caduca (enlaceTemporal), no el enlace permanente. Si el archivo pasa a
// un repo PRIVADO (tabla: `privado: {repo, asset}`), hace falta ademas GITHUB_DIST_TOKEN: token de SOLO LECTURA de ese repo.
// Lo de las vistas previas va a OTRO almacen ('descargas-pruebas') y su resumen se lee sin clave: son descargas de prueba,
// nunca se mezclan con las reales.
import { getStore } from '@netlify/blobs';
import tabla from '../descargas.mjs';
import embudo from '../embudo.mjs';
import { evento, eventoUso, clicDe, PREFIJO_IR, origenDe, destino, enlaceTemporal, claveValida, resumir, semanaAnterior, diasEntre, UNICOS_ACTIVOS } from '../lib/descargas.mjs';

const env = k => (globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || '';
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function respuesta(cuerpo, estado, extra = {}) {
  return new Response(cuerpo, { status: estado, headers: Object.assign({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra) });
}

async function leer(store, desde, hasta) {
  const eventos = [];
  for (const dia of diasEntre(desde, hasta)) {
    const { blobs } = await store.list({ prefix: `ev/${dia}/` });
    for (const b of blobs) {
      const e = await store.get(b.key, { type: 'json' });
      if (e) eventos.push(e);
    }
  }
  return eventos;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const contexto = (context.deploy && context.deploy.context) || 'desconocido';
  const produccion = contexto === 'production';
  const store = getStore({ name: produccion ? 'descargas' : 'descargas-pruebas', consistency: 'strong' });
  const ruta = url.pathname.replace(/\/+$/, '');

  if (ruta === '/descargar/interno') {
    if (!claveValida(url.searchParams.get('clave'), env('DESCARGAS_CLAVE_INTERNA'))) return respuesta('No encontrado', 404);
    return respuesta('<!doctype html><meta charset="utf-8"><title>Interno</title><p>Este navegador queda marcado como interno: sus descargas no cuentan como usuarios reales.</p>',
      200, { 'Content-Type': 'text/html; charset=utf-8',
             'Set-Cookie': 'tc_interno=1; Max-Age=31536000; Path=/descargar; Secure; HttpOnly; SameSite=Lax' });
  }

  if (ruta === '/descargar/resumen') {
    if (produccion && !claveValida(url.searchParams.get('clave'), env('DESCARGAS_CLAVE_INTERNA'))) return respuesta('No encontrado', 404);
    const hoy = new Date().toISOString().slice(0, 10);
    let { desde, hasta } = semanaAnterior(hoy);
    if (RE_FECHA.test(url.searchParams.get('desde') || '')) desde = url.searchParams.get('desde');
    if (RE_FECHA.test(url.searchParams.get('hasta') || '')) hasta = url.searchParams.get('hasta');
    if (diasEntre(desde, hasta).length > 62) return respuesta('Periodo demasiado largo (maximo 62 dias)', 400);
    // las huellas internas se buscan desde el primer dia del mes: una descarga con la cookie marca a ese equipo todo el mes
    const eventos = await leer(store, desde.slice(0, 8) + '01', hasta);
    const internas = eventos.filter(e => e.interno && e.huella).map(e => e.huella);
    const r = resumir(eventos, { desde, hasta, contexto, internas });
    r.clave_interna_configurada = !!env('DESCARGAS_CLAVE_INTERNA');   // solo si existe; jamas el valor
    r.unicos = UNICOS_ACTIVOS ? (env('DESCARGAS_SAL') ? 'activos' : 'activos sin sal') : 'apagados (sin aviso de privacidad)';
    return respuesta(JSON.stringify(r, null, 1), 200, { 'Content-Type': 'application/json; charset=utf-8' });
  }

  if (ruta === '/descargar/uso') {
    if (req.method !== 'POST') return respuesta('No encontrado', 404);
    let cuerpo = null;
    try { const txt = await req.text(); if (txt.length <= 512) cuerpo = JSON.parse(txt); } catch (e) { cuerpo = null; }
    const ts = new Date().toISOString();
    const ev = eventoUso({ ts, contexto, cuerpo, pais: context.geo && context.geo.country && context.geo.country.code,
      metodo: req.method, ua: req.headers.get('user-agent'), interno: /(?:^|;\s*)tc_interno=1(?:;|$)/.test(req.headers.get('cookie') || '') });
    if (!ev) return respuesta('Uso no valido', 400);
    try { await store.setJSON(`ev/${ts.slice(0, 10)}/${ts}-u-${Math.random().toString(36).slice(2, 10)}`, ev); }
    catch (e) { console.error('uso: no se pudo registrar', e && e.message); }
    return respuesta(null, 204);
  }

  const origen = origenDe(req.headers.get('referer'), url.host);
  if (ruta.startsWith(PREFIJO_IR)) {
    const ts = new Date().toISOString();
    const c = clicDe({ ruta, tabla: embudo, referer: req.headers.get('referer'), host: url.host, ts, contexto,
      pais: context.geo && context.geo.country && context.geo.country.code, metodo: req.method, ua: req.headers.get('user-agent'),
      interno: /(?:^|;\s*)tc_interno=1(?:;|$)/.test(req.headers.get('cookie') || '') });
    if (!c) return respuesta('No encontrado', 404);
    // el clic NUNCA se bloquea por el registro: si el almacen falla, se redirige igual y queda en el log
    try { await store.setJSON(`ev/${ts.slice(0, 10)}/${ts}-c-${Math.random().toString(36).slice(2, 10)}`, c.evento); }
    catch (e) { console.error('clic: no se pudo registrar', e && e.message); }
    return respuesta(null, 302, { Location: c.location });
  }

  if (ruta !== '/descargar') return respuesta('No encontrado', 404);
  const d = destino(tabla, url.searchParams.get('archivo'));
  if (!d) return respuesta('No hay archivo de descarga configurado', 500);
  const ts = new Date().toISOString();
  const ev = evento({
    ts, contexto, version: d.version, archivo: d.archivo, origen, pais: context.geo && context.geo.country && context.geo.country.code,
    metodo: req.method, ua: req.headers.get('user-agent'),
    ip: UNICOS_ACTIVOS ? context.ip : undefined, sal: UNICOS_ACTIVOS ? env('DESCARGAS_SAL') : '',
    interno: /(?:^|;\s*)tc_interno=1(?:;|$)/.test(req.headers.get('cookie') || ''),
  });
  try {
    // la descarga NUNCA se bloquea por el registro: si el almacen falla, se redirige igual y queda en el log
    await store.setJSON(`ev/${ts.slice(0, 10)}/${ts}-${Math.random().toString(36).slice(2, 10)}`, ev);
  } catch (e) {
    console.error('descargar: no se pudo registrar el evento', e && e.message);
  }
  // una URL firmada que caduca; si GitHub no la da, el enlace de siempre (la descarga nunca se bloquea) y queda en el log
  const enlace = await enlaceTemporal(d, { token: env('GITHUB_DIST_TOKEN') });
  if (!enlace.temporal) console.error('descargar: se entrego el enlace permanente:', enlace.motivo);
  return respuesta(null, 302, { Location: enlace.url });
};

export const config = { path: ['/descargar', '/descargar/interno', '/descargar/resumen', '/descargar/uso', '/descargar/ir/*'] };
