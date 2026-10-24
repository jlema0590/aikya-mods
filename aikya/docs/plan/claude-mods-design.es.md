# Plan de implementación: mods de consumo y flujo para Aikya

> Referencia de diseño archivada del espacio de trabajo original. Las rutas `deliverables/` y las ramas del núcleo que se mencionan abajo describen aquel entorno; la estructura vigente y los mods instalables de este repositorio se documentan en el README raíz.

**Fecha:** 24 de octubre de 2026. **Estado:** consumo y flujo siguen como propuesta; el mod independiente BoxBot se ha creado por petición posterior del usuario.

**Objetivo:** disponer de dos mods independientes para Claude Code: consumo verificable y flujo del comando Aikya activo.

**Arquitectura:** plugins JavaScript/TypeScript con eventos y vistas nativas de Claude Code. El mod de consumo obtiene métricas del motor; el mod de flujo observa invocaciones y lee estados semánticos de Aikya. Las decisiones, comprobaciones y políticas siguen perteneciendo al núcleo de Aikya.

**Tecnologías:** API oficial de mods, TypeScript, elementos nativos `Box`, `Text`, `Button`, `Select`, Python para el adaptador existente, pruebas con `claude plugin test` y `unittest`.

**Idioma del producto:** todos los mods, incluidos textos visibles, estados, controles, mensajes, descripciones, ayuda y accesibilidad, deben estar en **inglés**. Este documento de planificación permanece en español. La maqueta anterior se ha corregido al inglés.

**Distribución obligatoria en terminal:** al ejecutar `claude`, una vez instalado y habilitado el plugin, la misma sesión debe mostrar Claude Code a la izquierda y el panel de mods a la derecha. El arranque previsto es automático, sin pedir un segundo comando para abrir el panel. El diálogo, las herramientas, las respuestas y el prompt permanecen en la zona de Claude; los controles del mod permanecen en su panel. El foco inicial debe conservarlo el prompt de Claude.

**Composición lateral actualizada:** Claude Code a la izquierda; un panel contenedor a la derecha con `Flow` y `BoxBot` como secciones simultáneas. El resumen de `Usage` deja de ocupar una sección lateral. Esta composición conjunta requiere integración futura de las vistas, conservando la independencia de sus datos y plugins. La vista de la cinta transportadora debe pausar su temporizador cuando deje de estar visible. Proporción de diseño orientativa: 70% Claude / 30% panel; el ancho real depende del motor y del redimensionado del usuario.

**Línea inferior de consumo:** `Context`, `Tokens` y `Usage` comparten una sola línea en la zona inferior de Claude, debajo de su prompt. Ejemplo de texto en inglés: `Context: 42% | Tokens: 53k | Usage 5h/7d: N/A/N/A`. Los valores del ejemplo son ilustrativos. `Usage` muestra las ventanas publicadas por el motor; no se deduce de los tokens. En el resumen no se repiten tarjetas, encabezados, gráficos ni bloques verticales de consumo. En poco ancho se abreviarán etiquetas sin envolver a varias filas. El desglose por modelo, caché, coste estimado y cobertura se consulta mediante `/aikya-usage`, fuera de la vista compacta permanente.

**Límite de aceptación del diseño lateral:** validar con terminal en modo fullscreen y ancho suficiente para que el motor coloque el panel a la derecha. En un terminal estrecho, una colocación encima del prompt no cumple el diseño solicitado: mostrar el requisito de ampliar la terminal, sin declarar conseguida la división. No inventar una opción de colocación que la API no expone. Verificar arranque, redimensionado y recuperación del panel cuando vuelva a haber espacio.

Esta distribución y el autoarranque son requisitos incorporados al plan. El prototipo BoxBot entregado hasta ahora sigue abriéndose con `/aikya-boxbot`; todavía no se ha implementado ni instalado el arranque automático al ejecutar `claude`.

**Especificación:** petición del usuario en esta conversación y criterios de aceptación de este documento. El plan y la maqueta se entregan fuera de los repositorios de código. Si se aprueban después, la ubicación de este plan dentro de Aikya será `aikya/docs/plan/2026-10-24-claude-mods.es.md`.

## 1. Base verificada y alcance

