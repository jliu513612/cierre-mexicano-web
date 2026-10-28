---
id: 04_carpeta_trabajo
title: Carpeta de trabajo
sidebar_position: 4
---

# Carpeta de trabajo

Todos los datos (clientes, CFDIs, cierres, licencia) viven en una carpeta de trabajo; por omisión es %APPDATA%\TaxCerteza. Puedes elegir otra, por ejemplo una carpeta respaldada del despacho. La aplicación siempre indica cuál está usando: aparece en el título de la ventana, y no cambia de carpeta sin avisar.

## Paso a paso

1. Abre el menú Más (≡, esquina superior derecha) y elige Carpeta de trabajo. El diálogo muestra la carpeta activa y cuántos clientes contiene; cuando eliges una carpeta propia, la ruta aparece además en el título de la ventana.

2. Con Cambiar… eliges otra carpeta (el cambio aplica al reiniciar la aplicación). Abrir en el Explorador te lleva directo a ella, útil para respaldarla.

3. Carpetas de red: una carpeta en unidad de red mapeada o en ruta UNC no se puede elegir como carpeta de trabajo. La base de datos es un archivo que se corrompe sin aviso si más de una PC lo escribe a la vez a través de la red; para compartir datos entre varios contadores, la vía soportada es el modo despacho (incompleto en esta versión: ver el capítulo Instalación). Si tu carpeta de trabajo ya existente está en red, la aplicación arranca, pero te lo advierte en cada inicio.
