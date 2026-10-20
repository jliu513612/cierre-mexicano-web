// Logica del contador de descargas de taxcerteza.mx, separada de Netlify para poder probarla con node --test.
// La usa netlify/functions/descargar.mjs. Lo que se guarda por descarga, y nada mas:
//   ts, contexto (production / deploy-preview / ...), version, archivo, pais, metodo, bot, interno, huella.
// La huella es sha256(sal secreta | mes | IP | user-agent) recortada: sirve para contar descargadores UNICOS sin guardar
// la IP ni el user-agent en claro. La sal vive en una variable de Netlify y el mes entra en el hash, asi que la misma
// persona tiene otra huella cada mes (no se puede seguir a nadie de un mes a otro).
import { createHash, timingSafeEqual } from 'node:crypto';

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

export function evento({ ts, contexto, version, archivo, pais, metodo, ua, ip, sal, interno }) {
  return { ts, contexto, version, archivo, pais: pais || null, metodo: metodo || 'GET', bot: esBot(ua, metodo),
           interno: !!interno, huella: huella(sal, ts, ip, ua) };
}

/**
 * Resumen de un periodo [desde, hasta] (fechas AAAA-MM-DD, inclusivas) de los eventos de UN contexto.
 * internas: huellas que se sabe que son nuestras (las de las descargas hechas con la cookie de interno).
 */
export function resumir(eventos, { desde, hasta, contexto = 'production', internas = [] } = {}) {
  const dentro = eventos.filter(e => e.contexto === contexto && e.ts.slice(0, 10) >= desde && e.ts.slice(0, 10) <= hasta);
  const nuestras = new Set(internas);
  for (const e of dentro) if (e.interno && e.huella) nuestras.add(e.huella);
  const esInterno = e => e.interno || (e.huella && nuestras.has(e.huella));
  const unicos = l => new Set(l.filter(e => e.huella).map(e => e.huella)).size;
  const reales = dentro.filter(e => !e.bot && !esInterno(e));
  const porVersion = {}, porPais = {};
  for (const e of reales) {
    porVersion[e.version] = (porVersion[e.version] || 0) + 1;
    porPais[e.pais || '??'] = (porPais[e.pais || '??'] || 0) + 1;
  }
  return {
    periodo: { desde, hasta }, contexto,
    descargas_total: dentro.length,
    descargas_bots: dentro.filter(e => e.bot).length,
    descargas_internas: dentro.filter(e => !e.bot && esInterno(e)).length,
    descargas_reales: reales.length,
    unicos_total: unicos(dentro),
    unicos_reales: unicos(reales),
    sin_huella: dentro.filter(e => !e.huella).length,
    por_version: porVersion,
    por_pais: porPais,
  };
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
