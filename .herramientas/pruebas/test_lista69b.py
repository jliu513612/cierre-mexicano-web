"""Validaciones de .herramientas/lista69b.py con CSV inventados (forma del archivo del SAT, datos falsos).
Ejecutar: python -X utf8 .herramientas/pruebas/test_lista69b.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import lista69b as L  # noqa: E402

CAB = ('No,RFC,Nombre del Contribuyente,Situación del contribuyente,Número y fecha de oficio global de presunción SAT,'
       'Publicación página SAT presuntos,Número y fecha de oficio global de presunción DOF,Publicación DOF presuntos,'
       'Número y fecha de oficio global de contribuyentes que desvirtuaron SAT,Publicación página SAT desvirtuados,'
       'Número y fecha de oficio global de contribuyentes que desvirtuaron DOF,Publicación DOF desvirtuados,'
       'Número y fecha de oficio global de definitivos SAT,Publicación página SAT definitivos,'
       'Número y fecha de oficio global de definitivos DOF,Publicación DOF definitivos,'
       'Número y fecha de oficio global de sentencia favorable SAT,Publicación página SAT sentencia favorable,'
       'Número y fecha de oficio global de sentencia favorable DOF,Publicación DOF sentencia favorable')


def csv(n=10050, fecha='30 de septiembre de 2026', situacion='Definitivo', cab=CAB):
    filas = [f'"Información actualizada al {fecha}; los listados a que se hace mención, son de carácter público",,,',
             'Listado completo de contribuyentes (Artículo 69-B del CFF),,,', cab]
    for i in range(n):
        filas.append(f'{i + 1},AAA{100000 + i % 900000:06d}AB{i % 10},EMPRESA {i},{situacion},,,,02/01/2026,,,,,,,,15/03/2026,,,,')
    return '\n'.join(filas).encode('latin-1')


def falla(contenido, previo=None, contiene=''):
    try:
        L.construir(contenido, previo)
    except L.Invalido as e:
        assert contiene in str(e), f'motivo inesperado: {e}'
        return
    raise AssertionError(f'debia fallar ({contiene})')


d = L.construir(csv())
assert d['fecha_info'] == '2026-09-30' and d['filas'] == 10050 and d['estado'] == 'ACTUALIZADO'
assert d['r']['AAA100000AB0'][0] == ['D', 'EMPRESA 0', '2026-01-02', '', '2026-03-15', '']
falla(csv(fecha='treinta de septiembre'), contiene='no trae la fecha')
falla(csv(situacion='Cancelado'), contiene='situaciones que no reconozco')
falla(csv(n=500), contiene='minimo')
falla(csv(cab=CAB.replace('Publicación DOF definitivos', 'Publicacion DOF def')), contiene='faltan columnas')
falla(csv(fecha='31 de diciembre de 2025'), previo={'fecha_info': '2026-09-30', 'filas': 10050}, contiene='anterior')
falla(csv(n=12000), previo={'fecha_info': '2026-09-30', 'filas': 10050}, contiene='variacion')
falla(b'', contiene='vacio')
assert L.URL.startswith('https://')
print('lista69b.py: 9 comprobaciones, 0 fallos')
