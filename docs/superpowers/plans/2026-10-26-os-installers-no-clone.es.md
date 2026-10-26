# Instaladores por sistema operativo sin clonar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** instalar los mods desde una release mediante un comando por sistema operativo y un menú sencillo, sin clonar ni exigir Git.

**Architecture:** reutilizar el constructor de releases y el marketplace local nativo de Claude. El motor Bash genera dos instaladores autónomos para Linux/macOS; PowerShell genera el de Windows. Descargar paquetes verificados a fuentes persistentes por versión antes de registrar los mods.

**Tech Stack:** Bash 3.2, PowerShell 5.1/7, HTTPS, TAR.GZ/ZIP, SHA-256, Python 3.12 estándar para herramientas de desarrollo, Claude Code fijado por `.claude-version`, GitHub Actions.

**Spec:** [experiencia de instalación](../../installer-experience.es.md).

## Global Constraints

- Rama: `feature/installers-no-clone`, creada desde `origin/develop` en `b91d94685b135c249bc4e516381007f65680ef37`.
- Este encargo entrega rama y plan; los pasos de implementación permanecen pendientes.
- Todos los textos del instalador y las instrucciones públicas estarán en inglés.
- Sin Git, Python o Node.js para descargar o extraer; sin permisos de administrador ni instalación automática de dependencias.
- Claude Code debe estar instalado; usar su CLI nativa, sin cambiar los mods ni su diseño visual.
- Menú interactivo predeterminado: `Flow + Usage (recommended)`; sin terminal y sin argumentos: todos los mods. Ámbito predeterminado: `user`.
- Mantener argumentos explícitos, `project`, `local`, `AIKYA_MODS_HOME`, instalación local por `--source` y nombres online anteriores.
- Descargar una release estable, fijar su tag para todas las peticiones y conservar sus archivos en disco. La nueva distribución empieza en `v0.0.11`.
- No cambiar la release `v0.0.10`, sus assets ni las versiones de los mods si su código no cambia.

## Review Focus

- Entrada no interactiva: no bloquear ni consumir stdin; instalar todos por defecto y respetar argumentos explícitos. Tareas 3 y 4.
- Release antigua, inexistente o cambiante durante una descarga: rechazar un contrato incompatible y evitar mezclar assets de versiones. Tareas 2, 3 y 4.
- Hash incorrecto, archivo truncado, rutas peligrosas o catálogo inválido: detenerse sin escribir configuración de Claude. Tareas 2, 3 y 4.
- Rutas con espacios/Unicode, repetición, caché antigua o instalaciones simultáneas: preservar fuentes ajenas y garantizar una fuente persistente válida. Tareas 3, 4 y 5.
- Fallo de Claude después de registrar el marketplace o de instalar un mod: conservar los archivos referenciados, informar del resultado parcial y permitir reintentar. Tareas 3, 4 y 5.

---

## Mapa de archivos e interfaces

