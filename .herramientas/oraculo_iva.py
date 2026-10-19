"""Oraculo del «IVA del mes»: arma lotes de CFDI INVENTADOS, los pasa por el programa tal cual y guarda lo que da.

Lo usa extraer_del_producto.py (vectores_iva). Cadena EJECUTADA del programa, la misma de un cierre:
  XML -> enriquecedor_v2.parse_cfdi_v2 -> inventario temporal (con efos_status de efos_scraper.consultar_rfc)
      -> calculador_iva_v2.cargar_cfdis_enriquecidos -> calculador_iva_v2.calcular(cfdis, None, periodo)

Solo genera lo que la herramienta del sitio SOPORTA (corte 1): CFDI 4.0 de tipo I y P (Pagos 2.0), IVA al 16, 8, 0 y
exento, ObjetoImp 01, retenciones de IVA e ISR, efectivo, formas no monetarias distintas de 08 y 31, moneda extranjera
con y sin tipo de cambio, uso D, emisores en un 69-B inventado, REP de este mes y del mes anterior, REP sobre PUE y
pagos que el libro de pagos rechaza. Lo NO soportado (E, relacion 04, nomina, retenciones, Pagos 1.0, IEPS, 08, 31,
otro mes, XML ajeno) lo rechaza la pagina sin calcular, y se prueba aparte.
"""
import contextlib
import csv
import io
import json
import random
import tempfile
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

NS4 = 'http://www.sat.gob.mx/cfd/4'
NS_P20 = 'http://www.sat.gob.mx/Pagos20'
NS_TFD = 'http://www.sat.gob.mx/TimbreFiscalDigital'
PROPIO = 'TCE160101AB1'          # RFC inventado del contribuyente
TERCEROS = ['AAA010101AAA', 'BBB020202BB2', 'CCCC030303CC3', 'DDDD040404DD4', 'EEE050505EE5', 'FFFF060606FF6']
EFOS = {  # RFC inventados del 69-B de prueba: (situacion del CSV, fechas DOF por etapa)
    'GGG070707GG7': ('Definitivo', {'P': '2025-01-10', 'D': '2026-03-15'}),
    'HHHH080808HH8': ('Presunto', {'P': '2026-02-01'}),
    'III090909II9': ('Desvirtuado', {'P': '2024-05-01', 'V': '2025-06-01'}),
    'JJJ101010JJ1': ('Definitivo', {'P': '2025-11-01', 'D': '2026-05-20'}),
    'KKK111111KK1': ('Definitivo', {'P': '2025-01-01'}),   # definitivo SIN fecha: no se excluye, se avisa
}
DOS = Decimal('0.01')


def q2(x):
    return Decimal(x).quantize(DOS, rounding=ROUND_HALF_EVEN)


def s2(x):
    return str(q2(x))


# --------------------------------------------------------------------------------------------- CSV del 69-B inventado
def csv_69b(real):
    """Mismo formato que el listado oficial (encabezados y columnas del real), con filas INVENTADAS."""
    try:
        texto, cod = real.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        texto, cod = real.decode('latin-1'), 'latin-1'
    lineas = texto.splitlines()
    idx = next(i for i, l in enumerate(lineas[:10]) if l.startswith('No,RFC,'))
    cab = next(csv.reader([lineas[idx]]))
    i_rfc, i_nom, i_sit = cab.index('RFC'), cab.index('Nombre del Contribuyente'), cab.index('Situación del contribuyente')
    col = {k: [cab.index(v)] for k, v in (('P', 'Publicación DOF presuntos'), ('V', 'Publicación DOF desvirtuados'),
                                          ('D', 'Publicación DOF definitivos'), ('S', 'Publicación DOF sentencia favorable'))}
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    filas = []
    n = 0
    # un RFC con dos filas: la PRIMERA es desvirtuado y la segunda definitivo -> el programa elige la peor
    extra = [('JJJ101010JJ1', 'Desvirtuado', {'P': '2024-01-01', 'V': '2024-06-01'})]
    # relleno: el programa no acepta un listado de menos de 100 RFC (PISO_MIN de efos_scraper)
    extra += [('ZZZ%06dZZ%d' % (i, i % 10), 'Desvirtuado', {'P': '2020-01-01', 'V': '2021-01-01'}) for i in range(120)]
    for rfc, (sit, fechas) in list(EFOS.items()) + [(r, (s, f)) for r, s, f in extra]:
        n += 1
        f = [''] * len(cab)
        f[0] = str(n)
        f[i_rfc], f[i_nom], f[i_sit] = rfc, 'CONTRIBUYENTE INVENTADO %d SA DE CV' % n, sit
        for k, iso in fechas.items():
            for i in col[k]:
                a, m, d = iso.split('-')
                f[i] = '%s/%s/%s' % (d, m, a)
        filas.append(f)
    w.writerows(filas)
    return ('\n'.join(lineas[:idx + 1]) + '\n' + out.getvalue()).encode(cod)


