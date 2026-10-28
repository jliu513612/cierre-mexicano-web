---
id: fuentes
title: De dónde sale cada número
description: "Qué fuentes combina el cálculo del mes, qué manda cuando dos fuentes no coinciden y qué pasa si falta un dato."
slug: /fuentes
---

# De dónde sale cada número y qué manda si las fuentes chocan

El cálculo del mes no sale de una sola fuente. La aplicación lee los comprobantes
(XML) directamente de la carpeta del cliente y los combina con otras fuentes; cada
una entra por su propio camino. **Cuando dos fuentes no coinciden, la aplicación no
elige por ti:** te muestra la diferencia y la cifra queda sin determinar hasta que
la resuelvas.

## Las fuentes

| Fuente | Qué aporta | Dónde se carga |
|---|---|---|
| Comprobantes XML: emitidos, recibidos, complementos de pago y recibos de nómina | IVA causado y acreditable, ingresos y deducciones del ISR, ISR retenido por salarios, DIOT | [Carga de datos](./uso/05-carga-de-datos.md) |
| Cobro en el banco que **tú vinculas** a una factura emitida | IVA causado de una factura en parcialidades (PPD) cobrada, aunque todavía no haya complemento de pago | [Banco (conciliación)](./uso/08-banco-conciliacion.md) |
| Pedimento en PDF del agente aduanal | IVA de importación acreditable y su renglón en la DIOT | [Comercio exterior](./uso/10-comercio-exterior-vista-previa.md) |
| Lo que capturas en la aplicación | Coeficiente de utilidad, pagos provisionales, PTU, pérdidas fiscales, constancias de plataformas, entero de retenciones de IVA, pagos con formas distintas al dinero (por ejemplo 08 y 31) y el uso de cada cuenta para la proporción de IVA acreditable | [Cierre mensual](./uso/13-cierre-mensual.md) · [Plataformas digitales](./uso/22-plataformas-digitales.md) |
| Declaraciones y acuses que capturas o importas | Pagos provisionales de meses anteriores y saldo a favor de IVA; además, deciden si un mes ya declarado se puede volver a calcular | [Cierre mensual](./uso/13-cierre-mensual.md) |
| Parámetros fiscales | Tarifas, UMA, subsidio para el empleo y cuotas, por año | [Parámetros fiscales](./uso/20-parametros-fiscales.md) |
| Estado del comprobante en el SAT y tu marca de cancelación | Si un comprobante cuenta o no por estar cancelado | [CFDIs](./uso/07-cfdis.md) |

Para calcular, la aplicación **vuelve a leer los XML de la carpeta**: las listas que
ves en pantalla son un resumen para buscar y filtrar, no la base del cálculo.

## Qué manda cuando dos fuentes chocan

- **Complemento de pago y cobro en el banco del mismo pago.** Son dos pruebas del
  mismo pago y el IVA se causa **una sola vez**. Si la aplicación no puede saber si
  son el mismo pago, la cifra queda sin determinar.
- **Un cobro que el banco parece pagar, pero que no has vinculado.** No entra al
  cálculo. Si la coincidencia es fuerte, el IVA del mes queda sin determinar hasta
  que lo resuelvas en Banco; si es débil, solo aparece en la lista para revisar.
- **Un cobro vinculado a una factura de pago en una sola exhibición (PUE).** El
  cierre se detiene: el IVA de esa factura ya se causó al emitirla.
- **El SAT dice «vigente» y tú marcaste el comprobante como cancelado.** La
  aplicación no elige: lo presenta como hallazgo para que lo aclares.
- **Tipo de cambio.** Manda el que declara el comprobante; el del DOF solo se usa
  para avisarte si hay una diferencia.
- **Pagos provisionales de meses anteriores.** Lo pagado manda sobre lo declarado, y
  lo declarado sobre lo calculado. Lo que captures como pagos reales en la Memoria
  de cálculo manda sobre todo lo anterior.
- **Saldo a favor de IVA.** La declaración capturada manda sobre lo que calculó el
  cierre; el saldo inicial que confirmes ante el SAT manda para los meses
  posteriores.
- **Pedimento.** Un pedimento pagado no se reemplaza por una versión no pagada del
  mismo número. El borrador del agente, o un PDF sin la certificación del banco, se
  guarda, pero su IVA no se acredita.
- **Nómina.** Manda el recibo timbrado. La calculadora de nómina sirve para preparar
  la nómina; el cierre usa lo que dicen los CFDI de nómina.
- **Tarifa del ISR.** Se usa la del año del periodo. Si falta la de ese año, la cifra
  queda sin determinar; nunca se toma la de otro año.
- **Constancias de plataformas.** Manda la constancia: la aplicación compara contra
  la tasa esperada y te avisa si no coincide.

## Si falta un dato o está en duda

- La cifra queda **sin determinar** y el programa dice por qué.
- El **cierre formal se detiene**: no se guarda una declaración con una cifra que no
  se pudo determinar.
- La **vista previa sigue calculando**, marcada como estimación, para que veas el
  resto del mes.

## Si el mes ya está declarado

La aplicación no vuelve a calcular en silencio un mes declarado. Un complemento de
pago que llega tarde con fecha de pago de ese mes no se mete solo: se te avisa, y
el camino es evaluar una complementaria desde el Centro de complementarias.

## Lo que la conciliación del banco no cambia

Conciliar el banco de forma automática marca qué facturas quedaron cobradas o
pagadas; **no cambia ningún impuesto**. Lo que sí entra al cálculo es el cobro que tú
vinculas a mano a una factura emitida.

---

Esta página describe **cómo calcula el software**. No es asesoría fiscal sobre un
caso concreto: ese criterio corresponde al contador.