| Archivo | Responsabilidad |
| --- | --- |
| `installers/install.sh` | Motor Unix autónomo: plataforma, selección, descarga, verificación, persistencia e invocación del instalador local. |
| `installers/install.ps1` | Motor Windows autónomo con el mismo contrato funcional y llamadas directas a Claude. |
| `scripts/build_release.py` | ZIP actual, nuevo TAR.GZ equivalente y tres assets específicos por sistema operativo, además de los nombres compatibles. |
| `scripts/publish_release.py` | Validar el inventario ampliado y publicar/reanudar drafts por ID numérico. |
| `tests/test_online_installers.py` | Pruebas de ambos motores en su frontera con HTTP, extracción y Claude. |
| `tests/test_releases.py`, `tests/test_publish_release.py`, `tests/release_fixture.py` | Contrato de assets, repetibilidad, integridad y publicación. |
| `tests/integration_online_release.py` (nuevo) | Servir una release fixture y ejecutar los assets finales con Claude real y configuración aislada. |
| `tests/integration_platforms.py`, `tests/integration_package.py` | Conservar cobertura de ámbitos, rutas y paquetes; añadir nueva distribución. |
| `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Matriz nativa y ensayo de release sin publicación automática desde ramas. |
| `README.md`, `docs/distribution.md`, `docs/terminal-compatibility.md`, `VERSION`, `CHANGELOG.md` | Comandos fáciles, requisitos reales, límites y próxima versión. |

Los nuevos nombres son assets generados en `dist/`, no copias manuales que diverjan: `install-linux.sh`, `install-macos.sh`, `install-windows.ps1`. El constructor debe generar scripts completos; ningún launcher puede depender de un checkout ni de descargar otro script sin verificar.

### Tarea 1: incorporar la corrección pendiente del publicador

**Files:** `scripts/publish_release.py`, `tests/test_publish_release.py`, `.github/workflows/release.yml`, `CHANGELOG.md`, `docs/distribution.md`.

**Interfaces:** conservar `publish(repo, tag, sha, folder, dry_run=False)`. Tomar como referencia el cambio ya probado `a68f428ca1131c0318a9c5370dc22a82d9707a01`, ausente de esta base; no incorporar toda la antigua rama.

- [ ] Añadir la regresión: el mock devuelve 404 al consultar un draft por tag; listar releases devuelve su ID y consultar ese ID devuelve el draft. Probar creación y reanudación.
- [ ] Ejecutar `python -m unittest discover -s tests -p 'test_publish_release.py' -v`; observar el fallo del flujo actual por consulta del draft mediante tag.
- [ ] Portar la búsqueda del ID y validación del draft; incorporar el checkout de herramientas del workflow mediante su SHA inmutable y la prueba previa del helper. Conservar la comprobación del SHA del tag y los assets del código publicado.
- [ ] Repetir la suite del publicador; exigir éxito de creación/reanudación y rechazo de releases ya publicadas. Registrar en Unreleased sin alterar las notas históricas de 0.0.10.
- [ ] Crear un commit independiente: `fix: verify draft releases by ID`.

### Tarea 2: contrato de paquetes e instaladores publicados

**Files:** `scripts/build_release.py`, `scripts/publish_release.py`, `tests/test_releases.py`, `tests/test_publish_release.py`, `tests/release_fixture.py`.

**Interfaces:** conservar `build(root, version, output)` y la CLI existente. Añadir `tar_files(destination: Path, entries: dict[str, bytes]) -> None` y `render_unix_installer(source: bytes, platform: str) -> bytes`, con `platform` limitado a `linux` o `macos`.

`release.json` conserva sus campos y añade `installer_schema: 1`, `archives: {"unix": "aikya-mods-vX.Y.Z.tar.gz", "windows": "aikya-mods-vX.Y.Z.zip"}` e `installers` con claves `linux`, `macos`, `windows` y los nombres de scripts definidos en el mapa. Generar también `installer-manifest.txt` con las cuatro líneas exactas especificadas en el diseño, incluyéndolo en SHA256SUMS. El TAR.GZ y el ZIP tienen la misma raíz `aikya-mods/`, archivos y bytes. Los nombres antiguos `install.sh` e `install.ps1` siguen presentes.

- [ ] Ampliar `test_archives_contain_installable_mods_and_hashes_match_actual_assets`: comparar contenidos ZIP/TAR, exigir los tres instaladores autónomos, aliases y coherencia entre JSON y manifiesto de texto. Extender `test_rebuilding_produces_identical_bytes` a TAR.GZ y scripts generados.
- [ ] Ejecutar `python -m unittest discover -s tests -p 'test_releases.py' -v`; observar fallos por assets y metadatos ausentes.
- [ ] Generar TAR/GZIP con orden, permisos, propietarios y timestamps deterministas; renderizar una constante de plataforma esperada en el motor Bash. Copiar el motor PowerShell como `install-windows.ps1`. Mantener los paquetes individuales actuales.
- [ ] Ampliar `local_assets(folder, tag)` para exigir esquema, nombres permitidos, inventario nuevo y checksums de todos los assets; no aceptar nombres arbitrarios procedentes de metadatos. Sustituir expectativas literales de ocho assets por el nuevo contrato completo.
- [ ] Añadir pruebas de esquema desconocido, asset faltante, nombre de archivo inseguro, metadatos incoherentes y hash incorrecto. Ejecutar suites de releases y publicador; ambas deben pasar.
- [ ] Crear un commit independiente: `feat: package OS installers and Unix release archives`.

### Tarea 3: instalar desde releases en Linux y macOS

**Files:** `installers/install.sh`, `tests/test_online_installers.py`, `tests/release_fixture.py`.

**Interfaces:** conservar opciones existentes. `resolve_release` produce por stdout un tag estable validado; `download_release TAG STAGING` guarda manifiesto, checksums y TAR.GZ de ese tag; `install_release TAG STAGING` valida, extrae y conserva la fuente antes de invocar el `install.sh` local. Ninguna función exige Git. El script generado para una plataforma distinta falla con un mensaje claro.

- [ ] Escribir pruebas ejecutables `test_release_install_never_invokes_git`, `test_interactive_default_selects_flow_and_usage` y `test_piped_script_installs_all_without_a_menu`; registrar llamadas HTTP/Claude y afirmar selección y rutas exactas del diseño.
- [ ] Ejecutar `python -m unittest discover -s tests -p 'test_online_installers.py' -v`; confirmar que el comportamiento actual falla por clonar o carecer del menú/contrato nuevo.
- [ ] Sustituir clonación por lectura HTTPS de `releases/latest/download/installer-manifest.txt` para obtener el tag; para versión explícita no consultar latest. Descargar el manifiesto, SHA256SUMS y el paquete desde `releases/download/TAG/`, exigiendo coincidencia de versión y checksum del manifiesto. Usar `curl` o `wget` en Linux y `curl` en macOS; sin jq. Leer las cuatro claves permitidas mediante `read` y validaciones estrictas de valores/nombres, sin `eval` ni `source` del manifiesto; rechazar líneas adicionales, duplicadas o ausentes.
- [ ] Implementar selección mediante terminal interactiva y preservar todas las opciones explícitas. `--list`, `--help` y `--dry-run` deben salir antes de cualquier acceso a red o escritura. Comprobar Claude y herramientas necesarias antes de descargar el paquete.
- [ ] Implementar comprobación SHA-256 y validación previa de entradas TAR; comprobar VERSION y ejecutar `claude plugin validate RUTA --strict` sobre marketplace y mods extraídos antes de configurar. Usar staging privado, bloqueo exclusivo de raíz y traslado a la fuente persistente del diseño. Una carpeta existente solo se reutiliza si coincide con el paquete verificado; no sobrescribir cambios locales.
- [ ] Añadir pruebas: latest cambia entre peticiones pero todas usan el primer tag; v0.0.10 incompatible; HTTP 404/interrupción; hash incorrecto; TAR con `../`, rutas absolutas, enlaces o duplicados; catálogo ausente; espacios/Unicode; caché Git antigua conservada; versión modificada; bloqueo; repetición y fallo parcial de Claude. Exigir cero llamadas de configuración en fallos previos a registrar y ausencia de mensaje de éxito ante fallo de Claude.
- [ ] Ejecutar las pruebas Bash y `bash -n installers/install.sh`; deben pasar con Bash 3.2. Crear commit `feat: install Unix mods from verified release archives`.

### Tarea 4: instalar desde releases en Windows

**Files:** `installers/install.ps1`, `tests/test_online_installers.py`.

**Interfaces:** conservar `-Mods`, `-All`, `-Scope`, `-Version`, `-Source`, `-DryRun`, `-List`, `-Help`; añadir `Resolve-Release`, `Save-Release` e `Install-Release` como equivalentes funcionales de la tarea 3. Sin Git, Bash ni cambios permanentes de ExecutionPolicy.

- [ ] Reutilizar los casos compartidos de la tarea 3, con ZIP y rutas de Windows, y añadir `test_windows_installer_does_not_require_bash_or_git`. Ejecutarlos en PowerShell 5.1 y 7 para demostrar fallo del clonador actual.
- [ ] Resolver la release estable mediante el mismo manifiesto HTTPS y lector estricto de la tarea 3, o el tag explícito; fijar ese tag para todas las descargas. Usar `Get-FileHash` y APIs ZIP de .NET para inspeccionar entradas antes de extraerlas; rechazar escapes, enlaces, duplicados y metadatos incompatibles. Comprobar VERSION y validar marketplace/mods con `claude plugin validate RUTA --strict` antes de configurar. No depender de utilidades Unix.
- [ ] Implementar el mismo menú, ámbitos, persistencia, bloqueo, comprobación de carpetas existentes y resultado parcial que en Unix. Invocar Claude directamente con arrays de argumentos y conservar el cwd inicial.
- [ ] Ejecutar todos los casos aplicables de `test_online_installers.py` con ambos motores PowerShell; exigir selección correcta, ningún proceso Git/Bash y mensajes finales solo tras éxito completo.
- [ ] Crear un commit independiente: `feat: install Windows mods from verified release archives`.

### Tarea 5: validación nativa y distribución sencilla

**Files:** nuevo `tests/integration_online_release.py`; adaptar `tests/integration_platforms.py`, `tests/integration_package.py`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md`, `docs/distribution.md`, `docs/terminal-compatibility.md`, `VERSION`, `CHANGELOG.md`.