# ------------------------------------------------------------------------------------------------ XML de un CFDI 4.0
def _attrs(d):
    return ''.join(' %s="%s"' % (k, v) for k, v in d.items() if v is not None)


def xml_cfdi(c):
    """c: dict con lo inventado. Devuelve el XML como texto."""
    tr_tot, ret_iva, ret_isr = {}, Decimal(0), Decimal(0)
    conceptos = []
    for k in c['conceptos']:
        imp = ''
        tras = ''.join('<cfdi:Traslado%s/>' % _attrs({'Base': t['base'], 'Impuesto': t.get('impuesto', '002'),
                                                     'TipoFactor': t['tipo_factor'], 'TasaOCuota': t.get('tasa'),
                                                     'Importe': t.get('importe')}) for t in k.get('traslados', []))
        rets = ''.join('<cfdi:Retencion%s/>' % _attrs({'Base': r['base'], 'Impuesto': r['impuesto'], 'TipoFactor': 'Tasa',
                                                      'TasaOCuota': r['tasa'], 'Importe': r['importe']})
                       for r in k.get('retenciones', []))
        for t in k.get('traslados', []):
            if t['tipo_factor'] != 'Exento':
                clave = (t.get('impuesto', '002'), t['tipo_factor'], t['tasa'])
                b, i = tr_tot.get(clave, (Decimal(0), Decimal(0)))
                tr_tot[clave] = (b + Decimal(t['base']), i + Decimal(t['importe']))
        for r in k.get('retenciones', []):
            if r['impuesto'] == '002':
                ret_iva += Decimal(r['importe'])
            else:
                ret_isr += Decimal(r['importe'])
        if tras or rets:
            imp = '<cfdi:Impuestos>%s%s</cfdi:Impuestos>' % (
                '<cfdi:Traslados>%s</cfdi:Traslados>' % tras if tras else '',
                '<cfdi:Retenciones>%s</cfdi:Retenciones>' % rets if rets else '')
        conceptos.append('<cfdi:Concepto%s>%s</cfdi:Concepto>' % (_attrs({
            'ClaveProdServ': k.get('clave', '84111506'), 'Cantidad': '1', 'ClaveUnidad': 'E48', 'Descripcion': 'Servicio',
            'ValorUnitario': k['importe'], 'Importe': k['importe'], 'Descuento': k.get('descuento'),
            'ObjetoImp': k['objeto']}), imp))
    total_tras = sum((v[1] for v in tr_tot.values()), Decimal(0))
    impuestos = ''
    if tr_tot or ret_iva or ret_isr:
        rets = ''
        if ret_iva or ret_isr:
            rets = '<cfdi:Retenciones>%s%s</cfdi:Retenciones>' % (
                '<cfdi:Retencion Impuesto="001" Importe="%s"/>' % s2(ret_isr) if ret_isr else '',
                '<cfdi:Retencion Impuesto="002" Importe="%s"/>' % s2(ret_iva) if ret_iva else '')
        tras = ''.join('<cfdi:Traslado%s/>' % _attrs({'Base': s2(b), 'Impuesto': k[0], 'TipoFactor': k[1], 'TasaOCuota': k[2],
                                                      'Importe': s2(i)}) for k, (b, i) in sorted(tr_tot.items()))
        impuestos = '<cfdi:Impuestos%s>%s%s</cfdi:Impuestos>' % (_attrs({
            'TotalImpuestosRetenidos': s2(ret_iva + ret_isr) if (ret_iva or ret_isr) else None,
            'TotalImpuestosTrasladados': s2(total_tras) if tr_tot else None}), rets,
            '<cfdi:Traslados>%s</cfdi:Traslados>' % tras if tras else '')
    sub = sum((Decimal(k['importe']) for k in c['conceptos']), Decimal(0))
    desc = sum((Decimal(k.get('descuento') or 0) for k in c['conceptos']), Decimal(0))
    total = sub - desc + total_tras - ret_iva - ret_isr
    pagos = ''
    if c['tipo'] == 'P':
        sub, desc, total = Decimal(0), Decimal(0), Decimal(0)
        bloques = []
        for p in c['pagos']:
            drs = []
            for dr in p['drs']:
                tdr = ''.join('<pago20:TrasladoDR%s/>' % _attrs({'BaseDR': t['base'], 'ImpuestoDR': t.get('impuesto', '002'),
                                                                'TipoFactorDR': t['tipo_factor'], 'TasaOCuotaDR': t.get('tasa'),
                                                                'ImporteDR': t.get('importe')}) for t in dr.get('traslados', []))
                rdr = ''.join('<pago20:RetencionDR%s/>' % _attrs({'BaseDR': r['base'], 'ImpuestoDR': r['impuesto'],
                                                                 'TipoFactorDR': 'Tasa', 'TasaOCuotaDR': r['tasa'],
                                                                 'ImporteDR': r['importe']}) for r in dr.get('retenciones', []))
                imp = ''
                if tdr or rdr:
                    imp = '<pago20:ImpuestosDR>%s%s</pago20:ImpuestosDR>' % (
                        '<pago20:RetencionesDR>%s</pago20:RetencionesDR>' % rdr if rdr else '',
                        '<pago20:TrasladosDR>%s</pago20:TrasladosDR>' % tdr if tdr else '')
                drs.append('<pago20:DoctoRelacionado%s>%s</pago20:DoctoRelacionado>' % (_attrs({
                    'IdDocumento': dr['id'], 'MonedaDR': dr.get('moneda', 'MXN'), 'EquivalenciaDR': dr.get('equiv', '1'),
                    'NumParcialidad': dr.get('parcialidad'), 'ImpSaldoAnt': dr.get('saldo_ant'), 'ImpPagado': dr.get('pagado'),
                    'ImpSaldoInsoluto': dr.get('insoluto'), 'ObjetoImpDR': dr.get('objeto', '02')}), imp))
            bloques.append('<pago20:Pago%s>%s</pago20:Pago>' % (_attrs({
                'FechaPago': p['fecha'] + 'T12:00:00', 'FormaDePagoP': p['forma'], 'MonedaP': p.get('moneda', 'MXN'),
                'TipoCambioP': p['tc'] if 'tc' in p else '1', 'Monto': p['monto']}), ''.join(drs)))
        pagos = ('<pago20:Pagos Version="2.0"><pago20:Totales MontoTotalPagos="%s"/>%s</pago20:Pagos>'
                 % (s2(sum((Decimal(p['monto']) for p in c['pagos']), Decimal(0))), ''.join(bloques)))
    rel = ''
    comp = _attrs({
        'xmlns:cfdi': NS4, 'xmlns:pago20': NS_P20 if c['tipo'] == 'P' else None, 'xmlns:tfd': NS_TFD,
        'Version': '4.0', 'Fecha': c['fecha'] + 'T10:00:00', 'SubTotal': s2(sub) if c['tipo'] == 'I' else '0',
        'Descuento': s2(desc) if desc else None, 'Moneda': c.get('moneda', 'MXN') if c['tipo'] == 'I' else 'XXX',
        'TipoCambio': c.get('tc') if c['tipo'] == 'I' else None, 'Total': s2(total) if c['tipo'] == 'I' else '0',
        'TipoDeComprobante': c['tipo'], 'Exportacion': '01', 'MetodoPago': c.get('metodo') if c['tipo'] == 'I' else None,
        'FormaPago': c.get('forma') if c['tipo'] == 'I' else None, 'LugarExpedicion': '06600'})
    return ('<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante%s>%s<cfdi:Emisor Rfc="%s" Nombre="%s" RegimenFiscal="601"/>'
            '<cfdi:Receptor Rfc="%s" Nombre="%s" DomicilioFiscalReceptor="06600" RegimenFiscalReceptor="601" UsoCFDI="%s"/>'
            '<cfdi:Conceptos>%s</cfdi:Conceptos>%s<cfdi:Complemento>%s<tfd:TimbreFiscalDigital Version="1.1" UUID="%s" '
            'FechaTimbrado="%sT10:05:00"/></cfdi:Complemento></cfdi:Comprobante>') % (
        comp, rel, c['emisor'], 'EMISOR ' + c['emisor'], c['receptor'], 'RECEPTOR ' + c['receptor'],
        c.get('uso', 'G03' if c['tipo'] == 'I' else 'CP01'), ''.join(conceptos), impuestos, pagos, c['uuid'], c['fecha'])


