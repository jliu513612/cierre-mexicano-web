// Logica del contador de descargas de taxcerteza.mx, separada de Netlify para poder probarla con node --test.
// La usa netlify/functions/descargar.mjs. Lo que se guarda por descarga, y nada mas:
//   ts, contexto (production / deploy-preview / ...), version, archivo, origen (pagina del propio sitio, ver origenDe),
//   pais, metodo, bot, interno. Los usos de las herramientas y los clics del embudo van al mismo almacen con su `tipo`.
// La IP NO se guarda, ni nada calculado con ella (decision de la duena del sitio, 2026-10-20). Lo unico que sale de la
// conexion es `pais`: Netlify lo deduce de la IP (context.geo) y aqui solo se guarda su codigo de dos letras; el aviso de
// privacidad (/privacidad/) lo dice asi. El user-agent solo se mira al momento para la marca de bot y no se guarda.
// LOS UNICOS ESTAN APAGADOS (UNICOS_ACTIVOS = false). El codigo se conserva: la huella seria sha256(sal | mes | IP | UA)
// recortada, con la sal en una variable de Netlify; se enciende cuando exista el aviso de privacidad.
import { createHash, timingSafeEqual } from 'node:crypto';
import { HERRAMIENTAS, NOMBRES, ACCIONES } from './herramientas.mjs';
import embudo from '../embudo.mjs';

const DESTINOS = Object.keys(embudo);

/** Unicos (huella de IP + user-agent): APAGADO hasta que exista el aviso de privacidad. */
export const UNICOS_ACTIVOS = false;

// Clientes que no son una persona descargando: buscadores, previsualizadores de enlaces y descargas por programa.
const RE_BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|slack|discord|embedly|preview|curl|wget|python|httpclient|http-client|java\/|go-http|okhttp|axios|node-fetch|libwww|headless|lighthouse|monitor|uptime|pingdom|scan/i;

export function esBot(ua, metodo) {
  if (metodo && metodo.toUpperCase() === 'HEAD') return true;   // un HEAD no baja el archivo
  const u = String(ua || '').trim();
  return u === '' || RE_BOT.test(u);
}

export function mesDe(ts) { return String(ts).slice(0, 7); }

/** Huella del mes, o null si no hay sal (entonces no se puede contar unicos y el resumen lo dice). */
export function huella(sal, ts, ip, ua) {
  if (!sal) return null;
  return createHash('sha256').update([sal, mesDe(ts), String(ip || ''), String(ua || '')].join('|')).digest('hex').slice(0, 20);
}

/** Compara una clave sin filtrar su longitud ni su contenido por el tiempo de respuesta. */
export function claveValida(dada, esperada) {
  if (!esperada || typeof dada !== 'string') return false;
  const a = createHash('sha256').update(dada).digest(), b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

/** El destino de /descargar sale SOLO de la tabla del repo: jamas de la URL (nada de redireccion abierta). */
export function destino(tabla, archivo) {
  const clave = archivo && Object.prototype.hasOwnProperty.call(tabla.archivos, archivo) ? archivo : tabla.predeterminado;
  const d = tabla.archivos[clave];
  return d ? { archivo: clave, version: d.version, url: d.url, privado: d.privado || null } : null;
}

// Hosts donde GitHub sirve los archivos con URL FIRMADA que caduca (lista cerrada: otro host no se entrega).
const HOSTS_FIRMADOS = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'];

/** El enlace que se le da a la persona: una URL FIRMADA de GitHub que caduca, en vez del enlace permanente.
    - Con el archivo en un repo PRIVADO (`d.privado` = {repo, asset} y `token` de solo lectura): la pide a la API.
    - Si no, resuelve aqui la redireccion del enlace publico, que GitHub firma con caducidad.
    Si algo falla o el destino no es un host firmado conocido, devuelve el enlace permanente: la descarga NUNCA se
    bloquea por esto. Devuelve {url, temporal, motivo}. El token jamas sale de aqui. */
export async function enlaceTemporal(d, { traer = fetch, token = '' } = {}) {
  try {
    let r;
    if (d.privado && token) {
      r = await traer(`https://api.github.com/repos/${d.privado.repo}/releases/assets/${d.privado.asset}`, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream', 'User-Agent': 'taxcerteza-descargar', 'X-GitHub-Api-Version': '2022-11-28' } });
    } else {
      r = await traer(d.url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'taxcerteza-descargar' } });
    }
    const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
    let u = null;
    try { u = loc ? new URL(loc) : null; } catch (e) { u = null; }
    if (!u || u.protocol !== 'https:' || HOSTS_FIRMADOS.indexOf(u.host) < 0) {
      return { url: d.url, temporal: false, motivo: `GitHub no dio una URL firmada (HTTP ${r.status})` };
    }
    return { url: u.href, temporal: true, motivo: d.privado && token ? 'repo privado' : 'enlace publico firmado' };
  } catch (e) {
    return { url: d.url, temporal: false, motivo: `no se pudo pedir la URL firmada: ${e && e.name}` };
  }
}

