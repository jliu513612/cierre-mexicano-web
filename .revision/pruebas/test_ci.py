"""ci.py revisa lo que ESTE PR cambio (diff contra el merge-base), no lo que main cambio despues de que la rama salio.

Caso real (2026-10-27): el PR 105 salio de main antes de que el PR 102 reescribiera resico. Su cabeza trae resico con
el texto viejo y el dictamen viejo (sin `puntajes`), y ci.py, comparando contra la PUNTA de main, la dio por cambiada
y la reprobo: «el dictamen trae 0 puntajes». El merge no habria publicado ese texto.

Uso:  python -X utf8 .revision/pruebas/test_ci.py   (sale con 1 si algo falla)
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent  # .revision
RAIZ = AQUI.parent
sys.path.insert(0, str(AQUI))
sys.dont_write_bytecode = True
import ci  # noqa: E402

SLUG = "resico-ingresos-cobrados-o-facturados"
PAG = f"blog/{SLUG}/index.html"
DIC = f".revision/dictamenes/{SLUG}.json"
fallos = []


def exige(c, m):
    print(("  ok    " if c else "  FALLA ") + m)
    if not c:
        fallos.append(m)


def git(repo, *a):
    r = subprocess.run(["git", "-C", str(repo), "-c", "user.name=prueba", "-c", "user.email=prueba@example.invalid",
                        "-c", "core.autocrlf=false", *a], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        raise RuntimeError(f"git {' '.join(a)}: {r.stderr}")
    return r.stdout.strip()


def escribe(repo, ruta, texto):
    p = Path(repo) / ruta
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(texto, encoding="utf-8", newline="\n")


def dictamen(html, puntajes):
    d = {"slug": SLUG, "huella": ci.huella(html), "a_ciegas_con_anclas": True, "graves": 0, "medios": 0, "leves": 0}
    if puntajes:
        d.update(puntajes=puntajes, puntaje=sum(puntajes) / len(puntajes))
    else:
        d["puntaje"] = 66  # formato anterior al 2026-10-12: un solo puntaje
    return json.dumps(d, ensure_ascii=False, indent=2) + "\n"


def con_parrafo(html, texto):
    return html.replace("<article>", f"<article><p>{texto}</p>", 1)


def corre(origen, rama, tmp, nombre):
    """Monta base (main) y pr (la rama) como en el workflow y corre ci.py; devuelve (codigo, salida)."""
    base, pr = tmp / f"{nombre}_base", tmp / f"{nombre}_pr"
    subprocess.run(["git", "clone", "-q", str(origen), str(base)], check=True)
    subprocess.run(["git", "clone", "-q", "--no-checkout", str(origen), str(pr)], check=True)
    git(pr, "checkout", "-q", rama)
    sha_main = git(base, "rev-parse", "HEAD")
    cambios = tmp / f"{nombre}_cambios.txt"
    cambios.write_text(git(pr, "diff", "--name-only", f"{sha_main}...HEAD") + "\n", encoding="utf-8")
    r = subprocess.run([sys.executable, "-X", "utf8", str(AQUI / "ci.py"), str(base), str(pr), str(cambios)],
                       capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stdout + r.stderr, base, pr


tmp = Path(tempfile.mkdtemp(prefix="test_ci_"))
try:
    origen = tmp / "origen"
    origen.mkdir()
    shutil.copytree(AQUI, origen / ".revision", ignore=shutil.ignore_patterns("__pycache__", "pruebas"))
    real = (RAIZ / PAG).read_text(encoding="utf-8")
    vieja, nueva = con_parrafo(real, "Texto de la version vieja."), con_parrafo(real, "Texto de la version nueva.")
    escribe(origen, f"blog/{SLUG}/meta.json", (RAIZ / f"blog/{SLUG}/meta.json").read_text(encoding="utf-8"))
    escribe(origen, "sitemap.xml", (RAIZ / "sitemap.xml").read_text(encoding="utf-8"))

    # main0: resico vieja con su dictamen viejo (sin `puntajes`)
    escribe(origen, PAG, vieja)
    escribe(origen, DIC, dictamen(vieja, None))
    git(origen, "init", "-q", "-b", "main")
    git(origen, "add", "-A")
    git(origen, "commit", "-q", "-m", "main0")

    # Ramas que salen de main0, ANTES de que main reescriba resico
    git(origen, "checkout", "-q", "-b", "vieja_sitemap")  # como el PR 105: no toca resico
    escribe(origen, "sitemap.xml", (RAIZ / "sitemap.xml").read_text(encoding="utf-8") + "<!-- otra entrada -->\n")
    git(origen, "commit", "-q", "-am", "sitemap")
    git(origen, "checkout", "-q", "main")
    git(origen, "checkout", "-q", "-b", "vieja_rel")  # reconstruye resico: solo cambian los enlaces relacionados
    escribe(origen, PAG, vieja.replace('<section class="rel">', '<section class="rel"><a href="/blog/otra/">Otra</a>', 1))
    git(origen, "commit", "-q", "-am", "enlaces")
    git(origen, "checkout", "-q", "main")
    git(origen, "checkout", "-q", "-b", "vieja_contenido")  # cambia el TEXTO de resico sin dictamen nuevo
    escribe(origen, PAG, con_parrafo(vieja, "Parrafo que agrega la rama."))
    git(origen, "commit", "-q", "-am", "contenido")
    git(origen, "checkout", "-q", "main")

    # main1: resico reescrita con su dictamen de dos revisores
    escribe(origen, PAG, nueva)
    escribe(origen, DIC, dictamen(nueva, [76, 76]))
    git(origen, "commit", "-q", "-am", "main1: resico reescrita")
    git(origen, "checkout", "-q", "-b", "fresca_contenido")  # sale de main1 y cambia el texto sin dictamen nuevo
    escribe(origen, PAG, con_parrafo(nueva, "Parrafo que agrega la rama."))
    git(origen, "commit", "-q", "-am", "contenido")
    git(origen, "checkout", "-q", "main")

    print("rama vieja que no toca resico (el caso del PR 105):")
    c, out, base, pr = corre(origen, "vieja_sitemap", tmp, "a")
    exige(ci.huella((pr / PAG).read_text(encoding="utf-8")) != ci.huella((base / PAG).read_text(encoding="utf-8")),
          "calibracion: la cabeza trae resico con OTRO texto que main")
    exige("puntajes" not in json.loads((pr / DIC).read_text(encoding="utf-8")), "calibracion: y con el dictamen viejo, sin puntajes")
    exige(c == 0 and "PASA" in out, f"PASA (codigo {c})")
    exige(SLUG not in out, "y no revisa resico")

    print("rama vieja que solo reconstruye los enlaces de resico:")
    c, out, base, pr = corre(origen, "vieja_rel", tmp, "b")
    exige(PAG in (tmp / "b_cambios.txt").read_text(encoding="utf-8"), "calibracion: resico esta en la lista de cambios")
    exige(c == 0 and "PASA" in out, f"PASA (codigo {c})")

    print("sin merge-base calculable (main sin historia) falla CERRADO y lo dice:")
    sin_git = tmp / "e_base"
    shutil.copytree(base, sin_git, ignore=shutil.ignore_patterns(".git"))
    r = subprocess.run([sys.executable, "-X", "utf8", str(AQUI / "ci.py"), str(sin_git), str(pr), str(tmp / "b_cambios.txt")],
                       capture_output=True, text=True, encoding="utf-8")
    exige(r.returncode == 1 and "no se pudo calcular el merge-base" in r.stdout, f"NO PASA con el aviso (codigo {r.returncode})")

    print("rama vieja que cambia el texto de resico:")
    c, out, _, _ = corre(origen, "vieja_contenido", tmp, "c")
    exige(c == 1 and f"{SLUG}:" in out, f"NO PASA y nombra resico (codigo {c})")

    print("rama al dia que cambia el texto de resico:")
    c, out, _, _ = corre(origen, "fresca_contenido", tmp, "d")
    exige(c == 1 and f"{SLUG}: el dictamen es de otra version del texto" in out, f"NO PASA: dictamen de otra version (codigo {c})")
    if fallos:
        print(out)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("test_ci.py: %d fallos" % len(fallos))
sys.exit(1 if fallos else 0)