- Repositorio: `jlema0590/aikya-harness`.
- Rama creada en GitHub y localmente: `feat/claude-mods`.
- Base exacta: `develop`, commit `3e35e7f84558dc2a6b3c8033c52e17c978bf284c`.
- `VERSION` en esa base: **6.0.1**.
- Referencia adicional inspeccionada: `feat/sdd-spec-coding-templates`, commit `5cade483d2115a8ffc009715eec335a299bc976d`, con `VERSION` **7.0.0**.
- La segunda referencia difiere de la base en 950 archivos. No se ha fusionado, copiado ni incorporado a la rama nueva.
- El checkout existente continúa en su rama original para preservar todos sus archivos. La rama nueva existe como referencia local y remota, sin commits adicionales.
- Claude Code CLI disponible: **2.1.308**, comprobado con `claude --version`. No se abrió una sesión ni se cargaron mods.

La diferencia entre ramas afecta al diseño: la observabilidad avanzada existe en la referencia 7.0.0, pero **no está disponible en develop 6.0.1**. Una interfaz no puede convertir esa ausencia en estados confirmados.

## 2. Qué se puede cambiar oficialmente en Claude Code

| Superficie o comportamiento | Capacidad oficial | Aplicación en esta propuesta |
|---|---|---|
| Paneles, banda sobre el prompt y controles | Dibujar elementos nativos interactivos | Panel de flujo y banda de consumo |
| Filas de herramientas y spinner | Observar o cambiar su representación | Indicador discreto del comando activo, opcional |
| Comandos locales | Registrar funciones que responden sin un turno del modelo | `/aikya-usage` y `/aikya-flow` |
| Prompts, skills y herramientas | Observar eventos, modificarlos o responderlos | Solo observación y paso del evento original |
| Turnos y peticiones al modelo | Leer identificadores, duración y uso registrado | Consumo por petición y correlación del trabajo |
| Sesión y agentes | Leer contexto, límites publicados por el motor y agentes | Contexto, consumo de cuenta y actividad |
| Almacenamiento y ficheros | Mantener estado local mediante API | Vista de sesión y lectura acotada del estado Aikya |

Un mod es un plugin con un módulo de eventos; no equivale a una skill ni a un cambio de CSS. La interfaz real se construye con el árbol de elementos que devuelve `$.ui.resolve(e)`; la maqueta de esta conversación es una representación del diseño.

