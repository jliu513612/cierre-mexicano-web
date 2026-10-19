"""Listado completo 69-B del SAT para la herramienta /herramientas/lista-69b/.

Uso:
  python -X utf8 .herramientas/lista69b.py actualizar   descarga, valida y reescribe herramientas/lista-69b/listado.json
                                                       si el archivo del SAT cambio; si no cambio, no toca nada
  python -X utf8 .herramientas/lista69b.py fallo        marca en listado.json que la ultima actualizacion fallo
                                                       (la pagina dice «no se pudo actualizar; datos al <fecha>»)
  python -X utf8 .herramientas/lista69b.py desde <csv>  construye listado.json desde un CSV ya descargado (pruebas)

Salida a stdout, ultima linea: CAMBIO | SIN_CAMBIO | FALLO <motivo>  (ASCII, para que la lea el workflow).

Fuente oficial: la pagina de datos abiertos del SAT https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html
enlaza a la URL de abajo. SOLO HTTPS: el script se niega a otra cosa.
"""
import csv
import datetime as dt
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

URL = 'https://wu1agsprosta001.blob.core.windows.net/agsc-publicaciones/Datos_abiertos/Documents_AGAFF/Listado_completo_69-B.csv'
PAGINA_SAT = 'https://www.sat.gob.mx/minisitio/DatosAbiertos/contribuyentes_publicados.html'
RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / 'herramientas' / 'lista-69b' / 'listado.json'
MESES = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split()
# Situacion del listado -> codigo corto. Lista CERRADA: una situacion nueva hace fallar la validacion (falla cerrado).
SITUACIONES = {'presunto': 'P', 'definitivo': 'D', 'desvirtuado': 'V', 'sentencia favorable': 'S'}
# Columna de la fecha de publicacion en el DOF de cada etapa, por su encabezado EXACTO.
ETAPAS = {
    'P': 'Publicación DOF presuntos', 'V': 'Publicación DOF desvirtuados',
    'D': 'Publicación DOF definitivos', 'S': 'Publicación DOF sentencia favorable',
}
MIN_FILAS = 10000
MAX_VARIACION = 0.10


class Invalido(Exception):
    pass


def _fecha_iso(s):
    s = (s or '').strip()
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if not m:
        return ''
    try:
        return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
    except ValueError:
        return ''


def construir(contenido, previo=None):
    """bytes del CSV -> dict listo para listado.json. Lanza Invalido si algo no cuadra."""
    try:
        texto = contenido.decode('utf-8')
    except UnicodeDecodeError:
        texto = contenido.decode('latin-1')
    lineas = texto.splitlines()
    if not lineas:
        raise Invalido('archivo vacio')
    m = re.search(r'Informaci[oó]n actualizada al (\d{1,2}) de ([a-z]+) de (\d{4})', lineas[0], re.I)
    if not m or m.group(2).lower() not in MESES:
        raise Invalido('el encabezado no trae la fecha «Informacion actualizada al ...»')
    fecha_info = dt.date(int(m.group(3)), MESES.index(m.group(2).lower()) + 1, int(m.group(1))).isoformat()
    idx = next((i for i, l in enumerate(lineas[:10]) if l.startswith('No,RFC,')), None)
    if idx is None:
        raise Invalido('no encuentro la fila de encabezados No,RFC,...')
    filas = list(csv.reader(lineas[idx:]))
    cab = filas[0]
    faltan = [c for c in ['RFC', 'Nombre del Contribuyente', 'Situación del contribuyente'] + list(ETAPAS.values()) if c not in cab]
    if faltan:
        raise Invalido(f'faltan columnas: {faltan}')
    i_rfc, i_nom, i_sit = cab.index('RFC'), cab.index('Nombre del Contribuyente'), cab.index('Situación del contribuyente')
    i_et = {k: cab.index(v) for k, v in ETAPAS.items()}
    por_rfc, n, raras = {}, 0, set()
    for f in filas[1:]:
        if len(f) < len(cab):
            continue
        rfc = f[i_rfc].strip().upper()
        if len(rfc) < 12:
            continue
        sit = SITUACIONES.get(f[i_sit].strip().lower())
        if sit is None:
            raras.add(f[i_sit].strip())
            continue
        n += 1
        por_rfc.setdefault(rfc, []).append([sit, f[i_nom].strip()] + [_fecha_iso(f[i_et[k]]) for k in 'PVDS'])
    if raras:
        raise Invalido(f'situaciones que no reconozco: {sorted(raras)}')
    if n < MIN_FILAS:
        raise Invalido(f'solo {n} filas (minimo {MIN_FILAS})')
    if previo:
        if previo.get('fecha_info') and fecha_info < previo['fecha_info']:
            raise Invalido(f'la fecha del encabezado ({fecha_info}) es anterior a la publicada ({previo["fecha_info"]})')
        if previo.get('filas') and abs(n - previo['filas']) / previo['filas'] > MAX_VARIACION:
            raise Invalido(f'{n} filas frente a {previo["filas"]}: variacion mayor del {MAX_VARIACION:.0%}')
    return {
        '_nota': 'GENERADO por .herramientas/lista69b.py desde el listado oficial del SAT. No se edita a mano.',
        'fuente': URL, 'pagina_sat': PAGINA_SAT, 'fecha_info': fecha_info,
        'sha256': hashlib.sha256(contenido).hexdigest(), 'filas': n, 'rfc_distintos': len(por_rfc),
        'estado': 'ACTUALIZADO', 'actualizado': dt.date.today().isoformat(), 'ultimo_fallo': None,
        'columnas': ['situacion', 'nombre', 'dof_presunto', 'dof_desvirtuado', 'dof_definitivo', 'dof_sentencia_favorable'],
        'r': dict(sorted(por_rfc.items())),
    }


def escribir(d):
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')


def leer_previo():
    return json.loads(SALIDA.read_text(encoding='utf-8')) if SALIDA.exists() else None


def descargar():
    if not URL.startswith('https://'):
        raise Invalido('la fuente no es https')
    req = urllib.request.Request(URL, headers={'User-Agent': 'taxcerteza-herramientas/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        if r.status != 200:
            raise Invalido(f'HTTP {r.status}')
        return r.read()


def main(argv):
    orden = argv[1] if len(argv) > 1 else ''
    previo = leer_previo()
    try:
        if orden == 'desde':
            d = construir(Path(argv[2]).read_bytes(), previo)
        elif orden == 'actualizar':
            contenido = descargar()
            if previo and previo.get('sha256') == hashlib.sha256(contenido).hexdigest() and previo.get('estado') == 'ACTUALIZADO':
                print('el archivo del SAT no cambio')
                print('SIN_CAMBIO')
                return 0
            d = construir(contenido, previo)
        elif orden == 'fallo':
            if not previo:
                print('FALLO no hay listado previo que marcar')
                return 1
            if previo.get('estado') != 'NO_SE_PUDO_ACTUALIZAR':
                previo['estado'] = 'NO_SE_PUDO_ACTUALIZAR'
                previo['ultimo_fallo'] = dt.date.today().isoformat()
                escribir(previo)
                print('CAMBIO')
            else:
                print('SIN_CAMBIO')
            return 0
        else:
            print(__doc__)
            return 2
    except Exception as e:  # cualquier fallo se reporta con su motivo; el workflow decide si marca el listado
        print(f'FALLO {type(e).__name__}: {e}')
        return 1
    escribir(d)
    print(f"listado al {d['fecha_info']}: {d['filas']} filas, {d['rfc_distintos']} RFC, {SALIDA.stat().st_size:,} bytes")
    print('CAMBIO')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
