"""Construye las paginas de /herramientas/ a partir de las plantillas y de los datos extraidos del programa.

Uso:  python -X utf8 .herramientas/construir.py              escribe las paginas
      python -X utf8 .herramientas/construir.py --comprobar  no escribe; sale con 1 si lo publicado no coincide

No necesita el repo del programa: solo lee .herramientas/datos/uma.json (que escribe extraer_del_producto.py).
Una sola fuente por cosa: la barra y el pie salen de plantillas/base.html; las preguntas frecuentes visibles y
el FAQPage de los datos estructurados salen del mismo bloque @@FAQ; los numeros de la UMA salen de datos/uma.json.
"""
import html
import json
import re
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SITIO = "https://taxcerteza.mx"
MESES = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split()
PAGINAS = {  # plantilla -> ruta publicada
    "indice": "/herramientas/",
    "validar-rfc": "/herramientas/validar-rfc/",
    "valor-uma": "/herramientas/valor-uma/",
    "complemento-de-pago": "/herramientas/complemento-de-pago/",
}


def fecha_larga(iso):
    a, m, d = (int(x) for x in iso.split("-"))
    return f"{d} de {MESES[m - 1]} de {a}"


def pesos(texto):
    entero, dec = texto.split(".")
    return f"{int(entero):,}.{dec}"


def sin_etiquetas(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h))).strip()


def variables_uma():
    d = json.loads((AQUI / "datos" / "uma.json").read_text(encoding="utf-8"))
    u = d["valores"][-1]
    filas = []
    for v in reversed(d["valores"]):
        filas.append(
            f'<tr><th scope="row">{v["anio"]}</th><td>${pesos(v["diario"])}</td><td>${pesos(v["mensual"])}</td>'
            f'<td>${pesos(v["anual"])}</td><td>{fecha_larga(v["desde"])} al {fecha_larga(v["hasta"])}</td>'
            f'<td><a href="{html.escape(v["url"])}" rel="noopener">DOF {fecha_larga(v["dof"])}</a></td></tr>')
    fuentes = "\n".join(
        f'    <li>INEGI, valores de la UMA {v["anio"]}: <a href="{html.escape(v["url"])}" rel="noopener">Diario Oficial de la '
        f'Federación del {fecha_larga(v["dof"])}</a>. Vigentes del {fecha_larga(v["desde"])} al {fecha_larga(v["hasta"])}.</li>'
        for v in reversed(d["valores"]))
    return d, {
        "UMA_ANIO": str(u["anio"]), "UMA_DIARIO": pesos(u["diario"]), "UMA_MENSUAL": pesos(u["mensual"]),
        "UMA_ANUAL": pesos(u["anual"]), "UMA_DESDE": fecha_larga(u["desde"]), "UMA_HASTA": fecha_larga(u["hasta"]),
        "UMA_DOF": fecha_larga(u["dof"]), "UMA_URL": html.escape(u["url"]), "UMA_VERIFICADO": fecha_larga(d["verificado"]),
        "UMA_PRIMER_DESDE": fecha_larga(d["valores"][0]["desde"]), "UMA_LEY_URL": html.escape(d["ley"]["url"]),
        "UMA_TABLA": "\n".join(filas), "UMA_FUENTES": fuentes,
        "UMA_HASTA_ISO": u["hasta"], "UMA_DESDE_ISO": u["desde"],
    }


def rellenar(texto, variables):
    def uno(m):
        k = m.group(1)
        if k not in variables:
            raise SystemExit(f"marcador sin valor: {k}")
        return variables[k]
    return re.sub(r"\{\{([A-Z_]+)\}\}", uno, texto)


def leer_plantilla(nombre):
    crudo = (AQUI / "plantillas" / f"{nombre}.html").read_text(encoding="utf-8")
    partes = re.split(r"^@@([A-Z_]+)[ \t]*\n", crudo, flags=re.M)
    return {partes[i]: partes[i + 1].strip("\n") for i in range(1, len(partes), 2)}


