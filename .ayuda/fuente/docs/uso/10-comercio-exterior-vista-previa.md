---
id: 10_comercio_ext
title: Comercio Exterior (vista previa)
sidebar_position: 10
---

# Comercio Exterior (vista previa)

Módulo en vista previa (por eso la pestaña dice Comercio Ext. con la marca de beta): la captura de pedimentos y el panorama por mes ya operan. La importación definitiva acredita IVA por las reglas generales. En la importación temporal (IMMEX), el tratamiento del IVA lo decide la forma de pago que el propio pedimento declara para el IVA; el costo del pedimento temporal y la exportación están en desarrollo: quedan en suspenso con aviso y nunca se calculan a ciegas (el paso del cierre anual explica la única excepción).

## Paso a paso

1. Abre la pestaña Comercio Ext. Con los botones de la barra subes los pedimentos del cliente y capturas el gasto extranjero.

2. El panorama por mes muestra: pedimentos subidos, el IVA de importación acreditable (con su composición por los renglones IVA e IVA/PRV del pedimento), lo pendiente de acreditar, el gasto extranjero y si ya está reflejado en el cierre. Verde significa al día; ámbar, que falta correr el cierre del mes para que lo subido se refleje; la columna de sugerencia dice exactamente qué hacer.

3. Doble clic en un mes abre su composición: cada pedimento con su número, fecha de pago, el IVA y el IVA/PRV tal como vienen impresos en el pedimento, la contribución acreditable (o «pendiente» cuando falta un dato o una regla) y el total, junto con los gastos extranjeros del mes.

4. IVA del pedimento temporal: lo decide la forma de pago que el pedimento declara para el IVA (Apéndice 13 del Anexo 22). Pagado en efectivo (clave 0), es IVA pagado y acreditable por las reglas generales y va a la DIOT; con crédito fiscal en IVA e IEPS (clave 21), es informativo: no se paga, no se acredita y no va a la DIOT. Con cualquier otra clave, o si el pedimento no trae forma de pago, ese IVA queda por confirmar, con aviso; la aplicación no lo decide por su cuenta. Las claves citadas son las del Apéndice 13 vigente cuando se escribió este manual. La certificación IVA/IMMEX del cliente (pestaña Fiscal) ya no lo decide: se coteja con el pedimento y, si lo contradice, la aplicación lo avisa.

5. DIOT de importaciones: cada pedimento cuyo IVA de importación sí se acreditó genera su propio renglón en la DIOT, como proveedor extranjero: un renglón por pedimento, no uno por proveedor. Su número de identificación fiscal y su país de residencia se capturan en este mismo diálogo de pedimentos (botones Tax ID… y País…); si el PDF trajo una propuesta de proveedor, la confirmas con Revisar proveedor…, y mientras no la confirmes sus datos no se usan. Si falta cualquiera de los dos, al exportar la DIOT la aplicación no genera el archivo .txt del mes e indica qué renglones y qué campos faltan; no los rellena por su cuenta. Lo capturado se conserva aunque vuelvas a subir el PDF del pedimento.

6. Pedimento temporal, propiedad de la mercancía: con el botón Dueño… del mismo diálogo contestas si la mercancía es de la empresa y de qué tipo es; la aplicación no lo deduce del régimen. Mientras no lo contestes, el temporal queda pendiente de verificación.

7. Cierre anual: la deducción fiscal de la importación definitiva se expone en la conciliación anual al tipo de cambio que marca el propio pedimento. Se muestra como dato para que lo concilies con el costo de lo vendido antes de declarar. No se resta en automático, para no duplicar el costo que ya trae la balanza. En la importación temporal, si capturaste que la mercancía no es de la empresa y es un insumo, su valor sale excluido de esa deducción con la razón a la vista; activo fijo, otro tipo o sin contestar quedan pendientes de verificación, igual que los impuestos del pedimento (IGI, DTA, PRV).
