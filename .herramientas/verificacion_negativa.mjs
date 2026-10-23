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
  ['rep: vuelve la lista propia del 1 de diciembre (2024, 2030, 2036)', H('complemento-de-pago/rep.js'), '    var m = cal.motivo(iso);', "    var m = cal.motivo(iso) || (iso.slice(5) === '12-01' && (+iso.slice(0, 4) - 2024) % 6 === 0 ? 'TRANSMISION' : null);"],
  ['rep: el aviso de dia no computable desaparece', H('complemento-de-pago/rep.js'), 'limiteNoComputable: diaNoComputable(limite) };', 'limiteNoComputable: null };'],
  ['rep: el 5 de mayo deja de contar como festivo', H('complemento-de-pago/rep.js'), "return m === null ? null : (m === 'SABADO'", "return m === null || m === 'CINCO_DE_MAYO' ? null : (m === 'SABADO'"],
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
  // --- Calendario del dia 17
  ['cal: el 1 de diciembre de transmision sin el tope de 2018', H('calendario-dia-17/calendario.js'), "if (md === 1201 && f.a <= HASTA && f.a % 6 === HASTA % 6) return 'TRANSMISION';", "if (md === 1201 && f.a % 6 === HASTA % 6) return 'TRANSMISION';"],
  ['cal: tercer lunes de febrero en vez del primero', H('calendario-dia-17/calendario.js'), "if (f.m === 2 && f.d === nLunes(f.a, 2, 1)) return 'CONSTITUCION';", "if (f.m === 2 && f.d === nLunes(f.a, 2, 3)) return 'CONSTITUCION';"],
  ['cal: sin el 5 de mayo (lista de la LFT, no del CFF)', H('calendario-dia-17/calendario.js'), "if (md === 505) return 'CINCO_DE_MAYO';", ''],
  ['cal: la facilidad sin un si explicito', H('calendario-dia-17/calendario.js'), 'return iso(prorroga === true ? masHabiles(base, diasExtraRfc(rfc)) : base);', 'return iso(prorroga ? masHabiles(base, diasExtraRfc(rfc)) : base);'],
  ['cal: la facilidad tambien a la DIOT', H('calendario-dia-17/calendario.js'), "if (obligacion === 'DIOT') return iso(recorrer(ultimoDia(s.a, s.m)));", "if (obligacion === 'DIOT') return iso(prorroga === true ? masHabiles(recorrer(ultimoDia(s.a, s.m)), diasExtraRfc(rfc)) : recorrer(ultimoDia(s.a, s.m)));"],
  ['cal: sexto caracter en vez de sexto digito', H('calendario-dia-17/calendario.js'), 'return dig.length < 6 ? 0 : datos.dias_por_digito[dig.charAt(5)];', 'return dig.length < 6 ? 0 : (datos.dias_por_digito[String(rfc).charAt(5)] || 0);'],
  ['cal: los dias de la facilidad contados naturales', H('calendario-dia-17/calendario.js'), 'while (k > 0) { n += 1; if (!motivo(deDias(n))) k -= 1; }', 'while (k > 0) { n += 1; k -= 1; }'],
  ['cal: se ofrece un ano sin medir', H('calendario-dia-17/calendario-datos.js'), '"anios": [', '"anios": [ 2028,'],
  ['cal: el dia inhabil en fin de semana se nombra por el dia de la semana', H('calendario-dia-17/pagina.js'), 'INHABIL[cal.festivo(f)]', 'INHABIL[cal.motivo(f)]', 'nav'],
  ['cal: el aviso de la facilidad sale sin RFC', H('calendario-dia-17/pagina.js'), '} else if (r.conRfc) {', '} else if (true) {', 'nav'],
  ['cal: la facilidad deja de remitir al contador', H('calendario-dia-17/pagina.js'), 'Revisa con tu contador si te aplica. La DIOT no cambia.', 'La DIOT no cambia.', 'nav'],
  ['descargas: los unicos se encienden sin aviso de privacidad', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), 'export const UNICOS_ACTIVOS = false;', 'export const UNICOS_ACTIVOS = true;'],
  ['descargas: el evento guarda la IP', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "metodo: metodo || 'GET', bot: esBot(ua, metodo), interno: !!interno };", "metodo: metodo || 'GET', bot: esBot(ua, metodo), interno: !!interno, ip };"],
  // --- Usos de las herramientas
  ['usos: el envio lleva un dato del usuario', H('uso.js'), '    var c = { herramienta: String(herramienta) };', "    var c = { herramienta: String(herramienta), pagina: (typeof document !== 'undefined' && document.querySelector('input')) ? document.querySelector('input').value : 'x' };", 'nav'],
  ['usos: el servidor guarda lo que llega aparte de herramienta y n', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "  const e = { tipo: 'uso', ts, contexto, herramienta: c.herramienta, n, pais: pais || null, bot: esBot(ua, metodo), interno: !!interno };", "  const e = Object.assign({}, c, { tipo: 'uso', ts, contexto, herramienta: c.herramienta, n, pais: pais || null, bot: esBot(ua, metodo), interno: !!interno });"],
  ['usos: una herramienta sin su evento', H('factura-con-retenciones/pagina.js'), "    if (window.TCUso) window.TCUso.registrar('factura-con-retenciones');\n", '', 'nav'],
  ['usos: doble conteo (sin dedupe)', H('uso.js'), '    if (antes !== undefined && ahora - antes < VENTANA_MS) return false;\n', '', 'nav'],
  ['usos: el servidor no conoce una herramienta publicada', path.join(RAIZ, 'netlify', 'lib', 'herramientas.mjs'), "'iva-del-mes', 'tipo-de-cambio'];", "'iva-del-mes'];"],
  // --- Tipo de cambio
  ['tc: la publicacion que aplica es la del mismo dia (C en vez de C-1)', H('tipo-de-cambio/tc.js'), 'var pub = habilOAnterior(c - 1); exigir(pub, c - 1); return pub;', 'var pub = habilOAnterior(c); exigir(pub, c); return pub;'],
  ['tc: lo determinado es la publicacion misma (un dia habil de menos)', H('tipo-de-cambio/tc.js'), 'var pub = publicacionQueAplica(c), det = habilAnterior(pub);', 'var pub = publicacionQueAplica(c), det = pub;'],
  ['tc: sabado y domingo cuentan como habiles', H('tipo-de-cambio/tc.js'), '      if (s === 0 || s === 6) return false;\n', ''],
  ['tc: un ano sin calendario de la CNBV se responde igual (falla abierto)', H('tipo-de-cambio/tc.js'), '      if (!cal[a]) throw new NoCubierto([+a]);', '      if (!cal[a]) cal[a] = {};'],
  ['tc: sin dato se da un valor', H('tipo-de-cambio/tc.js'), "        else if (!serie || !Object.prototype.hasOwnProperty.call(serie, det)) b.motivo = 'SIN_DATO';\n", '', 'nav'],
  ['tc: un inhabil de la CNBV cambiado a mano en los datos publicados', H('tipo-de-cambio/tipo-cambio-datos.js'), '"2026-09-16"', '"2026-09-15"'],
  ['tc: el cotejo deja de mirar la columna para solventar obligaciones', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '    if (!igual(serie[det], r.obligaciones)) {', '    if (false) {'],
  ['tc: el cotejo deja de mirar si el dia es habil', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '    if (habil !== (r.determinacion !== null)) {', '    if (false) {'],
  ['tc: el cotejo acepta una tabla oficial corta', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '  if (filas.length < minimo) dif.push(', '  if (false) dif.push('],
  ['tc: una respuesta del SIE sin serie declarada pasa', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '  if (id !== SERIE) throw', '  if (id && id !== SERIE) throw'],
  ['tc: se publica una serie con el cotejo fallido', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), "  if (!cotejo.ok) throw new Error('no se publica una serie cuyo cotejo con la tabla oficial fallo');\n", ''],
  ['tc: la pagina usa datos sin cotejo en verde', H('tipo-de-cambio/pagina.js'), ' || !j.cotejo || j.cotejo.ok !== true)', ')', 'nav'],
  ['tc: la pagina deja de decir la regla de la moneda adquirida', H('tipo-de-cambio/pagina.js'), "    res.appendChild(el('p', 'aviso', 'Si la moneda se adquirió, el artículo 20 del Código Fiscal toma el tipo de cambio al que se adquirió y no este. Revisa con tu contador cuál aplica a tu operación.'));\n", '', 'nav'],
    ['tc: la pagina no avisa de datos atrasados', H('tipo-de-cambio/pagina.js'), '    } else if (!(j.ultimo_dato >= esperado)) {', '    } else if (false) {', 'nav'],
  ['tc: un dato que falta y ya existe se presenta como futuro', H('tipo-de-cambio/tc.js'), "      return esperado !== 'NO_CUBIERTO' && ob.determinado > esperado ? 'AUN_SIN_PUBLICAR' : 'NO_AL_DIA';", "      return 'AUN_SIN_PUBLICAR';", 'nav'],
  ['tc: el dato esperado ignora la hora de publicacion', H('tipo-de-cambio/tc.js'), '      if (h && mx.getUTCHours() >= HORA_ESPERADA) return hoy;', '      if (h) return hoy;'],
  ['tc: un intento fallido pisa los datos publicados', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio-servidor.mjs'), "    if (r.ok) await store.set('fix.json', JSON.stringify(r.datos) + '\\n');", "    await store.set('fix.json', JSON.stringify(r.datos || null) + '\\n');"],
  ['tc: la vigilancia no mira la frescura', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '  else if (!(pub.ultimo_dato >= esperado)) problemas.push(', '  else if (false) problemas.push('],
  ['tc: la actualizacion publica aunque el cotejo falle', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio.mjs'), '    if (!c.ok) return { ok: false, texto: `el cotejo', '    if (false) return { ok: false, texto: `el cotejo'],
  ['tc: la pagina no cuenta su uso', H('tipo-de-cambio/pagina.js'), "      if (window.TCUso) window.TCUso.registrar('tipo-de-cambio');\n      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'tipo-de-cambio', clase);", "      if (window.TCOpinion) window.TCOpinion.mostrar(res, 'tipo-de-cambio', clase);", 'nav'],
  ['tc: la primera carga desde una visita no tiene limite de intentos', path.join(RAIZ, 'netlify', 'lib', 'tipo-cambio-servidor.mjs'), "  if (origen !== 'programada' && antes", "  if (origen === 'a mano' && antes"],
  // --- Pasos del embudo (clics por destino y pagina de origen)
  ['embudo: el origen se atribuye aunque el Referer sea de otro sitio', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "  if (!host || u.host !== host) return 'sin_origen';\n", ''],
  ['embudo: un destino fuera de la tabla pasa (redireccion abierta)', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "  if (typeof d !== 'string' || !Object.prototype.hasOwnProperty.call(tabla, d)) return null;", "  if (typeof d !== 'string' || !(d in tabla)) return null;", 'nav'],
  ['embudo: el destino de la redireccion sale de la URL', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '  let location = tabla[ev.destino];', '  let location = ruta.slice(PREFIJO_IR.length);', 'nav'],
  ['embudo: los clics y los usos cuentan como descargas', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '  const dentro = todos.filter(e => !e.tipo);', "  const dentro = todos.filter(e => e.tipo !== 'uso');"],
  ['embudo: los bots entran en los clics reales', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '  const clicsReales = clics.filter(e => !e.bot && !e.interno);', '  const clicsReales = clics.filter(e => !e.interno);'],
  ['embudo: la descarga deja de guardar su pagina de origen', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "origen: origen || 'sin_origen', pais: pais || null, metodo:", 'pais: pais || null, metodo:'],
  ['embudo: una herramienta vuelve a enlazar Descargar sin contar', H('valor-uma/index.html'), 'href="/descargar/ir/descargar"', 'href="/#descargar"'],
  ['embudo: la plantilla vuelve a enlazar WhatsApp directo', path.join(RAIZ, '.herramientas', 'plantillas', 'base.html'), '<a href="/descargar/ir/whatsapp" rel="nofollow">', '<a href="https://wa.me/528125834137">', 'nav'],
  // --- Llamada a la accion despues del resultado
  ['cta: una herramienta con frase deja de mostrarla', H('valor-uma/pagina.js'), "    if (window.TCCta) window.TCCta.mostrar(res, 'valor-uma');\n", '', 'nav'],
  ['cta: una frase promete algo fuera de la vara', H('cta.js'), "'El programa trae la UMA, el salario mínimo, las tarifas y el subsidio con su fuente en el DOF y su vigencia.'", "'El programa trae gratis la UMA, el salario mínimo, las tarifas y el subsidio con su fuente en el DOF y su vigencia.'"],
  ['cta: el boton lleva directo, sin contar el clic', H('cta.js'), "    boton.href = '/descargar/ir/descargar';", "    boton.href = '/#descargar';", 'nav'],
  ['cta: el bloque se pone ANTES del resultado', H('cta.js'), '    caja.appendChild(b);', '    caja.insertBefore(b, caja.firstChild);', 'nav'],
  ['cta: una herramienta nueva sin decidir su frase', H('cta.js'), "    'valor-uma': ['Aquí convertiste veces UMA a pesos.',", "    'valor-umaX': ['Aquí convertiste veces UMA a pesos.',"],
  // --- WhatsApp con su pagina de origen, pie de fundamento y revision, hueco de condiciones
  ['whatsapp: el texto prellenado arrastra la URL de la pagina', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "  const texto = ev.destino === 'whatsapp' ? textoWhatsapp(ev.origen) : '';", "  const texto = ev.destino === 'whatsapp' ? textoWhatsapp(ev.origen) + ' ' + (referer || '') : '';"],
  ['whatsapp: deja de prellenar la pagina de origen', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "  if (texto) location += '?text=' + encodeURIComponent(texto);", "  if (false) location += '?text=' + encodeURIComponent(texto);", 'nav'],
  ['pie: una fecha de revision cambiada a mano en los datos', path.join(RAIZ, '.herramientas', 'datos', 'normas.json'), '"revisado": "2026-10-21"', '"revisado": "2026-10-20"'],
  ['pie: pierde el aviso de que no es un servicio del SAT', path.join(RAIZ, '.herramientas', 'construir.py'), "'    <p>Es una herramienta informativa, no un servicio oficial del SAT. Revisa con tu contador tu caso concreto.</p>\\n'", "'    <p>Es una herramienta informativa.</p>\\n'"],
  ['pie: una herramienta sin normas declaradas', path.join(RAIZ, '.herramientas', 'normas_por_herramienta.json'), '  "lista-69b": ["cff-69-b"],\n', ''],
  ['cta: las condiciones de la prueba prometen algo no medido', H('cta.js'), "Pruébalo 30 días gratis, sin registro. Tus datos", "Pruébalo 30 días gratis, sin registro y para siempre. Tus datos"],
  ['cta: el pie de una herramienta deja de decir la prueba', H('valor-uma/index.html'), 'Se prueba 30 días gratis y sin registro;', 'Se activa;'],
  // --- Bloque del tipo de cambio (solo dolares, solo con valor)
  ['cta tipo de cambio: el bloque sale tambien sin valor', H('tipo-de-cambio/pagina.js'), "      if (clase === 'TC_PARA_OBLIGACIONES' && window.TCCta) window.TCCta.mostrar(res, 'tipo-de-cambio');", "      if (window.TCCta) window.TCCta.mostrar(res, 'tipo-de-cambio');", 'nav'],
  ['cta tipo de cambio: promete otras monedas', H('cta.js'), 'tipo de cambio de las facturas en dólares de cada cliente', 'tipo de cambio de las facturas en moneda extranjera de cada cliente'],
  // --- Tipo de cambio: descarga de un rango
  ['rango: un dia sin dato se rellena con el ultimo valor', H('tipo-de-cambio/tc.js'), "valor: e === 'CON_VALOR' ? ob.valor : null, estado: e });", "valor: e === 'CON_VALOR' ? ob.valor : (j.valores[j.ultimo_dato] || null), estado: e });"],
  ['rango: vuelve a cortar los rangos largos', H('tipo-de-cambio/tc.js'), '      var invertido = b < a;\n', "      if (b - a + 1 > 366) return { ok: false, motivo: 'LARGO' };\n      var invertido = b < a;\n"],
  ['rango: las fechas al reves paran con un error', H('tipo-de-cambio/tc.js'), '      if (invertido) { var x = a; a = b; b = x; }', "      if (invertido) return { ok: false, motivo: 'ORDEN' };"],
  ['rango: el aviso de desde cuando hay datos no sale', H('tipo-de-cambio/pagina.js'), '      aviso.hidden = !fuera;', '      aviso.hidden = true;', 'nav'],
  ['rango: un dia que no existe en el mes deja de ajustarse', H('tipo-de-cambio/pagina.js'), 'ajustada = d > ultimo;', 'ajustada = false;', 'nav'],
  ['rango: el archivo sale sin BOM', H('tipo-de-cambio/pagina.js'), "new Blob(['\\ufeff' + tc.csv(r.filas)]", 'new Blob([tc.csv(r.filas)]', 'nav'],
  ['rango: el uso se cuenta con las fechas', H('tipo-de-cambio/pagina.js'), "window.TCUso.registrar('tipo-de-cambio', r.filas.length, 'descarga_rango');", "window.TCUso.registrar('tipo-de-cambio', r.filas.length, desde);", 'nav'],
  ['usos: el servidor acepta cualquier accion', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '  if (c.accion !== undefined && (ACCIONES[c.herramienta] || []).indexOf(c.accion) < 0) return null;\n', ''],
  // --- Descarga con URL firmada que caduca
  ['descargas: se entrega cualquier redireccion, no solo las firmadas de GitHub', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "    if (!u || u.protocol !== 'https:' || HOSTS_FIRMADOS.indexOf(u.host) < 0) {", '    if (!u) {'],
  ['descargas: un fallo al pedir la URL firmada bloquea la descarga', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '    return { url: d.url, temporal: false, motivo: `no se pudo pedir la URL firmada: ${e && e.name}` };', "    return { url: '', temporal: false, motivo: `no se pudo pedir la URL firmada: ${e && e.name}` };"],
  // --- Recursos locales de cada pagina
  ['recursos: el icono de la ayuda deja de servirse', path.join(RAIZ, '_redirects'), '/ayuda/img/favicon.ico  /favicon.ico  200', ''],
  // --- Contador de descargas
  ['descargas: la portada vuelve a enlazar directo a GitHub', path.join(RAIZ, 'index.html'), 'href="/descargar">Descargar para Windows</a>', 'href="https://github.com/jliu513612/taxcerteza-releases/releases/download/v1.0.47/TaxCerteza_1.0.47.zip">Descargar para Windows</a>'],
  ['descargas: la huella deja de cambiar cada mes', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), '[sal, mesDe(ts), String(ip', '[sal, String(ip'],
  ['descargas: lo interno cuenta como real', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), 'const esInterno = e => e.interno || (e.huella && nuestras.has(e.huella));', 'const esInterno = e => false;'],
  ['descargas: un HEAD cuenta como descarga', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), "if (metodo && metodo.toUpperCase() === 'HEAD') return true;", ''],
  ['descargas: el destino sale de la peticion', path.join(RAIZ, 'netlify', 'lib', 'descargas.mjs'), 'const clave = archivo && Object.prototype.hasOwnProperty.call(tabla.archivos, archivo) ? archivo : tabla.predeterminado;\n  const d = tabla.archivos[clave];', "const clave = archivo || tabla.predeterminado;\n  const d = tabla.archivos[clave] || { version: '?', url: archivo };"],
  // --- _redirects
  ['redirecciones: el 301 apunta a una pagina que no existe', path.join(RAIZ, '_redirects'), '/ayuda/banco-y-conciliacion/  301', '/ayuda/banco-y-conciliacion-vieja/  301'],
  ['redirecciones: el icono de la ayuda apunta a un fichero que no existe', path.join(RAIZ, '_redirects'), '/favicon.ico  200', '/img/favicon.ico  200'],
  // --- Sitemap de /herramientas/
  ['sitemap: falta una herramienta y nombra una que no existe', H('sitemap.xml'), '<loc>https://taxcerteza.mx/herramientas/iva-del-mes/</loc>', '<loc>https://taxcerteza.mx/herramientas/no-existe/</loc>'],
  ['sitemap: robots.txt no declara el de herramientas', path.join(RAIZ, 'robots.txt'), 'Sitemap: https://taxcerteza.mx/herramientas/sitemap.xml', 'Sitemap: https://taxcerteza.mx/otro/sitemap.xml'],
  ['sitemap: el blog nombra una herramienta que no existe', path.join(RAIZ, 'sitemap.xml'), '<loc>https://taxcerteza.mx/ayuda/</loc>', '<loc>https://taxcerteza.mx/herramientas/no-existe/</loc>'],
  ['sitemap: una pagina cambia y conserva su fecha', path.join(RAIZ, '.herramientas', 'construir.py'), 'fechas[ruta] = {"huella": huella, "fecha": antes["fecha"] if antes.get("huella") == huella else hoy}', 'fechas[ruta] = {"huella": huella, "fecha": antes.get("fecha") or hoy}'],
  ['sitemap: falta la ultima pagina de PAGINAS', path.join(RAIZ, '.herramientas', 'construir.py'), '        urls.append(f\'  <url><loc>{SITIO}{ruta}</loc><lastmod>', '        if nombre != "iva-del-mes": urls.append(f\'  <url><loc>{SITIO}{ruta}</loc><lastmod>'],
  // --- IVA del mes
  ['iva: lo retenido al proveedor no sale del acreditable (Q-17600)', H('iva-del-mes/iva.js'), 'acr = res(acr, sale);', 'acr = sum(acr, CERO);'],
  ['iva: una PPD emitida causa sin complemento de pago', H('iva-del-mes/iva.js'), 'pendCau.push(c.uuid);', 'cau16 = sum(cau16, c.iva);'],
  ['iva: un pago de un mes anterior suma', H('iva-del-mes/iva.js'), 'var otroMes = mesFp.length === 7 && !!periodo && mesFp < periodo;', 'var otroMes = false;'],
  ['iva: efectivo de 2,000 exactos ya excede', H('iva-del-mes/iva.js'), 'if (cmp(mul(m.total, f), UMBRAL_EFECTIVO) > 0) m.es_efectivo_sobre_2k = true;', 'if (cmp(mul(m.total, f), UMBRAL_EFECTIVO) >= 0) m.es_efectivo_sobre_2k = true;'],
  ['iva: el 69-B trata al presunto como definitivo', H('iva-del-mes/iva.js'), "if (String(status || '').trim().toLowerCase() !== 'definitivo') return 'deducible';", "if (String(status || '').trim().toLowerCase() === 'limpio') return 'deducible';"],
  ['iva: el 69-B elige la primera fila y no la peor', H('iva-del-mes/iva.js'), 'if ((PRIORIDAD[SIT[filas[i][0]]] || 0) > (PRIORIDAD[SIT[elegida[0]]] || 0)) elegida = filas[i];', ''],
  ['iva: el libro de pagos admite saldos que no cuadran', H('iva-del-mes/iva.js'), 'if (leidoP && leidoA && leidoI && cmp(', 'if (false && leidoP && leidoA && leidoI && cmp('],
  ['iva: el pago en divisa no se lleva a pesos', H('iva-del-mes/iva.js'), "var fPago = (mp && mp !== 'MXN') ? tcp : D('1'), f = mul(equiv, fPago);", "var fPago = D('1'), f = equiv;"],
  ['iva: lo que te retuvieron se aplica sin tope', H('iva-del-mes/iva.js'), 'var aplicado = Dm.min(Dm.max(neto, CERO), retCon), remanente = res(retCon, aplicado);', 'var aplicado = retCon, remanente = CERO;'],
  ['iva: un XML de otro mes suma', H('iva-del-mes/iva.js'), 'out.otro_mes.push({ nombre: a.nombre, uuid: uuid, fecha: m.fecha }); return;', 'out.otro_mes.push({ nombre: a.nombre, uuid: uuid, fecha: m.fecha });'],
  ['iva: con un archivo no soportado igual da cifra', H('iva-del-mes/iva.js'), 'if (out.no_soportados.length || out.ilegibles.length) { out.cerrado = true; return out; }', ''],
  ['iva: un repetido cuenta dos veces', H('iva-del-mes/iva.js'), 'if (vistos[uuid]) { out.repetidos.push({ nombre: a.nombre, uuid: uuid, igual_a: vistos[uuid] }); return; }', ''],
  ['iva: rojo tambien para desvirtuado', H('iva-del-mes/iva.js'), "rojo: efos.status === 'presunto' || efos.status === 'definitivo',", 'rojo: true,'],
  ['iva: una nota de credito se lee como ingreso', H('iva-del-mes/iva.js'), "if (tipo !== 'I' && tipo !== 'P') throw", "if (tipo !== 'I' && tipo !== 'P' && tipo !== 'E') throw"],
  ['iva: decimal redondea medio hacia arriba', H('iva-del-mes/decimal.js'), 'if (dos > d || (dos === d && (abs(q) % 2n) === 1n)) q += neg ? -1n : 1n;', 'if (dos >= d) q += neg ? -1n : 1n;'],
  ['iva: el umbral del efectivo publicado no es el del programa', H('iva-del-mes/iva-datos.js'), '"umbral_efectivo_mxn": "2000",', '"umbral_efectivo_mxn": "3000",'],
  ['iva: la pagina no descarga el listado 69-B', H('iva-del-mes/pagina.js'), 'Promise.all([cargarListado(), Promise.all(', 'Promise.all([Promise.resolve(null), Promise.all(', 'nav'],
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
  ['opinion: el voto positivo arrastra el motivo', H('opinion.js'), "motivo: d.voto === 'NO' ? limpiarMotivo(d.motivo) : '', fecha: d.fecha };", "motivo: limpiarMotivo(d.motivo), fecha: d.fecha };"],
  ['opinion: vuelve el correo', H('opinion.js'), "motivo: d.voto === 'NO' ? limpiarMotivo(d.motivo) : '', fecha: d.fecha };", "motivo: d.voto === 'NO' ? limpiarMotivo(d.motivo) : '', correo: String(d.correo || ''), fecha: d.fecha };"],
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
  const f = spawnSync(process.env.PYTHON || 'python', ['-X', 'utf8', '.herramientas/pruebas/test_sitemap_fechas.py'], { cwd: RAIZ, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: '1' }) });
  if (f.status !== 0) rojas.push('test_sitemap_fechas.py: ' + String(f.stderr || f.stdout).trim().split('\n').pop());
  let n = { status: 0 };
  if (nav) {
    n = spawnSync(process.execPath, ['.herramientas/prueba_navegador.mjs'], { cwd: RAIZ, encoding: 'utf8', timeout: 300000 });
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
