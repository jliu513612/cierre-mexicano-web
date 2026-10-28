---
id: 14_diot
title: DIOT (vista previa y ajustes)
sidebar_position: 14
---

# DIOT (vista previa y ajustes)

La DIOT informa al SAT tus operaciones con proveedores. La aplicación la genera desde los CFDIs recibidos en el formato oficial vigente desde agosto de 2025 (54 campos, importes en pesos enteros) y te deja revisarla y ajustarla antes de exportar. El cálculo nunca se modifica: tus ajustes son una capa aparte que registra quién, cuándo y con qué razón.

## Paso a paso

1. En la pestaña Cierre, abre el menú Declaraciones y elige DIOT. La vista previa muestra un renglón por proveedor con sus operaciones, bases e IVA por tasa (16%, 8%, 0%, exento, retenido, importación).

2. Importaciones: cada pedimento cuyo IVA de importación sí se acreditó genera su propio renglón como proveedor extranjero (tipo 05): un renglón por pedimento, no uno por proveedor. Lleva el IVA pagado en aduana al 16% en la columna IVA imp. y su base; para 2026 la base es el valor en aduana más IGI, DTA y PRV. El tax ID y el país de residencia del proveedor se capturan en el diálogo de Pedimentos de Comercio Exterior (botones Tax ID… y País…; si el PDF trajo una propuesta de proveedor, la confirmas con Revisar proveedor…). Si a un renglón de importación le falta el tax ID o el país, la vista previa te lo avisa, y al exportar la aplicación no genera el archivo .txt del mes: te dice qué renglones y qué campos faltan y deja la hoja de trabajo con el detalle. No los rellena por su cuenta. El IVA de importación al 8% no tiene campo propio en el layout 2025: se avisa, no se reporta en automático.

3. Doble clic en un renglón muestra su desglose: de qué facturas (UUID por UUID) sale cada cifra de ese proveedor, con la suma cuadrada al centavo contra la vista previa.

4. Con Agregar renglón, Editar renglón y Quitar renglón ajustas la vista previa (por ejemplo, quitar un renglón que no corresponde). El formulario trae los 54 campos del layout oficial; todo ajuste pide una razón y queda registrado con usuario y fecha, y Deshacer ajuste lo revierte.

5. Exportar (.txt + hoja) genera el archivo oficial listo para cargarse al SAT y una hoja de trabajo para tu expediente.