Fuentes: [visión oficial de mods](https://code.claude.com/docs/en/plugins/mods), [interfaz](https://code.claude.com/docs/en/plugins/mods/interface), [eventos](https://code.claude.com/docs/en/plugins/mods/events), [API](https://code.claude.com/docs/en/plugins/mods/api).

### Compatibilidad

- CLI: mods habilitados por defecto desde **2.1.287**; objetivo de desarrollo inicial **2.1.308**, que es la versión observada.
- Claude Desktop: pestaña **Code**, motor desde **2.1.286**; verificar la versión y los elementos disponibles allí.
- VS Code: chat de la extensión desde **2.1.299**; **2.1.304** para sesiones que no consultan feature flags.
- `claude -p`, Agent SDK y sesiones cloud: pueden ejecutar hooks del plugin, pero no muestran el panel.
- Remote Control desde web/móvil muestra el dibujo en el terminal de la máquina; no implica modificar el chat general de claude.ai.
- En un terminal estrecho el motor puede colocar el panel encima del prompt. Esta posibilidad de la plataforma no cumple el requisito lateral fijado por el usuario; comprobar el modo fullscreen y pedir ampliar la terminal para el diseño de dos columnas.

No se verificó en esta tarea la versión de Desktop ni de la extensión. En la implementación deben prevalecer las declaraciones que genera la versión instalada en `.claude-plugin/types/`, porque la copia pública inspeccionada corresponde a 2.1.277. No se usarán imports de Node, DOM, ni llamadas directas a módulos Python dentro del runtime del mod.

Fuentes: [plataformas](https://code.claude.com/docs/en/plugins/mods#where-mods-run), [declaraciones por versión](https://code.claude.com/docs/en/plugins/mods/create#get-type-definitions-for-your-version), [declaraciones oficiales públicas](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts).

## 3. Análisis de Aikya

### Código que sí está en develop

| Archivo | Responsabilidad observada | Decisión |
|---|---|---|
| `token_report.py` | Lee JSONL locales, agrega entrada/salida/caché, deduplica snapshots de un mensaje y estima costes | Conservar CLI y reutilizar su contrato histórico |
| `context_budget.py` | Aproxima contexto estático mediante caracteres y metadatos | Mostrar solo como estimación estática opcional; nunca como consumo real |
| `token_policy.py` | Valida políticas y selección de modelos auxiliares | Mantener en el núcleo |
| `aikya_router.py` | Decide rutas de trabajo | Mantener en el núcleo |
| `aikya_cli.py` | Bootstrap, análisis y estado básico de instalación | Añadir únicamente lectura opcional del estado de ejecución si se instrumenta |
| `template/.claude/skills/{feature,bugfix,verify}/SKILL.md` | Describe pasos de trabajo y evidencias | Base para las recetas; todavía no emite un estado estructurado por fase |
| `template/.claude/settings.json` | Hooks de documentación y controles de herramientas | Preservar; el mod no los sustituye |

`token_report.py` exige `--path`, evitando buscar conversaciones ajenas al proyecto. La deduplicación actual incluye la ruta del fichero; una misma petición duplicada en dos ficheros podría sumarse dos veces. El adaptador futuro debe definir una identidad canónica y declarar cobertura parcial cuando falten identificadores.

### Código adicional que solo está en la referencia 7.0.0

| Archivo | Qué aporta para los mods |
|---|---|
| `src/aikya/middleware/usage.py` y `src/aikya/routing/usage.py` | Agregación histórica y CLI de tokens |
| `src/aikya/middleware/metrics.py` | Contexto/límites de runtime, antigüedad, intervalos y cobertura |
| `src/aikya/middleware/commands.py` | Recetas de seis fases por comando |
| `src/aikya/core/state.py` | Estados, ejecuciones, revisión, evidencias e invalidación por generación |
| `src/aikya/middleware/observer.py` y `lifecycle.py` | Invocaciones explícitas, actores y transiciones |
| `src/aikya/middleware/statusline.py` y `subagent_statusline.py` | Presentación textual y actividad de agentes |

El estado existente distingue `pending`, `running`, `waiting`, `completed`, `failed`, `skipped`, `blocked`, `interrupted`. Sus seis fases son `explore`, `plan`, `implement`, `validate`, `security`, `review`. Una terminación de agente o herramienta no acredita éxito de fase. `candidate_generation` invalida verificaciones de candidatos anteriores. Los snapshots están en una caché local privada identificada por proyecto y sesión, no en documentos del proyecto.

**Recomendación:** reutilizar este contrato, pero no copiar sus archivos sin adaptación: importan el paquete `aikya`, ausente en develop. Priorizar una extracción pequeña compatible con 6.0.1, o conectar un adaptador cuando esa infraestructura llegue a develop. La fusión completa de la rama 7.0.0 queda fuera del plan de mods.

## 4. Mod de consumo: `aikya-usage`

**Sí se puede extraer la presentación y la observación del consumo a un mod.** La política de modelos y los presupuestos que condicionan ejecución deben permanecer en Aikya.

La vista permanente será exclusivamente la línea inferior compacta descrita arriba. El comando `/aikya-usage` conserva el detalle bajo demanda; no abre una sección lateral de consumo de forma permanente. Flow y BoxBot ganan el espacio que antes ocupaba ese resumen lateral.

### Datos y límites

| Dato | Fuente prevista | Cómo se presenta |
|---|---|---|
| Contexto actual | `$.session.usage().context` | Tokens/ventana y porcentaje, si están presentes |
| Tokens por petición | Resultado de `turn.step` | Entrada, salida, lectura y creación de caché |
| Turno terminado | `turn.complete` | Reconciliación; no sumar otra vez las peticiones |
| Coste de sesión | `$.session.usage().cost` | Estimado en USD; nunca factura |
| Límites de cuenta | `rateLimits` del motor | Ventana, porcentaje utilizado y reinicio |
| Histórico | Adaptador de `token_report.py`, con rutas explícitas | Acumulado registrado y cobertura |
| Presupuesto propio | Límite explícito configurado por usuario | Porcentaje de presupuesto local |
| Coste por comando/fase | Peticiones correlacionadas de forma inequívoca | Atribuido, parcial o no atribuible |

La llamada simple a `$.session.usage()` no realiza el recuento completo con la API de tokens. No activar `breakdown: 'full'` automáticamente. Los límites de cuenta pueden faltar; con API key la lista puede estar vacía. Ausente significa **N/D**, no cero. Contexto ocupado, tokens acumulados, coste y cuota de suscripción son magnitudes distintas. El contexto no se suma como consumo histórico y los tokens no permiten deducir cuota 5h/7d.

No se puede deducir la factura exacta ni todo el consumo de la cuenta desde una sesión. Si falta precio o proveedor compatible, no presentar un total monetario completo. La primera versión usará el coste que publique el motor; un catálogo histórico posterior tendrá fecha, modelo, proveedor, caché y origen explícitos, sin mantener tarifas duplicadas en ambos lenguajes.

La interfaz local se actualizará con `session.measure`, `turn.complete` y compacción; un temporizador lento solo actualizará contadores de tiempo cuando sea necesario. No habrá llamadas a modelos, prompts añadidos, lectura de credenciales ni endpoints OAuth no documentados. Los contadores pertenecen al plugin de consumo; el plugin de flujo no vuelve a medirlos.

Fuentes: [API y métricas](https://code.claude.com/docs/en/plugins/mods/reference), [consumo de cada petición](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn), [semántica del coste](https://code.claude.com/docs/en/statusline#available-data), [semántica de la llamada simple](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts).

## 5. Mod de flujo: `aikya-flow`

El comando `/aikya-flow` abre el panel. Las invocaciones Aikya pueden actualizar además una banda compacta. Abrir o consultar la vista no inicia otro trabajo ni cambia aprobaciones.

### Flujo propuesto según comando

Las recetas siguientes son decisiones de este plan para develop; no se afirma que estén implementadas en esa base.

| Comando | Recorrido principal | Particularidad |
|---|---|---|
| `/aikya-feature`, `/aikya-mobile-feature` | Explorar → Planificar → Implementar → Validar | Seguridad/revisión según perfil y alcance |
| `/aikya-bugfix` | Reproducir → Diagnosticar → Corregir → Prueba de regresión | Se conserva la identidad de fases; cambian actividad y evidencia |
| `/aikya-analyze` | Descubrir → Proponer adopción → Esperar decisión | Implementar solo si se autoriza adopción; report-only omite escrituras |
| `/aikya-verify`, `/aikya-tests`, `/aikya-quality` | Determinar alcance → Ejecutar comprobaciones → Informar | No añade una fase de implementación |
| `/aikya-tokens` | Seleccionar registros → Agregar → Presentar | Explorar/Validar aplicables; fases de cambios como N/A |

Los nombres internos y todos los textos de los mods se mantienen en inglés. Las explicaciones de este plan están en español. La revisión independiente solo es requerida si el flujo o configuración la exige. Una comprobación obligatoria sin configurar bloquea; una actividad que no aplica se omite con motivo. No confundir `NOT_CONFIGURED`, `skipped` y `completed`.

SDD y sus comandos `specify → clarify → plan → tasks → implement` requieren una extensión posterior: no existen en la base 6.0.1. El panel podrá leer sus aprobaciones cuando se integre ese motor, sin emitirlas ni sustituirlas.

### Estados visuales

| Estado | Representación | Regla |
|---|---|---|
| `pending` | ○ Pending, gris | Fase aplicable todavía no iniciada |
| `running` | ● Running, azul | Transición explícita vigente |
| `waiting` | ◷ Waiting, ámbar | Decisión o aprobación pendiente, con motivo |
| `completed` | ✓ Completed, verde | Evidencia aceptada para el candidato actual |
| `failed` | × Failed, rojo | Comprobación o actividad fallida registrada |
| `skipped` | — Not applicable, gris | Motivo de inaplicabilidad visible |
| `blocked` | ! Blocked, ámbar | Prerrequisito requerido que falta |
| `interrupted` | ■ Interrupted, gris | Cancelación o cierre antes de terminar |
| Sin telemetría | ? No evidence | Disponibilidad de la vista; no es un nuevo estado del motor |

No se calcula un porcentaje de trabajo por contar fases: sus duraciones y complejidades difieren. Puede mostrarse “3 de 5 fases aplicables con evidencia”, aclarando que no estima tiempo restante.

### Detección, correlación y evidencia

1. Observar `command.run` para comandos y `skill.prompt` para skills expandidas. `prompt.submit` es apoyo limitado; no es la única fuente ni se persiste su contenido.
2. Normalizar alias conocidos. Mantener una sola invocación para el comando y su expansión de skill; una skill anidada será actividad del mismo trabajo, salvo nueva invocación explícita.
3. Clave de ejecución: proyecto canónico + sesión + `run_id`; correlacionar además `turn_id`, `agent_id`, revisión y generación cuando existan.
4. Los eventos de Claude muestran actividad y consumo. Las transiciones semánticas y evidencias proceden del registro Aikya. Ver `Bash`, `Edit`, o un agente detenido no permite completar una fase.
5. Validación/seguridad requieren código de salida exitoso o inspección explícita aceptada. Revisión requiere revisor y candidato actual. Si cambia el candidato, se invalidan resultados afectados.
6. Una petición que cruza fases sin correlación fiable queda sin atribución exacta. Se conserva el total de sesión sin repartirlo artificialmente.
7. El estado `blocked` es terminal en el contrato existente. La vista no lo reabre por sí misma; mostrará el procedimiento de recuperación que realmente soporte el núcleo.
8. Una nueva invocación independiente no hereda el éxito anterior; eventos tardíos de una ejecución sustituida se ignoran.

## 6. Componentes y archivos previstos

Todos los siguientes son **archivos futuros**, sin crearlos ni modificarlos en la rama durante esta tarea.

```text
plugins/
  aikya-usage/
    .claude-plugin/plugin.json
    hooks/hooks.json
    hooks/register.ts
    lib/normalize.ts
    lib/ledger.ts
    lib/view.ts
    tests/usage.test.ts
  aikya-flow/
    .claude-plugin/plugin.json
    hooks/hooks.json
    hooks/register.ts
    lib/recipes.ts
    lib/adapter.ts
    lib/view.ts
    tests/flow.test.ts
execution_state.py       # extracción mínima del contrato 7.0.0 si sigue ausente
execution_observer.py    # registro semántico y exportación de snapshot
command_workflows.py     # recetas proporcionales compatibles con develop
tests/test_mods_bridge.py
tests/test_token_mod_contract.py
aikya/docs/plan/2026-10-24-claude-mods.es.md
aikya/docs/research/claude-mods-capabilities.es.md
```

No habrá una dependencia entre los dos plugins. El flujo funciona sin consumo y viceversa. Cada mod declara su propio módulo en `hooks/hooks.json`. El estado efímero puede vivir en variables del módulo; si se usa `$.state` se añadirá `types/index.d.ts` y su declaración en el manifiesto. La persistencia opcional usa claves separadas por proyecto/sesión/ejecución; no un contador global compartido entre proyectos.

El puente Python se invoca por API de procesos con una lista de argumentos fijos y timeout; nunca concatenando argumentos del prompt en shell. Exporta JSON acotado de metadatos, sin prompts ni salidas completas. Se lee el estado desde el exportador, sin duplicar en TypeScript la lógica de directorios, locks y validación del motor.

En develop, la instrumentación futura afectaría de forma acotada a `aikya_cli.py`, al registro/copia de assets en `install.py`, y a las skills que deban emitir fases. Si para entonces se ha integrado la estructura `src/aikya/`, se usarán sus módulos existentes y no se crearán módulos raíz duplicados.

## 7. Tareas de implementación futura

### Tarea 1. Contrato de disponibilidad y métricas

**Crear:** `plugins/aikya-usage/.claude-plugin/plugin.json`, `plugins/aikya-usage/hooks/hooks.json`, un módulo inicial `hooks/register.ts` sin efectos, `plugins/aikya-usage/lib/normalize.ts` y `plugins/aikya-usage/tests/usage.test.ts`. Esta configuración mínima permite ejecutar sus pruebas por separado.

**Interfaz:** `normalizeUsage(raw: unknown, observedAtMs: number): UsageView`; porcentajes y coste opcionales, fuente y fecha obligatorias. `UsageView` tendrá `context`, `rateLimits`, `estimatedCostUsd`, `observedAtMs`, `coverage: 'complete' | 'partial' | 'unavailable'`.

- [ ] Escribir pruebas `missing_is_not_zero`, `api_key_has_no_plan_limits`, `expired_limit_is_unavailable`: ausencia produce `null`/N/D; cero observado permanece cero; un límite vencido deja de presentarse como vigente.
- [ ] Ejecutarlas antes de implementar y observar fallo por interfaz ausente.
- [ ] Implementar normalización sin cambiar el objeto de entrada ni usar peticiones de red.
- [ ] Ejecutar `claude plugin test plugins/aikya-usage`; las tres pruebas deben pasar.

### Tarea 2. Mod de consumo en vivo

**Ampliar:** hooks del plugin de consumo. **Crear:** `lib/ledger.ts` y `lib/view.ts` en ese plugin.

**Interfaces:** `recordRequest(key: RequestKey, usage: TokenUsage): void`, `readLedger(scope: Scope): UsageTotals`. `RequestKey` incluye sesión, agente, turno e identidad de petición disponible. `TokenUsage` conserva las cuatro categorías de tokens. No inventar una clave que convierta registros inciertos en completos.

- [ ] Probar `repeated_snapshot_counts_once`, `turn_total_does_not_duplicate_steps`, `agent_usage_is_separate`, `open_view_never_calls_model`.
- [ ] Registrar `/aikya-usage` como comando inmediato para abrir la vista. Observar `turn.step` reenviando el stream y el resultado sin modificarlos; capturar peticiones finalizadas y cobertura incompleta en abortos.
- [ ] Leer métricas simples del motor y dibujar `Context`, `Tokens` y `Usage` en una sola línea inferior, usando N/A cuando falte información. Mostrar estimación/cobertura y los detalles restantes al consultar `/aikya-usage`. Mantener identificadores acotados en memoria para la sesión.
- [ ] Ejecutar `claude plugin validate plugins/aikya-usage --strict` y `claude plugin test plugins/aikya-usage`; ambos deben salir con código 0. Los tests deben confirmar cero llamadas a modelos desde el mod.

### Tarea 3. Histórico compatible con Aikya 6.0.1

**Modificar en el futuro:** `token_report.py`. **Crear:** `tests/test_token_mod_contract.py` y `plugins/aikya-usage/lib/history.ts`, el adaptador histórico del plugin de consumo.

**Interfaz:** conservar `summarize(paths)` y CLI actuales; añadir un resultado versionado de metadatos para uso del plugin, con `schema_version`, ámbito, categorías, cobertura y fuente. El modo vivo y el histórico se consultan separadamente, sin sumar sus totales.

- [ ] Probar dos snapshots de la misma petición, copia de una petición entre ficheros, falta de uso, modelo sin tarifa y subagente no proporcionado. El total no se duplica cuando existe identidad inequívoca; la cobertura incierta se declara parcial.
- [ ] Extraer únicamente el resultado normalizado; preservar rutas explícitas y comportamiento de lectura local.
- [ ] Ejecutar `python3 -m unittest discover -s tests -p 'test_token_mod_contract.py'`; todas las pruebas deben pasar.
- [ ] Mantener `/aikya-tokens` y su CLI disponibles aunque el plugin no esté instalado.

### Tarea 4. Puente semántico mínimo de ejecución

**Crear si siguen ausentes:** `execution_state.py`, `execution_observer.py`, `command_workflows.py`, `tests/test_mods_bridge.py`. **Modificar:** registro de assets en `install.py`, `aikya_cli.py` y las skills soportadas de feature, bugfix, verify y analyze.

**Interfaz:** `export_snapshot(root: Path, session_id: str) -> dict | None`, solo lectura; JSON `schema_version=1` con `run_id`, `command`, `methodology`, `revision`, `candidate_generation`, fase, estados, actores, fuente y evidencias acotadas. Adaptar explícitamente desde el `schema=1` de la referencia 7.0.0; no tratar ambos esquemas como idénticos.

- [ ] Probar `no_snapshot_is_unavailable`, `different_session_is_rejected`, `tool_exit_does_not_complete_phase`, `stale_generation_is_rejected`, `new_run_rejects_late_event` y `failed_evidence_cannot_complete`.
- [ ] Extraer del código inspeccionado solo recetas, estado y exportador; adaptar imports a la base elegida y conservar los controles de evidencia.
- [ ] Añadir registros explícitos antes/después de fases en los puntos que efectivamente las conocen. Una skill sin instrumentación se muestra como actividad observada y fases sin confirmar.
- [ ] Ejecutar `python3 -m unittest discover -s tests -p 'test_mods_bridge.py'` y las pruebas de instalación existentes afectadas; exigir código 0 y equivalencia del status anterior sin opciones nuevas.

### Tarea 5. Mod de flujo y recetas

**Crear:** archivos de `plugins/aikya-flow/` indicados arriba.

**Interfaces:** `recipeFor(command: string, mode: 'write' | 'report-only'): FlowRecipe | null`; `readExecution(scope: Scope): Promise<ExecutionView>`; `renderFlow(view: ExecutionView, surface: Surface): NativeElement`. `ExecutionView` distingue datos disponibles de cada estado de dominio.

- [ ] Probar `feature_and_tokens_have_different_recipes`, `analyze_report_only_has_no_implementation`, `command_and_skill_are_one_run`, `nested_skill_is_activity`, `turn_complete_is_not_workflow_complete` y `unknown_command_is_ignored`.
- [ ] Registrar `/aikya-flow`, detectar invocaciones sin persistir texto y consultar el puente al recibir actividad relevante. Durante ejecución, si es necesario, refrescar el snapshot activo cada 2 segundos como máximo; cancelar al cerrar o terminar y no crear procesos desde `ui.render`.
- [ ] Dibujar fases, estado, motivo, evidencia y actores. Ofrecer banda compacta y panel; omisiones visibles como N/A. Ningún botón cambia evidencias o aprobaciones.
- [ ] Ejecutar `claude plugin validate plugins/aikya-flow --strict` y `claude plugin test plugins/aikya-flow`; código 0 y pruebas de todos los estados.

### Tarea 6. Compatibilidad, desactivación y entrega

**Ampliar:** pruebas de ambos mods. **Documentar después:** investigación, uso, requisitos e índice bajo `aikya/docs/`.

- [ ] Montar vistas en las superficies soportadas con las herramientas de pruebas oficiales; comprobar teclado, contraste, símbolos además del color, terminal estrecho y lectura de evidencia larga.
- [ ] Probar el arranque de `claude` con los plugins instalados y habilitados: Claude a la izquierda, panel a la derecha, foco en el prompt y sin comando adicional. Comprobar que el tamaño insuficiente se informa como requisito pendiente, y que cambiar de pestaña pausa la animación que ya no está visible.
- [ ] Comprobar que el panel contenedor presenta Flow y BoxBot, mientras Context/Tokens/Usage ocupan una única línea inferior sin bloque lateral duplicado. Al reducir el ancho, verificar etiquetas compactas sin saltos de línea ni recorte de valores.
- [ ] Probar reinicio, `/clear`, `/resume`, recarga del plugin, dos sesiones y dos proyectos: no mezclar estado ni reutilizar medidas caducadas.
- [ ] Probar sin puente, sin límites, plugin deshabilitado y sin interfaz: resultado N/D o salida textual disponible; Aikya conserva su comportamiento previo.
- [ ] Medir con fixtures que el refresco no dispara modelos y que una ráfaga de eventos agrupa redibujados; no establecer promesas de latencia sin medición.
- [ ] Validar por separado cada directorio y ejecutar ambas suites oficiales. Registrar comandos y resultados observados. Documentar pruebas manuales de CLI/Desktop/VS Code que se hayan realizado realmente.
- [ ] Solo tras la implementación aprobada, añadir documentación e índice. Publicar marketplace queda fuera de esta tarea y de la primera entrega local.

Fuente de las pruebas: [herramientas oficiales para probar mods](https://code.claude.com/docs/en/plugins/mods/test).

## 8. Criterios de aceptación globales

1. Los dos plugins se pueden cargar y desactivar independientemente.
2. La lectura simple de consumo y la apertura del panel no solicitan inferencia al modelo.
3. Entrada, salida, caché, contexto, coste y límites aparecen con su origen y disponibilidad real.
4. Un comando de solo lectura no muestra implementación requerida.
5. Espera, error, bloqueo, interrupción y ausencia de telemetría se distinguen visualmente.
6. El estado completado exige evidencia del candidato vigente; el fin de un turno no lo sustituye.
7. Los contadores no duplican snapshots ni totales de turnos y peticiones; la atribución incompleta es explícita.
8. El núcleo funciona sin mods, y el mod de flujo funciona sin datos de consumo.
9. En terminal fullscreen con ancho suficiente, `claude` abre automáticamente la distribución lateral: conversación a la izquierda y área de mods a la derecha. La disposición vertical no se presenta como cumplimiento de este requisito.
10. Contexto, tokens y uso se muestran juntos en una sola línea inferior, con textos en inglés; Usage no ocupa una sección lateral permanente.

## 9. Revisión del plan

Cinco casos que deben quedar cubiertos antes de entregar: registros duplicados entre fuentes (tareas 2/3), cuota ausente o caducada (tarea 1), invocación duplicada por comando y skill (tarea 5), evidencia anterior al candidato (tarea 4), y contaminación entre proyectos/reanudaciones (tarea 6).

Las pruebas futuras de consumo y flujo siguen pendientes de implementación. La viabilidad de API está respaldada por documentación oficial y lectura de código; la exactitud del flujo completo depende del puente semántico descrito. El MVP puede mostrar actividad nativa antes de ese puente, siempre que no pinte las fases como verificadas. La validación ejecutada para BoxBot se describe a continuación.

**Orden recomendado:** contratos → consumo en vivo → histórico compatible → puente mínimo → flujo → compatibilidad. Es posible entregar primero el mod de consumo, que no depende del puente de fases.

## 10. Tercer mod creado: Aikya BoxBot

Diseño actualizado: se elimina el robot y se sustituye por cajas que avanzan de izquierda a derecha sobre una cinta transportadora, con una interfaz completamente en inglés. Se conserva el nombre y el comando de BoxBot. El plugin se entrega separado en `deliverables/claude-mods-robot/aikya-boxbot/`, sin modificar el núcleo del repositorio ni instalarlo en la configuración del usuario.

- Comando: `/aikya-boxbot`.
- Ciclo: tres cajas avanzan a velocidad constante, entran por la izquierda y salen por la derecha, con una repetición de ocho segundos. Estado visible: `Conveyor running`.
- Sin botones ni controles visibles en el panel o la vista previa. Los comandos `/aikya-boxbot pause`, `resume`, `still`, `motion` y `hide` siguen disponibles en Claude.
- Movimiento: ocho frames por segundo mientras el panel está visible; pausa, modo estático y cierre cancelan el temporizador.
- Desktop/VS Code: ilustración con el elemento nativo `Svg`, con rodillos y superficie en movimiento. Terminal: dibujo monoespaciado de siete filas que se adapta al ancho del panel.
- Es decorativo: no representa progreso de tareas ni aprueba fases.
- El mod no llama a modelos, herramientas, procesos, red, archivos ni credenciales. Solo registra su comando, observa ciclo de vida y dibuja su panel.
- La preferencia de movimiento reducido del sistema se respeta en la vista previa. El mod nativo ofrece el comando `/aikya-boxbot still` para detener el movimiento; no afirma detectar una preferencia que la API inspeccionada no publica.
- Verificación observada en Claude Code 2.1.308: nueve pruebas oficiales pasan y `claude plugin validate --strict` termina con código 0. Incluyen desplazamiento de las cajas y continuidad del ciclo. El validador avisa de un icono de catálogo pendiente; no se ha publicado un marketplace.

La prueba oficial monta árboles de interfaz para terminal, Desktop y VS Code. La inspección de la animación en la vista previa no sustituye una prueba manual dentro de cada aplicación nativa.

GENERATED BY AIKYA HARNESS
