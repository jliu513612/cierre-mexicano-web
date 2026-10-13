"""Estilo de los textos de /herramientas/. Usa las MISMAS listas que el blog (.revision/revisar.py): no hay una segunda lista.

Uso: python -X utf8 .herramientas/estilo.py      sale con 1 si algo no pasa

Mira el texto visible de las paginas y los textos que pintan los scripts: sin rayas largas, sin exclamaciones, sin
muletillas, sin terminos prohibidos y sin «usted debe». Las metricas de ritmo del blog (parrafos, frases) no aplican
a una pagina de herramienta y no se miden aqui.
"""
import html
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / ".revision"))
import revisar  # noqa: E402  (el canonico del sitio)


def texto_de(p):
    s = p.read_text(encoding="utf-8")
    if p.suffix == ".html":
        s = re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S)
        return html.unescape(re.sub(r"<[^>]+>", " ", s))
    # En un script solo cuentan las cadenas largas con espacios: son los textos que ve el visitante.
    return " ".join(c for c in re.findall(r"'([^'\n]{12,})'", s) if " " in c and not re.search(r"[=;{}()]", c))


def main():
    mal = 0
    archivos = [p for p in sorted((RAIZ / "herramientas").rglob("*")) if p.suffix in (".html", ".js")]
    for p in archivos:
        t = texto_de(p)
        bajo, f = t.lower(), []
        if "—" in t or "–" in t:
            f.append("raya larga")
        if "!" in t or "¡" in t:
            f.append("exclamacion")
        f += [f"muletilla: {x}" for x in revisar.MULETILLAS if x in bajo]
        for x in revisar.PROHIBIDAS:
            patron = r"(?<![a-záéíóúñ])" + re.escape(x) + r"(?![a-záéíóúñ])" if x.isalpha() else re.escape(x)
            if re.search(patron, bajo):
                f.append(f"termino prohibido: {x}")
        if re.search(r"\busted(es)?\b|\bdeber?[áa]?s?\b|tienes que", bajo):
            f.append("tono de orden (usted / debe / tienes que)")
        print(("NO PASA " if f else "pasa    ") + str(p.relative_to(RAIZ)), f or "")
        mal += bool(f)
    print(f"{len(archivos)} archivos, {mal} con fallos")
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
