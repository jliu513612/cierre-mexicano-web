// Lo que baja /descargar. Se actualiza en cada version, en el MISMO cambio que el texto de #descargar de index.html.
// La URL nunca sale de la peticion: solo de aqui (no hay redireccion abierta).
export default {
  predeterminado: 'windows',
  archivos: {
    windows: {
      version: '1.0.50',
      url: 'https://github.com/jliu513612/taxcerteza-releases/releases/download/v1.0.50/TaxCerteza_1.0.50.zip',
    },
  },
  // La ACTUALIZACION EN UN CLIC del programa: /descargar/actualizacion/<version> (el url_zip del version.json firmado,
  // desde 1.0.50). Lista CERRADA por version: una version que no esta aqui da 404, y el programa cae a la descarga
  // manual. Se AÑADE la version nueva en el MISMO cambio que publica su version.json; las anteriores se quedan, porque
  // un manifiesto firmado de la version N siempre lleva a la N.
  actualizaciones: {
    '1.0.49': 'https://github.com/jliu513612/taxcerteza-releases/releases/download/v1.0.49/TaxCerteza_1.0.49.zip',
    '1.0.50': 'https://github.com/jliu513612/taxcerteza-releases/releases/download/v1.0.50/TaxCerteza_1.0.50.zip',
  },
};
