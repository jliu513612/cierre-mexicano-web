// /herramientas/tipo-de-cambio/ en el servidor: sirve los datos del FIX y los actualiza. Rutas:
//   /herramientas/tipo-de-cambio/fix.json      los datos que lee la pagina (de Netlify Blobs). Si el almacen esta VACIO
//                                              (primer despliegue), ejecuta una vez la misma actualizacion (un intento
//                                              por minuto como mucho); si tampoco hay datos: 404.
//   /herramientas/tipo-de-cambio/estado?clave= estado del ultimo intento y de la configuracion. No es publico.
//   /herramientas/tipo-de-cambio/actualizar?clave=  ejecuta la MISMA actualizacion que la funcion programada
//                                              (tipo-cambio-diario.mjs): primera carga y reintentos a mano.
// Variables de Netlify (las crea la duena del sitio; no van en el repo):
//   BANXICO_TOKEN            token del SIE de Banxico (solo lo usa la actualizacion; jamas se devuelve)
//   DESCARGAS_CLAVE_INTERNA  la clave interna que ya protege /descargar/resumen
// Las vistas previas usan OTRO almacen ('tipo-cambio-pruebas') y su estado y actualizar no piden clave, como el
// resumen de descargas: nada de una vista previa llega a produccion.
import { claveValida } from '../lib/descargas.mjs';
import { almacen, actualizarEn, leerEstado } from '../lib/tipo-cambio-servidor.mjs';

const env = k => (globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || '';

function respuesta(cuerpo, estado, extra = {}) {
  return new Response(cuerpo, { status: estado, headers: Object.assign({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra) });
}
const json = (o, estado = 200, extra = {}) => respuesta(JSON.stringify(o, null, 1), estado, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra));

export default async (req, context) => {
  const url = new URL(req.url);
  const contexto = (context.deploy && context.deploy.context) || 'desconocido';
  const produccion = contexto === 'production';
  const store = await almacen(produccion);
  const ruta = url.pathname.replace(/\/+$/, '');
  const conClave = () => !produccion || claveValida(url.searchParams.get('clave'), env('DESCARGAS_CLAVE_INTERNA'));

  if (ruta === '/herramientas/tipo-de-cambio/fix.json') {
    let datos = await store.get('fix.json', { type: 'text' });
    if (!datos) {
      await actualizarEn(store, { token: env('BANXICO_TOKEN'), origen: 'primera carga', contexto });
      datos = await store.get('fix.json', { type: 'text' });
    }
    if (!datos) return json({ error: 'sin datos todavia' }, 404);
    // el navegador revalida siempre; la CDN guarda 5 minutos
    return respuesta(datos, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=300' });
  }

  if (ruta === '/herramientas/tipo-de-cambio/estado') {
    if (!conClave()) return respuesta('No encontrado', 404);
    const e = await leerEstado(store);
    e.contexto = contexto;
    e.banxico_token_configurado = !!env('BANXICO_TOKEN');            // solo si existe; jamas el valor
    e.clave_interna_configurada = !!env('DESCARGAS_CLAVE_INTERNA');
    return json(e);
  }

  if (ruta === '/herramientas/tipo-de-cambio/actualizar') {
    if (!conClave()) return respuesta('No encontrado', 404);
    const r = await actualizarEn(store, { token: env('BANXICO_TOKEN'), origen: 'a mano', contexto });
    return json(r, r.ok ? 200 : 502);
  }

  return respuesta('No encontrado', 404);
};

export const config = {
  path: ['/herramientas/tipo-de-cambio/fix.json', '/herramientas/tipo-de-cambio/estado', '/herramientas/tipo-de-cambio/actualizar'],
};
