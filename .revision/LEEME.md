# Revision automatica del blog

Cada pull request pasa por `ci.py` (workflow `revision-blog`). El script y la base de hechos se toman de `main`, no del PR.

Cambiar algo de esta carpeta o de `.github/` es cambiar el estandar: lo decide la duena del sitio.

`ci.py` revisa solo lo que ESTE PR cambio: una pagina cuyo contenido es el del merge-base no se revisa aunque difiera de la punta de main (una rama vieja trae el texto y el dictamen viejos y el merge no los publica). Si el merge-base no se puede calcular, lo avisa y revisa todo lo que difiere de main. Prueba: `python -X utf8 .revision/pruebas/test_ci.py`, que el workflow corre antes de la revision.
