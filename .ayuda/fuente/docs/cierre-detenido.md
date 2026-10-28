---
id: cierre-detenido
title: Si el cierre se detiene o sale «Rechazado»
description: "Qué significa cada desenlace del cierre mensual, dónde se corrige la causa, qué se vuelve a correr y qué pasa con el cierre anterior del mes."
slug: /cierre-detenido
---

# Si el cierre se detiene o sale «Rechazado»

El cierre formal del mes puede terminar de dos formas, y conviene distinguirlas:

| Lo que ves | Qué significa | ¿Se guardó el mes? |
|---|---|---|
| Una ventana que empieza con **«ERROR»** y termina con **«COMO SALIR»** | El cierre **se detuvo**: hay una cifra que no se pudo determinar | No: esa corrida no registró ninguna declaración |
| El aviso **«Cierre completado, PERO la auditoría marcó…»** | El cierre **terminó**, y la revisión del mes encontró hallazgos; la calificación puede ser «Rechazado» | Sí: el mes se calculó y se guardó |

## 1. El cierre se detuvo

Antes de guardar nada, la aplicación revisa que cada cifra del mes se pueda
determinar. Si falta algo, se detiene y la ventana dice qué falta, por qué y cómo
salir. Si el mes no estaba declarado, el cierre anterior de ese mes queda como
estaba.

**Causas frecuentes y dónde se corrigen:**

- **Un CFDI con impuestos que no se pueden leer.** La ventana da el UUID, el campo y
  el archivo. Pide el XML corregido al emisor o descárgalo de nuevo del portal del
  SAT y vuelve a cargarlo.
- **IVA que no se puede determinar.** Según lo que diga la ventana:
  - confirma la forma de pago en la Memoria de cálculo con **«Capturar evidencia de
    pago…»** (formas de pago como 08 o 31);
  - vincula en Banco el cobro con su factura, con su importe (ver
    [movimientos «Por confirmar»](./banco-por-confirmar.md));
  - registra el entero de las retenciones de IVA en Declaraciones;
  - revisa el tipo de cambio del comprobante en moneda extranjera.
- **ISR que no se puede determinar.** Captura la evidencia de los gastos que la
  ventana nombra, o el régimen del cliente en **Configurar cliente**.
- **Meses anteriores incompletos.** Usa **«Verificar vigencia»** en esos meses. Si ya
  los revisaste por otra vía, puedes aceptarlos en Cierre anual con **«Aceptar
  vigencia sin verificar»**: queda registrado quién aceptó, cuándo y sobre qué
  comprobantes, y ningún CFDI se marca como vigente.
- **Saldo a favor de IVA de meses anteriores.** Registra en el Centro de
  complementarias si ese saldo se acredita o se pide en devolución.

**Cómo abrir el comprobante.** Cuando la ventana nombra un lugar de la aplicación,
trae un botón que te lleva ahí (por ejemplo **«Ir a CFDIs con esos meses…»**). Para
un comprobante concreto, copia su UUID de la ventana y búscalo en la pestaña
**CFDIs**.

**Qué vuelves a correr.** Cuando corrijas la causa, pulsa otra vez **«Cerrar
formalmente»**: el mes se vuelve a calcular. Solo hay que tocar otro mes si la causa
está en ese otro mes.

## 2. El cierre terminó con hallazgos («Rechazado»)

El mes se calculó y se guardó. En **Ver ▾ → «Ver detalles…»**, la ventana
**«Hallazgos del auditor»** muestra arriba la calificación (Rechazado, Observado o
Aprobado con observaciones) y una tabla con la severidad, el monto, el porqué y la
acción sugerida de cada hallazgo, del más importante al menos importante.

Un hallazgo crítico —por ejemplo, una base de IVA que no cuadra con los
comprobantes— pone la calificación en Rechazado. **Revisa cada hallazgo antes de
presentar la declaración.** Para que la calificación cambie, corrige el origen y
vuelve a cerrar el mes. Marcar un hallazgo como revisado, con tu justificación, está
en desarrollo.

## 3. Qué pasa con el cierre anterior del mes

- Cada cierre guarda una **versión nueva** de la declaración y **conserva la
  anterior**.
- La revisión de hallazgos y la memoria de cálculo muestran las del cierre más
  reciente.
- Si el mes ya está **bloqueado o declarado**, la aplicación te pregunta si quieres
  cerrarlo como **declaración complementaria**, y la versión sube.
- Volver a cerrar **no cambia lo que ya presentaste al SAT**: las correcciones de un
  mes declarado se evalúan en el Centro de complementarias.
- Si el ejercicio ya tiene presentada la declaración anual, el mes no se vuelve a
  cerrar.

---

Esta página describe **cómo funciona el software**. No es asesoría fiscal sobre un
caso concreto: ese criterio corresponde al contador.
