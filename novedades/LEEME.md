# /novedades/ — historial público de versiones

**Para qué sirve.** Que quien visita taxcerteza.mx (y los buscadores y asistentes
de IA) vea cada versión, su fecha y lo que trae: el ritmo de mejora del programa.

**Fuente única:** `novedades/versiones.json`. La página `novedades/index.html` se
genera a partir de él con `python novedades/generar.py`, y nunca se edita a mano.

## Cada vez que se publica una versión

1. Al subir `version.json` con la versión nueva, se añade su entrada **arriba** en
   `versiones.json`: versión, fecha, un título corto y de 1 a 5 puntos.
2. Se ejecuta `python novedades/generar.py`, que comprueba las reglas y regenera
   la página.
3. `python novedades/generar.py --check` falla si la versión de `version.json` no
   tiene entrada, o si la página no coincide con el JSON.

Lo puede hacer cualquier sesión o persona: no depende de quién publicó la versión.

## Cómo se redacta (lo comprueba `generar.py`)

La página pública cuenta lo que el programa **hace ahora**, no lo que hacía mal.

- **Sí:** capacidades nuevas, en lenguaje de contador. Por ejemplo: «Las notas
  de crédito ajustan el IVA de su mes junto con su comprobación».
- **No:** errores corregidos, defectos conocidos, «ya no…», «se contaba dos veces»,
  avisos de no enviar un archivo, trabajo incompleto o temas de seguridad.
  Esos avisos son necesarios, pero van **dentro del programa** (`notas_es` de
  `version.json`), que es donde el usuario los necesita.
- Nada de cifras de clientes, nombres internos ni identificadores de trabajo.
- Lo que todavía no está terminado no se anuncia.
- Entre 1 y 5 puntos por versión, de 200 caracteres como máximo cada uno.

Si un cambio solo se puede contar mencionando un error, no se cuenta.

## Qué versiones se listan

Las publicadas en este sitio (las que pasaron por `version.json`). Las versiones de
prueba internas no se listan.
