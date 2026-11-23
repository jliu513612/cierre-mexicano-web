"""Genera novedades/index.html desde novedades/versiones.json y comprueba sus reglas.

Uso:
  python novedades/generar.py           genera la pagina (y comprueba)
  python novedades/generar.py --check   solo comprueba: rc 1 si algo falla

Reglas (por que existen: ver novedades/LEEME.md):
  1. La version de version.json (la que se descarga hoy) tiene entrada aqui.
  2. Versiones unicas, fechas AAAA-MM-DD, orden de la mas nueva a la mas antigua.
  3. Entre 1 y 5 puntos por version, cada uno de 200 caracteres o menos.
  4. Ningun texto usa el vocabulario que rompe la confianza (errores pasados,
     avisos de defectos, trabajo incompleto). Esos avisos van DENTRO del
     programa, en version.json, no en la pagina publica.
  5. La pagina publicada coincide con lo que genera este script.
"""
import datetime
import html
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "novedades" / "versiones.json"
SALIDA = RAIZ / "novedades" / "index.html"
PLANTILLA = RAIZ / "blog" / "index.html"   # nav, estilos y pie: uno solo para todo el sitio

PROHIBIDO = [
    r"\berror", r"\bbug", r"\bfall[oa]", r"\bcorrig", r"\bcorrecci", r"(?<!por )\bdefecto",
    r"\bproblema", r"\bya no\b", r"\bdos veces\b", r"de m[aá]s\b", r"\bno env[ií]es",
    r"\bincomplet", r"no est[aá] complet", r"\bsal[ií]an\b", r"\baviso importante",
    r"\bvulnerab", r"\bseguridad\b", r"\bfuga\b", r"\bperd[ií]", r"\bmal\b",
]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(iso):
    d = datetime.date.fromisoformat(iso)
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def comprobar(datos):
    fallos = []
    vs = datos["versiones"]
    actual = json.loads((RAIZ / "version.json").read_text(encoding="utf-8"))["version"]
    nums = [v["version"] for v in vs]
    if actual not in nums:
        fallos.append(f"la version publicada {actual} (version.json) no tiene entrada en versiones.json")
    if len(set(nums)) != len(nums):
        fallos.append("hay versiones repetidas")
    fechas = []
    for v in vs:
        try:
            fechas.append(datetime.date.fromisoformat(v["fecha"]))
        except ValueError:
            fallos.append(f"{v['version']}: fecha no es AAAA-MM-DD: {v['fecha']!r}")
        pts = v.get("puntos", [])
        if not 1 <= len(pts) <= 5:
            fallos.append(f"{v['version']}: {len(pts)} puntos (entre 1 y 5)")
        for t in [v.get("titulo", "")] + pts:
            if len(t) > 200:
                fallos.append(f"{v['version']}: texto de mas de 200 caracteres: {t[:60]}…")
            for pat in PROHIBIDO:
                if re.search(pat, t, re.I):
                    fallos.append(f"{v['version']}: vocabulario que rompe la confianza ({pat}): {t[:80]}…")
    if fechas != sorted(fechas, reverse=True):
        fallos.append("las versiones no van de la mas nueva a la mas antigua")
    return fallos


def generar(datos):
    pl = PLANTILLA.read_text(encoding="utf-8")
    estilo = re.search(r"<style>.*?</style>", pl, re.S).group(0)
    nav = re.search(r"<nav>.*?</nav>", pl, re.S).group(0)
    pie = re.search(r"<footer>.*?</footer>", pl, re.S).group(0)
    vs = datos["versiones"]
    ult = vs[0]
    primera = datetime.date.fromisoformat(vs[-1]["fecha"])
    url = "https://taxcerteza.mx/novedades/"
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "WebPage", "name": "Novedades de Tax Certeza", "url": url, "inLanguage": "es-MX",
             "dateModified": ult["fecha"],
             "description": "Historial de versiones de Tax Certeza: número, fecha y novedades de cada versión publicada."},
            {"@type": "SoftwareApplication", "name": "Tax Certeza", "applicationCategory": "BusinessApplication",
             "operatingSystem": "Windows", "softwareVersion": ult["version"], "datePublished": ult["fecha"],
             "releaseNotes": url, "url": "https://taxcerteza.mx/"},
        ],
    }
    e = html.escape
    bloques = []
    for v in vs:
        pts = "".join(f"<li>{e(p)}</li>" for p in v["puntos"])
        bloques.append(
            f'<section class="ver" id="v{e(v["version"])}"><div class="vh"><h2>Versión {e(v["version"])}</h2>'
            f'<time datetime="{e(v["fecha"])}">{e(fecha_larga(v["fecha"]))}</time></div>'
            f'<p class="vt">{e(v["titulo"])}</p><ul>{pts}</ul></section>')
    extra = """
.ver{border:1px solid #E2E8F0;border-radius:14px;padding:20px 24px;margin:0 0 18px;background:#fff}
.vh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.vh h2{font-size:21px;color:#1E40AF;margin:0}.vh time{color:#64748B;font-size:14px}
.vt{font-weight:700;color:#0F172A;margin:6px 0 4px;font-size:16.5px}
.ver ul{margin:8px 0 0 22px}.ver li{margin:5px 0;font-size:16px;color:#334155}
.resumen{display:flex;gap:14px;flex-wrap:wrap;margin:0 0 28px}
.resumen div{flex:1 1 180px;background:#EFF6FF;border-radius:12px;padding:14px 18px}
.resumen b{display:block;font-size:24px;color:#1E40AF}.resumen span{color:#475569;font-size:14px}
"""
    estilo = estilo.replace("</style>", extra + "</style>")
    cuerpo = f"""<div class="list">
  <h1>Novedades de Tax Certeza</h1>
  <p class="sub">Cada versión publicada, con su fecha y lo que trae para tu cierre fiscal.</p>
  <div class="resumen"><div><b>{e(ult['version'])}</b><span>versión actual · {e(fecha_larga(ult['fecha']))}</span></div>
  <div><b>{len(vs)}</b><span>versiones publicadas desde {MESES[primera.month - 1]} de {primera.year}</span></div></div>
  {''.join(bloques)}
  <p class="sub">Descarga la versión actual en <a href="/#descargar">taxcerteza.mx</a>. El programa te avisa cuando hay una versión nueva.</p>
</div>"""
    return f"""<!DOCTYPE html>
<html lang="es-MX"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>Novedades y versiones | Tax Certeza</title>
<meta name="description" content="Historial de versiones de Tax Certeza: número, fecha y novedades de cada versión. Versión actual {e(ult['version'])}, del {e(fecha_larga(ult['fecha']))}.">
<link rel="canonical" href="{url}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{estilo}
</head><body>
{nav}
{cuerpo}
{pie}
</body></html>
"""


def main():
    datos = json.loads(DATOS.read_text(encoding="utf-8"))
    fallos = comprobar(datos)
    pagina = generar(datos)
    if "--check" in sys.argv:
        if not SALIDA.exists() or SALIDA.read_text(encoding="utf-8") != pagina:
            fallos.append("novedades/index.html no coincide con versiones.json: ejecuta python novedades/generar.py")
    else:
        if not fallos:
            SALIDA.write_text(pagina, encoding="utf-8")
    for f in fallos:
        print("FALLA:", f)
    print("OK" if not fallos else f"{len(fallos)} fallo(s)")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
