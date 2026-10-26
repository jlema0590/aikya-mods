# Instalación por sistema operativo sin clonar

Documento de diseño interno en español. Los instaladores y las instrucciones públicas estarán en inglés.

## Objetivo y alcance

Instalar los mods con un único comando para el sistema operativo elegido, sin clonar el repositorio, instalar Git ni solicitar permisos de administrador. Claude Code debe estar previamente instalado y disponible como `claude`.

Se distribuirán `install-windows.ps1`, `install-macos.sh` e `install-linux.sh` como assets de una release. Son instaladores de terminal; no se incluyen MSI, PKG, aplicaciones gráficas ni gestores de paquetes en esta entrega. La siguiente versión propuesta es `0.0.11`; `v0.0.10` y sus assets permanecerán intactos.

## Experiencia

1. El usuario copia un comando desde la sección de su sistema operativo del README. El comando descarga el instalador a un archivo temporal y lo ejecuta, manteniendo disponible la entrada de la terminal.
2. En una terminal interactiva aparece este menú en inglés:

```text
Aikya Mods Installer

1. Flow + Usage (recommended)
2. All mods
3. Choose mods
Q. Cancel

Choose an option [1]:
```

`Choose mods` ofrece Flow, Usage y BoxBot de forma independiente. Elegir `Q` no descarga paquetes ni cambia la configuración. Una entrada inválida vuelve a solicitar la selección.

3. El instalador verifica Claude Code, resuelve la release estable, descarga y comprueba el paquete, instala los mods seleccionados y muestra:

```text
Installation complete.
Installed: Flow, Usage
Restart Claude Code to load your mods.
```

Sin terminal interactiva y sin selección explícita se conserva el comportamiento anterior: instalar todos los mods sin preguntas. Los argumentos explícitos evitan el menú. El ámbito predeterminado es `user`; `project` y `local` siguen disponibles y respetan el directorio desde el que se lanzó la instalación.

## Distribución y dependencias

- Windows: PowerShell 5.1 o 7, HTTPS, ZIP, comprobación SHA-256 y extracción con herramientas de PowerShell/.NET. No necesita Bash. No cambiar permanentemente la política de ejecución.
- macOS: Bash 3.2, `curl`, `tar` y `shasum`, con paquete TAR.GZ.
- Linux: Bash, `curl` o `wget`, `tar`, `gzip` y `sha256sum`, con paquete TAR.GZ. Si falta una herramienta, mostrar su nombre y detenerse antes de configurar Claude; no instalar dependencias automáticamente ni usar `sudo`.
- Git, Node.js y Python no son dependencias del instalador. Los requisitos propios de Claude Code siguen siendo responsabilidad de su instalación previa.
- Instalar siempre una release publicada y estable; nunca una rama, un draft o una prerelease. Resolver `latest` una sola vez y descargar paquete, metadatos y checksums desde ese mismo tag.
- Publicar `installer-manifest.txt` con cuatro líneas `clave=valor`: `installer_schema=1`, `version=vX.Y.Z`, `unix_archive=aikya-mods-vX.Y.Z.tar.gz` y `windows_archive=aikya-mods-vX.Y.Z.zip`. El lector rechaza claves duplicadas, desconocidas y valores inesperados; nunca ejecuta ni importa el manifiesto como código. Este formato evita exigir un lector JSON externo en Unix. El manifiesto también está incluido en SHA256SUMS y debe coincidir con `release.json` al construir la release.
- Permitir fijar `--version vX.Y.Z` / `-Version vX.Y.Z`. La nueva distribución empieza en `v0.0.11`; versiones anteriores carecen del contrato nuevo y se rechazan con un mensaje explicativo antes de configurar Claude. `--source` / `-Source` conserva la instalación local sin red.
- Conservar `install.sh` e `install.ps1` como nombres compatibles de los assets online. El `install.sh` de la raíz sigue siendo el instalador local del proyecto.

## Persistencia y fallos

El paquete se descarga y verifica antes de extraerlo a una carpeta temporal privada dentro del directorio de datos. Validar nombres de archivo, rechazar rutas absolutas, escapes `..`, enlaces y entradas duplicadas antes de extraer. Comprobar versión y catálogo antes de registrar el marketplace.

Fuentes persistentes por versión:

| Sistema | Directorio predeterminado |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Aikya\Mods\releases\vX.Y.Z\aikya-mods` |
| macOS | `~/Library/Application Support/Aikya/Mods/releases/vX.Y.Z/aikya-mods` |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/aikya-mods/releases/vX.Y.Z/aikya-mods` |

`AIKYA_MODS_HOME` sustituye la raíz de datos en los tres sistemas. No borrar ni convertir los antiguos checkouts. No sustituir carpetas ajenas ni archivos modificados: una versión ya instalada debe coincidir con el paquete verificado para poder reutilizarse. Bloquear instalaciones simultáneas en la misma raíz y liberar el bloqueo al terminar o fallar.

La instalación registra esta fuente persistente mediante la CLI nativa de Claude y después instala cada mod seleccionado. Una interrupción de descarga o una comprobación fallida no modifica la configuración de Claude. Si falla una operación de la CLI, informar de la instalación parcial, conservar las fuentes verificadas que la configuración pueda referenciar y permitir reintentar; no prometer una reversión completa de operaciones anteriores.

## Criterios de aceptación

- Los tres instaladores funcionan sin ejecutar Git y sin exigir Python o Node.js para descargar o extraer.
- Selección interactiva, selección explícita y ejecución sin terminal producen los mods y ámbitos esperados.
- `--list`, `--help`, `--dry-run` y equivalentes PowerShell no descargan, no escriben y no configuran Claude. El dry-run sin versión muestra `latest stable` sin resolverlo por red.
- Comprobar instalación real, repetición y actualización en runners Linux, macOS y Windows, con configuración de Claude aislada y rutas con espacios/Unicode. Windows se valida con PowerShell 5.1 y 7; macOS con Bash 3.2.
- Verificar paquetes y assets publicados, checksums e inventario completo antes de declarar lista la distribución. No afirmar cobertura de todas las distribuciones Linux ni de interfaces gráficas de IDE por ejecutar estas pruebas.
- Las instrucciones públicas ofrecen un comando por sistema operativo, selección de Flow + Usage, selección individual y versión fija. No anunciar URLs nuevas hasta que exista la release correspondiente.

GENERATED BY AIKYA HARNESS
