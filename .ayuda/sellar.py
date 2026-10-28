"""Sella la SALIDA del generador de /ayuda/ que vive en .ayuda/fuente/ (decision de pauta, 2026-10-27).

Las paginas de uso, calculos, secciones y leyes, y la barra lateral, NO se editan a mano: salen de
tools/generar_kb.py y tools/kb_leyes.py del repo del PRODUCTO, que leen manual/escenas/*.json, el registro de
formulas (local) y .ayuda/fuente/conceptos.json. Los titulos de calculos se cambian en conceptos.json y se
regenera; nunca en el .md.

Uso, despues de regenerar y copiar la salida a .ayuda/fuente/:
    python -X utf8 .ayuda/sellar.py --producto <checkout del producto con el que se genero>

Escribe .ayuda/SELLO.json: el sha256 de cada fichero generado (con finales de linea normalizados a LF, porque
git los convierte al hacer checkout) y de donde salio (commit del producto, si tenia cambios sin commitear, y el
sha256 de los dos generadores). La prueba .ayuda/pruebas/sello.test.js lo comprueba en CI: un fichero generado
cambiado a mano, uno nuevo sin sellar o uno que falta la ponen en rojo.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FUENTE = AQUI / "fuente"
SELLO = AQUI / "SELLO.json"
# Lo que escribe el generador. Lo demas de fuente/ (intro, alcance, fuentes, banco-por-confirmar,
# cierre-detenido, configuracion, estilos, conceptos.json) se edita AQUI, a mano, y no se sella.
GENERADO = ["docs/uso", "docs/calculos", "docs/secciones", "docs/leyes", "sidebars.js"]
GENERADORES = ["tools/generar_kb.py", "tools/kb_leyes.py"]


def huella(p: Path) -> str:
    return hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def generados() -> dict:
    out = {}
    for g in GENERADO:
        p = FUENTE / g
        if p.is_file():
            out[g] = huella(p)
        elif p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file():
                    out[f.relative_to(FUENTE).as_posix()] = huella(f)
        else:
            raise SystemExit(f"falta {g} en {FUENTE}: no se sella una salida incompleta")
    return out


def git(producto: Path, *args) -> str:
    return subprocess.run(["git", "-C", str(producto), *args], capture_output=True, text=True,
                          check=True).stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--producto", type=Path, required=True, help="checkout del producto con el que se genero")
    a = ap.parse_args()
    sucio = git(a.producto, "status", "--porcelain", "--", *GENERADORES, "manual/escenas")
    sello = {
        "_doc": "Salida sellada del generador de /ayuda/. No editar a mano lo listado en 'ficheros': "
                "regenerar desde el producto y volver a sellar con .ayuda/sellar.py.",
        "generado": GENERADO,
        "producto": {
            "commit": git(a.producto, "rev-parse", "HEAD"),
            "rama": git(a.producto, "branch", "--show-current"),
            "sin_commitear": bool(sucio),
            "generadores": {g: huella(a.producto / g) for g in GENERADORES},
        },
        "ficheros": generados(),
    }
    SELLO.write_text(json.dumps(sello, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"sellados {len(sello['ficheros'])} ficheros generados; producto {sello['producto']['commit'][:8]}"
          f"{' CON cambios sin commitear en los generadores o las escenas' if sucio else ''}")


if __name__ == "__main__":
    main()
