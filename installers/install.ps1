#requires -Version 5.1
<# Standalone Windows release installer. No Git, Bash, Node.js or Python required. #>
[CmdletBinding()]
param(
    [string[]]$Mods = @(),
    [switch]$All,
    [ValidateSet('user', 'project', 'local')][string]$Scope = 'user',
    [string]$Version,
    [string]$Source,
    [switch]$DryRun,
    [switch]$List,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
$releaseUrl = 'https://github.com/jlema0590/aikya-mods/releases'
$available = @('aikya-boxbot', 'aikya-flow', 'aikya-usage')
$stage = $null
$lockStream = $null
$lockDirectory = $null
$lockOwned = $false

function Assert-Version([string]$Tag) {
    if ($Tag -cnotmatch '^v(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$') {
        throw 'Use a stable release version such as v0.0.11.'
    }
    if ([int]$Matches[1] -eq 0 -and [int]$Matches[2] -eq 0 -and [int]$Matches[3] -lt 11) {
        throw 'Release installers require v0.0.11 or later. Older releases can be installed from their extracted bundle.'
    }
}
function Invoke-Claude([string[]]$ClaudeArguments) {
    & claude @ClaudeArguments
    if ($LASTEXITCODE -ne 0) { throw 'Claude Code failed. Earlier successful changes are not rolled back. Keep the marketplace source and retry after resolving the error.' }
}
function Save-Download([string]$Uri, [string]$Destination) {
    # TLS 1.2 is needed by the Windows PowerShell 5.1 networking stack.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
}
function Read-Manifest([string]$Path) {
    $data = @{}
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $parts = $line.Split(@('='), 2)
        if ($parts.Count -ne 2 -or $parts[0] -cnotin @('installer_schema', 'version', 'unix_archive', 'windows_archive') -or $data.ContainsKey($parts[0])) {
            throw 'Invalid or duplicate installer manifest entry.'
        }
        $data[$parts[0]] = $parts[1]
    }
    if ($data.Count -ne 4 -or $data['installer_schema'] -cne '1') { throw 'Unsupported installer manifest schema.' }
    Assert-Version $data['version']
    if ($data['unix_archive'] -cne ('aikya-mods-' + $data['version'] + '.tar.gz') -or
        $data['windows_archive'] -cne ('aikya-mods-' + $data['version'] + '.zip')) { throw 'Invalid installer archive names.' }
    return $data
}
function Assert-Hash([string]$Name) {
    $digests = @()
    foreach ($line in [IO.File]::ReadAllLines((Join-Path $stage 'SHA256SUMS'))) {
        if ($line -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$') { throw 'Invalid release checksums.' }
        if ($Matches[2] -ceq $Name) { $digests += $Matches[1] }
    }
    if ($digests.Count -ne 1) { throw "Missing or duplicate checksum: $Name" }
    $actual = (Get-FileHash -LiteralPath (Join-Path $stage $Name) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -cne $digests[0]) { throw "Checksum mismatch: $Name" }
}
function Expand-VerifiedArchive([string]$Path, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        if ($archive.Entries.Count -eq 0) { throw 'The release archive is empty.' }
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName
            if ($name -cnotmatch '^aikya-mods/[A-Za-z0-9_./-]+$' -or $name -match '(^|/)\.\.?($|/)|//' -or -not $names.Add($name.TrimEnd('/'))) {
                throw 'Unsafe or duplicate release archive path.'
            }
            foreach ($component in $name.Split('/')) {
                if ($component.EndsWith('.') -or $component -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)') { throw 'Unsafe Windows archive path.' }
            }
            $kind = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($kind -notin @(0, 0x8000, 0x4000)) { throw 'Release archives must not contain links or special files.' }
        }
        [IO.Compression.ZipFile]::ExtractToDirectory($Path, $Destination)
    }
    finally { $archive.Dispose() }
}
function Get-TreeHashes([string]$Path) {
    $result = @{}
    # Provider-returned relative names also work with Windows 8.3 aliases and .. paths.
    foreach ($name in Get-ChildItem -LiteralPath $Path -Recurse -Force -Name) {
        $entry = Get-Item -LiteralPath (Join-Path $Path $name) -Force
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The installed release contains a link. Preserve it before retrying.' }
        $relative = $name.Replace('\', '/')
        $result[$relative] = if ($entry.PSIsContainer) { 'directory' } else { (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash }
    }
    return $result
}

try {
    if ($Help) {
        Write-Output @'
Aikya Mods release installer (Windows PowerShell 5.1+)
With no selection: show a menu in a terminal; install all mods without a terminal.
  -Mods aikya-flow,aikya-usage  Choose mods without prompting
  -All                        Install all mods without prompting
  -Scope user|project|local    Claude configuration scope; default: user
  -Version vMAJOR.MINOR.PATCH  Install a release; default: latest stable (v0.0.11+)
  -Source PATH                Use an extracted bundle without downloading
  -DryRun                     Show the plan without network access or writes
  -List                       List available mods without installing
AIKYA_MODS_HOME sets the persistent data directory.
'@
        return
    }
    $selected = @()
    foreach ($entry in $Mods) {
        foreach ($mod in $entry.Split(',')) {
            if ($available -cnotcontains $mod) { throw "Mod '$mod' is not available." }
            if ($selected -cnotcontains $mod) { $selected += $mod }
        }
    }
    if ($All -and $selected.Count -gt 0) { throw 'Choose -All or -Mods, not both.' }
    if ($Version) {
        Assert-Version $Version
        if ($Source) { throw 'Choose -Version or -Source, not both.' }
    }
    if ($List) { Write-Output 'Available mods:'; $available | ForEach-Object { Write-Output "  $_" }; return }
    if ($selected.Count -eq 0 -and -not $All -and -not $DryRun -and -not [Console]::IsInputRedirected) {
        while ($selected.Count -eq 0) {
            Write-Host "`nAikya Mods Installer`n`n1. Flow + Usage (recommended)`n2. All mods`n3. Choose mods`nQ. Cancel`n"
            $answer = Read-Host 'Choose an option [1]'
            switch ($answer) {
                { $_ -in @('', '1') } { $selected = @('aikya-flow', 'aikya-usage'); break }
                '2' { $selected = $available; break }
                'Q' { Write-Output 'Cancelled. Nothing was installed.'; return }
                '3' {
                    Write-Host "1. Flow`n2. Usage`n3. BoxBot"
                    $answer = Read-Host 'Choose numbers separated by spaces (or Q to cancel)'
                    if ($answer -ieq 'Q') { Write-Output 'Cancelled. Nothing was installed.'; return }
                    $choices = @($answer.Trim() -split '\s+')
                    if ($choices.Count -eq 0 -or @($choices | Where-Object { $_ -notin @('1', '2', '3') }).Count -gt 0) {
                        Write-Host 'Invalid selection. Choose 1, 2 or 3.'; break
                    }
                    foreach ($choice in $choices) {
                        $mod = @('aikya-flow', 'aikya-usage', 'aikya-boxbot')[[int]$choice - 1]
                        if ($selected -cnotcontains $mod) { $selected += $mod }
                    }
                    break
                }
                default { Write-Host 'Invalid selection. Choose 1, 2, 3 or Q.' }
            }
        }
    }
    if ($selected.Count -eq 0) { $selected = $available }
    if ($DryRun) {
        $label = if ($Version) { $Version } else { 'latest stable' }
        Write-Output "Release: $label`nScope: $Scope"
        Write-Output ('Selected plugins: ' + (($selected | ForEach-Object { "$_@aikya-mods" }) -join ' '))
        Write-Output 'Dry run complete. Nothing was installed.'
        return
    }
    if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { throw 'Claude Code was not found. Install it and ensure claude is on PATH.' }
    if (-not $Source) {
        $cacheRoot = if ($env:AIKYA_MODS_HOME) { $env:AIKYA_MODS_HOME } else { Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Aikya/Mods' }
        foreach ($directory in @($cacheRoot, (Join-Path $cacheRoot 'releases'))) {
            if ((Test-Path -LiteralPath $directory) -and ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'The installation directory must not be a link.' }
        }
        New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
        $lockDirectory = Join-Path $cacheRoot '.install-lock'
        # CreateNew is atomic. Retain a marker directory so an interrupted run is visible.
        if (Test-Path -LiteralPath $lockDirectory) { throw "Another installation holds $lockDirectory. If interrupted, inspect that lock before removing it." }
        New-Item -ItemType Directory -Path $lockDirectory -ErrorAction Stop | Out-Null
        try {
            $lockStream = [IO.File]::Open((Join-Path $lockDirectory 'owner'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
            $lockOwned = $true
        }
        catch { throw "Another installation holds $lockDirectory." }
        $stage = Join-Path $cacheRoot ('.staging.' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $stage | Out-Null
        if (-not $Version) {
            $latest = Join-Path $stage 'latest.txt'
            Save-Download "$releaseUrl/latest/download/installer-manifest.txt" $latest
            $Version = (Read-Manifest $latest)['version']
        }
        $manifestPath = Join-Path $stage 'installer-manifest.txt'
        Save-Download "$releaseUrl/download/$Version/installer-manifest.txt" $manifestPath
        $manifest = Read-Manifest $manifestPath
        if ($manifest['version'] -cne $Version) { throw 'Installer manifest does not match the requested release.' }
        Save-Download "$releaseUrl/download/$Version/SHA256SUMS" (Join-Path $stage 'SHA256SUMS')
        Assert-Hash 'installer-manifest.txt'
        $archiveName = $manifest['windows_archive']
        $archivePath = Join-Path $stage $archiveName
        Save-Download "$releaseUrl/download/$Version/$archiveName" $archivePath
        Assert-Hash $archiveName
        $extracted = Join-Path $stage 'extracted'
        Expand-VerifiedArchive $archivePath $extracted
        $Source = Join-Path $extracted 'aikya-mods'
        if (-not (Test-Path -LiteralPath (Join-Path $Source 'VERSION')) -or [IO.File]::ReadAllText((Join-Path $Source 'VERSION')).Trim() -cne $Version.Substring(1)) { throw 'The extracted bundle version does not match the release.' }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Source '.claude-plugin/marketplace.json') -PathType Leaf)) { throw "Not an Aikya Mods bundle: $Source" }
    $Source = (Resolve-Path -LiteralPath $Source).Path
    Invoke-Claude -ClaudeArguments @('plugin', 'validate', $Source, '--strict')
    foreach ($mod in $available) { Invoke-Claude -ClaudeArguments @('plugin', 'validate', (Join-Path $Source "mods/$mod"), '--strict') }
    if ($stage) {
        $destination = Join-Path $cacheRoot "releases/$Version"
        if (Test-Path -LiteralPath $destination) {
            if ((Get-Item -LiteralPath $destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The release directory must not be a link.' }
            $actual = Get-TreeHashes $destination
            $expected = Get-TreeHashes $extracted
            if ($actual.Count -ne $expected.Count) { throw 'The installed release contains local changes. Preserve that directory before retrying.' }
            foreach ($key in $expected.Keys) {
                if (-not $actual.ContainsKey($key) -or $actual[$key] -cne $expected[$key]) { throw 'The installed release contains local changes. Preserve that directory before retrying.' }
            }
        }
        else {
            New-Item -ItemType Directory -Path (Join-Path $cacheRoot 'releases') -Force | Out-Null
            Move-Item -LiteralPath $extracted -Destination $destination
        }
        $Source = Join-Path $destination 'aikya-mods'
    }
    Invoke-Claude -ClaudeArguments @('plugin', 'marketplace', 'add', $Source, '--scope', $Scope)
    foreach ($mod in $selected) { Invoke-Claude -ClaudeArguments @('plugin', 'install', "$mod@aikya-mods", '--scope', $Scope) }
    Write-Output 'Installation complete. Restart Claude Code to load the selected mods.'
    Write-Output "Marketplace source retained at $Source"
}
catch {
    [Console]::Error.WriteLine('Error: ' + $_.Exception.Message)
    exit 1
}
finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if ($lockStream) { $lockStream.Dispose() }
    if ($lockOwned) { Remove-Item -LiteralPath $lockDirectory -Recurse -Force }
}
