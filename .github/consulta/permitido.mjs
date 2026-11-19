// Excepcion a la aprobacion manual de PRs (aprobada por la duena del sitio el 2026-11-13): un PR se mergea solo,
// con auto-merge al pasar sus checks, SOLO si TODOS sus ficheros son paginas de consulta NUEVAS:
// consulta/<token>/index.html con estado «added». Cualquier otra cosa -otro fichero, una pagina modificada, borrada
// o renombrada, una lista vacia o ilegible- vuelve a la aprobacion de June. La lista enumera lo PERMITIDO, no lo
// sospechoso: lo que no reconoce cuenta como no permitido (falla cerrado).
//
// Uso: node permitido.mjs < ficheros.tsv   (una linea por fichero: <estado>\t<ruta>, como la API de GitHub)
// Sale 0 e imprime PERMITIDO si el PR entra en la excepcion; sale 1 e imprime NO-PERMITIDO y el motivo si no.

export const PATRON = /^consulta\/[a-z0-9][a-z0-9-]{5,63}\/index\.html$/;
export const MAX_FICHEROS = 5;

export function juzgar(tsv) {
  if (typeof tsv !== 'string') return { permitido: false, motivo: 'la lista de ficheros no es texto' };
  const lineas = tsv.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l !== '');
  if (lineas.length === 0) return { permitido: false, motivo: 'el PR no trae ficheros' };
  if (lineas.length > MAX_FICHEROS) return { permitido: false, motivo: `trae ${lineas.length} ficheros (tope ${MAX_FICHEROS})` };
  for (const l of lineas) {
    const partes = l.split('\t');
    if (partes.length !== 2) return { permitido: false, motivo: `linea ilegible: ${JSON.stringify(l)}` };
    const [estado, ruta] = partes;
    if (estado !== 'added') return { permitido: false, motivo: `${ruta}: estado «${estado}» (solo se permiten paginas nuevas)` };
    if (!PATRON.test(ruta)) return { permitido: false, motivo: `${ruta}: fuera de consulta/<token>/index.html` };
  }
  return { permitido: true, motivo: `${lineas.length} pagina(s) de consulta nuevas` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let entrada = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { entrada += c; });
  process.stdin.on('end', () => {
    const r = juzgar(entrada);
    console.log(`${r.permitido ? 'PERMITIDO' : 'NO-PERMITIDO'}: ${r.motivo}`);
    process.exit(r.permitido ? 0 : 1);
  });
}
