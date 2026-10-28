---
id: 05_carga_datos
title: Carga de datos
sidebar_position: 5
---

# Carga de datos

Hay cuatro vías para alimentar la aplicación: descarga directa del SAT (recomendada), XML sueltos que ya tengas, el estado de cuenta bancario y la migración desde CONTPAQi. Para calcular, la aplicación vuelve a leer los XML de la carpeta y los combina con lo que vinculas en el banco, los pedimentos y lo que capturas; si dos fuentes no coinciden, te lo muestra y no elige por ti. CONTPAQi es una marca de su titular, sin relación ni afiliación con Tax Certeza.

**Ver también:** [De dónde sale cada número y qué manda si las fuentes chocan](../fuentes.md)

## Paso a paso

1. Descarga del SAT: abre el menú Más (esquina superior derecha) y elige SAT (descarga de CFDIs). Ahí configuras la e.firma del cliente (.cer, .key y contraseña, guardadas cifradas en tu equipo, nunca se transmiten a terceros) y lanzas la descarga masiva del periodo.

2. XML manual: si ya tienes los XML del cliente (se los pidió al SAT, se los mandó otro despacho), usa el botón Cargar XML/ZIP… de la pestaña CFDIs (ver su capítulo): acepta XML sueltos o un ZIP y acomoda cada comprobante en la carpeta del mes correcto, avisando de repetidos o ilegibles. También puedes copiarlos a mano a %APPDATA%\TaxCerteza\data\RFC-DEL-CLIENTE\AAAA-MM\ (una carpeta por mes); la línea de salud de datos del Tablero te dice cuántos XML tiene cada cliente en disco.

3. Migración desde CONTPAQi: para arrancar con los papeles de trabajo poblados, importa el export de CONTPAQi del cliente (balanzas mensuales + catálogo de cuentas). Selecciona la carpeta del export; la aplicación muestra primero el plan de lo que va a importar y solo aplica lo que confirmes.

4. Balanzas incompletas: una balanza con movimientos de un solo lado (la columna de cargos o la de abonos viene vacía) o que no cuadra entre cargos y abonos se rechaza completa para ese mes, con el motivo a la vista: pide al cliente la balanza completa y correcta. El mes rechazado se ve en el plan pero no se puede marcar para importar: no entra nada parcial ni descuadrado.

5. Estado de cuenta bancario: se sube en la pestaña Banco (ver su capítulo). Ahí mismo se concilia contra los CFDIs del mes.
