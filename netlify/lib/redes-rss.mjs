// Generacion pura de feeds RSS 2.0 para redes sociales (Facebook y X/Buffer via Zapier Free) a partir de
// assets/redes/agenda.json. Sin dependencias externas, sin estado y determinista por reloj (hora de la Ciudad de Mexico,
// UTC-6 sin horario de verano).
export const HORA_DESBLOQUEO_CDMX = 8;

export const BASE_ANCLA = {
  fecha: '2026-11-25',
  titulo: 'Retenciones de ISR e IVA al facturar a persona moral',
  facebook_texto:
    'Retenciones de persona moral: 10 % ISR y 2/3 del IVA en honorarios y rentas; ' +
    '1.25 % ISR en RESICO; 4 % de la contraprestacion como IVA en fletes.\n\n' +
    'Guia completa:\n' +
    'https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=facebook&utm_medium=social&utm_campaign=20261207',
  facebook_link:
    'https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=facebook&utm_medium=social&utm_campaign=20261207',
  facebook_image: 'https://taxcerteza.mx/assets/redes/2026-12-07/facebook_1080x1350.jpg',
  x_texto:
    'Retenciones al facturar a persona moral: 10 % ISR y 2/3 IVA en honorarios/rentas; ' +
    '1.25 % ISR en RESICO; 4 % como IVA en fletes.\n' +
    'https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=x&utm_medium=social&utm_campaign=20261207',
  x_link:
    'https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=x&utm_medium=social&utm_campaign=20261207',
  x_image: 'https://taxcerteza.mx/assets/redes/2026-12-07/x_1600x900.png',
  alt: 'Tarjeta de Tax Certeza sobre retenciones de ISR e IVA al facturar a persona moral.',
};

const DIAS_SEM = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function escaparXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convierte una fecha AAAA-MM-DD y hora HH:MM (CDMX, UTC-6) a RFC 822. */
export function rfc822Cdmx(fechaIso, hora = '08:00') {
  const [a, m, d] = fechaIso.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d, hh, mm, 0));
  const dw = DIAS_SEM[dt.getUTCDay()];
  const dd = String(d).padStart(2, '0');
  const mon = MESES[m - 1];
  return `${dw}, ${dd} ${mon} ${a} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00 -0600`;
}

/** Devuelve { fecha: 'AAAA-MM-DD', hora: 0..23 } en hora de la Ciudad de Mexico (UTC-6 fijo). */
export function relojCdmx(ahora = new Date()) {
  const cdmx = new Date(ahora.getTime() - 6 * 3600 * 1000);
  return {
    fecha: cdmx.toISOString().slice(0, 10),
    hora: cdmx.getUTCHours(),
  };
}

/** Filtra los elementos ya desbloqueados (fechas anteriores, o la de hoy a partir de las 08:00 CDMX) + BASE_ANCLA. */
export function elementosActivos(agenda, ahora = new Date()) {
  const { fecha: hoy, hora } = relojCdmx(ahora);
  const lista = Array.isArray(agenda) ? agenda : [];
  const activos = lista.filter(e => {
    const f = String((e && e.fecha) || '9999-99-99');
    if (f < hoy) return true;
    if (f === hoy && hora >= HORA_DESBLOQUEO_CDMX) return true;
    return false;
  });
  activos.push(BASE_ANCLA);
  activos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return activos;
}

export function construirRss(red, agenda, ahora = new Date(), limite = 15) {
  if (red !== 'facebook' && red !== 'x') return null;
  const activos = elementosActivos(agenda, ahora).slice(0, limite);
  const horaPub = red === 'x' ? '08:00' : '12:30';
  const itemsXml = activos.map(entry => {
    const fecha = entry.fecha;
    const imgUrl = entry[`${red}_image`];
    const mime = String(imgUrl || '').toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return [
      '    <item>',
      `      <title>${escaparXml(entry.titulo)}</title>`,
      `      <link>${escaparXml(entry[`${red}_link`])}</link>`,
      `      <description>${escaparXml(entry[`${red}_texto`])}</description>`,
      `      <guid isPermaLink="false">${escaparXml(`taxcerteza-${red}-${fecha}`)}</guid>`,
      `      <pubDate>${rfc822Cdmx(fecha, horaPub)}</pubDate>`,
      `      <enclosure url="${escaparXml(imgUrl)}" type="${mime}" length="0" />`,
      '    </item>',
    ].join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>Tax Certeza Redes (${red.toUpperCase()})</title>`,
    '    <link>https://taxcerteza.mx/</link>',
    `    <description>Publicaciones fiscales programadas de Tax Certeza para ${red}.</description>`,
    '    <language>es-MX</language>',
    itemsXml,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