# ------------------------------------------------------------------------------------------- lotes inventados al azar
def _uuid(rnd):
    h = '%032X' % rnd.getrandbits(128)
    return '%s-%s-%s-%s-%s' % (h[:8], h[8:12], h[12:16], h[16:20], h[20:])


def _traslado(rnd, base, tasa):
    if tasa == 'Exento':
        return {'base': s2(base), 'tipo_factor': 'Exento'}
    imp = q2(base * Decimal(tasa))
    return {'base': s2(base), 'tipo_factor': 'Tasa', 'tasa': tasa, 'importe': s2(imp)}


def _factura(rnd, periodo, emitida, metodo, contraparte):
    dia = rnd.randint(1, 28)
    conceptos = []
    for _ in range(rnd.choice([1, 1, 2, 3])):
        base = q2(Decimal(rnd.randint(50, 900000)) / 100)
        tasa = rnd.choice(['0.160000'] * 5 + ['0.080000', '0.000000', 'Exento', 'objeto01'])
        k = {'importe': s2(base), 'objeto': '02'}
        if tasa == 'objeto01':
            k['objeto'] = '01'
        else:
            k['traslados'] = [_traslado(rnd, base, tasa)]
            if tasa == '0.160000' and rnd.random() < 0.25:
                k['retenciones'] = [{'base': s2(base), 'impuesto': '002', 'tasa': '0.106667',
                                     'importe': s2(base * Decimal('0.106667'))},
                                    {'base': s2(base), 'impuesto': '001', 'tasa': '0.100000',
                                     'importe': s2(base * Decimal('0.10'))}]
        conceptos.append(k)
    c = {'tipo': 'I', 'uuid': _uuid(rnd), 'fecha': '%s-%02d' % (periodo, dia), 'metodo': metodo,
         'forma': '99' if metodo == 'PPD' else rnd.choice(['03'] * 6 + ['01', '01', '02', '04', '17', '12']),
         'emisor': PROPIO if emitida else contraparte, 'receptor': contraparte if emitida else PROPIO,
         'conceptos': conceptos}
    if not emitida and rnd.random() < 0.08:
        c['uso'] = 'D01'
    r = rnd.random()
    if r < 0.07:
        c['moneda'], c['tc'] = 'USD', rnd.choice(['17.2500', '18.0123', '19.5'])
    elif r < 0.10:
        c['moneda'] = 'USD'   # sin tipo de cambio: el programa no la suma y deja el IVA sin determinar
    if c['forma'] == '01' and rnd.random() < 0.5:   # efectivo alrededor de los 2,000
        c['conceptos'] = [{'importe': rnd.choice(['1700.00', '1724.14', '1724.13', '1800.00', '500.00']), 'objeto': '02',
                           'traslados': [_traslado(rnd, Decimal(rnd.choice(['1700.00', '1724.14', '1724.13'])), '0.160000')]}]
        c['conceptos'][0]['importe'] = c['conceptos'][0]['traslados'][0]['base']
    return c


