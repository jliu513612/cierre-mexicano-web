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
    "verificar-factura": "/herramientas/verificar-factura/",
    "lista-69b": "/herramientas/lista-69b/",
    "factura-con-retenciones": "/herramientas/factura-con-retenciones/",
    "calendario-dia-17": "/herramientas/calendario-dia-17/",
}


# Formulario ESTATICO que Netlify detecta al desplegar. No se ve ni se usa a mano: opinion.js envia con fetch a este
# mismo nombre. Los campos son la lista completa de lo que se puede enviar; no hay campo para lo tecleado.
FORMULARIO = (
    '<form name="opinion-herramientas" method="POST" data-netlify="true" netlify-honeypot="sitio" hidden aria-hidden="true">'
    '<input type="hidden" name="herramienta"><input type="hidden" name="clase"><input type="hidden" name="voto">'
    '<input type="hidden" name="motivo"><input type="hidden" name="correo"><input type="hidden" name="fecha">'
    '<input type="hidden" name="sitio"></form>\n')


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
    _ret = json.loads((AQUI / "datos" / "retenciones.json").read_text(encoding="utf-8"))
    _que = {"liva-1-a": "quién está obligado a retener el IVA, entre ellos la persona moral que recibe servicios personales independientes, usa o goza bienes de una persona física, o recibe servicios de autotransporte terrestre de bienes",
            "rliva-3": "retención en cantidad menor: dos terceras partes del IVA (fracción I) y 4 % del valor del flete (fracción II)",
            "lisr-106": "retención del 10 % que hace la persona moral sobre los servicios profesionales",
            "lisr-116": "retención del 10 % que hace la persona moral sobre el arrendamiento de inmuebles",
            "lisr-113-j": "retención del 1.25 % que hace la persona moral a una persona física del RESICO"}
    _ley = {"LIVA": "Ley del IVA", "RLIVA": "Reglamento de la Ley del IVA", "LISR": "Ley del ISR"}

    def _reforma(v):
        m = re.search(r"[UuÚú]ltima reforma(?: publicada| del documento)? DOF (\d{2}-\d{2}-\d{4})", v)
        if not m:
            raise SystemExit(f"sin fecha de ultima reforma en la vigencia: {v}")
        return f"Texto vigente, última reforma DOF {m.group(1)}"

    def _cita(c):
        ley, resto = c.split(", ", 1)
        return f"{_ley[ley]}, {resto}"
    v_uma["FUENTES_RET"] = "\n".join(
        f'      <li><a href="{html.escape(f["url"])}" rel="noopener">{html.escape(_cita(f["cita"]))}</a>: {_que[k]}. {_reforma(f["vigencia"])}.</li>'
        for k, f in _ret["fuentes"].items())
    _cal = json.loads((AQUI / "datos" / "calendario.json").read_text(encoding="utf-8"))
    _que_cal = {"lisr-14": "los pagos provisionales mensuales del ISR se presentan a más tardar el día 17 del mes inmediato posterior",
                "liva-5-d": "el IVA se calcula por mes de calendario y se paga a más tardar el día 17 del mes siguiente",
                "cff-12": "días inhábiles; si el último día del plazo es inhábil, se prorroga hasta el siguiente día hábil; las vacaciones generales del SAT no cuentan como inhábiles para declaraciones y pagos",
                "rmf-2026-4-5-1": "la información de operaciones con proveedores (DIOT) se presenta durante el mes inmediato posterior",
                "rmf-2026-2-1-6": "periodos de vacaciones generales del SAT en 2026",
                "dec-compila-2013-5.1": "días hábiles adicionales al día 17 según el sexto dígito numérico del RFC, con supuestos excluidos"}
    _nombre_cal = {"LISR": "Ley del ISR, artículo {a}", "LIVA": "Ley del IVA, artículo {a}", "CFF": "Código Fiscal de la Federación, artículo {a}",
                   "RMF": "Resolución Miscelánea Fiscal para 2026, regla {a}", "DECCOMPILA2013": "Decreto que compila diversos beneficios fiscales, artículo {a}"}

    def _vig_cal(f):
        if f["ley"] in ("LISR", "LIVA", "CFF"):
            return _reforma(f["vigencia"])
        return f'{"Publicado" if f["ley"] == "DECCOMPILA2013" else "Publicada"} en el DOF el {f["publicacion"]}'
    v_uma["FUENTES_CAL"] = "\n".join(
        f'      <li><a href="{html.escape(_cal["fuentes"][k]["url"])}" rel="noopener">{_nombre_cal[_cal["fuentes"][k]["ley"]].format(a=_cal["fuentes"][k]["articulo"])}</a>: {_que_cal[k]}. {_vig_cal(_cal["fuentes"][k])}.</li>'
        for k in _que_cal)
    v_uma["CAL_ANIOS"] = " y ".join(str(x) for x in _cal["anios"])
    _dias = {}
    for d in "1234567890":
        _dias.setdefault(_cal["dias_por_digito"][d], []).append(d)
    v_uma["CAL_TABLA_DIGITOS"] = "\n".join(
        f'<tr><th scope="row">{" y ".join(ds)}</th><td>{n} {"día" if n == 1 else "días"}</td></tr>' for n, ds in _dias.items())
    v_uma["CAL_OPCIONES"] = "\n".join(f'          <option value="{x}">{x}</option>' for x in _cal["anios"])
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
            "CUERPO": cuerpo, "SCRIPTS": s.get("SCRIPTS", ""), "FORMULARIO": "" if nombre == "indice" else FORMULARIO,
        })
        if "[[" in pagina or "{{" in pagina or "@@" in pagina:
            raise SystemExit(f"{nombre}: quedaron marcadores sin rellenar")
        salidas[ruta.strip("/") + "/index.html"] = pagina
    limpio = {k: v for k, v in datos_uma.items() if k != "_nota"}
    salidas["herramientas/valor-uma/uma-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/uma.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCUmaDatos = datos;\n})(this, " + json.dumps(limpio, ensure_ascii=False, indent=1) + ");\n")
    ret = {k: v for k, v in json.loads((AQUI / "datos" / "retenciones.json").read_text(encoding="utf-8")).items() if k != "_nota"}
    salidas["herramientas/factura-con-retenciones/retenciones-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/retenciones.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCRetencionesDatos = datos;\n})(this, " + json.dumps(ret, ensure_ascii=False, indent=1) + ");\n")
    cal = {k: v for k, v in json.loads((AQUI / "datos" / "calendario.json").read_text(encoding="utf-8")).items() if k != "_nota"}
    salidas["herramientas/calendario-dia-17/calendario-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/calendario.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCCalendarioDatos = datos;\n})(this, " + json.dumps(cal, ensure_ascii=False, indent=1) + ");\n")
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
