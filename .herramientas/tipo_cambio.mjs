// Datos del tipo de cambio de /herramientas/tipo-de-cambio/, desde la linea de comandos. Dos usos:
//
//   node .herramientas/tipo_cambio.mjs --vigilar <url o archivo del JSON publicado>
//       lo que corre .github/workflows/tipo-cambio.yml: FRESCURA (el ultimo FIX publicado es el que ya debe existir
//       a esta hora) y COTEJO independiente de los ultimos 30 dias contra la tabla oficial de Banxico. No necesita
//       token. Sale con 1 si algo no cuadra, si falta un dia o si los datos no estan al dia.
//   BANXICO_TOKEN=... node .herramientas/tipo_cambio.mjs --actualizar <salida.json>
//       la MISMA actualizacion que la funcion de Netlify, escrita a un archivo local (para revisar a mano).
//
// Las dos imprimen siempre una linea LATIDO (todo bien) o ALERTA (algo fallo): el silencio no cuenta como bien.
// El token se lee del entorno y no se imprime nunca.
import fs from 'node:fs';
import { URL_OFICIAL, leerOficial, actualizar, vigilarPublicado } from '../netlify/lib/tipo-cambio.mjs';

async function traerTexto(origen) {
  if (!/^https?:\/\//.test(origen)) return fs.readFileSync(origen, 'utf8');
  const r = await fetch(origen + (origen.includes('?') ? '&' : '?') + 'v=' + Date.now(), { signal: AbortSignal.timeout(60000), cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} al leer ${origen}`);
  return r.text();
}

async function vigilar(origen, ahora = new Date()) {
  const pub = JSON.parse(await traerTexto(origen));
  const r = await fetch(URL_OFICIAL, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} de la tabla oficial de Banxico`);
  const filas = leerOficial(Buffer.from(await r.arrayBuffer()).toString('latin1'));
  return vigilarPublicado({ pub, filas, ahora });
}

async function main() {
  const [modo, arg] = process.argv.slice(2);
  let r;
  try {
    if (modo === '--vigilar' && arg) r = await vigilar(arg);
    else if (modo === '--actualizar' && arg) {
      r = await actualizar({ token: process.env.BANXICO_TOKEN || '' });
      if (r.ok) fs.writeFileSync(arg, JSON.stringify(r.datos) + '\n');
    } else { console.error('uso: --vigilar <url o archivo> | --actualizar <salida.json>'); process.exit(2); }
  } catch (e) {
    r = { ok: false, texto: String(e && e.message || e) };
  }
  console.log(`${r.ok ? 'LATIDO' : 'ALERTA'} tipo-de-cambio ${new Date().toISOString()} ${r.texto}`);
  process.exit(r.ok ? 0 : 1);
}

main();