def _iva_de(c):
    return sum((Decimal(t.get('importe') or 0) for k in c['conceptos'] for t in k.get('traslados', [])), Decimal(0))


def _rep(rnd, periodo, emitido, contraparte, facturas_ppd, mes_anterior):
    pagos = []
    for _ in range(rnd.choice([1, 1, 2])):
        fecha_mes = mes_anterior if rnd.random() < 0.15 else periodo
        drs = []
        monto = Decimal(0)
        for _ in range(rnd.choice([1, 1, 2])):
            if facturas_ppd and rnd.random() < 0.7:
                f = rnd.choice(facturas_ppd)
                ident, total, iva = f['uuid'], None, _iva_de(f)
            else:
                f, ident, iva = None, _uuid(rnd), q2(Decimal(rnd.randint(100, 200000)) / 100)
            base = q2(iva / Decimal('0.16')) if iva else q2(Decimal(rnd.randint(100, 50000)))
            frac = rnd.choice([Decimal(1), Decimal('0.5'), Decimal('0.3')])
            b_dr, i_dr = q2(base * frac), q2(iva * frac)
            pagado = q2(b_dr + i_dr)
            saldo_ant = q2(pagado / frac) if frac != 1 else pagado
            dr = {'id': ident, 'parcialidad': str(rnd.choice([1, 1, 2])), 'saldo_ant': s2(saldo_ant), 'pagado': s2(pagado),
                  'insoluto': s2(saldo_ant - pagado)}
            if rnd.random() < 0.08:
                dr['insoluto'] = s2(saldo_ant)            # saldos que no cuadran: el libro lo rechaza
            if i_dr:
                tasa = '0.080000' if rnd.random() < 0.1 else '0.160000'
                dr['traslados'] = [{'base': s2(b_dr), 'tipo_factor': 'Tasa', 'tasa': tasa, 'importe': s2(i_dr)}]
                if rnd.random() < 0.15:
                    dr['retenciones'] = [{'base': s2(b_dr), 'impuesto': '002', 'tasa': '0.106667',
                                          'importe': s2(b_dr * Decimal('0.106667'))}]
            elif rnd.random() < 0.5:
                dr['traslados'] = [{'base': s2(b_dr), 'tipo_factor': 'Tasa', 'tasa': '0.000000', 'importe': '0.00'}]
            else:
                dr['objeto'] = '01'
            drs.append(dr)
            monto += pagado
        p = {'fecha': '%s-%02d' % (fecha_mes, rnd.randint(1, 28)), 'forma': rnd.choice(['03'] * 8 + ['01', '17', '02']),
             'monto': s2(monto), 'drs': drs}
        if rnd.random() < 0.07:   # pago en dolares de facturas en pesos
            p['moneda'], p['tc'] = 'USD', '18.5000'
            p['monto'] = s2(monto / Decimal('18.5'))
            for dr in drs:
                dr['equiv'] = '0.054054'
        elif rnd.random() < 0.03:
            p['moneda'], p['tc'] = 'USD', '1'    # TipoCambioP sospechoso: 1 con divisa
        elif rnd.random() < 0.03:
            p['moneda'], p['tc'] = 'USD', None   # sin TipoCambioP: no se suma
        if p['forma'] == '01' and rnd.random() < 0.2:
            p['monto'] = '0.00'                  # efectivo con importe que no prueba nada
        pagos.append(p)
    return {'tipo': 'P', 'uuid': _uuid(rnd), 'fecha': '%s-%02d' % (periodo, rnd.randint(1, 28)),
            'emisor': PROPIO if emitido else contraparte, 'receptor': contraparte if emitido else PROPIO,
            'conceptos': [{'importe': '0', 'objeto': '01', 'clave': '84111506'}], 'pagos': pagos}