/** El evento que se guarda. `unicos` (por omision UNICOS_ACTIVOS) decide si lleva huella; apagado, ni la IP ni nada
    calculado con ella entra en el evento (el codigo de pais, que deduce Netlify, si). */
export function evento({ ts, contexto, version, archivo, pais, metodo, ua, ip, sal, interno, origen, unicos = UNICOS_ACTIVOS }) {
  const e = { ts, contexto, version, archivo, origen: origen || 'sin_origen', pais: pais || null, metodo: metodo || 'GET', bot: esBot(ua, metodo), interno: !!interno };
  if (unicos) e.huella = huella(sal, ts, ip, ua);
  return e;
}

/** USO de una herramienta (el usuario ejecuto el calculo, el cotejo o la verificacion). Mismo almacen que las descargas
    y la misma privacidad: herramienta, cuantos elementos (p. ej. XML) y nada de lo que la persona escribio o subio.
    `cuerpo` es lo que llega del navegador; de el solo se leen `herramienta`, `n` y, si viene, `accion` (de la lista
    cerrada ACCIONES; una accion desconocida invalida el evento). Devuelve null si no es valido. */
export const MAX_ELEMENTOS = 1000;
export function eventoUso({ ts, contexto, cuerpo, pais, metodo, ua, interno }) {
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
  if (typeof c.herramienta !== 'string' || HERRAMIENTAS.indexOf(c.herramienta) < 0) return null;
  if (c.accion !== undefined && (ACCIONES[c.herramienta] || []).indexOf(c.accion) < 0) return null;
  const n = Number.isInteger(c.n) && c.n > 0 ? Math.min(c.n, MAX_ELEMENTOS) : null;
  const e = { tipo: 'uso', ts, contexto, herramienta: c.herramienta, n, pais: pais || null, bot: esBot(ua, metodo), interno: !!interno };
  if (c.accion !== undefined) e.accion = c.accion;
  return e;
}

/** De que pagina del PROPIO sitio viene un clic, por la cabecera Referer (la ruta, nunca nada de la persona). Solo una
    lista cerrada: 'portada', 'herramientas' (el indice), 'herramienta:<nombre>' de una herramienta publicada, 'blog',
    'ayuda', 'otra' (otra pagina del sitio) o 'sin_origen' (sin Referer, o de OTRO sitio: eso no se atribuye). */
export function origenDe(referer, host) {
  let u;
  try { u = new URL(String(referer || '')); } catch (e) { return 'sin_origen'; }
  if (!host || u.host !== host) return 'sin_origen';
  const p = u.pathname;
  if (p === '/' || p === '/index.html') return 'portada';
  if (p === '/herramientas/' || p === '/herramientas/index.html') return 'herramientas';
  const m = /^\/herramientas\/([a-z0-9-]+)\//.exec(p);
  if (m) return HERRAMIENTAS.indexOf(m[1]) >= 0 ? 'herramienta:' + m[1] : 'herramientas';
  if (/^\/blog(\/|$)/.test(p)) return 'blog';
  if (/^\/ayuda(\/|$)/.test(p)) return 'ayuda';
  return 'otra';
}

/** CLIC en un paso del embudo (/descargar/ir/<destino>): destino de la tabla y pagina de origen. Misma privacidad que
    las descargas: ni la IP ni nada calculado con ella; solo el codigo de pais. Devuelve null si el destino no esta en la tabla. */
export function eventoClic({ ts, contexto, destino: d, tabla, origen, pais, metodo, ua, interno }) {
  if (typeof d !== 'string' || !Object.prototype.hasOwnProperty.call(tabla, d)) return null;
  return { tipo: 'clic', ts, contexto, destino: d, origen: origen || 'sin_origen', pais: pais || null, bot: esBot(ua, metodo), interno: !!interno };
}

/** La ruta /descargar/ir/<destino> entera, sin Netlify: devuelve {evento, location} o null (entonces 404). La usan la
    funcion y el servidor de la prueba en navegador, asi que lo que se prueba es lo que corre. `location` sale SOLO de la
    tabla. */
export const PREFIJO_IR = '/descargar/ir/';
export function clicDe({ ruta, tabla, referer, host, ts, contexto, pais, metodo, ua, interno }) {
  if (typeof ruta !== 'string' || !ruta.startsWith(PREFIJO_IR)) return null;
  const ev = eventoClic({ ts, contexto, destino: ruta.slice(PREFIJO_IR.length), tabla, origen: origenDe(referer, host), pais, metodo, ua, interno });
  if (!ev) return null;
  let location = tabla[ev.destino];
  // WhatsApp: el texto que se prellena dice de que pagina viene. Sale SOLO de la lista cerrada del origen (nunca de la
  // URL ni de nada que la persona escribio) y es la persona quien decide si lo envia.
  const texto = ev.destino === 'whatsapp' ? textoWhatsapp(ev.origen) : '';
  if (texto) location += '?text=' + encodeURIComponent(texto);
  return { evento: ev, location };
}

