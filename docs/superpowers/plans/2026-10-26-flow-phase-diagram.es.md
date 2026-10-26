# Aikya Flow Phase Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Sustituir la lista de fases de Flow por bloques verticales con bordes redondeados, nombre, estado, colores y animaciones funcionales, siguiendo el croquis del usuario.

**Architecture:** Mantener el modelo y la validación de evidencias actuales. Añadir un modelo de presentación puro que seleccione tarjetas o un diagrama compacto según el espacio del panel; el hook dibujará Box y Text nativos dentro del marco compartido existente. Un modelo de movimiento puro alimentado por tiempo y cambios reales de estado controlará el indicador giratorio y los énfasis breves, sin desplazar el contenido. El marco seguirá colocando BoxBot en su sección inferior y Usage continuará en su línea independiente.

**Tech Stack:** JavaScript, elementos nativos Box/Text de Claude Code 2.1.308, claude-code/testing, herramientas Python de empaquetado y matriz GitHub Actions existente.

**Spec:** [Requisitos y ejemplo de este documento](#requisitos-y-ejemplo), basados en la solicitud y el croquis del usuario del 2026-10-26. Estado: aprobado por el usuario el 2026-10-26; implementación y verificaciones locales completadas; pendiente validación remota tras el push.

## Global Constraints

- Esperar aprobación antes de implementar, cambiar versiones o hacer commit/push de esta propuesta.
- Todo el texto de la interfaz permanece en inglés; el plan y la explicación al usuario están en español.
- Conservar las seis fases internas y los nueve estados de presentación actuales.
- Mantener las recetas por comando, los motivos de los estados y la validación de evidencias.
- Conservar Claude a la izquierda, Flow en el panel derecho, BoxBot abajo y Usage en una sola línea inferior.
- Sin controles visuales nuevos, porcentajes de progreso inferidos, dependencias externas ni llamadas de red. Un único temporizador de Flow coordinará animación y lectura existente; animar no aumentará la frecuencia de lectura de evidencias.
- Las flechas indican el orden visual; no imponen una máquina de transiciones nueva ni impiden repeticiones o fases paralelas.

## Review Focus

- Ausencia de snapshot válido: conservar No evidence, aunque existan herramientas activas o un turno haya terminado.
- Recetas de bugfix y solo lectura: conservar Reproduce/Diagnose/Fix/Regression y Not applicable, respectivamente.
- Poco espacio vertical: seleccionar el modo compacto para conservar las seis fases y espacio para BoxBot; no perder Review ni ocultar fases silenciosamente.
- Orden de hooks y pie vacío: conservar un único marco y el contrato de claves con BoxBot en ambos órdenes de carga.
- Motivos largos, temas sin color y redimensionado: conservar el estado legible y el detalle accesible por `/aikya-flow status`.
- Animación y eventos tardíos: una lectura repetida no repite el énfasis de éxito, y un nuevo comando o interrupción cancela cualquier énfasis anterior.

## Ajustes adicionales aprobados

- Omitir Claude task y la cabecera normal Turn ended en Flow. Conservar actividad útil y estados con evidencia.
- Retirar del panel de BoxBot la frase Decorative animation. No task progress is measured.
- Documentar actualización desde /plugin y comandos de terminal, y distinguir rama de trabajo de marketplace público.

## Estados actuales

Fases internas: explore, plan, implement, validate, security, review.
Etiquetas habituales: Explore, Plan, Implement, Validate, Security, Review.

| Estado interno | Etiqueta visible | Significado |
| --- | --- | --- |
| unknown | No evidence | No hay evidencia válida para indicar el estado de esta fase. |
| pending | Pending | La ejecución registrada señala que la fase está pendiente. |
| running | Running | La ejecución registrada señala que la fase está en curso. |
| waiting | Waiting | La fase espera una decisión o condición indicada en el motivo. |
| completed | Completed | La fase tiene evidencia válida de finalización. |
| failed | Failed | La ejecución informa un fallo y su motivo. |
| skipped | Not applicable | La receta omite la fase o el registro justifica su omisión. |
| blocked | Blocked | La fase no puede continuar por el motivo indicado. |
| interrupted | Interrupted | La fase se interrumpió, según su registro. |

El estado nativo de la sesión es independiente: Idle, Running, Command returned, Turn ended, Interrupted, Error y Refused. La actividad adicional incluye Thinking, Tool running/finished/failed, Denied, Waiting for permission y Nested skill. Estas señales no acreditan por sí mismas la finalización de una fase.

## Requisitos y ejemplo

- Un bloque por fase, con nombre centrado en la primera línea y símbolo más estado en la segunda.
- Box con `borderStyle: 'round'`; una flecha `↓` centrada entre bloques, sin espacios verticales grandes. Para terminales sin los glifos de borde, verificar una representación ASCII equivalente con `+`, `-`, `|` y `v` antes de anunciar soporte.
- Estado en color y símbolo: verde para Completed, cian para Running, amarillo para Waiting/Blocked/Interrupted, rojo para Failed y gris para No evidence/Pending/Not applicable. Preferir claves semánticas del tema cuando tengan el significado correspondiente; conservar el acento cian actual de Running. No depender exclusivamente del color.
- Conservar una cabecera de cuatro líneas como máximo: nombre, comando, actividad nativa y fuente. Sus líneas se truncan al ancho disponible. Los motivos completos permanecen en `/aikya-flow status` para no aumentar cada tarjeta.
- Perfil completo: seis tarjetas de cuatro filas, cinco filas de flechas, cabecera de cuatro filas como máximo y reserva de doce filas para el pie compartido. Usar tarjetas cuando placement sea dock, bodyColumns >= 32 y bodyRows >= 45. El ancho de tarjeta será min(40, bodyColumns), con centrado horizontal.
- Perfil compacto: una línea por fase, con símbolo, nombre y estado; una flecha entre fases. Usarlo en paneles bajos/estrechos, inline o sin medidas. Mantener las seis fases visibles cuando exista altura suficiente. La reserva conservadora evita depender del orden de hooks o de detectar si BoxBot está habilitado.
- Si ni el perfil compacto con el resto del contenido cabe, conservar el desplazamiento nativo de todo el panel. No presentar BoxBot como una región fija independiente de ese desplazamiento.

Ejemplo de las tarjetas, con evidencia ficticia disponible:

```text
AIKYA FLOW
/aikya-feature
Running · Tool running: Edit
Source: Aikya execution snapshot
╭────────────────────────────╮
│          Explore           │
│        ✓ Completed         │
╰────────────────────────────╯
              ↓
╭────────────────────────────╮
│            Plan            │
│        ✓ Completed         │
╰────────────────────────────╯
              ↓
╭────────────────────────────╮
│         Implement          │
│         ● Running          │
╰────────────────────────────╯
              ↓
╭────────────────────────────╮
│          Validate          │
│         ○ Pending          │
╰────────────────────────────╯
              ↓
╭────────────────────────────╮
│          Security          │
│         ○ Pending          │
╰────────────────────────────╯
              ↓
╭────────────────────────────╮
│           Review           │
│         ○ Pending          │
╰────────────────────────────╯

        [BoxBot conveyor]
```

Sin conexión a un registro compatible, las fases aplicables mostrarán `? No evidence`, como en el croquis. El cambio visual no crea evidencias ni instrumenta un harness que no emita el registro compatible.

## Propuesta de animaciones y colores

Estado: animaciones y colores aprobados por el usuario; se implementan junto con la limpieza de textos solicitada.

### Paleta

| Estado visible | Color propuesto | Comportamiento |
| --- | --- | --- |
| No evidence | Gris atenuado | Estático; mantiene ?. |
| Pending | Gris | Estático; mantiene ○. |
| Running | Cian | Indicador de una celda que gira; borde cian estable. |
| Waiting | Amarillo/ámbar | Reloj estático; no aparenta ejecución. |
| Completed | Verde | ✓ visible inmediatamente; un énfasis breve al confirmarse el cambio. |
| Failed | Rojo | × visible inmediatamente; un énfasis breve al entrar y luego estático. |
| Not applicable | Gris atenuado | Estático; mantiene —. |
| Blocked | Amarillo/ámbar | ! estático; un énfasis breve al entrar. |
| Interrupted | Amarillo/ámbar | ■ estático; termina cualquier giro o énfasis previo de esa fase. |

El nombre y el texto del estado permanecen legibles en todo momento. Se aplicará color al borde, símbolo y estado, dejando el título neutro. Los fondos permanecen sin relleno para que el panel no se convierta en una serie de bloques saturados. Usar `success`, `warning`, `error`, `inactive` y el acento cian actual; los tonos se comprobarán con los temas reales y NO_COLOR. La información no depende del color.

### Oportunidades de movimiento

La finalidad de las tres propuestas es indicación de estado. Sus tiempos son propuestas iniciales que se comprobarán en terminal; no son animaciones implementadas ni mediciones de rendimiento.

| Lugar | Situación actual | Frecuencia | Propósito | Movimiento propuesto |
| --- | --- | --- | --- | --- |
| Símbolo Running de la tarjeta o actividad nativa de la cabecera | Símbolo fijo | Continuo mientras exista actividad confirmada | Indicación de estado | Secuencia ◐ → ◓ → ◑ → ◒, un cuadro cada 250 ms y ciclo de 1 s, por pasos uniformes. Solo cambia una celda; el texto y el borde no se mueven. En modo estático se usa ●. |
| Conector entre dos fases consecutivas | Flecha fija | Solo al confirmarse un relevo entre fases | Indicación de estado | Flecha entrante en cian con un énfasis de 250 ms, una sola vez. Sin añadir filas ni partículas que aparenten progreso hacia fases pendientes. |
| Símbolo al entrar en Completed, Failed o Blocked | Cambio de texto inmediato | Solo en cambios reales aceptados | Indicación de estado | Color y símbolo finales visibles inmediatamente; negrita durante 250 ms, luego estilo estable. Sin desaparición, demora del estado, vibración ni parpadeo repetido. |

Las flechas entre fases completadas pueden quedar verdes; la conexión hacia la fase activa, cian; las futuras, grises. Este trazado es una lectura visual de estados aceptados, no un motor nuevo de transiciones. Solo se enfatiza un relevo cuando los cambios recibidos lo acreditan; estados no contiguos no se reinterpretan como pasos intermedios completados.

Si varias fases están Running según evidencia válida, pueden compartir el mismo cuadro de giro; no se fuerza artificialmente una única fase activa. Si no hay evidencia de fases y Claude sí está trabajando, solo gira el indicador de actividad nativa de la cabecera. Las cajas mantienen No evidence.

### Movimiento descartado

- Entrada/salida animada del panel: se abre por comandos o eventos frecuentes; la acción debe responder de inmediato.
- Deslizamientos, rebotes y cambios de tamaño de las cajas: moverían datos que la persona está leyendo y alterarían el espacio de BoxBot.
- Pulso o giro permanente en Waiting, Blocked, Interrupted o No evidence: sugeriría trabajo en ejecución donde el estado no lo confirma.
- Celebraciones en la primera lectura de un snapshot ya completado: no representan un cambio recién observado. La primera pintura es estática salvo el indicador Running real.

### Control de movimiento y coste

- Proponer `/aikya-flow still` y `/aikya-flow motion`, siguiendo el patrón ya usado por BoxBot. Son comandos locales; no añaden botones y no afectan la animación de BoxBot.
- Still detiene solo los efectos visuales: los estados y las lecturas continúan actualizándose. Motion reanuda el indicador actual sin repetir confirmaciones anteriores.
- No afirmar detección automática de preferencias de movimiento del sistema operativo si el API no la expone. El modo estático debe permitir la misma lectura de datos y colores.
- Coordinar los cuadros a 250 ms dentro del único reloj de Flow cuando haya un giro o énfasis activo. Mantener el refresco periódico de cache en 2000 ms, además de los eventos ya existentes. Cuando no haya animación, usar únicamente la cadencia de lectura actual si existe conexión.
- Al ocultar/cerrar el panel o terminar la sesión, cancelar el reloj. Un nuevo comando, un cambio de ejecución, un snapshot invalidado o una interrupción cancelan efectos anteriores.
- No animar cada evento de herramienta; los textos de actividad se actualizan inmediatamente. Evitar redibujos de animación mientras no exista un efecto activo.

### Pruebas adicionales propuestas

- Con reloj simulado: cuadros a 0, 250, 500, 750 y 1000 ms; misma anchura y geometría en todos ellos.
- No evidence sigue estático aunque la cabecera refleje actividad nativa; una herramienta finalizada no colorea una fase como Completed.
- Énfasis de 250 ms aplicado una sola vez en transiciones válidas; lecturas repetidas, primera carga e invalidaciones de render no lo reinician.
- Lecturas tardías, nuevo comando y eventos de cierre no reviven efectos ni trabajo cancelado.
- Still elimina movimiento y conserva actualizaciones de estado; Motion no repite éxitos antiguos. Waiting y Blocked no mantienen un giro.
- Mientras se anima, la lectura periódica de cache no aumenta de la frecuencia actual de 2000 ms. El mismo temporizador sirve a todos los indicadores activos.
- Verificación de colores/NO_COLOR, glifos, bajo consumo y posición de BoxBot en terminal real y en la matriz de plataformas.

Referencia de viabilidad: [elementos y API de reloj de Claude](https://code.claude.com/docs/en/plugins/mods/reference). Los tiempos y efectos anteriores requieren validación visual durante la implementación.

## Task 1: Diagrama y adaptación del panel

**Files:**
- Create: `mods/aikya-flow/lib/view.js`
- Create: `mods/aikya-flow/lib/motion.js`
- Modify: `mods/aikya-flow/hooks/register.js`
- Create: `mods/aikya-flow/tests/view.test.ts`
- Create: `mods/aikya-flow/tests/motion.test.ts`
- Modify: `mods/aikya-flow/tests/runtime.test.ts`
- Verify unchanged behavior: `mods/aikya-flow/lib/flow.js`, `mods/aikya-flow/lib/snapshot.js`, `mods/aikya-flow/tests/flow.test.ts`, `mods/aikya-boxbot/tests/boxbot.test.ts`

**Interfaces:**
- Consumes: `phaseRows(flow)`, `LABELS`, `SYMBOLS` y las medidas nativas bodyColumns/bodyRows/placement, sin nuevas fuentes de estado.
- Produces: `phaseView(rows, {bodyColumns, bodyRows, placement}) -> {mode: 'cards'|'compact', width: number, nodes: Array<{id, label, status, symbol, stateLabel, color}>}`. El hook crea los elementos nativos a partir de ese modelo puro, sin pasar `$` a módulos importados.
- Produces: `motionFrame({phaseStatus, nativeRunning, still, frame}) -> {symbol, animate}` y `transitionEmphasis(previous, current, changedAt, now) -> {phaseIds, connectorIds}`; modelos puros sin temporizadores ni acceso a `$`, siguiendo las reglas anteriores. El hook conserva y cancela el reloj.
- Preserves: claves aikya-mods-pane, aikya-flow-content y aikya-mods-footer; minHeight basado en la altura real del dock; ningún engine node bajo el marco dimensionado.

- [x] **Step 1: Escribir pruebas que fallen.** Comprobar seis nodos en orden, cinco conectores, símbolos y etiquetas de los nueve estados; unknown no se convierte en pending. Comprobar receta bugfix y Not applicable para solo lectura.
- [x] **Step 2: Ejecutar `claude plugin test mods/aikya-flow`.** Confirmar fallos por la falta del diagrama antes de implementar.
- [x] **Step 3: Implementar el modelo, las tarjetas y los efectos aprobados.** Mantener las lecturas y el paso de eventos actuales. Sustituir la lista plana por la vista vertical y mantener el informe completo de motivos en el comando status. Añadir primero las pruebas de animación descritas arriba; confirmar su fallo y después implementar los efectos, el reloj coordinado y los comandos still/motion.
- [x] **Step 4: Verificar adaptación.** Comprobar los límites bodyRows 44/45 y bodyColumns 31/32, ausencia de medidas, inline, motivos largos y estado legible sin color. Validar árboles nativos en terminal/Desktop/VS Code.
- [x] **Step 5: Verificar el panel compartido real.** Probar Flow solo y con BoxBot en ambos órdenes de carga. Redimensionar para recorrer tarjetas y compacto; comprobar todas las fases, ausencia de duplicados y posición inferior de BoxBot cuando el conjunto cabe. Usage mantiene su línea actual.
- [x] **Step 6: Ejecutar las pruebas y validación estricta de los tres mods.** Añadir regresiones si aparece un fallo en el dibujo real; commit después de confirmar los resultados.

## Task 2: Documentación y distribución

**Files:**
- Modify: `mods/aikya-flow/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `VERSION`
- Modify: `README.md`, `mods/aikya-flow/README.md`, `CHANGELOG.md`, `docs/distribution.md`, `tests/test_releases.py`
- Create: `docs/validation/2026-10-26-flow-phase-diagram.md`

**Interfaces:**
- Consumes: Vista aprobada y validada en Task 1.
- Produces: Flow 0.1.2 y bundle 0.0.14 propuestos, sujetos a comprobar que siguen libres al implementar. BoxBot pasa a 0.3.2 por la eliminación del texto decorativo; Usage permanece en 0.1.1.

- [x] **Step 1: Actualizar versiones y documentación en inglés.** Explicar estados, diferencia entre actividad y evidencias, recetas y perfiles de tamaño.
- [x] **Step 2: Ejecutar `python3 -m unittest discover -s tests -v`, validación y pruebas de todos los mods, y `python3 scripts/build_release.py --check --version v0.0.14`.** Construir los trece assets en un directorio vacío y verificar sus sumas.
- [ ] **Step 3: Commit y push a la rama de trabajo tras aprobar el diseño.** Esperar el resultado de la matriz Linux/macOS/Windows. La integración a ramas protegidas y la publicación siguen sus flujos habituales.

Referencia oficial de viabilidad: [bordes de Box](https://code.claude.com/docs/en/plugins/mods/reference#box-border-styles) y [medidas del panel](https://code.claude.com/docs/en/plugins/mods/reference#render-sites). La API documenta estas capacidades; su dibujo conjunto se comprobará en la implementación.

GENERATED BY AIKYA HARNESS
