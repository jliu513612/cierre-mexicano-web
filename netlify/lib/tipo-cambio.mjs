// Tipo de cambio FIX de Banxico para /herramientas/tipo-de-cambio/: leer la serie del SIE, leer la tabla oficial y
// cotejarlas. Funciones puras (sin red): las usan el actualizador diario y las pruebas, con las mismas fechas que la
// pagina (tc.js, que a su vez es la regla de scripts/banxico_fix.py del programa, verificada con vectores ejecutados).
//
// Falla CERRADO en todo: una respuesta que no declara la serie de ley, un valor con forma rara, una tabla oficial con
// otras columnas o con menos dias de los esperados NO se aceptan; lanzan un error que dice lo medido.
import tcmod from '../../herramientas/tipo-de-cambio/tc.js';
import datos from '../../herramientas/tipo-de-cambio/tipo-cambio-datos.js';

export const SERIE = 'SF43718';
export const URL_SIE = 'https://www.banxico.org.mx/SieAPIRest/service/v1/series/' + SERIE + '/datos/';
export const URL_OFICIAL = 'https://www.banxico.org.mx/tipcamb/tipCamIHAction.do?idioma=sp';
const VALOR = /^\d{1,3}\.\d{4,6}$/;

export const tc = tcmod.crear(datos);

/** 'dd/mm/aaaa' -> 'aaaa-mm-dd', o null si no tiene esa forma. */
function iso(dma) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dma).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Respuesta JSON del SIE -> {aaaa-mm-dd: '17.1234'}. Los N/E se omiten (no hay FIX ese dia), como serie_rango. */
export function leerSie(json) {
  const serie = json && json.bmx && Array.isArray(json.bmx.series) && json.bmx.series[0];
  const id = serie && serie.idSerie;
  if (id !== SERIE) throw new Error(`la respuesta del SIE no es de la serie de ley: se pidio ${SERIE} y declara ${JSON.stringify(id)}`);
  if (!Array.isArray(serie.datos)) throw new Error('la respuesta del SIE no trae la lista de datos');
  const out = {};
  for (const r of serie.datos) {
    const f = iso(r && r.fecha);
    if (!f) throw new Error(`fecha con forma inesperada en el SIE: ${JSON.stringify(r && r.fecha)}`);
    const v = String(r.dato == null ? '' : r.dato).trim();
    if (v === 'N/E' || v === '') continue;
    if (!VALOR.test(v)) throw new Error(`valor con forma inesperada en el SIE para ${f}: ${JSON.stringify(v)}`);
    out[f] = v;
  }
  return out;
}

