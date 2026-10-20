// Lo del servidor para el tipo de cambio: el almacen (Netlify Blobs), la actualizacion con su estado y su latido.
// La logica (leer, cotejar, publicar) es la de tipo-cambio.mjs; aqui solo se guarda y se cuenta.
import { actualizar, tc } from './tipo-cambio.mjs';

// @netlify/blobs se carga solo al usarlo: las pruebas pasan un almacen simulado y no lo necesitan instalado.
export async function almacen(produccion) {
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name: produccion ? 'tipo-cambio' : 'tipo-cambio-pruebas', consistency: 'strong' });
}
const ESPERA_ENTRE_INTENTOS_MS = 60000;

/** Ejecuta la actualizacion y la guarda. Solo con el cotejo en verde se reemplaza fix.json; el estado se escribe
    siempre. Devuelve {ok, texto} y deja una linea LATIDO o ALERTA en el log. El token jamas sale de aqui. */
export async function actualizarEn(store, { token, origen, contexto, ahora = new Date(), traer } = {}) {
  const antes = await store.get('estado.json', { type: 'json' }).catch(() => null);
  if (origen === 'a mano' && antes && ahora - Date.parse(antes.ts) < ESPERA_ENTRE_INTENTOS_MS) {
    return { ok: false, texto: 'hubo un intento hace menos de un minuto; espera y vuelve a intentarlo' };
  }
  let r;
  try {
    r = await actualizar({ token, ahora, traer });
    if (r.ok) await store.set('fix.json', JSON.stringify(r.datos) + '\n');
  } catch (e) {
    r = { ok: false, texto: String(e && e.message || e) };
  }
  if (token && r.texto.includes(token)) r.texto = r.texto.split(token).join('[token]');
  const estado = { ts: ahora.toISOString(), origen, contexto, ok: r.ok, texto: r.texto };
  try { await store.setJSON('estado.json', estado); } catch (e) { r.texto += ` (y no se pudo guardar el estado: ${e && e.message})`; }
  console.log(`${r.ok ? 'LATIDO' : 'ALERTA'} tipo-de-cambio ${estado.ts} ${origen} ${contexto}: ${r.texto}`);
  return { ok: r.ok, texto: r.texto };
}

/** Estado para /estado: el ultimo intento y lo que hay publicado, con si esta al dia. */
export async function leerEstado(store, ahora = new Date()) {
  const intento = await store.get('estado.json', { type: 'json' }).catch(() => null);
  const fix = await store.get('fix.json', { type: 'json' }).catch(() => null);
  const esperado = tc.ultimoEsperado(ahora.getTime());
  return {
    ultimo_intento: intento,
    datos: fix ? { ultimo_dato: fix.ultimo_dato, generado: fix.generado, cotejo: fix.cotejo } : null,
    ultimo_esperado: esperado,
    al_dia: !!fix && esperado !== 'NO_CUBIERTO' && fix.ultimo_dato >= esperado,
  };
}
