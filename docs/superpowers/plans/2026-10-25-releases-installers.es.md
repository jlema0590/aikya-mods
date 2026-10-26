# Releases e instaladores multiplataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** validar el proyecto en CI, crear releases por tag y permitir instalar los mods desde una URL en Linux, macOS y Windows.

**Architecture:** conservar el instalador local de Bash. Añadir instaladores online autónomos de Bash y PowerShell que mantienen un checkout por ref y delegan en la CLI oficial de Claude. Un constructor Python crea artefactos reproducibles; Actions reutiliza la validación antes de publicar la release.

**Tech Stack:** Bash 3.2, PowerShell 5.1+, Python 3.12 estándar, Git, Claude Code 2.1.308, GitHub Actions y GitHub CLI.

**Spec:** [requisitos de distribución](../../distribution.md). El usuario ha autorizado implementar este trabajo en la sesión; no se crea una release real ni se suben cambios como parte de las pruebas.

## Global Constraints

- Mantener cambios previos del usuario y compatibilidad de `install.sh` y los tres mods.
- Interfaces y mensajes de producto en inglés. Instalación por defecto: todos los mods, ámbito user y ref main.
- Versiones opcionales solo `vMAJOR.MINOR.PATCH`. Validar selección completa antes de clonar o configurar.
- Caché persistente por ref; rechazar origen inesperado y modificaciones locales; respetar cwd para project/local.
- Versiones de mods independientes; catálogo y plugin.json deben coincidir.
- Publicar únicamente después de verificar el commit exacto del tag y completar los assets de un draft.

## Review Focus

- Script recibido por stdin: instalar sin menú ni consumir el flujo del script; tarea 1.
- Rutas con espacios y ámbito project/local: conservar argumentos y cwd; tarea 1.
- Caché existente con otro origen o cambios locales: detenerse sin reset; tarea 1.
- Catálogo inconsistente, enlaces o archivos generados: no producir una release inválida; tarea 2.
- Tag inválido, commit distinto o release ya publicada: no sustituir artefactos publicados; tarea 3.

### Tarea 1: instaladores online y pruebas por plataforma

**Archivos:** crear `installers/install.sh`, `installers/install.ps1`, `tests/test_online_installers.py`; adaptar `tests/test_installers.py` e `integration_install.py` para Windows.

**Interfaces:** Bash `[MOD ...|--all] [--scope user|project|local] [--version vX.Y.Z] [--source PATH] [--dry-run|--list]`; PowerShell `-Mods`, `-All`, `-Scope`, `-Version`, `-Source`, `-DryRun`, `-List`. Directorio persistente configurable con `AIKYA_MODS_HOME`.

- [x] Escribir pruebas de ejecución real de scripts con Git/Claude simulados en su frontera: stdin, selección, scope, rutas, fallos, caché y dry-run.
- [x] Ejecutarlas y observar fallos por ausencia de los instaladores.
- [x] Implementar ambos scripts sin alterar el instalador local existente.
- [x] Ejecutar pruebas de Bash/PowerShell y verificar instalación real aislada desde source y descarga real del repositorio público con el instalador Bash recibido por stdin.

### Tarea 2: paquetes verificables de release

**Archivos:** crear `.claude-version`, `.gitattributes`, `scripts/build_release.py`, `tests/test_releases.py`, `tests/integration_package.py`; ampliar `.gitignore` para `dist/`.

**Interfaces:** `python scripts/build_release.py --version vX.Y.Z --output DIR`. Produce ZIP global y por mod, `install.sh`, `install.ps1`, `release.json` y `SHA256SUMS`. El directorio de salida debe estar vacío.

- [x] Probar contenido real de ZIPs, hashes, repetibilidad y rechazo de versiones, catálogos inconsistentes y symlinks.
- [x] Observar fallos antes de implementar el constructor.
- [x] Construir con whitelist de archivos y metadatos ZIP estables; no copiar el repositorio completo.
- [x] Ejecutar la suite y probar la instalación local del ZIP extraído con configuración temporal.

### Tarea 3: workflows, documentación y verificación final

**Archivos:** actualizar `.github/workflows/ci.yml`, crear `release.yml`, `scripts/publish_release.py` y `tests/test_publish_release.py`; completar `docs/distribution.md` y README.

**Interfaces:** CI invocable mediante `workflow_call` con ref opcional. Release en push de tags `v*` y ejecución manual para un tag existente; checkout del mismo SHA validado. `contents: write` solo en el job de publicación.

- [x] Crear matriz Linux/macOS/Windows con Python, CLI de Claude fijada, pruebas de instaladores, manifiestos, suites nativas, integración y build de release.
- [x] Crear y probar publicación mediante draft, upload, comprobación de inventario/tamaño/digest y publicación; preservar releases publicadas y probar reintentos y selección de latest.
- [x] Documentar comandos curl, versión fija, caché, requisitos y procedimiento de crear un tag.
- [x] Ejecutar suites completas, actionlint y build reproducible; revisar cambios sin publicar una release ni hacer push. La ejecución en runners reales de GitHub queda pendiente de subir los cambios.

GENERATED BY AIKYA HARNESS
