# Claude Code en terminales integradas — Implementation Plan

> Ejecución autorizada por el usuario el 2026-10-25: «empecemos con el plan» y «los mods tiene que funcionar cuando iniciemos claude code desde su terminal en cada uno de los IDE». Se ejecuta en esta sesión, con verificación antes de afirmar compatibilidad.

**Goal:** cargar BoxBot, Flow y Usage al iniciar Claude Code en las terminales integradas de Cursor, Trae y la suite JetBrains.

**Architecture:** conservar los tres plugins de Claude y su marketplace. El editor proporciona la terminal; los eventos, métricas y elementos de interfaz los proporciona Claude Code con `surface: terminal`. La instalación `user` sirve a las sesiones que compartan usuario, entorno de ejecución y directorio de configuración de Claude.

**Tech Stack:** instaladores Bash existentes, Python unittest/integración, JavaScript/TypeScript y kit nativo `claude-code/testing`, Claude Code 2.1.308 como versión comprobada.

**Spec:** aclaración del usuario de 2026-10-25 y [protocolo de compatibilidad](../../terminal-compatibility.md). Sustituye el plan de integración nativa del día anterior.

## Restricciones

- Los tres mods se ejecutan dentro de Claude Code; no se añade una extensión VSIX, plugin Kotlin ni observador del agente propio del IDE.
- Interfaz y mensajes de uso en inglés. Conservar comandos e instalación individual/conjunta.
- La ruta recomendada para todos los proyectos es `--scope user`. `project` y `local` siguen siendo ámbitos de Claude, asociados al proyecto desde el que se instala.
- Mismo usuario/configuración de Claude implica plugins compartidos; SSH, WSL, contenedores y `CLAUDE_CONFIG_DIR` distintos se validan como entornos separados.
- Flow abre el panel sin pedir foco; BoxBot se compone debajo si está habilitado; Usage queda bajo el prompt. Ubicación lateral condicionada a fullscreen de Claude y anchura suficiente.
- Flow conserva `No evidence` sin caché compatible. Usage conserva `N/A` sin lectura nativa. La cuenta de tokens empieza con la carga del mod.
- Pruebas de instalación en directorios temporales. No copiar credenciales ni instalar en la configuración habitual del usuario.
- No presentar pruebas con el kit o una pseudoterminal como validación visual de un IDE real.

## Mapa de impacto

| Archivos | Trabajo |
| --- | --- |
| `install.sh`, `mods/*/install.sh`, manifiestos | Conservar ruta de Claude; corregir solo ante un fallo reproducido |
| `mods/*/hooks/register.js` | Verificar inicio, composición y superficies; corregir solo ante un fallo reproducido |
| `mods/*/tests/*.test.ts` | Conservar pruebas nativas de inicio, composición, terminal estrecha y relojes; validar los tres plugins juntos en una sesión real |
| `tests/integration_install.py` | Verificar visibilidad de una instalación de usuario desde otro directorio/proyecto |
| `README.md`, `mods/*/README.md` | Instrucciones de uso en terminales de IDE y condiciones de layout |
| `docs/terminal-compatibility.md` | Matriz por IDE/motor/versión, protocolo y resultados visuales pendientes |
| Plan y análisis de 2026-10-24 | Marcar la alternativa nativa como sustituida para evitar ejecutarla por error |

## Casos de revisión

- Reutilizar la configuración de usuario al cambiar de proyecto sin reinstalar.
- Abrir una terminal nueva con el mismo PATH y la misma configuración de Claude.
- Terminal estrecha o sin fullscreen: no confundir disposición inline con un fallo de carga.
- Tres módulos juntos y cada módulo solo; ocultar/reabrir panel y detener relojes.
- Sesiones/remotos distintos: no mezclar identidad, evidencia ni métricas.

### Tarea 1: corregir alcance y documentar el arranque

**Archivos:** este plan, `docs/terminal-compatibility.md`, README raíz y por mod; banners en los documentos anteriores.

- [x] Marcar el plan anterior como sustituido y registrar la arquitectura de terminal de Claude.
- [x] Documentar instalación de usuario una vez y posterior inicio con `claude` desde cada IDE.
- [x] Documentar fullscreen de Claude, espacio disponible, comprobación de PATH/configuración y entornos remotos separados.
- [x] Registrar una matriz visual pendiente por producto sin deducir soporte de toda JetBrains a partir de un único motor.

### Tarea 2: verificar los módulos y la instalación compartida

**Archivos:** suites existentes `mods/*/tests/*.test.ts`, `tests/integration_install.py` y registro de validación de la tarea 3.

**Interfaces:** conservar `register(on)` y comandos actuales. La integración instala en un `CLAUDE_CONFIG_DIR` temporal y consulta `claude plugin list --json` desde otros proyectos. El kit limita las importaciones a un plugin y sus plugins auxiliares inline no conservan las dependencias de módulos reales. Por ello, cada plugin conserva su suite nativa y la composición de los tres se verifica en una sesión real de Claude, sin crear un plugin agregado distinto del producto.

- [x] Probar arranque interactivo de los tres en una PTY: panel Flow/BoxBot, ASCII en terminal y footer Usage, sin enviar un prompt al modelo. Comandos locales de los tres mods comprobados.
- [x] Ejecutar las pruebas nativas existentes de disposición estrecha y ciclo ocultar/reabrir con reloj determinista. La comprobación visual de resize por IDE sigue en la tarea 3.
- [x] Ampliar la integración real para comprobar IDs instalados y `enabledPlugins` al cambiar de directorio, incluida una ruta con espacios.
- [x] Ejecutar unittest, todas las suites nativas, validación estricta y `tests/integration_install.py`.
- [x] Conservar los instaladores y módulos actuales: no se ha reproducido un defecto del producto. Se retiró el arnés experimental incompatible con el kit; no se conserva una suite fallida.

### Tarea 3: validación visual en terminales reales

**Archivos:** `docs/terminal-compatibility.md` y registro de resultados en `aikya/docs/research/2026-10-25-integrated-terminal-validation.md`.

- [ ] Trae: abrir una terminal de prueba separada e iniciar Claude con los tres plugins, sin interrumpir sesiones existentes.
- [ ] Cursor: repetir cuando el editor esté disponible. No registrar como probado si solo se simuló su entorno.
- [ ] JetBrains: repetir por producto y versión disponibles, identificando motor de terminal. Android Studio es una comprobación adicional de IntelliJ Platform, no sustituto de IntelliJ IDEA.
- [ ] Verificar arranque automático, foco, panel, dibujo en movimiento/inmóvil, línea Usage, comandos, resize, cierre y reapertura.
- [ ] Mantener pendientes las combinaciones no ejecutadas y registrar bloqueos de acceso/autenticación/automatización por separado de defectos de los mods.

**Criterio de cierre:** las pruebas de instalación y runtime pasan, y cada IDE declarado compatible dispone de una comprobación visual real. La tarea 3 puede permanecer pendiente por falta del producto o de una sesión accesible; eso no acredita compatibilidad completa.

GENERATED BY AIKYA HARNESS
