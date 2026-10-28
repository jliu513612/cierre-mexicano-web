---
id: 13_cierre_mensual
title: Cierre mensual
sidebar_position: 13
---

# Cierre mensual

El cierre del mes calcula IVA e ISR provisional a partir de los XML de la carpeta y de lo que vinculas y capturas, y revisa el resultado: si una cifra no se puede determinar, se detiene y te dice por qué; si termina con hallazgos, los ves en la auditoría del mes. Cada cifra tiene su memoria de cálculo.

**Ver también:** [Si el cierre se detiene o sale «Rechazado»](../cierre-detenido.md)

## Paso a paso

1. Con el cliente y el periodo elegidos arriba, haz clic en Cerrar formalmente. Las tarjetas muestran el resultado: IVA del mes, ISR provisional y total a pagar. La tabla anual de la izquierda resume los 12 meses; los botones Ver y Declaraciones dan acceso a DIOT, balanza, pólizas CONTPAQi y demás salidas.

2. En el menú Ver, la opción Ver detalles... abre la auditoría del cierre (ventana Hallazgos del auditor): cada hallazgo trae severidad (crítico, alto, medio), el monto involucrado y su porqué, ordenados por importancia. Un hallazgo crítico (por ejemplo, una base de IVA que no cuadra con los comprobantes) califica el cierre como Rechazado: revísalo antes de presentar la declaración; al corregir el origen y volver a cerrar, la calificación se actualiza.

3. Doble clic en un mes de la tabla anual abre la memoria de cálculo: IVA renglón por renglón e ISR con su coeficiente, cada cifra con su origen. Desde ahí puedes exportarla a Excel para el expediente del cliente.

4. Las filas marcadas con la lupa se pueden desglosar: doble clic abre la lista de facturas (UUID por UUID) que componen esa cifra, con el monto que aporta cada una y el cuadre al centavo contra el cierre. Con eso puedes sustentar cualquier cifra del mes documento por documento.

5. Al exportar la memoria a Excel se incluyen dos hojas de defensa: Fundamentos del cálculo (cada parámetro legal que el cálculo usó, con su valor, vigencia y norma) y Soporte del cálculo (el desglose por documento de cada cifra del periodo). Es el expediente que respalda el número ante una revisión.
