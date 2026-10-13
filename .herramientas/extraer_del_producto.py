"""Saca del repo del PRODUCTO los datos y los vectores de referencia de las herramientas del sitio.

Uso:  python -X utf8 .herramientas/extraer_del_producto.py <ruta_al_repo_del_producto>

Lo ejecuta una persona o una sesion que tenga el repo del producto; el CI del sitio NO lo ejecuta
(no tiene ese repo). Lo que escribe queda versionado aqui y `construir.py --comprobar` y las pruebas
de node lo consumen:

  .herramientas/datos/uma.json        valores de la UMA, con su fuente y su vigencia
  .herramientas/vectores/rfc.json     casos del validador de RFC
  .herramientas/vectores/uma.json     casos de vigencia y de conversion
  .herramientas/vectores/rep.json     casos de la fecha limite del complemento de pago

DE DONDE SALE CADA COSA (para que las dos implementaciones no puedan divergir):

  RFC formato y tipo ....... scripts/validadores_sat.py::validar_rfc (se EJECUTA)
  RFC fecha y digito ....... el producto NO los comprueba. La referencia es la funcion `_dv`
                             de este archivo (modulo 11) y la lista SAT_PRUEBA, que son RFC de
                             prueba publicos del SAT: su digito real es el vector.
  UMA valor diario ......... scripts/nomina_tablas.py::UMA_DIARIA_POR_ANIO y ::uma_rangos (se EJECUTA)
  UMA mensual, anual, DOF .. references/afirmaciones_legales.json, entradas uma-AAAA: se LEE del
                             texto de la publicacion, no se calcula; despues se coteja con 30.4 y 12.
  REP fecha limite ......... scripts/complemento_pago_monitor.py::fecha_limite_complemento y
                             ::clasificar_severidad (se EJECUTAN)
  REP lleva o no lleva ..... scripts/complemento_pago_monitor.py::estado_rep (se EJECUTA): solo el
                             metodo PPD lleva complemento.
"""
import datetime as dt
import json
import random
import re
import subprocess
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ALFABETO = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ Ñ"

# RFC de prueba publicos del SAT (los de los certificados de pruebas de CFDI). No son de clientes.
SAT_PRUEBA = (
    "EKU9003173C9 XIQB891116QE4 CACX7605101P8 IIA040805DZ4 H&E951128469 KIJ0906199R1 JES900109Q90 "
    "MISC491214B86 IVD920810GU2 FUNK671228PH6 URE180429TM6 OÑO120726RX3 XOJI740919U48 ICV060329BY0 "
    "WATM640917J45 COSC8001137NA CUSC850516316 SPR190613I52 IXS7607092R5 CTE950627K46 EWE1709045U0 "
    "L&O950913MSA S&S051221SE2 JUFA7608212V6 XIA190128J61 HERD890308UAA"
).split()


def _dv(rfc):
    """Digito verificador (modulo 11) de un RFC de 12 o 13 caracteres ya normalizado."""
    cuerpo = rfc[:-1].rjust(12)
    suma = sum(ALFABETO.index(c) * (13 - i) for i, c in enumerate(cuerpo))
    r = suma % 11
    if r == 0:
        return "0"
    return "A" if 11 - r == 10 else str(11 - r)


def _fecha_valida(aammdd):
    aa, mm, dd = int(aammdd[:2]), int(aammdd[2:4]), int(aammdd[4:])
    # Dos digitos de ano: basta con que la fecha exista en 19AA o en 20AA.
    for siglo in (1900, 2000):
        try:
            dt.date(siglo + aa, mm, dd)
            return True
        except ValueError:
            pass
    return False


def _esperado_rfc(norm, ok, tipo):
    if not norm:
        return {"resultado": "VACIO"}
    if tipo in ("GENERICO_NAC", "GENERICO_EXT"):
        return {"resultado": "GENERICO"}
    if not ok:
        return {"resultado": "FORMATO_INVALIDO"}
    fecha = norm[-9:-3]
    if not _fecha_valida(fecha):
        return {"resultado": "FECHA_INVALIDA"}
    esp = _dv(norm)
    return {"resultado": "CORRECTO" if esp == norm[-1] else "DIGITO_NO_COINCIDE", "digito_esperado": esp}


