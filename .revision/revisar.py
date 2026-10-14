"""Revision automatica de un articulo del blog (HTML ya construido).

Uso: python revisar.py <index.html> [<index.html> ...]
Sale con codigo 1 si algun articulo no pasa. Los umbrales son PROVISIONALES:
falta calibrarlos contra articulos escritos por personas (ver PLAN.md, seccion d).
"""
import html
import json
import re
import os
import statistics
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GENERALES = {"0", "2026"}

MULETILLAS = [
    "en el mundo actual", "es importante destacar", "cabe destacar", "cabe mencionar", "sin lugar a dudas",
    "en resumen", "en conclusión", "en definitiva", "a grandes rasgos", "dicho en una línea", "sin exagerar",
    "la buena noticia", "sin sobresaltos", "sin enredos", "en este sentido", "es fundamental", "es crucial",
    "juega un papel", "a la hora de", "no es paranoia", "pieza central", "herramientas como", "la clave está",
    "más vale", "en la era", "hoy en día", "sin sustos", "imagina que", "vale la pena señalar",
]
PROHIBIDAS = [
    "cierre mexicano", "mexican closing", "cpa", "veredicto", "dictamen", "multipuesto",
    "multi-puesto", "varios equipos", "en red", "inteligencia artificial", "(fin del art", "[related", "[affiliate",
    "<<<", "lorem",
]
NOTA_MARCA = "es una marca de su titular, sin relación ni afiliación con Tax Certeza"
UMBRAL = {
    # Calibrados el 2026-10-12 contra 8 articulos de contadores escritos por personas (2018-2022)
    # y los 4 articulos viejos del blog. Detalle y limites en ESTANDAR.md.
    "rayas_largas": 0, "muletillas_por_1000": 0.0, "no_es_sino_por_1000": 1.0, "negritas_pct": 4.0,
    "lista_pct": 50.0, "cv_parrafos_min": 0.30, "cv_frases_min": 0.40, "exclamaciones": 0,
    "enlaces_internos_min": 3, "preguntas_cuerpo_max": 2,
}