function limpio(h) {
  return h.replace(/<br\s*\/?>/gi, ' ').replace(/&([a-z])acute;/gi, '$1').replace(/&nbsp;/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Tabla oficial de Banxico (tipCamIHAction, ISO-8859-1 ya decodificada) -> [{fecha, determinacion, dof, obligaciones}].
    Las cuatro columnas vienen una tras otra: todas las fechas, luego todas las determinaciones, etc. N/E -> null. */
export function leerOficial(texto) {
  const titulos = [...texto.matchAll(/class="titulos_simpletablaSF"[^>]*>([\s\S]*?)<\/td>/g)].map(m => limpio(m[1]));
  const esperados = ['fecha', 'determinacion', 'publicacion dof', 'para solventar obligaciones'];
  if (JSON.stringify(titulos) !== JSON.stringify(esperados)) {
    throw new Error(`la tabla oficial cambio de columnas: ${JSON.stringify(titulos)} (se esperaban ${JSON.stringify(esperados)})`);
  }
  const v = [...texto.matchAll(/<td class="renglon(?:Par|Non)">([\s\S]*?)<\/td>/g)].map(m => m[1].trim());
  if (!v.length || v.length % 4) throw new Error(`la tabla oficial trae ${v.length} celdas, que no se reparten en 4 columnas`);
  const n = v.length / 4, filas = [];
  for (let i = 0; i < n; i++) {
    const f = iso(v[i]);
    if (!f) throw new Error(`fecha con forma inesperada en la tabla oficial: ${JSON.stringify(v[i])}`);
    const col = k => {
      const x = v[k * n + i];
      if (x === 'N/E') return null;
      if (!VALOR.test(x)) throw new Error(`valor con forma inesperada en la tabla oficial para ${f}: ${JSON.stringify(x)}`);
      return x;
    };
    filas.push({ fecha: f, determinacion: col(1), dof: col(2), obligaciones: col(3) });
  }
  return filas;
}

const igual = (a, b) => a !== undefined && a !== null && b !== null && Number(a).toFixed(4) === Number(b).toFixed(4);
function restar(f, dias) { return new Date(Date.parse(f + 'T00:00:00Z') - dias * 86400000).toISOString().slice(0, 10); }

/** Coteja la serie del SIE, con las fechas de tc.js, contra las tres columnas oficiales en los `dias` dias naturales
    anteriores a `hoy` (hoy no entra: antes del mediodia aun no hay FIX). Devuelve {ok, desde, hasta, revisados,
    diferencias}. Que un dia sea habil o no tambien se coteja: la tabla dice N/E en determinacion los dias inhabiles. */
export function cotejar({ serie, oficial, hoy, dias = 30, minimo = 18 }) {
  const desde = restar(hoy, dias), hasta = restar(hoy, 1), dif = [];
  const filas = oficial.filter(r => r.fecha >= desde && r.fecha <= hasta);
  for (const r of filas) {
    const habil = tc.esHabil(r.fecha);
    const det = tc.paraObligaciones(r.fecha);
    if (habil === 'NO_CUBIERTO' || det === 'NO_CUBIERTO') {
      dif.push(`${r.fecha}: sin calendario de dias inhabiles de la CNBV cargado para ese ano`);
      continue;
    }
    if (!igual(serie[det], r.obligaciones)) {
      dif.push(`${r.fecha}: para solventar obligaciones oficial ${r.obligaciones}, aqui ${serie[det] ?? 'sin dato'} (FIX del ${det})`);
    }
    if (habil !== (r.determinacion !== null)) {
      dif.push(`${r.fecha}: aqui es ${habil ? 'habil' : 'inhabil'} y la tabla oficial ${r.determinacion === null ? 'no trae' : 'trae'} FIX de ese dia`);
    } else if (habil) {
      if (!igual(serie[r.fecha], r.determinacion)) dif.push(`${r.fecha}: determinacion oficial ${r.determinacion}, aqui ${serie[r.fecha] ?? 'sin dato'}`);
      const pub = tc.dofDelDia(r.fecha);
      if (!igual(serie[pub], r.dof)) dif.push(`${r.fecha}: publicacion DOF oficial ${r.dof}, aqui ${serie[pub] ?? 'sin dato'} (FIX del ${pub})`);
    }
  }
  if (filas.length < minimo) dif.push(`la tabla oficial trae ${filas.length} dias entre ${desde} y ${hasta}; se esperaban al menos ${minimo}`);
  return { ok: dif.length === 0, desde, hasta, revisados: filas.length, diferencias: dif };
}

/** Lo que se publica para la pagina: la serie (solo desde `desde`) y el cotejo que la respalda. */
export function publicable({ serie, cotejo, generado, desde = '2023-12-01' }) {
  if (!cotejo.ok) throw new Error('no se publica una serie cuyo cotejo con la tabla oficial fallo');
  const valores = {};
  for (const f of Object.keys(serie).sort()) if (f >= desde) valores[f] = serie[f];
  const fechas = Object.keys(valores);
  return { serie: SERIE, generado, ultimo_dato: fechas[fechas.length - 1] || null, valores,
           cotejo: { desde: cotejo.desde, hasta: cotejo.hasta, revisados: cotejo.revisados, ok: true } };
}

/** Fecha de hoy en el centro de Mexico (UTC-6 todo el ano desde 2022). */
export function hoyMexico(ahora = new Date()) {
  return new Date(ahora.getTime() - 6 * 3600000).toISOString().slice(0, 10);
}

const DESDE = '2023-12-01';
const ESPERA_MS = 20000;

/** La actualizacion entera, la MISMA para la funcion programada, la ruta /actualizar y la linea de comandos:
    descarga la serie del SIE (con el token) y la tabla oficial, las coteja y, solo si cuadran, devuelve los datos a
    publicar. `traer` es fetch (las pruebas pasan uno simulado: ninguna prueba sale a la red ni gasta el token).
    Devuelve {ok:true, datos, texto} o {ok:false, texto}; los errores de red y de forma llegan como texto. */
export async function actualizar({ token, ahora = new Date(), traer = fetch } = {}) {
  if (!token) return { ok: false, texto: 'falta BANXICO_TOKEN en el entorno' };
  const hoy = hoyMexico(ahora);
  const pedir = async (url, opciones = {}) => {
    const host = new URL(url).host;
    let r;
    try {
      r = await traer(url, Object.assign({ signal: AbortSignal.timeout(ESPERA_MS) }, opciones));
    } catch (e) {
      throw new Error(e && e.name === 'TimeoutError' ? `${host} no contesto en ${ESPERA_MS / 1000} s` : `red al pedir a ${host}: ${e && e.message}`);
    }
    if (r.status === 401 || r.status === 403) throw new Error(`HTTP ${r.status} de ${host}: el token fue rechazado o no tiene permiso`);
    if (!r.ok) throw new Error(`HTTP ${r.status} de ${host}`);
    return r;
  };
  try {
    const [rs, ro] = await Promise.all([
      pedir(`${URL_SIE}${DESDE}/${hoy}`, { headers: { 'Bmx-Token': token, Accept: 'application/json' } }),
      pedir(URL_OFICIAL),
    ]);
    let json;
    try { json = JSON.parse(await rs.text()); } catch (e) { throw new Error('el SIE respondio algo que no es JSON (portal caido o pagina de error)'); }
    const serie = leerSie(json);
    const filas = leerOficial(Buffer.from(await ro.arrayBuffer()).toString('latin1'));
    const c = cotejar({ serie, oficial: filas, hoy });
    if (!c.ok) return { ok: false, texto: `el cotejo con la tabla oficial no cuadra (${c.revisados} dias del ${c.desde} al ${c.hasta}); no se publica: ` + c.diferencias.join('; ') };
    const datos = publicable({ serie, cotejo: c, generado: ahora.toISOString() });
    return { ok: true, datos, texto: `serie ${SERIE} hasta el ${datos.ultimo_dato}; cotejo ${c.revisados} dias del ${c.desde} al ${c.hasta} en verde` };
  } catch (e) {
    return { ok: false, texto: String(e && e.message || e) };
  }
}

/** La vigilancia diaria por fuera (.github/workflows/tipo-cambio.yml): lo PUBLICADO tiene que estar al dia (el ultimo FIX
    que ya debe existir en `ahora`) y cuadrar con la tabla oficial en los ultimos 30 dias. Pura: recibe lo publicado y
    las filas oficiales ya leidas. Devuelve {ok, texto}. */
export function vigilarPublicado({ pub, filas, ahora = new Date() }) {
  if (!pub || pub.serie !== SERIE || !pub.valores || !pub.cotejo || pub.cotejo.ok !== true) return { ok: false, texto: 'lo publicado no tiene la forma esperada' };
  const c = cotejar({ serie: pub.valores, oficial: filas, hoy: hoyMexico(ahora) });
  const esperado = tc.ultimoEsperado(ahora.getTime());
  const problemas = [];
  if (esperado === 'NO_CUBIERTO') problemas.push('no hay calendario de dias inhabiles de la CNBV para hoy: no se puede saber que dato toca');
  else if (!(pub.ultimo_dato >= esperado)) problemas.push(`no esta al dia: el ultimo FIX publicado es del ${pub.ultimo_dato} y a esta hora ya debe estar el del ${esperado}`);
  if (!c.ok) problemas.push(...c.diferencias);
  const de = `publicado hasta el ${pub.ultimo_dato} (generado ${pub.generado}); cotejo ${c.revisados} dias del ${c.desde} al ${c.hasta}`;
  return problemas.length ? { ok: false, texto: `${de}:\n  ` + problemas.join('\n  ') } : { ok: true, texto: `${de}: al dia y cuadra` };
}