/** El texto prellenado de WhatsApp para una pagina de origen de la lista cerrada; '' si no se sabe de donde viene. */
export function textoWhatsapp(origen) {
  const lugar = origen === 'portada' ? 'la página de inicio'
    : origen === 'herramientas' ? 'las herramientas gratuitas'
    : origen === 'blog' ? 'el blog'
    : origen === 'ayuda' ? 'la ayuda'
    : /^herramienta:/.test(origen) && NOMBRES[origen.slice('herramienta:'.length)] ? `la herramienta «${NOMBRES[origen.slice('herramienta:'.length)]}»`
    : '';
  return lugar ? `Hola, vengo de ${lugar} de taxcerteza.mx y quiero probar el programa.` : '';
}

/**
 * Resumen de un periodo [desde, hasta] (fechas AAAA-MM-DD, inclusivas) de los eventos de UN contexto.
 * internas: huellas que se sabe que son nuestras (las de las descargas hechas con la cookie de interno).
 */
export function resumir(eventos, { desde, hasta, contexto = 'production', internas = [], unicos = UNICOS_ACTIVOS } = {}) {
  const todos = eventos.filter(e => e.contexto === contexto && e.ts.slice(0, 10) >= desde && e.ts.slice(0, 10) <= hasta);
  const dentro = todos.filter(e => !e.tipo);                // las descargas no llevan tipo (ni las viejas ni las nuevas)
  const usos = todos.filter(e => e.tipo === 'uso');
  const nuestras = new Set(internas);
  for (const e of dentro) if (e.interno && e.huella) nuestras.add(e.huella);
  const esInterno = e => e.interno || (e.huella && nuestras.has(e.huella));
  const cuenta = l => new Set(l.filter(e => e.huella).map(e => e.huella)).size;
  const reales = dentro.filter(e => !e.bot && !esInterno(e));
  const porVersion = {}, porPais = {};
  for (const e of reales) {
    porVersion[e.version] = (porVersion[e.version] || 0) + 1;
    porPais[e.pais || '??'] = (porPais[e.pais || '??'] || 0) + 1;
  }
  const r = {
    periodo: { desde, hasta }, contexto,
    descargas_total: dentro.length,
    descargas_bots: dentro.filter(e => e.bot).length,
    descargas_internas: dentro.filter(e => !e.bot && esInterno(e)).length,
    descargas_reales: reales.length,
    por_version: porVersion,
    por_pais: porPais,
  };
  const usosReales = usos.filter(e => !e.bot && !e.interno);
  const porHerramienta = {}, elementos = {};
  for (const h of HERRAMIENTAS) { porHerramienta[h] = 0; elementos[h] = 0; }
  for (const e of usosReales) { porHerramienta[e.herramienta] += 1; elementos[e.herramienta] += e.n || 0; }
  r.usos = { total: usos.length, bots: usos.filter(e => e.bot).length, internos: usos.filter(e => !e.bot && e.interno).length,
             reales: usosReales.length, reales_por_herramienta: porHerramienta, elementos_por_herramienta: elementos };
  // las acciones de la lista cerrada, aparte (p. ej. «tipo-de-cambio:descarga_rango»); cuentan tambien como uso
  const porAccion = {};
  for (const [h, as] of Object.entries(ACCIONES)) for (const a of as) porAccion[h + ':' + a] = 0;
  for (const e of usosReales) if (e.accion) porAccion[e.herramienta + ':' + e.accion] += 1;
  r.usos.reales_por_accion = porAccion;
  // Embudo: los clics reales por destino y por pagina de origen, y de que pagina venian las descargas reales.
  const clics = todos.filter(e => e.tipo === 'clic');
  const clicsReales = clics.filter(e => !e.bot && !e.interno);
  const porDestino = {}, porOrigen = {}, descargasPorOrigen = {};
  for (const d of DESTINOS) porDestino[d] = 0;
  for (const e of clicsReales) {
    porDestino[e.destino] = (porDestino[e.destino] || 0) + 1;
    const o = porOrigen[e.origen] || (porOrigen[e.origen] = {});
    o[e.destino] = (o[e.destino] || 0) + 1;
  }
  for (const e of reales) { const o = e.origen || 'sin_origen'; descargasPorOrigen[o] = (descargasPorOrigen[o] || 0) + 1; }
  r.clics = { total: clics.length, bots: clics.filter(e => e.bot).length, internos: clics.filter(e => !e.bot && e.interno).length,
              reales: clicsReales.length, reales_por_destino: porDestino, reales_por_origen: porOrigen };
  r.descargas_reales_por_origen = descargasPorOrigen;
  if (unicos) Object.assign(r, { unicos_total: cuenta(dentro), unicos_reales: cuenta(reales), sin_huella: dentro.filter(e => !e.huella).length });
  return r;
}

/** Lunes a domingo de la semana ANTERIOR a `hoy` (AAAA-MM-DD), que es lo que pide el informe del lunes. */
export function semanaAnterior(hoy) {
  const d = new Date(hoy + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;            // lunes = 0
  const lunes = new Date(d.getTime() - (dow + 7) * 86400000);
  const domingo = new Date(lunes.getTime() + 6 * 86400000);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}

export function diasEntre(desde, hasta) {
  const out = [];
  for (let t = Date.parse(desde + 'T00:00:00Z'); t <= Date.parse(hasta + 'T00:00:00Z'); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
