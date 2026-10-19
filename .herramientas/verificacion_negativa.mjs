// Verificacion en negativo: rompe la logica de una en una y comprueba que las pruebas se ponen ROJAS.
// Uso: node .herramientas/verificacion_negativa.mjs
// Cada sabotaje se aplica sobre una COPIA de respaldo del archivo, que se restaura siempre (tambien si algo falla),
// y al final se comprueba que todo vuelve a estar verde y byte a byte igual que antes.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const H = p => path.join(RAIZ, 'herramientas', p);
const SABOTAJES = [
  // --- RFC: los modos de fallo del algoritmo, no un ejemplo comodo
  ['rfc: el orden de la tabla de valores (& despues de la O)', H('validar-rfc/rfc.js'), 'LMN&OPQ', 'LMNO&PQ'],
  ['rfc: los factores empiezan en 12 en vez de 13', H('validar-rfc/rfc.js'), 'suma += valor * (13 - i);', 'suma += valor * (12 - i);'],
  ['rfc: el resultado 10 ya no da la letra A', H('validar-rfc/rfc.js'), "=== 10 ? 'A' :", "=== 10 ? '0' :"],
  ['rfc: el residuo 0 ya no da el digito 0', H('validar-rfc/rfc.js'), "if (resto === 0) return '0';", "if (resto === 0) return '1';"],
  ['rfc: la persona moral se rellena con 0 en vez de espacio', H('validar-rfc/rfc.js'), "cuerpo = ' ' + cuerpo;", "cuerpo = '0' + cuerpo;"],
  ['rfc: se acepta el 29 de febrero de cualquier ano', H('validar-rfc/rfc.js'), 'if (mm === 2 && dd === 29 && aa % 4 !== 0) return false;', ''],
  ['rfc: se acepta cualquier dia del 1 al 31 en todos los meses', H('validar-rfc/rfc.js'), 'dd > DIAS_MES[mm - 1]', 'dd > 31'],
  ['rfc: la persona fisica deja de aceptar la Ñ', H('validar-rfc/rfc.js'), 'var RE_FISICA = /^[A-ZÑ&]{4}', 'var RE_FISICA = /^[A-Z&]{4}'],
  ['rfc: la persona moral acepta 2 letras', H('validar-rfc/rfc.js'), 'var RE_MORAL = /^[A-ZÑ&]{3}', 'var RE_MORAL = /^[A-ZÑ&]{2,3}'],
  ['rfc: la clave generica nacional deja de reconocerse', H('validar-rfc/rfc.js'), "var GENERICO_NACIONAL = 'XAXX010101000';", "var GENERICO_NACIONAL = 'XAXX010101001';"],
  ['rfc: ya no se quitan los guiones', H('validar-rfc/rfc.js'), ".replace(/-/g, '')", ''],
  ['rfc: el digito que no coincide pasa por correcto', H('validar-rfc/rfc.js'), "r.resultado = 'DIGITO_NO_COINCIDE';", "r.resultado = 'CORRECTO';"],
  // --- UMA
  ['uma: el ultimo dia de vigencia (31 de enero) queda fuera', H('valor-uma/uma.js'), 'fecha <= valores[i].hasta', 'fecha < valores[i].hasta'],
  ['uma: el primer dia de vigencia (1 de febrero) queda fuera', H('valor-uma/uma.js'), 'fecha >= valores[i].desde', 'fecha > valores[i].desde'],
  ['uma: se trunca en vez de redondear', H('valor-uma/uma.js'), 'return (a * 2n + b) / (b * 2n);', 'return a / b;'],
  ['uma: antes del primer valor ya no dice ANTERIOR_A_TABLA', H('valor-uma/uma.js'), 'if (fecha < primero.desde)', 'if (false)'],
  ['uma: despues del ultimo valor se da el ultimo como vigente', H('valor-uma/uma.js'), "if (fecha > ultimo.hasta) return { estado: 'SIN_CONFIRMAR', valor: null, ultimo: ultimo };", "if (fecha > ultimo.hasta) return { estado: 'VIGENTE', valor: ultimo };"],
  ['uma: pesos a veces con la escala equivocada', H('valor-uma/uma.js'), 'q * 100n * 10000n', 'q * 100n * 1000n'],
  ['uma: se acepta la coma como decimal', H('valor-uma/uma.js'), 'var RE_CANTIDAD = /^\\d{1,12}(\\.\\d{1,6})?$/;', 'var RE_CANTIDAD = /^\\d{1,12}([.,]\\d{1,6})?$/;'],
  ['uma: enero ya no avisa de que viene un valor nuevo', H('valor-uma/uma.js'), "return 'ENERO';", "return 'AL_DIA';"],
  ['uma: un numero cambiado a mano en los datos publicados', H('valor-uma/uma-datos.js'), '"diario": "117.31"', '"diario": "117.13"'],
  ['uma: un numero cambiado a mano en el texto de la pagina', H('valor-uma/index.html'), '<div class="cifra"><small>Diario</small><b>$117.31</b></div>', '<div class="cifra"><small>Diario</small><b>$117.13</b></div>', true],
  // --- REP
  ['rep: dia 10 en vez de dia 5 (la regla vieja)', H('complemento-de-pago/rep.js'), 'aIso(f.a, f.m + 1, 5)', 'aIso(f.a, f.m + 1, 10)'],
  ['rep: diciembre no cambia de ano', H('complemento-de-pago/rep.js'), 'aIso(f.a + 1, 1, 5)', 'aIso(f.a, 1, 5)'],
  ['rep: el dia del limite cuenta como vencido', H('complemento-de-pago/rep.js'), "dias < 0 ? 'VENCIDO'", "dias <= 0 ? 'VENCIDO'"],
  ['rep: urgente con 5 dias en vez de 3', H('complemento-de-pago/rep.js'), "dias <= 3 ? 'URGENTE'", "dias <= 5 ? 'URGENTE'"],
  ['rep: se aceptan fechas que no existen', H('complemento-de-pago/rep.js'), 'if (f.getUTCFullYear() !== a || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;', ''],
  ['rep: se calculan pagos de cualquier ejercicio', H('complemento-de-pago/rep.js'), 'if (f.a !== EJERCICIO_DE_LA_REGLA) return', 'if (false) return'],
  ['rep: el metodo distingue mayusculas', H('complemento-de-pago/rep.js'), ".toUpperCase() === 'PPD'", " === 'PPD'"],
  ['rep: la PUE no cobrada al cierre sale como que no lleva nada', H('complemento-de-pago/rep.js'), "return { resultado: 'SUSTITUIR'", "return { resultado: 'NO'"],
  ['rep: la PUE con forma 99 recibe veredicto', H('complemento-de-pago/rep.js'), "if (forma === '99') return { resultado: 'NO_CUBIERTO', fundamento: [], avisos: ['PUE_CON_99'] };", ''],
  ['rep: el aviso de forma no evaluada desaparece', H('complemento-de-pago/rep.js'), "avisos: forma === '99' ? [] : ['FORMA_NO_EVALUADA']", 'avisos: []'],
  ['rep: el aviso de dia no computable desaparece', H('complemento-de-pago/rep.js'), 'limiteNoComputable: diaNoComputable(limite) };', 'limiteNoComputable: null };'],
  ['rep: el 5 de mayo deja de contar como festivo', H('complemento-de-pago/rep.js'), 'md === 505 || ', ''],
  ['rep: el aviso RECORRE la fecha en vez de solo avisar', H('complemento-de-pago/rep.js'), "return f.m === 12 ? aIso(f.a + 1, 1, 5) : aIso(f.a, f.m + 1, 5);", "var l = f.m === 12 ? aIso(f.a + 1, 1, 5) : aIso(f.a, f.m + 1, 5); return diaNoComputable(l) === 'DOMINGO' ? l.slice(0, 8) + '06' : l;"],
  // --- Selector de archivos en español
  ['selector: el estado vuelve a depender del idioma del navegador', H('selector-archivos.js'), "n + ' archivos seleccionados'", "n + ' files selected'", 'nav'],
  ['selector: el input nativo vuelve a verse (la regla deja de aplicarse)', H('herramientas.css'), '.oculto-accesible{position:absolute;', '.oculto-x{position:absolute;', 'nav'],
  // --- Factura con retenciones
  ['ret: 2/3 exacto en vez del 0.666667 del programa', H('factura-con-retenciones/retenciones-datos.js'), '"ret_iva_pf_pct_del_iva": "66.6667"', '"ret_iva_pf_pct_del_iva": "66.6666666667"'],
  ['ret: redondeo medio hacia arriba en vez de medio al par', H('factura-con-retenciones/retenciones.js'), "if (r * 2n > d || (r * 2n === d && q % 2n === 1n)) q += 1n;", "if (r * 2n >= d) q += 1n;"],
  ['ret: el 1.25 % sin regimen 626 declarado', H('factura-con-retenciones/retenciones.js'), "var esResico = p.regimen === '626';", "var esResico = p.regimen !== 'otro';"],
  ['ret: la base sale del subtotal y no del IVA', H('factura-con-retenciones/retenciones.js'), 'var base = divPar(iva * IVA[1], IVA[0]);', 'var base = sub;'],
  ['ret: una persona fisica que paga tambien retiene', H('factura-con-retenciones/retenciones.js'), "if (p.receptor !== 'PM') { r.estado = 'NO_APLICA_RECEPTOR_PF'; r.neto = texto(sub + iva); return r; }", ''],
  ['ret: el IVA deja de rellenarse en la pagina', H('factura-con-retenciones/pagina.js'), "iva.value = v === null ? '' : miles(v);", '', 'nav'],
  // --- Lista 69-B
  ['69b: el listado responde a nombres heredados de JavaScript', H('lista-69b/lista69b.js'), "(datos && datos.r && Object.prototype.hasOwnProperty.call(datos.r, rfc)) ? datos.r[rfc] : []", "(datos && datos.r && datos.r[rfc]) || []"],
  ['69b: el fallo de actualizacion no se dice', H('lista-69b/lista69b.js'), "return datos.estado === 'NO_SE_PUDO_ACTUALIZAR' ? 'NO_SE_PUDO_ACTUALIZAR' : 'ACTUALIZADO';", "return 'ACTUALIZADO';", 'nav'],
  ['69b: sin fecha tambien responde', H('lista-69b/lista69b.js'), "!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(datos.fecha_info || '')) || ", ''],
  ['69b: los RFC repetidos se consultan dos veces', H('lista-69b/lista69b.js'), "if (!vistos[t]) { vistos[t] = true; validos.push(t); }", 'validos.push(t);'],
  ['69b: la pagina envia los RFC (las pruebas de node no pueden verlo)', H('lista-69b/pagina.js'), "res.className = 'res'; res.textContent = 'Cargando el listado…';", "res.className = 'res'; res.textContent = 'Cargando el listado…'; try { fetch('/', { method: 'POST', body: leidos.validos.join(',') }); } catch (e) {}", 'nav'],
  ['69b: la cabecera deja de decir la fecha del listado', H('lista-69b/pagina.js'), "'Listado completo del SAT con información al ' + larga(datos.fecha_info) + '. '", "'Listado completo del SAT. '", 'nav'],
  ['69b: el generador acepta una situacion desconocida', path.join(RAIZ, '.herramientas', 'lista69b.py'), "raras.add(f[i_sit].strip())", "pass"],
  ['69b: el generador acepta una fecha mas vieja que la publicada', path.join(RAIZ, '.herramientas', 'lista69b.py'), "if previo.get('fecha_info') and fecha_info < previo['fecha_info']:", "if False:"],
  // --- Verificar factura
  ['cfdi: fe con los PRIMEROS 8 caracteres del sello', H('verificar-factura/cfdi.js'), 'fe: at.Sello.slice(-8)', 'fe: at.Sello.slice(0, 8)'],
  ['cfdi: total con 2 decimales en vez de 6', H('verificar-factura/cfdi.js'), "while (dec.length < 6) dec += '0';", "while (dec.length < 2) dec += '0';"],
  ['cfdi: el RFC va sin codificar en el enlace', H('verificar-factura/cfdi.js'), "'&rr=' + encodeURIComponent(p.rfcReceptor)", "'&rr=' + p.rfcReceptor"],
  ['cfdi: sin timbre pasa por completo', H('verificar-factura/cfdi.js'), "if (!tfd) r.faltan.push('timbre fiscal digital (UUID)');", ''],
  ['cfdi: el lector acepta cierres que no corresponden', H('verificar-factura/cfdi.js'), "if (!abierto || abierto.nombre !== cierra) throw", "if (!abierto) throw"],
  ['cfdi: la pagina sube los XML (las pruebas de node no pueden verlo)', H('verificar-factura/pagina.js'), "return leerTexto(f).then(function (t) {", "return leerTexto(f).then(function (t) { try { fetch('/', { method: 'POST', body: t }); } catch (e) {}", 'nav'],
  // --- Opinion sobre el resultado. La marca 'nav' corre ademas la prueba en el navegador (lo que SALE por la red).
  ['opinion: el RFC escrito en el motivo ya no se quita', H('opinion.js'), "motivo: d.voto === 'NO' ? limpiarMotivo(d.motivo) : ''", "motivo: d.voto === 'NO' ? String(d.motivo || '') : ''", 'nav'],
  ['opinion: el envio anade lo tecleado en la pagina (las pruebas de node no pueden verlo)', H('opinion.js'), "body: e.cuerpo })", "body: e.cuerpo + '&tecleado=' + encodeURIComponent((doc.querySelector('main input') || {}).value || '') })", 'nav'],
  ['opinion: la pagina pasa el RFC normalizado en vez de la clase', H('validar-rfc/pagina.js'), 'opinion(r.resultado);', 'opinion(r.rfc);', 'nav'],
  ['opinion: un fallo del servidor se da por bueno', H('opinion.js'), "alTerminar(r && r.ok ? 'OK' : 'FALLO');", "alTerminar('OK');", 'nav'],
  ['opinion: la pagina ya no comprueba que opinion.js haya cargado', H('validar-rfc/pagina.js'), "if (clase !== 'VACIO' && window.TCOpinion)", "if (clase !== 'VACIO')", 'nav'],
  ['opinion: el campo trampa deja de mirarse', H('opinion.js'), "if (d.trampa) return { ok: false, motivo: 'TRAMPA' };", '', 'nav'],
  ['opinion: sin tope de envios', H('opinion.js'), "if (envios >= MAX_ENVIOS) { alTerminar('TOPE'); return; }", '', 'nav'],
  ['opinion: se acepta cualquier texto como clase', H('opinion.js'), 'if (!RE_CLASE.test(String(d.clase)))', 'if (false)'],
  ['opinion: el voto positivo arrastra motivo y correo', H('opinion.js'), "correo: d.voto === 'NO' ? correo : ''", 'correo: correo'],
  ['opinion: el formulario estatico pierde un campo', path.join(RAIZ, '.herramientas', 'construir.py'), '<input type="hidden" name="motivo">', ''],
];