def lote(rnd, periodo, mes_anterior):
    docs, ppd = [], []
    for _ in range(rnd.randint(1, 9)):
        emitida = rnd.random() < 0.45
        contraparte = rnd.choice(TERCEROS + (list(EFOS) if not emitida else []))
        metodo = 'PPD' if rnd.random() < 0.35 else 'PUE'
        f = _factura(rnd, periodo, emitida, metodo, contraparte)
        docs.append(f)
        if metodo == 'PPD' or rnd.random() < 0.1:   # tambien algun PUE: un REP sobre PUE no debe sumar
            ppd.append(f)
    for _ in range(rnd.choice([0, 0, 1, 2, 3])):
        emitido = rnd.random() < 0.5
        cand = [f for f in ppd if (f['emisor'] == PROPIO) == emitido]
        contraparte = cand[0]['receptor' if emitido else 'emisor'] if cand else rnd.choice(TERCEROS)
        docs.append(_rep(rnd, periodo, emitido, contraparte, cand, mes_anterior))
    return docs


CAMPOS_DECL = ('iva_estado', 'iva_causado_16', 'iva_causado_8', 'iva_causado_total', 'iva_acreditable',
               'iva_retenido_a_terceros', 'entero_retenciones', 'iva_retenido_al_contribuyente',
               'iva_retenido_al_contribuyente_aplicado', 'iva_retenido_al_contribuyente_remanente', 'iva_neto', 'tipo',
               'monto_a_pagar', 'saldo_a_favor_para_arrastrar')


