// Lo que baja /descargar. Se actualiza en cada version, en el MISMO cambio que el texto de #descargar de index.html.
// La URL nunca sale de la peticion: solo de aqui (no hay redireccion abierta).
export default {
  predeterminado: 'windows',
  archivos: {
    windows: {
      version: '1.0.49',
      url: 'https://github.com/jliu513612/taxcerteza-releases/releases/download/v1.0.49/TaxCerteza_1.0.49.zip',
    },
  },
};