function pruebas(nav) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '.herramientas/pruebas/*.test.js'], { cwd: RAIZ, encoding: 'utf8' });
  const rojas = [...r.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
  const total = (r.stdout.match(/^(not )?ok \d+ - /gm) || []).length;
  // El segundo candado: lo publicado tiene que ser exactamente lo que sale de las plantillas y los datos.
  const c = spawnSync(process.env.PYTHON || 'python', ['-X', 'utf8', '.herramientas/construir.py', '--comprobar'], { cwd: RAIZ, encoding: 'utf8' });
  if (c.status !== 0) rojas.push('construir.py --comprobar: ' + ((c.stdout || '').match(/^DISTINTO .+$/gm) || ['no se pudo ejecutar']).join(', '));
  // El tercero: las validaciones del generador del listado 69-B (Python).
  const l = spawnSync(process.env.PYTHON || 'python', ['-X', 'utf8', '.herramientas/pruebas/test_lista69b.py'], { cwd: RAIZ, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' }) });
  if (l.status !== 0) rojas.push('test_lista69b.py: ' + String(l.stderr || l.stdout).trim().split('\n').pop());
  let n = { status: 0 };
  if (nav) {
    n = spawnSync(process.execPath, ['.herramientas/prueba_navegador.mjs'], { cwd: RAIZ, encoding: 'utf8', timeout: 120000 });
    for (const m of (n.stdout || '').matchAll(/^  FALLA (.+)$/gm)) rojas.push('navegador: ' + m[1]);
    if (n.status !== 0 && !/FALLA/.test(n.stdout || '')) rojas.push('navegador: la prueba no termino (' + String(n.stderr || n.error || n.status).slice(0, 200) + ')');
  }
  return { rojas, total, codigo: r.status || c.status || n.status };
}

const base = pruebas(true);
if (base.codigo !== 0 || base.rojas.length || base.total < 20) {
  console.error('ANTES de sabotear las pruebas tienen que estar verdes:', base);
  process.exit(2);
}
console.log(`punto de partida: ${base.total} pruebas, todas verdes\n`);
const dirCopia = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-negativa-'));
let mal = 0;
SABOTAJES.forEach(([nombre, archivo, viejo, nuevo, marca], i) => {
  const copia = path.join(dirCopia, `${i}-${path.basename(archivo)}`);
  fs.copyFileSync(archivo, copia);
  const original = fs.readFileSync(archivo, 'utf8');
  let r;
  try {
    const veces = original.split(viejo).length - 1;
    if (veces !== 1) throw new Error(`el patron aparece ${veces} veces (esperaba 1): ${viejo}`);
    fs.writeFileSync(archivo, original.replace(viejo, nuevo));
    if (fs.readFileSync(archivo, 'utf8') === original) throw new Error('el sabotaje no cambio el archivo');
    r = pruebas(marca === 'nav');
  } finally {
    fs.copyFileSync(copia, archivo);  // se restaura SIEMPRE desde la copia
  }
  if (fs.readFileSync(archivo, 'utf8') !== original) throw new Error(`no se pudo restaurar ${archivo}`);
  const bien = r.rojas.length > 0;
  mal += !bien;
  console.log(`${bien ? 'ROJO  ' : 'VERDE!'} ${nombre}`);
  for (const t of r.rojas) console.log(`         - ${t}`);
  if (!bien) console.log('         ningun test lo vio: ESTE SABOTAJE PASA SIN SER DETECTADO');
});
fs.rmSync(dirCopia, { recursive: true, force: true });
const fin = pruebas(true);
console.log(`\nrestaurado: ${fin.total} pruebas, ${fin.rojas.length} rojas`);
console.log(`${SABOTAJES.length} sabotajes, ${SABOTAJES.length - mal} detectados, ${mal} sin detectar`);
process.exit(mal || fin.rojas.length || fin.codigo ? 1 : 0);