def vectores_rfc(prod):
    import validadores_sat as vs
    rnd = random.Random(1047)
    letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZÑ&"
    alnum = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    entradas = list(SAT_PRUEBA)
    entradas += ["XAXX010101000", "XEXX010101000", " xaxx010101000 ", "xexx-010101-000"]
    # normalizacion: minusculas, espacios, guiones
    entradas += ["eku9003173c9", " EKU 900317 3C9 ", "EKU-900317-3C9", "oño120726rx3", "h&e951128469"]
    # deben FALLAR por formato
    entradas += ["", "   ", "EKU9003173C", "EKU9003173C99X", "EKU90O3173C9", "1KU9003173C9", "EKU9003173C-",
                 "ÁKU9003173C9", "EKU9003173Ñ9", "EKU 9003173", "XIQB89111QE4", "XIQB891116QE", "XIQB8911160QE4",
                 "EKU9003173C9\t", "EKU\t9003173C9", "E.U9003173C9", "XIQB891116Q&4",
                 "EK9003173C9", "ABCDE9003173C9", "EKUX90031733C9",  # 2 letras, 5 letras, 7 digitos
                 "12345678901", "ABCDEFGHIJKLM"]
    # deben FALLAR por fecha (formato correcto)
    entradas += ["EKU9013173C9", "EKU9000173C9", "EKU9003003C9", "EKU9003323C9", "EKU9002303C9", "EKU9004313C9",
                 "XIQB891316QE4", "XIQB890230QE4", "XIQB010229QE4", "XIQB000229QE4", "XIQB040229QE4", "XIQB000000QE4"]
    # digito que NO coincide: se cambia el ultimo caracter o uno del cuerpo
    for r in SAT_PRUEBA[:10]:
        entradas.append(r[:-1] + ("1" if r[-1] != "1" else "2"))
        entradas.append(r[:-1] + "B")
        i = 1
        entradas.append(r[:i] + ("Z" if r[i] != "Z" else "Y") + r[i + 1:])
    # transposicion de dos digitos de la fecha (el error de captura mas comun)
    entradas += ["EKU0903173C9", "XIQB981116QE4"]  # la fecha sigue existiendo: lo unico que lo delata es el digito
    # aleatorios con formato valido: la mitad con su digito correcto
    for n in range(400):
        largo = 3 if n % 2 else 4
        cuerpo = "".join(rnd.choice(letras) for _ in range(largo))
        f = dt.date(1930, 1, 1) + dt.timedelta(days=rnd.randrange(0, 36000))
        cuerpo += f.strftime("%y%m%d") + rnd.choice(alnum) + rnd.choice(alnum)
        ult = _dv(cuerpo + "0") if n % 4 < 2 else rnd.choice(alnum)
        entradas.append(cuerpo + ult)
    casos, vistos = [], set()
    for e in entradas:
        if e in vistos:
            continue
        vistos.add(e)
        ok, tipo, _msg = vs.validar_rfc(e)
        norm = vs.normalizar_rfc(e)
        casos.append({"entrada": e, "normalizado": norm, "producto": {"ok": bool(ok), "tipo": tipo},
                      "esperado": _esperado_rfc(norm, ok, tipo)})
    for r in SAT_PRUEBA:  # el vector independiente: el digito REAL de un RFC publicado
        assert _dv(r) == r[-1], f"la referencia no reproduce el digito de {r}"
    return {"sat_prueba": SAT_PRUEBA, "casos": casos}


