"""Revision automatica de un pull request del sitio. Se ejecuta en GitHub Actions.

Uso: python ci.py <dir_base> <dir_pr> <archivo_con_lista_de_cambios>

<dir_base> es la rama main (de ahi salen ESTE script, revisar.py y la base de hechos: el PR no puede cambiarlos
para aprobarse a si mismo). <dir_pr> es el contenido del PR, que se trata como DATOS: no se ejecuta nada de el.

Reglas:
1. Un PR que toca el blog solo puede tocar blog/, sitemap.xml, llms.txt y .revision/dictamenes/.
2. Un PR que toca .github/ o .revision/ (fuera de dictamenes) es un cambio del estandar: no puede traer articulos.
3. Cada articulo nuevo o cuyo contenido cambio debe pasar revisar.py y traer su dictamen del revisor independiente,
   hecho sobre ESE texto (huella), con puntaje >= minimo y sin hallazgos graves ni medios.
4. Como mucho un articulo NUEVO por PR, y como mucho <tope> articulos nuevos en main en los ultimos 7 dias.
"""
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

PERMITIDOS = ("blog/", "sitemap.xml", "llms.txt", ".revision/dictamenes/")
ESTANDAR = (".github/", ".revision/")


def huella(html_texto):
    """Huella del contenido propio del articulo: titulo, respuesta, cuerpo y preguntas. No incluye enlaces relacionados ni estilos."""
    art = html_texto.split("<article>")[1].split("</article>")[0]
    art = re.split(r'<section class="rel">', art)[0]
    art = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", art)).strip()
    return hashlib.sha256(art.encode("utf-8")).hexdigest()


def main(base, pr, lista):
    base, pr = Path(base), Path(pr)
    cambios = [x.strip() for x in Path(lista).read_text(encoding="utf-8").splitlines() if x.strip()]
    reglas = json.loads((base / ".revision" / "reglas.json").read_text(encoding="utf-8"))
    fallos, avisos = [], []

    toca_blog = [c for c in cambios if c.startswith(("blog/", "sitemap.xml", "llms.txt"))]
    toca_estandar = [c for c in cambios if c.startswith(ESTANDAR) and not c.startswith(".revision/dictamenes/")]
    if toca_estandar and toca_blog:
        fallos.append(f"el PR mezcla articulos con cambios del estandar: {toca_estandar}")
    if toca_estandar and not toca_blog:
        avisos.append("CAMBIO DEL ESTANDAR: este PR no trae articulos. Solo June decide si se mergea: " + ", ".join(toca_estandar))
    if toca_blog:
        fuera = [c for c in cambios if not c.startswith(PERMITIDOS)]
        if fuera:
            fallos.append(f"un PR del blog toca archivos fuera de lo permitido: {fuera}")

    sys.path.insert(0, str(base / ".revision"))
    os.environ["REVISION_META"] = str(pr / "blog")
    os.environ["REVISION_BASE"] = str(base / ".revision")
    import revisar  # el de main, nunca el del PR

    nuevos = 0
    for pag in sorted((pr / "blog").glob("*/index.html")):
        slug = pag.parent.name
        h_pr = huella(pag.read_text(encoding="utf-8"))
        vieja = base / "blog" / slug / "index.html"
        if vieja.exists() and huella(vieja.read_text(encoding="utf-8")) == h_pr:
            continue  # el contenido no cambio (solo enlaces relacionados o estilos)
        es_nuevo = not vieja.exists()
        nuevos += es_nuevo
        m, f = revisar.revisar(str(pag))
        for x in f:
            fallos.append(f"{slug}: {x}")
        dic_p = pr / ".revision" / "dictamenes" / f"{slug}.json"
        if not dic_p.exists():
            fallos.append(f"{slug}: falta el dictamen del revisor independiente")
            continue
        d = json.loads(dic_p.read_text(encoding="utf-8"))
        if d.get("huella") != h_pr:
            fallos.append(f"{slug}: el dictamen es de otra version del texto")
        # Desde el 2026-10-12 (June): el puntaje es el PROMEDIO de al menos dos revisores independientes.
        ps = d.get("puntajes") or []
        if len(ps) < reglas.get("revisores_minimos", 1):
            fallos.append(f"{slug}: el dictamen trae {len(ps)} puntajes y hacen falta {reglas.get('revisores_minimos', 1)}")
        media = sum(ps) / len(ps) if ps else d.get("puntaje", 0)
        if media < reglas["puntaje_minimo"]:
            fallos.append(f"{slug}: puntaje {media:.1f} menor que {reglas['puntaje_minimo']}")
        d["puntaje"] = round(media, 1)
        if not d.get("a_ciegas_con_anclas"):
            fallos.append(f"{slug}: el puntaje no se tomo a ciegas y con anclas")
        if d.get("graves", 1) or d.get("medios", 1):
            fallos.append(f"{slug}: el revisor dejo hallazgos graves o medios ({d.get('graves')}, {d.get('medios')})")
        print(f"revisado {slug}: nuevo={es_nuevo} puntaje={d.get('puntaje')} leves={d.get('leves')}")

    if nuevos > reglas["nuevos_por_pr"]:
        fallos.append(f"{nuevos} articulos nuevos en un PR (tope {reglas['nuevos_por_pr']})")
    if nuevos:
        # Semana CALENDARIO, de lunes 00:00 hora de la Ciudad de Mexico (UTC-6, sin horario de verano): con
        # lunes, miercoles y viernes, una ventana movil de 7 dias contaba el articulo del miercoles anterior.
        ahora = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-6)))
        lunes = (ahora - datetime.timedelta(days=ahora.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        r = subprocess.run(["git", "-C", str(base), "log", f"--since={lunes.isoformat()}", "--diff-filter=A", "--name-only", "--format=", "--", "blog/*/index.html"],
                           capture_output=True, text=True)
        recientes = {x for x in r.stdout.split() if x.endswith("/index.html")}
        if len(recientes) + nuevos > reglas["nuevos_por_semana"]:
            fallos.append(f"tope semanal: {len(recientes)} articulos nuevos desde el lunes {lunes:%Y-%m-%d} + {nuevos} (tope {reglas['nuevos_por_semana']})")

    for a in avisos:
        print("AVISO:", a)
    if fallos:
        print("NO PASA")
        for x in fallos:
            print(" -", x)
        return 1
    print("PASA")
    return 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
