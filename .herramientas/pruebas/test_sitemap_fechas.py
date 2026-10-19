"""lastmod del sitemap de /herramientas/: una pagina que no cambia conserva su fecha; una que cambia toma la de hoy.

Uso:  python -X utf8 .herramientas/pruebas/test_sitemap_fechas.py   (sale con 1 si algo falla)
"""
import copy
import json
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AQUI))
sys.dont_write_bytecode = True
import construir as K  # noqa: E402

fallos = []


def exige(c, m):
    print(("  ok    " if c else "  FALLA ") + m)
    if not c:
        fallos.append(m)


previas = json.loads((AQUI / "fechas.json").read_text(encoding="utf-8"))
base = K.construir()
r = K.con_sitemap(dict(base), hoy="2099-01-01", previas=copy.deepcopy(previas))
nuevas = json.loads(r[".herramientas/fechas.json"])
exige(all(nuevas[k]["fecha"] == previas[k]["fecha"] for k in previas), "sin cambios, cada pagina conserva su fecha")
exige("2099-01-01" not in r["herramientas/sitemap.xml"], "sin cambios, el sitemap no estrena fecha")
otra = dict(base)
otra["herramientas/iva-del-mes/index.html"] = base["herramientas/iva-del-mes/index.html"].replace("</main>", "<p>x</p></main>", 1)
exige(otra["herramientas/iva-del-mes/index.html"] != base["herramientas/iva-del-mes/index.html"], "calibracion: la pagina cambio")
r2 = K.con_sitemap(otra, hoy="2099-01-01", previas=copy.deepcopy(previas))
n2 = json.loads(r2[".herramientas/fechas.json"])
exige(n2["/herramientas/iva-del-mes/"]["fecha"] == "2099-01-01", "la pagina que cambio toma la fecha de hoy")
exige(all(n2[k]["fecha"] == previas[k]["fecha"] for k in previas if k != "/herramientas/iva-del-mes/"), "las demas conservan la suya")
exige("<loc>https://taxcerteza.mx/herramientas/iva-del-mes/</loc><lastmod>2099-01-01</lastmod>" in r2["herramientas/sitemap.xml"], "y el sitemap lo dice")
exige(set(nuevas) == set(K.PAGINAS.values()), "una entrada por pagina construida")
print("test_sitemap_fechas.py: %d fallos" % len(fallos))
sys.exit(1 if fallos else 0)
