'use strict';
// Tipo de cambio para efectos fiscales: (1) las fechas, dia por dia, son las de scripts/banxico_fix.py del programa
// (vectores generados EJECUTANDOLO); (2) calibradas contra valores publicados por Banxico en su tabla oficial;
// (3) un ano sin calendario de la CNBV no se responde; (4) el lector del SIE y el de la tabla oficial fallan cerrado;
// (5) el cotejo diario se pone rojo ante cualquier diferencia, ante un calendario equivocado y ante una tabla corta.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..', '..');
const imp = rel => import(path.join(RAIZ, rel).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
const T = require(path.join(RAIZ, 'herramientas', 'tipo-de-cambio', 'tc.js'));
const DATOS = require(path.join(RAIZ, 'herramientas', 'tipo-de-cambio', 'tipo-cambio-datos.js'));
const FUENTE = require(path.join('..', 'datos', 'tipo-cambio.json'));
const V = require(path.join('..', 'vectores', 'tipo-cambio.json'));
const RECORTE = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tipo-cambio', 'tipcamb-recorte.html')).toString('latin1');
const tc = T.crear(DATOS);

test('tipo de cambio: los datos publicados son los del programa, tal cual', () => {
  const sin = o => { const c = Object.assign({}, o); delete c._nota; return c; };
  assert.deepEqual(sin(DATOS), sin(FUENTE));
  assert.equal(DATOS.serie, 'SF43718');
  assert.deepEqual(tc.anios, [2024, 2025, 2026]);
  for (const f of Object.values(DATOS.fuentes)) assert.match(f.url, /^https:\/\/(www\.diputados\.gob\.mx|dof\.gob\.mx)\//);
  assert.ok(DATOS.calendarios['2026'].includes('2026-09-16') && DATOS.calendarios['2026'].includes('2026-12-12'));
});

test('tipo de cambio: fechas iguales al programa, dia por dia (vectores ejecutados de banxico_fix)', () => {
  assert.ok(V.dias.length > 1000, 'calibracion: hay vectores');
  let cubiertos = 0, noCubiertos = 0;
  for (const d of V.dias) {
    assert.equal(tc.esHabil(d.fecha), d.habil, d.fecha + ' habil');
    assert.equal(tc.paraObligaciones(d.fecha), d.obligaciones, d.fecha + ' obligaciones');
    assert.equal(tc.publicacionQueAplica(d.fecha), d.publicacion_que_aplica, d.fecha + ' publicacion');
    assert.equal(tc.dofDelDia(d.fecha), d.dof_del_dia, d.fecha + ' dof');
    assert.equal(tc.determinado(d.fecha), d.determinado, d.fecha + ' determinado');
    if (d.obligaciones === 'NO_CUBIERTO') noCubiertos++; else cubiertos++;
  }
  assert.ok(cubiertos > 1000 && noCubiertos > 10, `los dos lados del calendario estan en los vectores (${cubiertos} / ${noCubiertos})`);
});

test('tipo de cambio: fuera del calendario de la CNBV no responde (falla cerrado)', () => {
  assert.equal(tc.paraObligaciones('2027-01-02'), 'NO_CUBIERTO');
  assert.equal(tc.paraObligaciones('2024-01-02'), 'NO_CUBIERTO', 'lo determinado cae en 2023');
  assert.equal(tc.esHabil('2023-06-01'), 'NO_CUBIERTO');
  const r = tc.consultar('2027-03-01', { '2027-02-25': '18.0000' });
  assert.equal(r.obligaciones.motivo, 'NO_CUBIERTO');
  assert.equal(r.obligaciones.valor, undefined, 'no inventa un valor aunque la serie traiga uno');
  assert.deepEqual(tc.consultar('2026-02-30', {}), { ok: false, motivo: 'FECHA' });
});

test('tipo de cambio: calibrado contra la tabla oficial de Banxico («Para solventar obligaciones»)', async () => {
  const { leerOficial } = await imp('netlify/lib/tipo-cambio.mjs');
  const filas = leerOficial(RECORTE);
  const serie = {}; for (const r of filas) if (r.determinacion) serie[r.fecha] = r.determinacion;
  // valores leidos a mano en la tabla oficial (tipCamIHAction) el 2026-10-20
  const oficiales = { '2026-03-05': '17.7228', '2026-03-06': '17.5445', '2026-03-07': '17.6770', '2026-03-10': '17.7962',
                      '2026-09-04': '16.9852', '2026-09-06': '16.9560', '2026-09-07': '16.9560', '2026-09-16': '17.1277' };
  for (const [f, v] of Object.entries(oficiales)) {
    const r = tc.consultar(f, serie);
    assert.equal(r.obligaciones.valor, v, f);
  }
  const sin = tc.consultar('2026-10-28', serie).obligaciones;
  assert.deepEqual([sin.motivo, sin.valor, sin.determinado], ['SIN_DATO', undefined, '2026-10-26'], 'sin dato no da valor');
  const r = tc.consultar('2026-03-10', serie);
  assert.equal(r.obligaciones.determinado, '2026-03-06');
  assert.equal(r.obligaciones.publicado_dof, '2026-03-09');
  assert.equal(r.dof_del_dia.valor, '17.7687');
  assert.equal(r.determinado_del_dia.valor, '17.5037');
});

test('tipo de cambio: la tabla oficial se lee entera o no se lee', async () => {
  const { leerOficial } = await imp('netlify/lib/tipo-cambio.mjs');
  const filas = leerOficial(RECORTE);
  assert.equal(filas.length, 234);
  assert.deepEqual(filas[filas.length - 1], { fecha: '2026-10-20', determinacion: '18.4200', dof: '18.4253', obligaciones: '18.4930' });
  assert.deepEqual(filas.find(r => r.fecha === '2026-09-06'), { fecha: '2026-09-06', determinacion: null, dof: null, obligaciones: '16.9560' });
  assert.throws(() => leerOficial(RECORTE.replace('Determinaci&oacute;n', 'Cierre')), /cambio de columnas/);
  assert.throws(() => leerOficial(RECORTE.replace(/<td class="renglonNon">\r\n\t\t\t18\.4930\r\n\t\t<\/td>/, '')), /no se reparten/);
  assert.throws(() => leerOficial(RECORTE.replace('18.4930', '18,4930')), /forma inesperada/);
});

test('tipo de cambio: el SIE tiene que declarar la serie de ley (falla cerrado)', async () => {
  const { leerSie } = await imp('netlify/lib/tipo-cambio.mjs');
  const r = (id, datos) => ({ bmx: { series: [Object.assign(id === undefined ? {} : { idSerie: id }, { datos })] } });
  assert.deepEqual(leerSie(r('SF43718', [{ fecha: '05/03/2026', dato: '17.6770' }, { fecha: '07/03/2026', dato: 'N/E' }])),
    { '2026-03-05': '17.6770' });
  assert.throws(() => leerSie(r('SF46410', [{ fecha: '05/03/2026', dato: '20.1' }])), /serie de ley/);
  assert.throws(() => leerSie(r(undefined, [])), /serie de ley/, 'no declarar la serie tampoco pasa');
  assert.throws(() => leerSie({}), /serie de ley/);
  assert.throws(() => leerSie(r('SF43718', [{ fecha: '2026-03-05', dato: '17.6770' }])), /fecha con forma/);
  assert.throws(() => leerSie(r('SF43718', [{ fecha: '05/03/2026', dato: '1,7.67' }])), /forma inesperada/);
});

test('tipo de cambio: el cotejo diario se pone rojo ante cualquier diferencia', async () => {
  const { leerOficial, cotejar, publicable } = await imp('netlify/lib/tipo-cambio.mjs');
  const filas = leerOficial(RECORTE);
  const serie = {}; for (const r of filas) if (r.determinacion) serie[r.fecha] = r.determinacion;
  const bien = cotejar({ serie, oficial: filas, hoy: '2026-10-21' });
  assert.deepEqual([bien.ok, bien.revisados, bien.desde, bien.hasta], [true, 30, '2026-09-21', '2026-10-20']);
  assert.ok(cotejar({ serie, oficial: filas, hoy: '2026-10-21', dias: 220 }).ok, 'los 220 dias del recorte cuadran');

  const otro = Object.assign({}, serie, { '2026-10-15': '18.0001' });
  const c1 = cotejar({ serie: otro, oficial: filas, hoy: '2026-10-21' });
  assert.ok(!c1.ok && c1.diferencias.some(d => d.startsWith('2026-10-15: determinacion')), 'un valor distinto');
  assert.ok(c1.diferencias.some(d => /para solventar obligaciones/.test(d)), 'y el dia que lo usa para obligaciones');
  const falta = Object.assign({}, serie); delete falta['2026-10-14'];
  assert.ok(!cotejar({ serie: falta, oficial: filas, hoy: '2026-10-21' }).ok, 'un dia que falta en la serie');
  const corta = filas.filter(r => r.fecha < '2026-10-01');
  const c3 = cotejar({ serie, oficial: corta, hoy: '2026-10-21' });
  assert.ok(!c3.ok && /se esperaban al menos/.test(c3.diferencias.at(-1)), 'una tabla oficial con menos dias');
  const c4 = cotejar({ serie, oficial: filas.map(r => r.fecha === '2026-10-12' ? Object.assign({}, r, { determinacion: null, dof: null }) : r), hoy: '2026-10-21' });
  assert.ok(!c4.ok && c4.diferencias.some(d => /habil/.test(d)), 'un dia habil que la tabla oficial trata como inhabil');
  const c5 = cotejar({ serie, oficial: [{ fecha: '2027-01-04', determinacion: '18.0000', dof: '18.0000', obligaciones: '18.0000' }], hoy: '2027-01-05', minimo: 1 });
  assert.ok(!c5.ok && /sin calendario/.test(c5.diferencias[0]), 'un ano sin calendario no pasa el cotejo');

  assert.throws(() => publicable({ serie, cotejo: c1, generado: 'x' }), /no se publica/);
  const p = publicable({ serie, cotejo: bien, generado: '2026-10-20T19:00:00Z' });
  assert.equal(p.ultimo_dato, '2026-10-20');
  assert.equal(p.serie, 'SF43718');
  assert.ok(Object.keys(p.valores).every(f => f >= '2023-12-01'));
});

test('tipo de cambio: los datos de prueba de la pagina salen del recorte oficial, tal cual', async () => {
  const { leerOficial, cotejar, publicable } = await imp('netlify/lib/tipo-cambio.mjs');
  const filas = leerOficial(RECORTE);
  const serie = {}; for (const r of filas) if (r.determinacion) serie[r.fecha] = r.determinacion;
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tipo-cambio', 'fix.json'), 'utf8'));
  assert.deepEqual(fx, publicable({ serie, cotejo: cotejar({ serie, oficial: filas, hoy: '2026-10-21' }), generado: fx.generado }));
});

// --- La actualizacion (la misma de la funcion programada y de /actualizar), con la red SIMULADA: ninguna prueba sale a
// la red ni gasta el token. El SIE simulado responde con la columna de determinacion del recorte oficial.
const TOKEN = 'token-de-prueba-0123456789';
function redSimulada({ sie = 'bien', oficial = 'bien' } = {}) {
  const pedidos = [];
  const traer = async (url, op = {}) => {
    pedidos.push({ url, token: op.headers && op.headers['Bmx-Token'] });
    if (url.includes('SieAPIRest')) {
      if (sie === '401') return new Response('no', { status: 401 });
      if (sie === 'html') return new Response('<html>caido</html>', { status: 200 });
      return new Response(JSON.stringify({ bmx: { series: [{ idSerie: sie === 'otra' ? 'SF46410' : 'SF43718', datos: redSimulada.datos } ] } }), { status: 200 });
    }
    if (url.includes('tipCamIHAction')) {
      if (oficial === 'caida') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return new Response(Buffer.from(RECORTE, 'latin1'), { status: 200 });
    }
    throw new Error('URL inesperada: ' + url);
  };
  return { traer, pedidos };
}

test('tipo de cambio: la actualizacion publica solo con el cotejo en verde y sin dejar ver el token', async () => {
  const { leerOficial, actualizar } = await imp('netlify/lib/tipo-cambio.mjs');
  redSimulada.datos = leerOficial(RECORTE).filter(r => r.determinacion).map(r => ({ fecha: r.fecha.split('-').reverse().join('/'), dato: r.determinacion }));
  const ahora = new Date('2026-10-20T20:00:00Z');
  const red = redSimulada();
  const r = await actualizar({ token: TOKEN, ahora, traer: red.traer });
  assert.ok(r.ok, r.texto);
  assert.equal(red.pedidos.length, 2, 'calibracion: se pidieron el SIE y la tabla oficial');
  assert.ok(red.pedidos[0].url.endsWith('/SF43718/datos/2023-12-01/2026-10-20') && red.pedidos[0].token === TOKEN);
  assert.equal(red.pedidos[1].token, undefined, 'el token solo va al SIE');
  assert.deepEqual([r.datos.ultimo_dato, r.datos.cotejo.ok, r.datos.valores['2026-03-06']], ['2026-10-20', true, '17.7962']);
  assert.ok(!r.texto.includes(TOKEN));

  for (const [caso, esperado] of [[{ sie: '401' }, /token fue rechazado/], [{ sie: 'html' }, /no es JSON/], [{ sie: 'otra' }, /serie de ley/],
                                  [{ oficial: 'caida' }, /no contesto/]]) {
    const x = await actualizar({ token: TOKEN, ahora, traer: redSimulada(caso).traer });
    assert.ok(!x.ok && esperado.test(x.texto) && !x.datos && !x.texto.includes(TOKEN), JSON.stringify(caso) + ' ' + x.texto);
  }
  const guardado = redSimulada.datos;
  redSimulada.datos = guardado.map(d => d.fecha === '12/10/2026' ? { fecha: d.fecha, dato: '18.0000' } : d);
  const mal = await actualizar({ token: TOKEN, ahora, traer: redSimulada().traer });
  assert.ok(!mal.ok && /no cuadra/.test(mal.texto) && !mal.datos, 'un valor distinto de la tabla oficial no se publica');
  redSimulada.datos = guardado;
  assert.match((await actualizar({ token: '', ahora, traer: redSimulada().traer })).texto, /falta BANXICO_TOKEN/);
});

test('tipo de cambio: el almacen guarda los datos solo en verde, el estado siempre, y dice si estan al dia', async () => {
  const { actualizarEn, leerEstado } = await imp('netlify/lib/tipo-cambio-servidor.mjs');
  const mapa = new Map();
  const store = { get: async (k, o) => mapa.has(k) ? (o && o.type === 'json' ? JSON.parse(mapa.get(k)) : mapa.get(k)) : null,
                  set: async (k, v) => { mapa.set(k, v); }, setJSON: async (k, v) => { mapa.set(k, JSON.stringify(v)); } };
  const ahora = new Date('2026-10-20T20:00:00Z');
  const bien = await actualizarEn(store, { token: TOKEN, origen: 'programada', contexto: 'production', ahora, traer: redSimulada().traer });
  assert.ok(bien.ok && mapa.has('fix.json'));
  const fix = mapa.get('fix.json');
  let e = await leerEstado(store, ahora);
  assert.deepEqual([e.al_dia, e.ultimo_esperado, e.datos.ultimo_dato, e.ultimo_intento.ok], [true, '2026-10-20', '2026-10-20', true]);
  assert.equal((await leerEstado(store, new Date('2026-10-21T20:00:00Z'))).al_dia, false, 'al dia siguiente a las 14:00 ya no esta al dia');

  const despues = new Date(ahora.getTime() + 3600000);
  const malo = await actualizarEn(store, { token: TOKEN, origen: 'programada', contexto: 'production', ahora: despues, traer: redSimulada({ sie: '401' }).traer });
  assert.ok(!malo.ok);
  assert.equal(mapa.get('fix.json'), fix, 'un intento fallido NO borra ni cambia los datos publicados');
  e = await leerEstado(store, despues);
  assert.deepEqual([e.ultimo_intento.ok, /rechazado/.test(e.ultimo_intento.texto)], [false, true]);
  assert.ok(![...mapa.values()].some(v => v.includes(TOKEN)), 'el token no queda en el almacen');

  const seguido = await actualizarEn(store, { token: TOKEN, origen: 'a mano', contexto: 'production', ahora: new Date(despues.getTime() + 5000), traer: redSimulada().traer });
  assert.ok(!seguido.ok && /menos de un minuto/.test(seguido.texto), 'a mano: un intento por minuto');
});

test('tipo de cambio: que dato debe estar cargado a cada hora', () => {
  // hoy habil antes de las 14:00 del centro de Mexico -> el del dia habil anterior; desde las 14:00 -> el de hoy
  assert.equal(tc.ultimoEsperado(Date.parse('2026-10-20T19:59:00Z')), '2026-10-19');
  assert.equal(tc.ultimoEsperado(Date.parse('2026-10-20T20:00:00Z')), '2026-10-20');
  // domingo y lunes temprano -> el viernes; el 16 de septiembre (inhabil bancario) -> el 15
  assert.equal(tc.ultimoEsperado(Date.parse('2026-10-18T22:00:00Z')), '2026-10-16');
  assert.equal(tc.ultimoEsperado(Date.parse('2026-10-19T05:00:00Z')), '2026-10-16');
  assert.equal(tc.ultimoEsperado(Date.parse('2026-09-16T22:00:00Z')), '2026-09-15');
  assert.equal(tc.ultimoEsperado(Date.parse('2027-01-04T22:00:00Z')), 'NO_CUBIERTO', 'sin calendario no se puede saber');
});

test('tipo de cambio: la vigilancia diaria se pone roja con datos atrasados o que no cuadran', async () => {
  const { leerOficial, vigilarPublicado } = await imp('netlify/lib/tipo-cambio.mjs');
  const filas = leerOficial(RECORTE);
  const pub = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'tipo-cambio', 'fix.json'), 'utf8'));
  const ahora = new Date('2026-10-20T21:00:00Z');
  const bien = vigilarPublicado({ pub, filas, ahora });
  assert.ok(bien.ok, bien.texto);
  const atrasado = vigilarPublicado({ pub, filas, ahora: new Date('2026-10-21T20:45:00Z') });
  assert.ok(!atrasado.ok && /no esta al dia/.test(atrasado.texto), 'al dia siguiente a las 14:45 falta el FIX del 21');
  const otro = JSON.parse(JSON.stringify(pub)); otro.valores['2026-10-12'] = '18.0000';
  assert.ok(!vigilarPublicado({ pub: otro, filas, ahora }).ok, 'un valor distinto de la tabla oficial');
  const sin = JSON.parse(JSON.stringify(pub)); sin.cotejo.ok = false;
  assert.ok(!vigilarPublicado({ pub: sin, filas, ahora }).ok, 'lo publicado sin cotejo en verde');
  assert.ok(!vigilarPublicado({ pub, filas, ahora: new Date('2027-01-05T21:00:00Z') }).ok, 'sin calendario no se da por bueno');
});