**Interfaces:** `python tests/integration_online_release.py --assets DIR` sirve fixtures por HTTP local en las pruebas, ejecuta el instalador generado correspondiente al sistema y valida el registro real de Claude. La inyección de servidor de prueba no altera los endpoints HTTPS de los instaladores publicados ni se habilita mediante entrada no validada. Configuración y datos temporales aislados; nunca usar la configuración personal.

- [ ] Añadir integración de primera instalación, repetición y actualización entre dos releases fixture compatibles, usando Flow + Usage y cada ámbito. Incluir rutas con espacios/Unicode y un fallo de integridad antes de registrar. Comprobar que los archivos referenciados siguen existiendo tras finalizar el instalador.
- [ ] Ejecutar la integración contra los assets anteriores para observar ausencia del contrato; después conectar los instaladores nuevos. Usar un servidor determinista para la descarga y la CLI real para instalación; no hacer que cada prueba dependa de publicar una release en GitHub.
- [ ] En CI ejecutar el asset final en Linux/macOS y ambos PowerShell de Windows. Instrumentar las fronteras del proceso para fallar ante cualquier uso de Git; no confundir Git utilizado por checkout de CI con una dependencia del instalador. No exigir Python/Node al proceso instalador; la infraestructura de pruebas puede usarlos.
- [ ] Ampliar el ensayo de release a `feature/installers-no-clone` y `develop` con `publish=false`, conservando tags/manual como únicos caminos de publicación. Ejecutar actionlint, suites existentes, pruebas nativas de mods y nueva integración en la matriz.
- [ ] Documentar un comando por sistema que descarga el script a un temporal y lo ejecuta con terminal interactiva. Mostrar selección Flow + Usage, instalación individual y versión fija; los ejemplos deben usar los mismos argumentos que la integración. Explicar reinicio de Claude y disponibilidad en terminales de IDE; WSL, SSH y contenedores requieren instalar dentro de su propio entorno.
- [ ] Preparar `VERSION=0.0.11` y una entrada fechada en inglés en `CHANGELOG.md`, con Added/Changed/Fixed. Mantener las versiones individuales de los mods. Verificar `python scripts/build_release.py --check --version v0.0.11` y construir en un directorio vacío.
- [ ] Exigir matriz verde, inventario/checksums reproducibles y ensayo completo antes de proponer publicación. Registrar qué plataformas se probaron realmente. Crear commit `test: validate OS release installers and document easy setup`.

## Entrega y comprobación del plan

La revisión del diseño cubre la instalación sencilla, tres entradas por sistema, selección de mods, persistencia, releases inmutables y pruebas nativas. Cada condición de Review Focus tiene pruebas asignadas. Los cinco bloques de implementación son secuenciales y pueden ejecutarse en esta sesión sin delegación.

Crear esta rama y guardar estos documentos no implementa ni publica los instaladores. No se ejecuta ahora la batería multiplataforma: corresponde a los cambios previstos en las tareas anteriores.

GENERATED BY AIKYA HARNESS
