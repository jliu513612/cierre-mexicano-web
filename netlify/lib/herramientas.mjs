// Las herramientas de /herramientas/ cuyos usos se cuentan. UNA lista para el servidor; las pruebas exigen que coincida
// con las carpetas que hay en disco y con la de opinion.js (una herramienta nueva sin su evento sale roja en CI).
export const HERRAMIENTAS = ['validar-rfc', 'valor-uma', 'complemento-de-pago', 'verificar-factura', 'lista-69b',
  'factura-con-retenciones', 'calendario-dia-17', 'iva-del-mes', 'tipo-de-cambio'];

// El nombre que la persona ve de cada una (el titulo corto de su plantilla; la prueba exige que coincidan). Lo usa el
// texto que se prellena en WhatsApp para decir de que pagina viene.
export const NOMBRES = {
  'validar-rfc': 'Validador de RFC',
  'valor-uma': 'Valor de la UMA y conversor',
  'complemento-de-pago': 'Calculadora de la fecha límite del complemento de pago (REP)',
  'verificar-factura': 'Verificar factura (CFDI)',
  'lista-69b': 'Consulta de la lista 69-B (EFOS)',
  'factura-con-retenciones': 'Factura con retenciones',
  'calendario-dia-17': 'Calendario del día 17',
  'iva-del-mes': 'IVA del mes',
  'tipo-de-cambio': 'Tipo de cambio para efectos fiscales',
};
