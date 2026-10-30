// Centro de ayuda de Tax Certeza — contenido en Markdown dentro de git
// (sobrevive a un cambio de sistema de soporte y es el corpus más limpio para
// un agente de IA). Sitio ESTÁTICO: sin servidor ni base de datos que parchear.
const estructura = require('./estructura.json');

const config = {
  title: 'Ayuda · Tax Certeza',
  tagline: 'Documentación para contadores y despachos',
  favicon: 'img/favicon.ico',
  url: 'https://taxcerteza.mx',
  baseUrl: '/ayuda/',
  // Cada página se sirve como carpeta (/ayuda/x/ con 200; /ayuda/x hace 301). Con barra final, el canonical,
  // el sitemap y los enlaces internos apuntan a la URL que responde 200 y no a una redirección (pauta 2026-10-21:
  // Google tenía 1 página de la ayuda indexada). Lo vigila .herramientas/pruebas/canonicas.test.js en la CI web.
  trailingSlash: true,
  onBrokenLinks: 'throw',          // un enlace roto NO se publica en silencio
  baseUrlIssueBanner: false,       // su script en línea lo bloquea la CSP del sitio
  markdown: { hooks: { onBrokenMarkdownLinks: 'warn' } },   // ubicación v4+
  i18n: { defaultLocale: 'es', locales: ['es'] },
  // Búsqueda LOCAL: el índice se genera al construir y viaja con el sitio. Nada
  // de servicios de terceros: el sitio publicado tiene CSP de mismo origen.
  themes: [
    [require.resolve('@easyops-cn/docusaurus-search-local'), {
      hashed: true,
      language: ['es'],
      indexBlog: false,
      docsRouteBasePath: '/',
      explicitSearchResultPath: true,
    }],
  ],
  presets: [
    ['classic', {
      docs: {
        routeBasePath: '/',
        sidebarPath: './sidebars.js',
      },
      blog: false,
      theme: { customCss: './src/css/custom.css' },
      // La página de resultados del buscador no va al sitemap (y lleva noindex, ver
      // tools/sitio_sin_script_en_linea.py::NO_INDEXAR): búsqueda interna fuera del índice.
      sitemap: { ignorePatterns: ['/ayuda/search/**'] },
    }],
  ],
  themeConfig: {
    navbar: {
      title: '',
      // la marca lleva al sitio principal (June 2026-10-15: la ayuda no tenia
      // vuelta a taxcerteza.mx); el inicio de la ayuda sigue en la miga de pan
      logo: { alt: 'Tax Certeza', src: 'img/logo-tax-certeza.svg', href: 'https://taxcerteza.mx/', target: '_self' },
      // Una pestaña por sección, en el orden de ayuda/estructura.json (la misma
      // fuente que genera las barras laterales: no pueden divergir).
      items: [
        ...estructura.secciones.map((s) => ({
          type: 'docSidebar', sidebarId: s.id, position: 'left', label: s.pestana || s.titulo })),
        // Las leyes que usan los cálculos (compilación legal). June 2026-10-21: estaba publicada y solo
        // se llegaba por el pie; el candado de huérfanas del sitio impide que vuelva a pasar.
        { type: 'docSidebar', sidebarId: 'leyes', position: 'left', label: 'Leyes' },
      ],
    },
    footer: {
      style: 'light',
      links: [
        { label: 'Todas las explicaciones de cálculo', to: '/calculos' },
        { label: 'Leyes y textos oficiales', to: '/leyes' },
        { label: 'Qué responde esta ayuda', to: '/alcance' },
        { label: 'taxcerteza.mx', href: 'https://taxcerteza.mx/' },
      ],
      // iconos de redes: el MISMO fragmento que el sitio, las herramientas y el blog
      // (E:/tmp/kb_ayuda/redes/hacer_fragmento.py, Simple Icons CC0)
      copyright: `<div class="redes" role="list" aria-label="Tax Certeza en redes sociales"><span role="listitem"><a href="https://www.facebook.com/profile.php?id=61595089575092" target="_blank" rel="noopener" aria-label="Tax Certeza en Facebook" title="Tax Certeza en Facebook"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg></a></span><span role="listitem"><a href="https://x.com/TaxCerteza" target="_blank" rel="noopener" aria-label="Tax Certeza en X" title="Tax Certeza en X"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></a></span><span role="listitem"><a href="https://www.youtube.com/@TaxCerteza" target="_blank" rel="noopener" aria-label="Tax Certeza en YouTube" title="Tax Certeza en YouTube"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a></span></div>© ${new Date().getFullYear()} Tax Certeza`,
    },
  },
};
module.exports = config;