def texto(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def puertas_de_base(slug, art, fallos, m):
    """Hechos, funciones y cifras: lo que el articulo cita tiene que estar aprobado en la base."""
    # En el repo del blog: borradores/<slug>/meta.json y la base en la raiz.
    # En el repo del sitio (CI): REVISION_META=<dir con <slug>/meta.json>, REVISION_BASE=<dir con hechos.json y funciones.json>.
    dir_meta = Path(os.environ.get("REVISION_META") or RAIZ / "borradores")
    dir_base = Path(os.environ.get("REVISION_BASE") or RAIZ)
    meta_p = dir_meta / slug / "meta.json"
    if not meta_p.exists():
        fallos.append(f"sin meta.json para {slug}: no se puede cotejar contra la base")
        return
    meta = json.loads(meta_p.read_text(encoding="utf-8"))
    hechos = json.loads((dir_base / "hechos.json").read_text(encoding="utf-8"))["hechos"]
    fun = json.loads((dir_base / "funciones.json").read_text(encoding="utf-8"))
    permitidas = set(GENERALES)
    for h in meta.get("hechos", []):
        x = hechos.get(h)
        if x is None:
            fallos.append(f"hecho que no existe en la base: {h}")
            continue
        if x["estado"] != "aprobado" and slug not in x.get("tolerado_en", []):
            fallos.append(f"hecho no aprobado: {h} ({x['estado']})")
        permitidas |= {c.rstrip(".") for c in x["cifras"]}
    if not meta.get("hechos"):
        fallos.append("el articulo no declara ningun hecho de la base")
    fs = [fun["funciones"].get(f) for f in meta.get("funciones", [])]
    if not fs or None in fs:
        fallos.append("funciones declaradas que no existen en la lista, o ninguna declarada")
    else:
        if not any(f["confianza"] == "manual" for f in fs):
            fallos.append("todas las funciones citadas son de confianza 'codigo' (sin comprobar en el programa)")
        for f in fs:
            if f.get("obliga_a_decir") and f["obliga_a_decir"] not in texto(art).lower():
                fallos.append(f"falta decir '{f['obliga_a_decir']}' ({f['nombre']})")
    # Un bloque <div class="ejemplo"> puede llevar cifras ilustrativas, pero tiene que decir que son inventadas.
    for ej in re.findall(r'<div class="ejemplo">(.*?)</div>', art, flags=re.S):
        if "cifras inventadas" not in texto(ej).lower():
            fallos.append("bloque de ejemplo sin el aviso 'cifras inventadas'")
    zona = re.sub(r'<div class="meta">.*?</div>|<div class="ejemplo">.*?</div>|<section class="(?:fundamento|rel)">.*?</section>', " ", art, flags=re.S)
    cifras = re.findall(r"\d+o\.(?:-[A-Z])?|\d+(?:[.,]\d+)*(?:-[A-Z](?![a-z]))?", texto(zona))
    fuera = sorted({c for c in (x.rstrip(".") for x in cifras) if c not in permitidas})
    m["cifras"] = len(cifras)
    if fuera:
        fallos.append(f"cifras que no estan en los hechos citados: {fuera}")


def revisar(ruta, solo_estilo=False):
    s = open(ruta, encoding="utf-8").read()
    fallos, m = [], {}
    art = s.split("<article>")[1].split("</article>")[0]
    # el cuerpo redactado: sin FAQ, sin fundamento, sin CTA ni enlaces relacionados
    cuerpo = re.split(r'<section class="fundamento">|<h2>Preguntas frecuentes</h2>', art)[0]
    t_art, t = texto(art), texto(cuerpo)
    pal = len(t.split())
    m["palabras"] = pal
    bajo = t_art.lower()

    m["rayas_largas"] = t_art.count("—") + t_art.count("–")
    m["muletillas"] = [x for x in MULETILLAS if x in bajo]
    m["muletillas_por_1000"] = round(len(m["muletillas"]) * 1000 / pal, 2)
    nes = len(re.findall(r"\bno (?:es|son|se trata de|solo|sólo)\b[^.;]{0,80}\bsino\b", t.lower()))
    m["no_es_sino_por_1000"] = round(nes * 1000 / pal, 2)
    neg = sum(len(texto(x).split()) for x in re.findall(r"<strong>(.*?)</strong>", cuerpo, re.S))
    m["negritas_pct"] = round(neg * 100 / pal, 1)
    lis = sum(len(texto(x).split()) for x in re.findall(r"<li>(.*?)</li>", cuerpo, re.S))
    m["lista_pct"] = round(lis * 100 / pal, 1)
    parr = [len(texto(x).split()) for x in re.findall(r"<p[^>]*>(.*?)</p>", cuerpo, re.S)]
    m["cv_parrafos_min"] = round(statistics.pstdev(parr) / statistics.mean(parr), 2)
    fr = [len(x.split()) for x in re.split(r"(?<=[.!?])\s+", texto(re.sub(r"<li>.*?</li>", " ", cuerpo, flags=re.S))) if len(x.split()) > 2]
    m["cv_frases_min"] = round(statistics.pstdev(fr) / statistics.mean(fr), 2)
    m["exclamaciones"] = t_art.count("!") + t_art.count("¡")
    sin_h = re.sub(r"<h[1-6][^>]*>.*?</h[1-6]>", " ", cuerpo, flags=re.S)
    m["preguntas_cuerpo_max"] = texto(sin_h).count("?")
    m["enlaces_internos_min"] = len(set(re.findall(r'href="(/blog/[^"]+/)"', art)))
    ult = re.findall(r"<h2>(.*?)</h2>", cuerpo, re.S)
    m["titulos"] = len(ult)

    for k, lim in UMBRAL.items():
        v = m[k]
        if (k.endswith("_min") and v < lim) or (not k.endswith("_min") and v > lim):
            fallos.append(f"{k}={v} (umbral {lim})")
    for p in PROHIBIDAS:
        patron = r"(?<![a-záéíóúñ])" + re.escape(p) + r"(?![a-záéíóúñ])" if p.isalpha() else re.escape(p)
        if re.search(patron, s.lower()):
            fallos.append(f"termino prohibido: {p}")
    # June 2026-10-13: un articulo puede nombrar CONTPAQi, pero solo con la nota de marca ajena.
    if "contpaq" in s.lower() and NOTA_MARCA.lower() not in s.lower():
        fallos.append("nombra CONTPAQi sin la nota de marca ajena")
    if re.search(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b", t_art):
        fallos.append("posible RFC en el texto")
    if re.search(r"(?i)<h2>\s*(en resumen|conclusi[oó]n|en conclusi[oó]n|para terminar)", art):
        fallos.append("titulo de cierre tipo resumen")
    if not re.search(r'<p class="respuesta">[^<]{120,}', art):
        fallos.append("falta la respuesta directa al inicio")
    if not re.search(r"<time datetime=", art):
        fallos.append("falta fecha visible")

    # datos estructurados
    try:
        ld = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)]
        tipos = {n["@type"]: n for d in ld for n in d.get("@graph", [d])}
        for req in ("Article", "BreadcrumbList", "FAQPage"):
            if req not in tipos:
                fallos.append(f"falta JSON-LD {req}")
        a = tipos.get("Article", {})
        if not a.get("author") or not a.get("dateModified") or not a.get("citation"):
            fallos.append("Article sin author/dateModified/citation")
        vis = set(texto(x) for x in re.findall(r"<summary>(.*?)</summary>", art, re.S))
        if "FAQPage" in tipos and {q["name"] for q in tipos["FAQPage"]["mainEntity"]} != vis:
            fallos.append("FAQ visible y FAQPage no coinciden")
    except Exception as ex:  # JSON-LD que no parsea es fallo, no se salta
        fallos.append(f"JSON-LD invalido: {ex}")

    # cada articulo o regla citado en el texto debe estar en el bloque de fundamento
    marca = '<section class="fundamento">'
    fund = texto(art.split(marca)[1].split("</section>")[0]) if marca in art else ""
    if not fund:
        fallos.append("falta el bloque Fundamento legal")
    citas = set(re.findall(r"(?:art[ií]culos?|reglas?)\s+((?:\d+[\w.\-]*)(?:\.\d+)*)", t_art.split("Fundamento legal")[0], re.I))
    faltan = sorted(c.rstrip(".,") for c in citas if c.rstrip(".,") not in fund)
    if faltan:
        fallos.append(f"citas sin fundamento listado: {faltan}")
    m["citas"] = len(citas)
    for u in set(re.findall(r'href="(https?://[^"]+)"', art.split('class="cta"')[0])):
        if not re.match(r"https://(www\.)?(sat\.gob\.mx|dof\.gob\.mx|diputados\.gob\.mx)/.+", u):
            fallos.append(f"enlace externo no oficial o a una portada sin documento: {u}")
    if not solo_estilo:
        puertas_de_base(Path(ruta).resolve().parent.name, art, fallos, m)
    return m, fallos


if __name__ == "__main__":
    mal = 0
    estilo = "--solo-estilo" in sys.argv
    for r in [a for a in sys.argv[1:] if not a.startswith("--")]:
        m, f = revisar(r, solo_estilo=estilo)
        print(("NO PASA " if f else "PASA    ") + r)
        print("   ", {k: v for k, v in m.items()})
        for x in f:
            print("    -", x)
        mal += bool(f)
    sys.exit(1 if mal else 0)
