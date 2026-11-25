# -*- coding: utf-8 -*-
"""Genera feed-facebook.xml y feed-x.xml en assets/redes/ a partir de assets/redes/agenda.json.

Usado por .github/workflows/redes-rss.yml (lunes/miercoles/viernes 08:00 CDMX) para publicar
nuevos <item> al llegar su fecha sin necesidad de Zapier Pro ni webhooks de pago.
Solo biblioteca estandar de Python.
"""
import argparse
import datetime as dt
import email.utils
import json
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ_WEB = Path(__file__).resolve().parents[2]
DIR_REDES = RAIZ_WEB / "assets" / "redes"
ZONA_CDMX = dt.timezone(dt.timedelta(hours=-6))

BASE_ANCLA = {
    "fecha": "2026-11-25",
    "titulo": "Retenciones de ISR e IVA al facturar a persona moral",
    "facebook_texto": (
        "Retenciones de persona moral: 10 % ISR y 2/3 del IVA en honorarios y rentas; "
        "1.25 % ISR en RESICO; 4 % de la contraprestacion como IVA en fletes.\n\n"
        "Guia completa:\n"
        "https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=facebook&utm_medium=social&utm_campaign=20261207"
    ),
    "facebook_link": "https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=facebook&utm_medium=social&utm_campaign=20261207",
    "facebook_image": "https://taxcerteza.mx/assets/redes/2026-12-07/facebook_1080x1350.jpg",
    "x_texto": (
        "Retenciones al facturar a persona moral: 10 % ISR y 2/3 IVA en honorarios/rentas; "
        "1.25 % ISR en RESICO; 4 % como IVA en fletes.\n"
        "https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=x&utm_medium=social&utm_campaign=20261207"
    ),
    "x_link": "https://taxcerteza.mx/blog/cuanto-me-retienen-si-facturo-a-persona-moral/?utm_source=x&utm_medium=social&utm_campaign=20261207",
    "x_image": "https://taxcerteza.mx/assets/redes/2026-12-07/x_1600x900.png",
    "alt": "Tarjeta de Tax Certeza sobre retenciones de ISR e IVA al facturar a persona moral.",
}


def rfc822(fecha_iso, hora="08:00"):
    h, m = [int(x) for x in hora.split(":")]
    d = dt.datetime.fromisoformat(f"{fecha_iso}T{h:02d}:{m:02d}:00").replace(tzinfo=ZONA_CDMX)
    return email.utils.format_datetime(d)


def construir_rss(red, items, limite=15):
    rss = ET.Element("rss", version="2.0")
    ch = ET.SubElement(rss, "channel")
    ET.SubElement(ch, "title").text = f"Tax Certeza Redes ({red.upper()})"
    ET.SubElement(ch, "link").text = "https://taxcerteza.mx/"
    ET.SubElement(ch, "description").text = f"Publicaciones fiscales programadas de Tax Certeza para {red}."
    ET.SubElement(ch, "language").text = "es-MX"

    for entry in items[:limite]:
        fecha = entry["fecha"]
        it = ET.SubElement(ch, "item")
        ET.SubElement(it, "title").text = entry["titulo"]
        ET.SubElement(it, "link").text = entry[f"{red}_link"]
        ET.SubElement(it, "description").text = entry[f"{red}_texto"]
        guid = ET.SubElement(it, "guid", isPermaLink="false")
        guid.text = f"taxcerteza-{red}-{fecha}"
        ET.SubElement(it, "pubDate").text = rfc822(fecha, "08:00" if red == "x" else "12:30")
        img_url = entry[f"{red}_image"]
        mime = "image/png" if img_url.lower().endswith(".png") else "image/jpeg"
        ET.SubElement(it, "enclosure", url=img_url, type=mime, length="0")

    ET.indent(rss, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(rss, encoding="unicode") + "\n"


def generar(hoy_iso=None):
    hoy = hoy_iso or dt.datetime.now(ZONA_CDMX).date().isoformat()
    agenda_p = DIR_REDES / "agenda.json"
    agenda = json.loads(agenda_p.read_text(encoding="utf-8")) if agenda_p.is_file() else []
    activos = [e for e in agenda if e.get("fecha", "9999-99-99") <= hoy]
    activos.append(BASE_ANCLA)
    activos.sort(key=lambda e: e["fecha"], reverse=True)

    for red, nombre in (("facebook", "feed-facebook.xml"), ("x", "feed-x.xml")):
        xml_txt = construir_rss(red, activos)
        (DIR_REDES / nombre).write_text(xml_txt, encoding="utf-8")
    return len(activos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fecha", default="", help="Fecha de corte AAAA-MM-DD (vacio = hoy CDMX)")
    a = ap.parse_args()
    n = generar(a.fecha.strip() or None)
    print(f"Feeds RSS actualizados ({n} elementos activos incluyendo ancla).")


if __name__ == "__main__":
    main()
