// Avisa a IndexNow (Bing y los buscadores que lo comparten) de las URL nuevas, cambiadas o borradas en un despliegue
// de produccion. Lo corre .github/workflows/indexnow.yml en cada push a main, que es lo que Netlify despliega.
//
//   node .github/indexnow/avisar.mjs <sha-antes> <sha-despues>
//
// Que URL: las paginas .html que cambian entre los dos commits Y que estan (o estaban, si se borraron) en alguno de los
// sitemaps del sitio. Nada fuera de los sitemaps: ni plantillas, ni verificaciones de buscadores, ni el 404.
// Antes de avisar espera a que el sitio sirva la version nueva de una de esas paginas (el despliegue tiene que haber
// terminado); si no la sirve en 20 minutos, NO avisa y sale con 1.
// Siempre imprime una linea LATIDO (bien, tambien cuando no hay nada que avisar) o ALERTA (algo fallo).
// La clave no es secreta: se publica en la raiz como <clave>.txt para demostrar que el sitio es nuestro.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST = 'taxcerteza.mx';
export const SITEMAPS = ['sitemap.xml', 'herramientas/sitemap.xml', 'ayuda/sitemap.xml'];
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESPERA_TOTAL_MS = 20 * 60000, PASO_MS = 20000;

/** 'herramientas/x/index.html' -> 'https://taxcerteza.mx/herramientas/x/'; 'a.html' -> '.../a.html'. */
export function urlDe(archivo) {
  const ruta = archivo.replace(/(^|\/)index\.html$/, '$1');
  return `https://${HOST}/${ruta}`;
}

/** URL de un sitemap (texto) -> Set. */
export function locs(xml) {
  return new Set([...String(xml || '').matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]));
}

/** cambios: [{estado:'A'|'M'|'D', archivo}] (los renombres llegan como D + A). antes/despues: Set de URL de los sitemaps.
    Devuelve {urls, verificar}: las URL que se avisan y, de ellas, las que tienen que existir ya en el sitio. */
export function urlsCambiadas(cambios, antes, despues) {
  const urls = new Set(), verificar = [];
  for (const { estado, archivo } of cambios) {
    if (!/\.html$/.test(archivo) || archivo.split('/').some(p => p.startsWith('.'))) continue;
    const u = urlDe(archivo);
    if (estado === 'D' ? antes.has(u) || despues.has(u) : despues.has(u)) {
      if (!urls.has(u) && estado !== 'D') verificar.push({ url: u, archivo });
      urls.add(u);
    }
  }
  return { urls: [...urls].sort(), verificar };
}

/** La clave: el UNICO archivo de la raiz llamado <32 hex>.txt cuyo contenido es su propio nombre. */
export function clave(raiz = RAIZ) {
  const c = fs.readdirSync(raiz).filter(f => /^[0-9a-f]{32}\.txt$/.test(f))
    .filter(f => fs.readFileSync(path.join(raiz, f), 'utf8').trim() === f.slice(0, 32));
  if (c.length !== 1) throw new Error(`se esperaba un archivo de clave de IndexNow en la raiz y hay ${c.length}`);
  return c[0].slice(0, 32);
}

const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 << 20 });
const enCommit = (sha, archivo) => { try { return git('show', `${sha}:${archivo}`); } catch (e) { return ''; } };
const huella = t => crypto.createHash('sha256').update(String(t).replace(/\r\n/g, '\n').trim()).digest('hex');
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function traer(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now(), { signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
  return { status: r.status, texto: await r.text() };
}

async function esperarDespliegue(muestra, sha, k) {
  const esperado = huella(enCommit(sha, muestra.archivo));
  const limite = Date.now() + ESPERA_TOTAL_MS;
  let ultimo = '';
  while (Date.now() < limite) {
    try {
      const [p, kf] = await Promise.all([traer(muestra.url), traer(`https://${HOST}/${k}.txt`)]);
      if (p.status === 200 && huella(p.texto) === esperado && kf.status === 200 && kf.texto.trim() === k) return;
      ultimo = `pagina HTTP ${p.status}${p.status === 200 ? ' con otra version' : ''}, clave HTTP ${kf.status}`;
    } catch (e) { ultimo = String(e && e.message || e); }
    await dormir(PASO_MS);
  }
  throw new Error(`el sitio no sirve la version nueva de ${muestra.url} tras ${ESPERA_TOTAL_MS / 60000} min (${ultimo}); no se avisa`);
}

async function main(antes, despues) {
  if (!/^[0-9a-f]{40}$/.test(despues || '')) throw new Error('falta el sha del commit desplegado');
  const k = clave();
  const vacio = !antes || /^0+$/.test(antes);
  const cambios = vacio ? [] : git('diff', '--no-renames', '--name-status', antes, despues).trim().split('\n').filter(Boolean)
    .map(l => { const [estado, archivo] = l.split('\t'); return { estado: estado[0], archivo }; });
  const mapa = sha => new Set(SITEMAPS.flatMap(s => [...locs(enCommit(sha, s))]));
  const { urls, verificar } = urlsCambiadas(cambios, vacio ? new Set() : mapa(antes), mapa(despues));
  if (!urls.length) return `sin URL que avisar en ${despues.slice(0, 8)} (${cambios.length} archivos cambiados)`;
  // En un PR (INDEXNOW_SIMULAR=1) solo se dice que se avisaria: ni se espera al sitio ni se envia nada.
  if (process.env.INDEXNOW_SIMULAR === '1') return `SIMULADO, avisaria ${urls.length} URL de ${despues.slice(0, 8)}: ${urls.join(' ')}`;
  if (verificar.length) await esperarDespliegue(verificar[0], despues, k);
  const cuerpo = { host: HOST, key: k, keyLocation: `https://${HOST}/${k}.txt`, urlList: urls };
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', body: JSON.stringify(cuerpo),
    headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(30000) });
  if (r.status !== 200 && r.status !== 202) {
    throw new Error(`IndexNow respondio HTTP ${r.status} (${(await r.text()).slice(0, 200)}) para ${urls.length} URL`);
  }
  return `IndexNow respondio HTTP ${r.status} para ${urls.length} URL de ${despues.slice(0, 8)}: ${urls.join(' ')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [antes, despues] = process.argv.slice(2);
  main(antes, despues).then(
    t => { console.log(`LATIDO indexnow ${new Date().toISOString()} ${t}`); },
    e => { console.log(`ALERTA indexnow ${new Date().toISOString()} ${e && e.message || e}`); process.exit(1); });
}
