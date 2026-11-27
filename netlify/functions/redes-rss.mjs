// Sirve dinamicamente /assets/redes/feed-facebook.xml y /assets/redes/feed-x.xml leyendo assets/redes/agenda.json
// del mismo origen. Desbloquea cada fecha automaticamente a las 08:00 CDMX (UTC-6) sin hacer commits a main ni gastar
// compilaciones de Netlify.
import { construirRss } from '../lib/redes-rss.mjs';

const RUTAS = {
  '/assets/redes/feed-facebook.xml': 'facebook',
  '/assets/redes/feed-x.xml': 'x',
};

export default async req => {
  const url = new URL(req.url);
  const red = RUTAS[url.pathname];
  if (!red) return new Response('No encontrado', { status: 404 });

  let agenda = [];
  try {
    const res = await fetch(new URL('/assets/redes/agenda.json', url.origin), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) agenda = await res.json();
  } catch (e) {
    console.error('redes-rss: no se pudo leer agenda.json', e && e.message);
  }

  const xml = construirRss(red, agenda, new Date());
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
};

export const config = {
  path: ['/assets/redes/feed-facebook.xml', '/assets/redes/feed-x.xml'],
};