def correr(prod_scripts, docs, periodo, cache_efos, tmp):
    """Pasa el lote por el programa. Devuelve la parte de la salida que la pagina reproduce."""
    import enriquecedor_v2 as E
    import calculador_iva_v2 as C
    import efos_scraper as F
    archivos = []
    for i, d in enumerate(docs):
        p = Path(tmp) / ('%02d.xml' % i)
        p.write_text(xml_cfdi(d), encoding='utf-8')
        m = E.parse_cfdi_v2(str(p))
        direccion = 'emitido' if m['emisor_rfc'] == PROPIO else 'recibido'
        rfc_efos = m['emisor_rfc']
        archivos.append({'categoria': 'cfdi-xml', 'subcategoria': direccion, 'ruta': str(p), 'metadatos_v2': m,
                         'efos_status': F.consultar_rfc(rfc_efos, cache_path=str(cache_efos))})
    inv = Path(tmp) / 'inventario.json'
    inv.write_text(json.dumps({'archivos': archivos}, default=str), encoding='utf-8')
    cfdis = C.cargar_cfdis_enriquecidos(str(inv))
    with contextlib.redirect_stdout(io.StringIO()):
        r = C.calcular(cfdis, None, periodo)
    dcl = r['declaracion']
    sal = {k: str(dcl[k]) for k in CAMPOS_DECL}
    pend = r.get('pendientes') or {}
    sal['pendiente_causado'] = sorted(str(x.get('uuid')) for x in pend.get('causado_PPD', []))
    sal['pendiente_acreditable'] = sorted(str(x.get('uuid')) for x in pend.get('acreditable_no_pagado', []))
    sal['exclusiones'] = contar_exclusiones(r.get('exclusiones') or {})
    return sal


def contar_exclusiones(ex):
    """Cuantos comprobantes o pagos hay en cada exclusion (las hay en lista y en dict con `n` o `detalle`)."""
    out = {}
    for k, v in sorted(ex.items()):
        if isinstance(v, list):
            n = len(v)
        elif isinstance(v, dict):
            n = v['n'] if isinstance(v.get('n'), int) else len(v.get('detalle') or [])
        else:
            continue
        if n:
            out[k] = n
    return out


def manual(rnd, n):
    """Modo manual: los cuatro totales como dos comprobantes PUE hechos a mano (como test_cal42_iva_neto del
    programa) y calcular() del programa. La pagina hace lo mismo con su calcular()."""
    import calculador_iva_v2 as C
    casos = []
    for _ in range(n):
        v = {}
        for k in ('cobrado', 'pagado', 'retuviste', 'teRetuvieron'):
            r = rnd.random()
            v[k] = '0' if r < 0.2 else (s2(Decimal(rnd.randint(1, 99)) / 100) if r < 0.3 else s2(Decimal(rnd.randint(100, 50000000)) / 100))
        if rnd.random() < 0.5:
            v['retuviste'] = s2(Decimal(v['pagado']) * Decimal('0.666667'))
        base = {'moneda': 'MXN', 'tipo_cambio': Decimal(1), 'descuento': Decimal(0), 'metodo_pago': 'PUE', 'forma_pago': '03',
                'es_efectivo_sobre_2k': False, 'tasas_unicas': ['0.160000'], 'conceptos': [], 'efos_status': 'limpio',
                'efos_fecha_definitivo': '', 'es_nomina': False, 'nomina': None, 'es_retencion_independiente': False,
                'es_complemento_pago': False, 'es_nota_credito': False, 'complemento_pago': None, 'uso_cfdi': 'G03',
                'fecha': '', 'isr_retenido': Decimal(0), 'tc_faltante': False}
        em = dict(base, uuid='MANUAL-EMITIDO', direccion='emitido', subtotal=Decimal(v['cobrado']), total=Decimal(v['cobrado']),
                  iva=Decimal(v['cobrado']), iva_retenido=Decimal(v['teRetuvieron']), emisor_rfc=PROPIO, receptor_rfc=TERCEROS[0],
                  emisor_nombre='E', receptor_nombre='R')
        rc = dict(base, uuid='MANUAL-RECIBIDO', direccion='recibido', subtotal=Decimal(v['pagado']), total=Decimal(v['pagado']),
                  iva=Decimal(v['pagado']), iva_retenido=Decimal(v['retuviste']), emisor_rfc=TERCEROS[1], receptor_rfc=PROPIO,
                  emisor_nombre='E', receptor_nombre='R')
        with contextlib.redirect_stdout(io.StringIO()):
            dcl = C.calcular([em, rc], None, '')['declaracion']
        casos.append({'entrada': v, 'salida': {k: str(dcl[k]) for k in CAMPOS_DECL}})
    return casos
