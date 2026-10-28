# Centro de ayuda — cómo se mantiene

Sitio Docusaurus con el material cliente-facing. **El contenido no se edita a
mano: se GENERA** desde las fuentes que ya mantiene el proyecto.

## Ver y construir

```bash
cd ayuda
npm install          # la primera vez
npm start            # servidor de desarrollo
npm run build        # sitio estático en ayuda/build/
```

## Regenerar el contenido

```bash
# solo uso (fuente en git — no necesita nada más)
python tools/generar_kb.py

# uso + los 339 cálculos (necesita el registro de fórmulas, que es local)
python tools/generar_kb.py --key-documents "<ruta a key documents>" --incluir-calculos
```

| Carpeta | Fuente | ¿Se edita a mano? |
|---|---|---|
| `docs/uso/` | `manual/escenas/*.json` (22 capítulos) | **No** — se regenera |
| `docs/calculos/` | `FORMULAS_CALCULO_*.xlsx`, columna «Cálculo (lectura CPA)» | **No** — se regenera |
| `docs/intro.md` | escrita a mano | **Sí** — es doctrina, no contenido derivado |

## Cómo se evita que envejezca

El riesgo real no es no poder regenerar: es que **nadie se acuerde** y la ayuda
quede vieja mientras el producto cambia. Por eso `test_kb_al_dia` regenera en un
temporal y compara con lo publicado — si difieren, el gate dice qué archivo
cambió y con qué comando arreglarlo.

Asimetría honesta de las dos fuentes:

- `manual/escenas/` **está en git** → se verifica siempre, también en CI.
- El registro de fórmulas vive en `key documents/` (local, gitignoreado) → **CI
  no puede verlo**. El test lo declara *no verificado* en lugar de dar un OK
  silencioso sobre algo que no miró. Correrlo en la máquina de trabajo (o
  exportar `CIERRE_KEY_DOCUMENTS`) sí lo verifica.

**Al cambiar la UI del producto** se actualiza `manual/escenas/`; **al cambiar
un criterio fiscal** se actualiza el registro de fórmulas. En ambos casos:
regenerar, revisar el diff y commitear. El gate no deja olvidarlo.

## Qué NO puede salir a este sitio

Garantizado por construcción (`sanear_publicable()` + `test_generar_kb`):

- **Lógica de código** — solo se emiten las columnas Concepto / lectura CPA /
  Fundamento legal. Nunca fórmula-dev, `archivo:línea`, insumos ni parámetros.
- **Trazabilidad interna** — IDs de bug (`CAL-nn`, `DESC-nn`), dictámenes
  (`D-nn`), informes (`A-n reauditoría`), secciones (`REGLAS §x`).
- **Datos de cliente** — chequeo anti-fuga sobre lo generado. Los RFC genéricos
  del SAT (`XAXX`/`XEXX`) están en lista blanca por ser constantes públicas;
  cualquier otro RFC hace fallar la generación.

Lo que **sí** se conserva: si un criterio está en revisión del comité fiscal, la
página lo dice en lenguaje de cliente. Es honesto y protege legalmente — se
declaró que estaba en revisión, no se presentó como definitivo.

## La frontera de responsabilidad (por qué el sitio está dividido así)

| Clase | Ejemplo | ¿Se documenta? |
|---|---|---|
| **A.** Operación | «¿Cómo importo un estado de cuenta?» | Sí — `docs/uso/` |
| **B.** Por qué el software calcula así | «¿Por qué marcó este CFDI como no deducible?» | Sí — `docs/calculos/`, con fundamento legal, redactado como comportamiento del programa |
| **C.** Asesoría al caso concreto | «¿Puedo deducir esta comida?» | **No, ni una línea.** Escribirla es prometer que se responde; responderla es un acto profesional con responsabilidad ilimitada. |

`docs/intro.md` declara esta frontera al usuario y `test_kb_al_dia` impide que
se borre por accidente.