def construir():
    datos_uma, v_uma = variables_uma()
    base = (AQUI / "plantillas" / "base.html").read_text(encoding="utf-8")
    salidas = {}
    for nombre, ruta in PAGINAS.items():
        s = {k: rellenar(v, v_uma) for k, v in leer_plantilla(nombre).items()}
        faq = re.findall(r"^P: (.+)\nR: (.+)$", s.get("FAQ", ""), flags=re.M)
        faq_html = "\n".join(f"<details><summary>{p}</summary>\n<p>{r}</p></details>" for p, r in faq)
        migas = [("Inicio", "/"), ("Herramientas", "/herramientas/")]
        if nombre != "indice":
            migas.append((s["MIGA"], ruta))
        grafo = []
        if nombre == "indice":
            grafo.append({"@type": "CollectionPage", "name": s["TITULO_CORTO"], "url": SITIO + ruta, "description": s["DESCRIPCION"],
                          "inLanguage": "es-MX", "isPartOf": {"@type": "WebSite", "name": "Tax Certeza", "url": SITIO + "/"},
                          "hasPart": [{"@type": "WebApplication", "name": leer_plantilla(n)["TITULO_CORTO"], "url": SITIO + r}
                                      for n, r in PAGINAS.items() if n != "indice"]})
        else:
            grafo.append({"@type": "WebApplication", "name": s["TITULO_CORTO"], "url": SITIO + ruta, "description": s["DESCRIPCION"],
                          "applicationCategory": "BusinessApplication", "operatingSystem": "All",
                          "browserRequirements": "Requiere JavaScript", "inLanguage": "es-MX", "isAccessibleForFree": True,
                          "publisher": {"@type": "Organization", "name": "Tax Certeza", "url": SITIO,
                                        "logo": SITIO + "/apple-touch-icon.png"}})
            grafo.append({"@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": sin_etiquetas(p), "acceptedAnswer": {"@type": "Answer", "text": sin_etiquetas(r)}}
                for p, r in faq]})
        grafo.append({"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": SITIO + r} for i, (n, r) in enumerate(migas)]})
        miga_html = '<nav class="migas" aria-label="Ruta de navegación"><ol>' + "".join(
            f'<li><a href="{r}">{n}</a></li>' if i < len(migas) - 1 else f'<li aria-current="page">{n}</li>'
            for i, (n, r) in enumerate(migas)) + "</ol></nav>"
        cuerpo = s["CUERPO"].replace("[[FAQ]]", faq_html).replace("[[MIGAS]]", miga_html)
        pagina = rellenar(base, {
            "TITULO": html.escape(s["TITULO"], quote=True), "DESCRIPCION": html.escape(s["DESCRIPCION"], quote=True), "RUTA": ruta,
            "JSONLD": json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False).replace("</", "<\\/"),
            "NAV_ACTUAL": ' aria-current="page"' if nombre == "indice" else "",
            "CUERPO": cuerpo, "SCRIPTS": s.get("SCRIPTS", ""),
        })
        if "[[" in pagina or "{{" in pagina or "@@" in pagina:
            raise SystemExit(f"{nombre}: quedaron marcadores sin rellenar")
        salidas[ruta.strip("/") + "/index.html"] = pagina
    limpio = {k: v for k, v in datos_uma.items() if k != "_nota"}
    salidas["herramientas/valor-uma/uma-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/uma.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCUmaDatos = datos;\n})(this, " + json.dumps(limpio, ensure_ascii=False, indent=1) + ");\n")
    return salidas


def main():
    comprobar = "--comprobar" in sys.argv
    mal = 0
    for rel, contenido in construir().items():
        p = RAIZ / rel
        if comprobar:
            igual = p.exists() and p.read_text(encoding="utf-8") == contenido
            print(("igual    " if igual else "DISTINTO ") + rel)
            mal += not igual
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(contenido, encoding="utf-8", newline="\n")
            print(f"escrito  {rel} ({len(contenido.encode('utf-8')):,} bytes)")
    if mal:
        sys.exit("lo publicado no coincide con las plantillas y los datos: ejecuta construir.py y sube el resultado")


if __name__ == "__main__":
    main()