def datos_uma(prod):
    import nomina_tablas as nt
    reg = json.loads((prod / "references" / "afirmaciones_legales.json").read_text(encoding="utf-8"))["articulos"]
    rangos = nt.uma_rangos()
    anios = sorted(nt.UMA_DIARIA_POR_ANIO)
    assert len(rangos) == len(anios)
    valores = []
    for r, anio in zip(rangos, anios):
        e = reg[f"uma-{anio}"]
        m = re.search(r"valor diario de la Unidad de Medida y Actualización es de \$([\d,.]+) pesos mexicanos, el mensual es de "
                      r"\$([\d,.]+) pesos mexicanos y el valor anual \$([\d,.]+) pesos mexicanos, los cuales estarán vigentes a "
                      r"partir del 1º de febrero de (\d{4})", e["texto"])
        assert m, f"uma-{anio}: no encuentro los tres valores en el texto de la publicacion"
        diario, mensual, anual = (Decimal(x.replace(",", "")) for x in m.groups()[:3])
        assert int(m.group(4)) == anio
        assert diario == r["valor"] == nt.UMA_DIARIA_POR_ANIO[anio], f"uma-{anio}: el registro y el motor no coinciden"
        # Ley UMA, art. 4: mensual = diario x 30.4; anual = mensual x 12. Cotejo, no fuente.
        assert (diario * Decimal("30.4")).quantize(Decimal("0.01"), ROUND_HALF_UP) == mensual, anio
        assert mensual * 12 == anual, anio
        assert r["inicio"] == dt.date(anio, 2, 1)
        assert re.fullmatch(r"https://(www\.)?dof\.gob\.mx/.+", e["fuente_url"])
        valores.append({
            "anio": anio, "diario": str(diario), "mensual": str(mensual), "anual": str(anual),
            "desde": r["inicio"].isoformat(),
            # El motor deja abierto el ultimo rango; la Ley UMA (art. 5) lo cierra el 31 de enero siguiente.
            "hasta": dt.date(anio + 1, 1, 31).isoformat(),
            "dof": "-".join(reversed(e["fecha_publicacion"].split("-"))),
            "url": e["fuente_url"], "verificado": e["fecha_verificacion"], "ref": f"uma-{anio}",
        })
    ley = reg["leyuma-5"]
    commit = subprocess.run(["git", "-C", str(prod), "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()
    return {
        "_nota": "GENERADO por .herramientas/extraer_del_producto.py. No se edita a mano.",
        "producto_commit": commit,
        "verificado": max(v["verificado"] for v in valores),
        "ley": {"cita": "Ley para Determinar el Valor de la Unidad de Medida y Actualización, artículos 4 y 5",
                "url": ley["fuente_url"], "dof": "2016-12-30", "ref": "leyuma-5"},
        "valores": valores,
    }


def vectores_uma(datos):
    import nomina_tablas as nt
    import vigencias
    rangos = nt.uma_rangos()
    primero, ultimo = datos["valores"][0], datos["valores"][-1]
    fechas = set()
    for v in datos["valores"]:
        d, h = dt.date.fromisoformat(v["desde"]), dt.date.fromisoformat(v["hasta"])
        fechas |= {d, d + dt.timedelta(days=1), h, h - dt.timedelta(days=1), dt.date(v["anio"], 7, 1), dt.date(v["anio"], 12, 31),
                   dt.date(v["anio"] + 1, 1, 1), dt.date(v["anio"], 2, 28)}
    fechas |= {dt.date(2024, 2, 29)}
    vig = []
    for f in sorted(fechas):
        val = vigencias.valor_vigente(rangos, f.isoformat())  # el MOTOR del producto
        assert val is not None
        vig.append({"fecha": f.isoformat(), "estado": "VIGENTE", "diario": str(val)})
    # Fuera de la tabla. Antes del primer valor el motor tambien se niega (None).
    for f in ("2022-01-31", "2021-06-15", "2016-06-01"):
        assert vigencias.valor_vigente(rangos, f) is None
        vig.append({"fecha": f, "estado": "ANTERIOR_A_TABLA", "diario": None})
    # Despues del ultimo: aqui la pagina se APARTA del motor a proposito. El motor devuelve el ultimo valor
    # (rige hasta que se cargue otro); la pagina no puede afirmar un valor que la ley ya sustituyo.
    h = dt.date.fromisoformat(ultimo["hasta"])
    for f in (h + dt.timedelta(days=1), h + dt.timedelta(days=200), h + dt.timedelta(days=900)):
        vig.append({"fecha": f.isoformat(), "estado": "SIN_CONFIRMAR", "diario": None, "difiere_del_motor": True})
    conv = []
    rnd = random.Random(47)
    cantidades = ["1", "0", "5", "15", "25", "100", "0.5", "2.5", "1.25", "3.3333", "0.000001", "1000000", "12.345678", "999999999.99"]
    cantidades += [str(Decimal(rnd.randrange(1, 10 ** 9)) / Decimal(10 ** rnd.choice((0, 1, 2, 4, 6)))) for _ in range(40)]
    for v in datos["valores"]:
        for per in ("diario", "mensual", "anual"):
            val = Decimal(v[per])
            for c in cantidades:
                q = Decimal(c)
                conv.append({"fecha": v["desde"], "periodo": per, "sentido": "VECES_A_PESOS", "cantidad": c,
                             "resultado": str((q * val).quantize(Decimal("0.01"), ROUND_HALF_UP))})
                conv.append({"fecha": v["hasta"], "periodo": per, "sentido": "PESOS_A_VECES", "cantidad": c,
                             "resultado": str((q / val).quantize(Decimal("0.0001"), ROUND_HALF_UP))})
    invalidas = ["", " ", "abc", "-1", "1e5", "1.2.3", "12,5", "1.1234567", "1234567890123456", "NaN", "0x10", "+5", "1 000"]
    return {"vigencia": vig, "conversion": conv, "cantidades_invalidas": invalidas}


def vectores_rep(prod):
    import complemento_pago_monitor as cpm
    fechas = []
    for anio in (2025, 2026, 2027, 2028):
        for mes in range(1, 13):
            ult = (dt.date(anio + (mes == 12), mes % 12 + 1, 1) - dt.timedelta(days=1)).day
            fechas += [dt.date(anio, mes, 1), dt.date(anio, mes, 5), dt.date(anio, mes, 15), dt.date(anio, mes, ult)]
    limite = [{"fecha_pago": f.isoformat(), "limite": cpm.fecha_limite_complemento(f.isoformat())} for f in fechas]
    estado = []
    for pago in ("2026-10-20", "2026-10-31", "2026-11-01", "2026-12-31", "2026-02-28", "2026-01-01"):
        lim = dt.date.fromisoformat(cpm.fecha_limite_complemento(pago))
        for delta in (-40, -10, -4, -3, -2, -1, 0, 1, 2, 30, 400):
            hoy = (lim + dt.timedelta(days=delta)).isoformat()
            sev, dias = cpm.clasificar_severidad(pago, hoy)
            estado.append({"fecha_pago": pago, "hoy": hoy, "estado": sev, "dias": dias})
    lleva = []
    for metodo in ("PPD", "PUE", "ppd", "pue", " PPD", "", "XXX", "PPDD"):
        est, _falta = cpm.estado_rep("100.00", "0", metodo)
        lleva.append({"metodo": metodo, "producto": est, "lleva_rep": est != cpm.NO_APLICA})
    invalidas = ["", "2026-02-30", "2026-13-01", "2026-00-10", "20261020", "20/10/2026", "2026-10-32", "abcd-ef-gh", "2026-1-5", "2025-02-29"]
    return {"limite": limite, "estado": estado, "lleva": lleva, "fechas_invalidas": invalidas}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    prod = Path(sys.argv[1]).resolve()
    sys.path.insert(0, str(prod / "scripts"))
    sys.dont_write_bytecode = True
    datos = datos_uma(prod)
    salidas = {
        "datos/uma.json": datos,
        "vectores/rfc.json": vectores_rfc(prod),
        "vectores/uma.json": vectores_uma(datos),
        "vectores/rep.json": vectores_rep(prod),
    }
    for rel, obj in salidas.items():
        p = AQUI / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
        n = sum(len(v) for v in obj.values() if isinstance(v, list))
        print(f"{rel}: {n} elementos")
    print("producto en", datos["producto_commit"], "| UMA verificada el", datos["verificado"])


if __name__ == "__main__":
    main()
