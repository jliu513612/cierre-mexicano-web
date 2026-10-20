// Logica del contador de descargas de taxcerteza.mx, separada de Netlify para poder probarla con node --test.
// La usa netlify/functions/descargar.mjs. Lo que se guarda por descarga, y nada mas:
//   ts, contexto (production / deploy-preview / ...), version, archivo, pais, metodo, bot, interno.
// NADA derivado de la IP (decision de la duena del sitio, 2026-10-20: hasta que exista el aviso de privacidad). El
// user-agent solo se mira al momento para la marca de bot y no se guarda.
// LOS UNICOS ESTAN APAGADOS (UNICOS_ACTIVOS = false). El codigo se conserva: la huella seria sha256(sal | mes | IP | UA)
// recortada, con la sal en una variable de Netlify; se enciende cuando exista el aviso de privacidad.
import { createHash, timingSafeEqual } from 'node:crypto';
import { HERRAMIENTAS } from './herramientas.mjs';

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
  return d ? { archivo: clave, version: d.version, url: d.url } : null;
}

/** El evento que se guarda. `unicos` (por omision UNICOS_ACTIVOS) decide si lleva huella; apagado, ni la IP ni nada
    derivado de ella entra en el evento. */
export function evento({ ts, contexto, version, archivo, pais, metodo, ua, ip, sal, interno, unicos = UNICOS_ACTIVOS }) {
  const e = { ts, contexto, version, archivo, pais: pais || null, metodo: metodo || 'GET', bot: esBot(ua, metodo), interno: !!interno };
  if (unicos) e.huella = huella(sal, ts, ip, ua);
  return e;
}

/** USO de una herramienta (el usuario ejecuto el calculo, el cotejo o la verificacion). Mismo almacen que las descargas
    y la misma privacidad: herramienta, cuantos elementos (p. ej. XML) y nada de lo que la persona escribio o subio.
    `cuerpo` es lo que llega del navegador; de el solo se leen `herramienta` y `n`. Devuelve null si no es valido. */
export const MAX_ELEMENTOS = 1000;
export function eventoUso({ ts, contexto, cuerpo, pais, metodo, ua, interno }) {
  const c = cuerpo && typeof cuerpo === 'object' ? cuerpo : {};
  if (typeof c.herramienta !== 'string' || HERRAMIENTAS.indexOf(c.herramienta) < 0) return null;
  const n = Number.isInteger(c.n) && c.n > 0 ? Math.min(c.n, MAX_ELEMENTOS) : null;
  return { tipo: 'uso', ts, contexto, herramienta: c.herramienta, n, pais: pais || null, bot: esBot(ua, metodo), interno: !!interno };
}

/**
 * Resumen de un periodo [desde, hasta] (fechas AAAA-MM-DD, inclusivas) de los eventos de UN contexto.
 * internas: huellas que se sabe que son nuestras (las de las descargas hechas con la cookie de interno).
 */
export function resumir(eventos, { desde, hasta, contexto = 'production', internas = [], unicos = UNICOS_ACTIVOS } = {}) {
  const todos = eventos.filter(e => e.contexto === contexto && e.ts.slice(0, 10) >= desde && e.ts.slice(0, 10) <= hasta);
  const dentro = todos.filter(e => e.tipo !== 'uso');       // las descargas (los eventos viejos no llevan tipo)
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
