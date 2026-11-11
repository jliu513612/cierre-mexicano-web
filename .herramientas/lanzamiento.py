"""Rellena la portada y la tabla de /descargar con los datos REALES de un release, el dia de la publicacion.

Uso:  python -X utf8 .herramientas/lanzamiento.py --version 1.0.48 --zip TaxCerteza_1.0.48.zip --bytes 201905414 \
          --sha256 <64 hex> --fecha 2026-10-26
      (--sin-medir solo para pruebas: no descarga el archivo)

Los datos salen de la fila de docs/RELEASES.md del programa. ANTES de escribir nada descarga el zip publicado en
https://github.com/jliu513612/taxcerteza-releases/releases/download/v<version>/<zip> y comprueba que su tamano y su
SHA-256 son los de la fila: si no coinciden, para y no toca nada (la portada publicaria una huella falsa).

Que escribe, con el numero exacto de sustituciones (si un conteo no cuadra, no escribe nada):
  index.html             {{ZIP_NOMBRE}} x5, {{ZIP_BYTES}} x1, {{ZIP_HUELLA}} x1, {{FECHA_PUBLICACION}} x1
  netlify/descargas.mjs  la version y la URL del archivo predeterminado de /descargar
  sitemap.xml            el lastmod de la portada pasa a la fecha de la publicacion
NO escribe version.json: es el manifiesto de la actualizacion automatica y va FIRMADO (campo `firma`, Ed25519) por la
herramienta de release del programa. Lo publica quien tiene la llave; lanzamiento.test.js exige que su version sea la
misma que la de la portada y la de /descargar antes de mergear.
"""
import argparse
import hashlib
import re
import sys
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
REPO_RELEASES = "https://github.com/jliu513612/taxcerteza-releases/releases/download"
MESES = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split()


def medir(url):
    h, n = hashlib.sha256(), 0
    req = urllib.request.Request(url, headers={"User-Agent": "taxcerteza-lanzamiento"})
    with urllib.request.urlopen(req, timeout=120) as r:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            h.update(b)
            n += len(b)
    return n, h.hexdigest()


def sustituir(texto, pares, archivo):
    for viejo, nuevo, veces in pares:
        n = texto.count(viejo)
        if n != veces:
            sys.exit(f"{archivo}: esperaba {veces} de {viejo!r}, hay {n}; no se escribe nada")
        texto = texto.replace(viejo, nuevo)
    return texto


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--version", required=True)
    a.add_argument("--zip", required=True)
    a.add_argument("--bytes", required=True, type=int)
    a.add_argument("--sha256", required=True)
    a.add_argument("--fecha", required=True)
    a.add_argument("--sin-medir", action="store_true")
    o = a.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", o.version):
        sys.exit("version con forma X.Y.Z")
    if not re.fullmatch(r"[\w.-]+\.zip", o.zip):
        sys.exit("el zip es un nombre de archivo .zip")
    sha = o.sha256.strip().lower()
    if not re.fullmatch(r"[0-9a-f]{64}", sha):
        sys.exit("SHA-256: 64 caracteres hexadecimales")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", o.fecha):
        sys.exit("fecha AAAA-MM-DD")
    url = f"{REPO_RELEASES}/v{o.version}/{o.zip}"
    if o.sin_medir:
        print("AVISO: sin medir el archivo publicado (solo para pruebas)")
    else:
        print("midiendo", url, "...", flush=True)
        n, h = medir(url)
        if n != o.bytes or h != sha:
            sys.exit(f"el archivo publicado NO es el de la fila: {n} bytes y {h}, la fila dice {o.bytes} y {sha}; no se escribe nada")
        print(f"ok: {n} bytes, {h}")
    anio, mes, dia = (int(x) for x in o.fecha.split("-"))
    fecha_larga = f"{dia} de {MESES[mes - 1]} de {anio}"

    ip = RAIZ / "index.html"
    idx = ip.read_text(encoding="utf-8")
    idx = sustituir(idx, [("{{ZIP_NOMBRE}}", o.zip, 5), ("{{ZIP_BYTES}}", f"{o.bytes:,}", 1),
                          ("{{ZIP_HUELLA}}", sha, 1), ("{{FECHA_PUBLICACION}}", fecha_larga, 1)], "index.html")
    if f"Tax Certeza {o.version}" not in idx:
        sys.exit(f"index.html no dice la version {o.version}; no se escribe nada")

    dp = RAIZ / "netlify" / "descargas.mjs"
    des = dp.read_text(encoding="utf-8")
    v_vieja = re.search(r"      version: '([\d.]+)',\n", des)
    u_vieja = re.search(r"      url: '(https://github\.com/jliu513612/taxcerteza-releases/releases/download/[^']+)',\n", des)
    if not v_vieja or not u_vieja:
        sys.exit("netlify/descargas.mjs: no encuentro la version y la URL del archivo")
    des = sustituir(des, [(f"      version: '{v_vieja.group(1)}',\n", f"      version: '{o.version}',\n", 1),
                          (f"      url: '{u_vieja.group(1)}',\n", f"      url: '{url}',\n", 1)], "netlify/descargas.mjs")

    sp = RAIZ / "sitemap.xml"
    sit = sp.read_text(encoding="utf-8")
    m = re.search(r"<url><loc>https://taxcerteza\.mx/</loc><lastmod>(\d{4}-\d{2}-\d{2})</lastmod>", sit)
    if not m:
        sys.exit("sitemap.xml: no encuentro el lastmod de la portada; no se escribe nada")
    sit = sustituir(sit, [(m.group(0), m.group(0).replace(m.group(1), o.fecha), 1)], "sitemap.xml")

    ip.write_text(idx, encoding="utf-8")
    dp.write_text(des, encoding="utf-8")
    sp.write_text(sit, encoding="utf-8")
    print(f"sitemap.xml: portada {m.group(1)} -> {o.fecha}")
    print(f"index.html: zip {o.zip}, {o.bytes:,} bytes, huella {sha}, publicada el {fecha_larga}")
    print(f"netlify/descargas.mjs: {v_vieja.group(1)} -> {o.version}; {u_vieja.group(1)} -> {url}")
    print("FALTA, fuera de este script: version.json firmado de", o.version, "(lo exige lanzamiento.test.js)")


if __name__ == "__main__":
    main()
