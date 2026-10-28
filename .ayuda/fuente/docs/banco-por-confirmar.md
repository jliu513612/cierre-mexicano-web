---
id: banco-por-confirmar
title: Movimientos «Por confirmar» en Banco
description: "Cuándo un movimiento bancario queda «Por confirmar», cómo se confirma o se rechaza la propuesta y qué pasa si no se confirma."
slug: /banco-por-confirmar
---

# Movimientos «Por confirmar» en Banco

Cuando concilias el banco, la aplicación busca la factura o el complemento de pago
que corresponde a cada depósito o cargo. Si la coincidencia es exacta y no hay
ninguna duda, el movimiento queda **Conciliado**. Si hay algo que debes revisar, la
aplicación **propone** la factura y deja el movimiento **Por confirmar**. Una
propuesta nunca se aplica sola.

## Cuándo queda «Por confirmar»

- **El importe difiere de la factura en $25.00 o menos**, en la moneda del
  movimiento; por ejemplo, un cobro con la comisión de la transferencia descontada.
  El importe tiene que cubrir más de la mitad de la factura: un pago menor se trata
  como pago parcial y se asigna a mano.
- **La factura está en otra moneda y se pagó desde una cuenta en pesos**, aunque el
  importe cuadre: el tipo de cambio que aplicó el banco hay que verificarlo.
- **La descripción del banco menciona a otra empresa** distinta de la de la factura
  propuesta.

**La ventana de fechas.** Para proponer una factura, su fecha de emisión —o la fecha
de pago, si es un complemento de pago— tiene que estar a **45 días naturales o
menos** de la fecha del movimiento, antes o después.

**Si dos facturas empatan**, la aplicación no elige: deja el movimiento sin CFDI con
el motivo «ambiguo», para que elijas tú.

**La banda de $25.00 y la ventana de 45 días son fijas en esta versión**; no se
cambian desde la aplicación.

## Cómo confirmar

- **Varios a la vez:** en la **Mesa de conciliación**, botón **«Confirmar por
  tolerancia…»**. Verás cada propuesta con su evidencia, ya marcada. Desmarca las que
  no procedan y pulsa **«Confirmar seleccionados»**.
- **Uno por uno:** en la pestaña Banco, haz doble clic en el movimiento; en
  **Estado** elige **Conciliado** y pulsa **Guardar**.

Lo que confirmas queda conciliado y protegido: volver a conciliar no lo cambia.

## Si la propuesta no es correcta

- **Rechazarla:** doble clic en el movimiento → **«Quitar CFDI casado»** →
  **Guardar**. El movimiento queda sin CFDI y la conciliación automática no lo
  vuelve a casar.
- **«Desvincular…» en la Mesa no rechaza la propuesta:** quita la factura, pero al
  volver a pulsar **Conciliar** la misma propuesta puede aparecer otra vez como «Por
  confirmar». Para rechazarla usa «Quitar CFDI casado», como se indica arriba.
- **Atarlo a otra factura en parcialidades (PPD):** usa **«Conciliar a mano (elegir
  facturas)…»**, o en la Mesa marca las facturas y pulsa **«Vincular selección»**.
  Aquí no aplican la banda de $25.00 ni la ventana de 45 días: capturas el importe
  que va a cada factura.
- Emparejar a mano una factura de pago en una sola exhibición (PUE) que queda fuera
  de la banda o de la ventana está en desarrollo.

## Facturas PPD cobradas sin complemento de pago

Si el depósito cobra una factura PPD que todavía no tiene complemento de pago,
**vincúlala a mano con su importe** («Conciliar a mano» o «Vincular selección»): así
queda registrado el cobro que causa el IVA del mes. Confirmar la propuesta deja el
banco conciliado, pero **no** registra ese cobro para el IVA.

## Si no la confirmas

El movimiento sigue contando como **pendiente** en la Mesa y en la Salud del
cliente, y no se toma como cobro o pago realizado en el flujo de caja. El IVA de tus
facturas PUE no cambia por esto, porque sale del propio CFDI. Si el cierre detecta
un cobro de una factura PPD sin complemento de pago, te lo dirá y te pedirá
vincularlo (ver [si el cierre se detiene](./cierre-detenido.md)).

Algunas mejoras de esta pantalla están en desarrollo.

---

Esta página describe **cómo funciona el software**. No es asesoría fiscal sobre un
caso concreto: ese criterio corresponde al contador.
