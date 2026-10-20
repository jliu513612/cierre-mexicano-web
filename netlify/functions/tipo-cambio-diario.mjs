// Actualizacion programada del tipo de cambio de /herramientas/tipo-de-cambio/ (decision de la duena del sitio,
// 2026-10-20). De lunes a viernes a las 13:15 y a las 17:15 de la Ciudad de Mexico (Banxico publica el FIX hacia las
// 12:00): descarga la serie SF43718 del SIE, la coteja con la tabla oficial de Banxico (ultimos 30 dias) y SOLO si
// cuadra la guarda en Netlify Blobs. Si no cuadra, conserva los datos anteriores (la pagina dice que no estan al dia) y
// deja el motivo en el estado. Cada corrida escribe una linea LATIDO o ALERTA en el log de la funcion.
// Las funciones programadas solo corren en el despliegue de produccion. La frescura la vigila ademas, por fuera,
// .github/workflows/tipo-cambio.yml.
import { almacen, actualizarEn } from '../lib/tipo-cambio-servidor.mjs';

const env = k => (globalThis.Netlify && Netlify.env.get(k)) || process.env[k] || '';

export default async (req, context) => {
  const contexto = (context && context.deploy && context.deploy.context) || 'production';
  await actualizarEn(await almacen(contexto === 'production'), { token: env('BANXICO_TOKEN'), origen: 'programada', contexto });
};

export const config = { schedule: '15 19,23 * * 1-5' };
