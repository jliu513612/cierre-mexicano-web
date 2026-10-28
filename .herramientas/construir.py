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
    "iva-del-mes": "/herramientas/iva-del-mes/",
    "tipo-de-cambio": "/herramientas/tipo-de-cambio/",
    "diagnostico-del-mes": "/herramientas/diagnostico-del-mes/",
}


# Formulario ESTATICO que Netlify detecta al desplegar. No se ve ni se usa a mano: opinion.js envia con fetch a este
# mismo nombre. Los campos son la lista completa de lo que se puede enviar; no hay campo para lo tecleado.
FORMULARIO = (
    '<form name="opinion-herramientas" method="POST" data-netlify="true" netlify-honeypot="sitio" hidden aria-hidden="true">'
    '<input type="hidden" name="herramienta"><input type="hidden" name="clase"><input type="hidden" name="voto">'
    '<input type="hidden" name="motivo"><input type="hidden" name="fecha">'
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


def pie_herramienta(nombre):
    """Pie comun de cada herramienta: la norma que la sustenta con su fecha de revision (del registro del programa, via
    datos/normas.json), el aviso de que es informativa y no del SAT, y lo que se guarda y lo que no. Una herramienta sin
    normas declaradas no se construye (falla cerrado)."""
    d = json.loads((AQUI / "datos" / "normas.json").read_text(encoding="utf-8"))
    if nombre not in d["herramientas"]:
        raise SystemExit(f"{nombre}: sin normas en normas_por_herramienta.json")
    items = "\n".join(
        f'      <li><a href="{html.escape(d["normas"][k]["url"])}" rel="noopener">{html.escape(d["normas"][k]["cita"])}</a>: '
        f'revisada el {fecha_larga(d["normas"][k]["revisado"])}.</li>'
        for k in d["herramientas"][nombre])
    return (
        '\n  <div class="pie-herramienta">\n'
        '    <h2>Fundamento y revisión</h2>\n'
        '    <ul>\n' + items + '\n    </ul>\n'
        '    <p>Es una herramienta informativa, no un servicio oficial del SAT. Revisa con tu contador tu caso concreto.</p>\n'
        '    <p>Sin registro: no pide cuenta ni datos de contacto, y esta página no guarda lo que escribes o subes. Al obtener '
        'un resultado solo se cuenta que se usó la herramienta y, si procesó varios elementos (archivos, RFC o días), cuántos. Si pulsas '
        'Descargar, WhatsApp o el video, se cuenta el clic con esta página como origen. Si opinas, se guardan tu voto y tu '
        'comentario.</p>\n'
        '  </div>\n')


# Datos de EJEMPLO del diagnostico del mes: un caso de los vectores INVENTADOS del IVA del mes (generados ejecutando la
# cadena del programa con RFC inventados; ver extraer_del_producto.vectores_iva). Elegido porque tiene IVA a cargo, PPD
# emitidas y recibidas sin complemento y pagos, y porque ninguna de sus contrapartes aparece en el listado 69-B real
# (lo comprueba diagnostico.test.js): el ejemplo no senala a ningun contribuyente de verdad.
CASO_EJEMPLO = 60


PRIVACIDAD = {  # el aviso de privacidad del sitio, en los dos idiomas: cuerpo en .herramientas/privacidad/, barra y pie de base.html
    "es": {"ruta": "/privacidad/", "titulo": "Aviso de privacidad | Tax Certeza", "lang": "es-MX", "locale": "es_MX",
           "descripcion": "Qué datos recoge el sitio taxcerteza.mx, para qué, con quién se comparten y cómo ejercer tus derechos ARCO."},
    "en": {"ruta": "/privacidad/en/", "titulo": "Privacy notice | Tax Certeza", "lang": "en", "locale": "en_US",
           "descripcion": "What data the taxcerteza.mx website collects, what it is used for, who it is shared with and how to exercise your rights."},
}


def paginas_privacidad(base):
    """Las dos paginas del aviso de privacidad. Mientras el cuerpo lleve [POR COMPLETAR] (datos de la empresa que da la
    duena del sitio) la pagina sale con noindex; la prueba privacidad.test.js ademas falla mientras queden."""
    salidas = {}
    for idioma, d in PRIVACIDAD.items():
        cuerpo = (AQUI / "privacidad" / f"cuerpo_{idioma}.html").read_text(encoding="utf-8").strip("\n")
        otro = PRIVACIDAD["en" if idioma == "es" else "es"]
        grafo = [{"@type": "WebPage", "name": d["titulo"].split(" | ")[0], "url": SITIO + d["ruta"], "description": d["descripcion"],
                  "inLanguage": d["lang"], "isPartOf": {"@type": "WebSite", "name": "Tax Certeza", "url": SITIO + "/"}}]
        pagina = rellenar(base, {
            "TITULO": html.escape(d["titulo"], quote=True), "DESCRIPCION": html.escape(d["descripcion"], quote=True), "RUTA": d["ruta"],
            "JSONLD": json.dumps({"@context": "https://schema.org", "@graph": grafo}, ensure_ascii=False).replace("</", "<\\/"),
            "NAV_ACTUAL": "", "CUERPO": cuerpo, "SCRIPTS": "", "FORMULARIO": "",
        })
        pagina = pagina.replace('<html lang="es-MX">', f'<html lang="{d["lang"]}">', 1)
        pagina = pagina.replace('<meta property="og:locale" content="es_MX">', f'<meta property="og:locale" content="{d["locale"]}">', 1)
        pagina = pagina.replace(f'<link rel="canonical" href="{SITIO}{d["ruta"]}">',
                                f'<link rel="canonical" href="{SITIO}{d["ruta"]}">\n'
                                f'<link rel="alternate" hreflang="{d["lang"]}" href="{SITIO}{d["ruta"]}">\n'
                                f'<link rel="alternate" hreflang="{otro["lang"]}" href="{SITIO}{otro["ruta"]}">', 1)
        if "[POR COMPLETAR" in cuerpo:
            pagina = pagina.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex, nofollow">', 1)
        if "[[" in pagina or "{{" in pagina or "@@" in pagina:
            raise SystemExit(f"privacidad {idioma}: quedaron marcadores sin rellenar")
        salidas[d["ruta"].strip("/") + "/index.html"] = pagina
    return salidas


def ejemplo_diagnostico():
    import base64
    import gzip
    v = json.loads((AQUI / "vectores" / "iva.json").read_text(encoding="utf-8"))
    caso = json.loads(gzip.decompress(base64.b64decode(v["casos_gz"])).decode("utf-8"))[CASO_EJEMPLO]
    cuenta, archivos = {}, []
    for x in caso["xml"]:
        if "pago20:Pagos" in x or 'TipoDeComprobante="P"' in x:
            tipo = "pago"
        elif f'Emisor Rfc="{v["propio"]}"' in x:
            tipo = "emitida"
        else:
            tipo = "recibida"
        cuenta[tipo] = cuenta.get(tipo, 0) + 1
        archivos.append({"nombre": f"{tipo}-{cuenta[tipo]:02d}.xml", "texto": x})
    return json.dumps({"_nota": "GENERADO por .herramientas/construir.py: XML INVENTADOS (RFC y contrapartes ficticios) para probar "
                                "el diagnostico. No son de ningun contribuyente.",
                       "rfc": v["propio"], "periodo": v["periodo"], "archivos": archivos}, ensure_ascii=False, indent=1) + "\n"


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
                "rmf-2026-4-5-1": "la información de operaciones con proveedores (DIOT) se presenta «durante el mes inmediato posterior al que corresponda dicha información»",
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
    _iva = json.loads((AQUI / "datos" / "iva.json").read_text(encoding="utf-8"))
    _que_iva = {"liva-1-b": "el IVA se causa cuando la contraprestación se cobra efectivamente",
                "liva-5": "requisitos para acreditar el IVA, entre ellos que corresponda a gastos efectivamente pagados",
                "liva-5-d": "el IVA se calcula por mes de calendario y se paga a más tardar el día 17 del mes siguiente",
                "liva-1-a": "quién retiene el IVA; lo retenido se entera aparte",
                "lisr-27": "en la fracción III, los pagos de más de $2,000 se hacen con medios distintos del efectivo",
                "cff-69-b": "contribuyentes publicados por operaciones presuntamente inexistentes (lista 69-B)"}
    _nombre_iva = {"LIVA": "Ley del IVA", "LISR": "Ley del ISR", "CFF": "Código Fiscal de la Federación"}
    v_uma["FUENTES_IVA"] = "\n".join(
        f'      <li><a href="{html.escape(_iva["fuentes"][k]["url"])}" rel="noopener">{_nombre_iva[_iva["fuentes"][k]["ley"]]}, artículo {_iva["fuentes"][k]["articulo"]}</a>: {_que_iva[k]}. {_reforma(_iva["fuentes"][k]["vigencia"])}.</li>'
        for k in _que_iva)
    # Diagnostico del mes: cada resultado cita el MISMO articulo que la herramienta de la que sale (IVA del mes, lista
    # 69-B y complemento de pago), con el mismo texto; nada propio.
    _nor = json.loads((AQUI / "datos" / "normas.json").read_text(encoding="utf-8"))["normas"]

    def _li_iva(k):
        return (f'<li><a href="{html.escape(_iva["fuentes"][k]["url"])}" rel="noopener">{_nombre_iva[_iva["fuentes"][k]["ley"]]}, '
                f'artículo {_iva["fuentes"][k]["articulo"]}</a>: {_que_iva[k]}. Revisada el {fecha_larga(_nor[k]["revisado"])}.</li>')
    _que_rep = {"cff-29-a": "en la fracción VII, inciso b), una factura pagada en parcialidades o después lleva un CFDI por cada pago",
                "rmf-2026-2-7-1-32": "plazo para emitir el complemento de pago"}
    v_uma["DIAG_FUND_IVA"] = "".join(_li_iva(k) for k in ("liva-1-b", "liva-5"))
    v_uma["DIAG_FUND_EFOS"] = _li_iva("cff-69-b")
    v_uma["DIAG_FUND_REP"] = "".join(
        f'<li><a href="{html.escape(_nor[k]["url"])}" rel="noopener">{html.escape(_nor[k]["cita"])}</a>: {_que_rep[k]}. '
        f'Revisada el {fecha_larga(_nor[k]["revisado"])}.</li>'
        for k in _que_rep)
    _tc = json.loads((AQUI / "datos" / "tipo-cambio.json").read_text(encoding="utf-8"))
    _anios_tc = sorted(_tc["calendarios"])
    v_uma["TC_ANIOS"] = ", ".join(_anios_tc[:-1]) + " y " + _anios_tc[-1] if len(_anios_tc) > 1 else _anios_tc[0]
    v_uma["TC_OPCIONES"] = "\n".join(f'          <option value="{x}">{x}</option>' for x in reversed(_anios_tc))
    _f = _tc["fuentes"]
    v_uma["FUENTES_TC"] = "\n".join(
        [f'      <li><a href="{html.escape(_f["cff-20"]["url"])}" rel="noopener">Código Fiscal de la Federación, artículo 20</a>: '
         "las contribuciones se determinan con el tipo de cambio al que se haya adquirido la moneda extranjera; si no hubo "
         "adquisición, con el que Banco de México publique en el DOF el día anterior a aquél en que se causen, y si ese día no "
         f'hubo publicación, con el último publicado antes. {_reforma(_f["cff-20"]["vigencia"])}.</li>']
        + [f'      <li><a href="{html.escape(_f[k]["url"])}" rel="noopener">Disposiciones de la CNBV publicadas en el DOF el '
           f'{_f[k]["vigencia"].split(",")[0].replace("DOF ", "")}</a>: días de {k[-4:]} en que las entidades financieras cierran '
           "y suspenden operaciones.</li>" for k in sorted(_f) if k.startswith("cnbv-dias-inhabiles-")]
        + ['      <li><a href="https://www.banxico.org.mx/tipcamb/tipCamIHAction.do?idioma=sp" rel="noopener">Banco de México, '
           "tipo de cambio para solventar obligaciones denominadas en dólares</a>: tabla oficial con las columnas de "
           f'determinación, publicación en el DOF y para solventar obligaciones. Serie {_tc["serie"]} del Sistema de '
           "Información Económica.</li>"])
    # La descripcion de /herramientas/ se GENERA de PAGINAS: cada herramienta declara @@NOMBRE_LISTA. Escrita a mano,
    # se quedo nombrando las 3 primeras cuando ya habia 9 (auditoria 2026-10-23). Sin nombre no se construye.
    _nombres = []
    for n in PAGINAS:
        if n == "indice":
            continue
        nl = leer_plantilla(n).get("NOMBRE_LISTA", "").strip()
        if not nl:
            raise SystemExit(f"{n}: sin @@NOMBRE_LISTA (lo usa la descripcion de /herramientas/)")
        _nombres.append(nl)
    v_uma["LISTA_HERRAMIENTAS"] = ", ".join(_nombres[:-1]) + " y " + _nombres[-1] if len(_nombres) > 1 else _nombres[0]
    base = (AQUI / "plantillas" / "base.html").read_text(encoding="utf-8")
    salidas = {}
    for nombre, ruta in PAGINAS.items():
        s = {k: rellenar(v, v_uma) for k, v in leer_plantilla(nombre).items()}
        faq = re.findall(r"^P: (.+)\nR: (.+)$", s.get("FAQ", ""), flags=re.M)
        faq_html = "\n".join(f"<details><summary>{p}</summary>\n<p>{r}</p></details>" for p, r in faq)
        migas = [("Inicio", "/"), ("Herramientas", "/herramientas/")]
        if nombre != "indice":
            migas.append((s["MIGA"], ruta))
        else:
            # las tarjetas del indice estan escritas a mano: una herramienta nueva sin tarjeta no se ve. Falla cerrado.
            sin_tarjeta = [r for n, r in PAGINAS.items() if n != "indice" and f'href="{r}"' not in s["CUERPO"]]
            if sin_tarjeta:
                raise SystemExit(f"indice: sin tarjeta para {', '.join(sin_tarjeta)}")
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
        if nombre != "indice":
            # el pie «Fundamento y revision», igual en todas: va dentro de la ultima seccion, al final de la pagina
            i = cuerpo.rfind("</section>")
            if i < 0:
                raise SystemExit(f"{nombre}: sin seccion donde poner el pie")
            cuerpo = cuerpo[:i] + pie_herramienta(nombre) + cuerpo[i:]
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
    iva = {k: v for k, v in json.loads((AQUI / "datos" / "iva.json").read_text(encoding="utf-8")).items() if k != "_nota"}
    salidas["herramientas/iva-del-mes/iva-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/iva.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCIvaDatos = datos;\n})(this, " + json.dumps(iva, ensure_ascii=False, indent=1) + ");\n")
    salidas.update(paginas_privacidad(base))
    salidas["herramientas/diagnostico-del-mes/ejemplo.json"] = ejemplo_diagnostico()
    tcam = {k: v for k, v in json.loads((AQUI / "datos" / "tipo-cambio.json").read_text(encoding="utf-8")).items() if k != "_nota"}
    salidas["herramientas/tipo-de-cambio/tipo-cambio-datos.js"] = (
        "/* GENERADO por .herramientas/construir.py desde .herramientas/datos/tipo-cambio.json. No se edita a mano. */\n"
        "(function (raiz, datos) {\n  if (typeof module === 'object' && module.exports) module.exports = datos;\n"
        "  else raiz.TCTipoCambioDatos = datos;\n})(this, " + json.dumps(tcam, ensure_ascii=False, indent=1) + ");\n")
    return salidas


def con_sitemap(salidas, hoy=None, previas=None):
    """Anade el sitemap de /herramientas/ y el registro de fechas que le da su lastmod.

    Una SOLA fuente de paginas: PAGINAS, la misma lista que construye las paginas. El lastmod es REAL: la fecha en que
    cambio el contenido publicado de cada pagina. Se guarda con la huella (sha256) de la pagina en
    .herramientas/fechas.json; si la pagina no cambio, su fecha se conserva; si cambio, toma la de hoy. Con
    --comprobar, una pagina cambiada sin su fecha nueva sale DISTINTO, como cualquier otra salida.
    Va en su propio sitemap (como /ayuda/sitemap.xml, declarado en robots.txt): el sitemap.xml raiz es del blog y la
    revision del blog no deja que un PR de herramientas lo toque."""
    import datetime as dt
    import hashlib
    hoy = hoy or dt.date.today().isoformat()
    if previas is None:
        previas = json.loads((AQUI / "fechas.json").read_text(encoding="utf-8")) if (AQUI / "fechas.json").exists() else {}
    fechas, urls = {}, []
    for nombre, ruta in PAGINAS.items():
        rel = ruta.strip("/") + "/index.html"
        huella = hashlib.sha256(salidas[rel].encode("utf-8")).hexdigest()
        antes = previas.get(ruta) or {}
        fechas[ruta] = {"huella": huella, "fecha": antes["fecha"] if antes.get("huella") == huella else hoy}
        urls.append(f'  <url><loc>{SITIO}{ruta}</loc><lastmod>{fechas[ruta]["fecha"]}</lastmod>'
                    f'<priority>{"0.8" if nombre == "indice" else "0.7"}</priority></url>')
    salidas[".herramientas/fechas.json"] = json.dumps(fechas, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    salidas["herramientas/sitemap.xml"] = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                                           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                           + "\n".join(urls) + "\n</urlset>\n")
    return salidas


def main():
    comprobar = "--comprobar" in sys.argv
    mal = 0
    for rel, contenido in con_sitemap(construir()).items():
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
