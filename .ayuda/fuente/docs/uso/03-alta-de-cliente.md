---
id: 03_alta_cliente
title: Alta de cliente
sidebar_position: 3
---

# Alta de cliente

Cada empresa que llevas es un cliente. Todo el trabajo (CFDIs, banco, cierres, pólizas) se guarda por cliente y periodo; el selector de la barra superior indica sobre cuál estás trabajando.

## Paso a paso

1. En la barra superior, haz clic en el botón + que está junto al selector de cliente.

2. Llena los datos del cliente: RFC (12 o 13 caracteres), razón social, régimen fiscal (desplegable) y coeficiente de utilidad si aplica. Si tienes la e.firma del cliente puedes cargarla aquí (.cer, .key y contraseña): se guarda cifrada en tu equipo y sirve para descargar sus CFDIs del SAT.

3. Régimen fiscal: en el alta lo eliges tú del desplegable, y esa elección confirma el perfil del cliente. El perfil confirmado siempre manda. Cuando el perfil aún no está confirmado (por ejemplo, clientes creados automáticamente al detectar sus CFDIs), la aplicación toma el régimen del campo RegimenFiscal del propio CFDI; el texto que se haya capturado queda solo como respaldo. Si el CFDI y lo capturado difieren, la aplicación marca la diferencia y no decide por su cuenta.

4. Haz clic en Crear cliente. Al crear el cliente, la aplicación te ofrece importar su historia desde un export de CONTPAQi (balanzas mensuales y catálogo de cuentas); puedes hacerlo en ese momento o después (ver el capítulo Carga de datos).

5. El cliente nuevo aparece en el selector de la barra superior. Elige también el año y el mes de trabajo en los selectores de periodo.
