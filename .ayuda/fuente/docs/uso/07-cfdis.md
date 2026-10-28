---
id: 07_cfdis
title: CFDIs
sidebar_position: 7
---

# CFDIs

La pestaña CFDIs es la rejilla de trabajo con todos los comprobantes del rango elegido: fecha, tipo, contraparte, RFC, UUID, importes, estatus y cuenta contable sugerida.

## Paso a paso

1. Revisa los comprobantes del periodo. Arriba están los filtros: rango Desde/Hasta (puedes ver varios meses o el año completo), dirección (emitidos/recibidos), método de pago (PUE/PPD) y búsqueda por contraparte o UUID. Doble clic en una fila abre el detalle del comprobante; con el clic derecho puedes ver la factura como PDF.

2. Columna Pagado (REP): en facturas PPD indica si ya tienen complemento de pago y por cuánto (pago parcial o total). Así detectas facturas emitidas sin REP y pagos sin factura relacionada antes del cierre.

3. Columna Cuenta: es la última columna de datos, al extremo derecho, y va resaltada con color: azul claro cuando ya tiene cuenta contable (por regla del emisor o propuesta automática) y ámbar en negrita cuando está vacía, por asignar. Doble clic sobre esa columna abre la regla emisor→cuenta: la cuenta que elijas se guarda por RFC del emisor y aplica a todos sus comprobantes de ahí en adelante.

4. Descarga del SAT desde esta pestaña: solo puede correr una descarga a la vez. Mientras hay una en curso, la aplicación deshabilita los controles de descarga masiva (el botón Descargar CFDIs (SAT) y las acciones de actualizar rango y de histórico) y, si intentas relanzar, te avisa que ya hay una corriendo. Al terminar, con éxito o con error, se rehabilitan solos; las consultas de vigencia y completitud siguen disponibles todo el tiempo.

5. Proveedores en lista negra (EFOS 69-B): botón Revisar, opción EFOS (lista 69-B). La aplicación cruza los RFC de tus contrapartes contra la lista del SAT; un proveedor en la lista definitiva hace no deducibles sus facturas y detiene el cierre con un hallazgo crítico.

6. Cargar XML/ZIP…: si te llegan comprobantes sueltos o un ZIP (del SAT, de otro despacho), no hace falta copiarlos a mano. Este botón los analiza y acomoda cada XML en la carpeta del mes que le corresponde.

7. Si algún comprobante ya está en disco, la aplicación te lo dice y te deja elegir entre reemplazar u omitir los repetidos: volver a subir no duplica nada sin avisarte.

8. Al final, el reporte cuenta todo el lote: cuántos entraron, cuántos se omitieron o reemplazaron, y cuántos eran ilegibles o de otro contribuyente.
