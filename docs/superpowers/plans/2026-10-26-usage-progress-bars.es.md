# Aikya Usage Progress Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Mostrar una barra de consumo para 5h y otra para 7d, con el porcentaje después de cada barra y todos los indicadores en una sola línea inferior.

**Architecture:** Mantener la fuente de datos nativa y el registro de tokens existentes. Extender el formateador puro con segmentos de texto y tono, barras ASCII con `=` y anchura adaptable. `footer(view, totals, columns)` seguirá produciendo texto plano a partir de esos segmentos; `PromptHint` los dibujará como texto nativo con colores por tramo y conservará una sola línea.

**Tech Stack:** JavaScript, elementos nativos de Claude Code, pruebas `claude-code/testing`, validación Python y GitHub Actions existentes.

**Spec:** [Requisitos y diseño de este documento](#requisitos-y-diseno), procedentes de la petición del usuario del 2026-10-26. Estado: aprobado por el usuario el 2026-10-26 mediante «perfecto implementalo»; código, pruebas locales y documentación completados; push y matriz de plataformas pendientes.

## Global Constraints

- No implementar, cambiar versiones, hacer commit ni push de esta propuesta antes de la aprobación del usuario.
- Mantener la interfaz y las etiquetas en inglés: Context, Tokens, Usage, 5h, 7d.
- Mantener una sola línea inferior; sin panel nuevo ni controles.
- El porcentaje representa consumo utilizado, no saldo restante ni progreso de tareas.
- Conservar las lecturas nativas y su precisión actual; nunca inferir consumo a partir de tokens.
- Sin dependencias, peticiones de red o temporizadores nuevos.
- Colores nativos mediante Text; no insertar secuencias ANSI en el texto ni depender solo del color para expresar consumo.
- Conservar el comportamiento de Flow y BoxBot, incluido su posicionamiento.

## Review Focus

- Lecturas ausentes o caducadas: barra indeterminada y N/A, nunca un cero ficticio.
- Cero, cien y sobreconsumo: rellenar la barra entre 0 y 100%, conservando el porcentaje real si supera 100%.
- Decimales: mantener el porcentaje actual con hasta un decimal; el relleno de caracteres es aproximado.
- Terminal estrecha: elegir por longitud real una variante más corta antes de que Claude recorte la sección 7d.
- Redimensionado y actualizaciones: recalcular el formato sin segunda línea ni duplicación del pie.

## Requisitos y diseno

Ejemplo ilustrativo, con valores ficticios:

```text
Context: 42% | Tokens: 53k | Usage 5h [====------] 40% | 7d [========--] 80%
```

- Diez celdas por barra en la variante completa; `=` es consumo utilizado y `-` es capacidad restante.
- Ambas barras tienen la misma anchura dentro de una variante.
- El porcentaje aparece siempre a la derecha de su barra, separado por un espacio en las variantes completa y compacta.
- Seleccionar la primera variante que quepa: etiquetas completas y 10 celdas; etiquetas compactas y 5 celdas; etiquetas mínimas y barras de 2 o 1 celda. Medir también etiquetas, cifras, porcentajes y separadores.
- Si no cabe ninguna variante con barras, conservar las cifras en un formato de texto mínimo con etiquetas 5h y 7d. Esta es la excepción propuesta para anchos extremos; nunca añadir otra fila.
- Para una lectura desconocida, usar `?` en las celdas y `N/A` después. Para un cero real, usar celdas `-` y `0%`.
- Mantener el formato de Context y Tokens, con las abreviaturas que ya utiliza el mod.

### Colores propuestos

- `success`: consumo inferior a 70%; verde en el tema oscuro validado.
- `warning`: consumo desde 70% y menor que 90%; amarillo en el tema oscuro validado.
- `error`: consumo desde 90% en adelante; rojo en los temas habituales. Su aplicación a esta línea se comprobó en terminal real.
- `inactive` o texto atenuado para los guiones restantes y los datos N/A.
- Colorear la parte consumida `=` y su porcentaje; mantener neutros etiquetas, corchetes y separadores. Cada ventana tiene un color independiente.
- Usar claves semánticas del tema para respetar sus colores; los tonos exactos pueden variar con el tema. Estos umbrales son una propuesta visual del mod, no límites nuevos de Claude.
- Respetar terminales sin color y la preferencia NO_COLOR: las barras y porcentajes seguirán siendo legibles en texto plano. No forzar color en el mod.
- La línea del ejemplo tendrá el tramo consumido de 5h y 40% en verde, y el de 7d y 80% en amarillo.

Viabilidad comprobada con un plugin temporal, fuera del repositorio, que dibuja datos ficticios: en Claude Code 2.1.308, `PromptHint` admite un Text con hijos Text de diferentes colores. Se comprobaron tanto la única fila como los colores distintos de `success`, `warning` y los guiones atenuados. El mod real no se modificó. Referencia: [Text y PromptHint en la documentación oficial](https://code.claude.com/docs/en/plugins/mods/reference#elements).

Ejemplo compacto:

```text
Ctx:42% Tok:53k | 5h [==---] 40% | 7d [====-] 80%
```

## Task 1: Formato y renderizado del consumo

**Files:**
- Modify: `mods/aikya-usage/lib/usage.js`
- Modify: `mods/aikya-usage/hooks/register.js`
- Test: `mods/aikya-usage/tests/usage.test.ts`
- Test: `mods/aikya-usage/tests/runtime.test.ts`

**Interfaces:**
- Consumes: `normalizeUsage(raw, nowMs)` y `readLedger(ledger)`, sin cambios en fuentes o contabilidad.
- Produces: `usageBar(value, cells) -> string`, función pura exportada; devuelve la barra ASCII y el porcentaje a continuación. `usageTone(value) -> "inactive" | "success" | "warning" | "error"` asigna el tono por los umbrales propuestos. `footerParts(view, totals, columns) -> Array<{text: string, tone: "text" | "inactive" | "success" | "warning" | "error"}>` produce los tramos de la variante que quepa. `footer(view, totals, columns) -> string` conserva su firma y une esos tramos sin estilos, de modo que no se duplique la lógica de anchura. `details(view, totals)` conserva su firma y utiliza el mismo formato para su línea de resumen.

- [x] **Step 1: Escribir pruebas que fallen.** Comprobar `usageBar(40, 10) === '[====------] 40%'`, `usageBar(80, 10) === '[========--] 80%'`, `usageBar(0, 5) === '[-----] 0%'`, `usageBar(100, 5) === '[=====] 100%'`, `usageBar(null, 5) === '[?????] N/A'` y `usageBar(120, 5) === '[=====] 120%'`. Comprobar 12.5% sin perder el decimal. Comprobar los tonos en null, 0, 69.9, 70, 89.9, 90, 100 y 120, y que unir `footerParts` produzca exactamente el texto de `footer`.
- [x] **Step 2: Ejecutar `claude plugin test mods/aikya-usage`.** Confirmar que las pruebas nuevas fallan antes de implementar.
- [x] **Step 3: Implementar el formato.** Redondear las celdas rellenas al entero más próximo, limitar solo el dibujo a la capacidad de la barra y conservar el porcentaje real. Elegir variantes por su longitud, sin saltos de línea. Usar Text anidados para colorear únicamente los tramos propuestos; el padre no llevará `dimColor: true`, que podría atenuar las barras. Reservar 24 columnas para los indicadores nativos de modo, según la comprobación real a 80 columnas. Conservar la atenuación de los tramos neutros y el coste de refresco existente.
- [x] **Step 4: Verificar la integración.** Añadir aserciones para la línea completa mostrada arriba, variantes de 80/50/32 columnas, ancho extremo, una o ambas ventanas N/A, lecturas caducadas, actualización de ambas ventanas y ausencia de pérdida de la sección 7d. Comprobar colores independientes para 5h/7d, tramos restantes atenuados, ausencia de ANSI incrustado, ocultar/mostrar, el comando local y que no se abra un panel.
- [x] **Step 5: Ejecutar pruebas y revisar en una terminal real.** `claude plugin test mods/aikya-usage` y `claude plugin validate mods/aikya-usage --strict` deben terminar sin errores. Comprobar también las claves de color en pruebas nativas y el color pintado en una terminal real; redimensionar una sesión aislada; usar una muestra de prueba explícita si no existen métricas de cuenta reales, sin simular que son lecturas reales.
- [x] **Step 6: Commit** del cambio y las pruebas después de su verificación.

## Task 2: Versiones, documentación y entrega

**Files:**
- Modify: `mods/aikya-usage/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Modify: `VERSION`, `CHANGELOG.md`, `README.md`, `mods/aikya-usage/README.md`
- Modify: `tests/test_releases.py` y referencias de versión actual en `docs/distribution.md`

**Interfaces:**
- Consumes: Formato y pruebas aprobados en Task 1.
- Produces: Usage 0.1.1 y bundle 0.0.13 propuestos, catálogo coherente, ejemplos de instalación y documentación en inglés. Confirmar antes de ejecutar que estas versiones siguen libres.

- [x] **Step 1: Actualizar las versiones y las expectativas de empaquetado.** Mantener BoxBot 0.3.1 y Flow 0.1.1.
- [x] **Step 2: Actualizar README y changelog.** Mostrar ambas barras con `=`, su significado, umbrales de color, N/A y la excepción para anchos extremos; mantener las instrucciones por sistema operativo.
- [x] **Step 3: Ejecutar `python3 -m unittest discover -s tests -v`, las pruebas y validación estricta de los tres mods, y `python3 scripts/build_release.py --check --version v0.0.13`.** Construir los 13 assets en un directorio vacío y confirmar que no hay errores.
- [ ] **Step 4: Commit y push a la rama de trabajo tras aprobar esta propuesta.** Validar la matriz existente de Linux, macOS y Windows. La integración a ramas protegidas y la publicación de una release se realizan por sus flujos de revisión habituales.

GENERATED BY AIKYA HARNESS
