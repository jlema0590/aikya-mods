#requires -Version 5.1
<# Standalone Windows installer. No Bash or existing checkout is required. #>
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
$repository = 'https://github.com/jlema0590/aikya-mods.git'
$available = @('aikya-boxbot', 'aikya-flow', 'aikya-usage')

function Show-Command([string]$Name, [string[]]$Arguments) {
    $quoted = @($Arguments | ForEach-Object { "'" + $_.Replace("'", "''") + "'" })
    Write-Output ($Name + ' ' + ($quoted -join ' '))
}
function Invoke-Git([string[]]$GitArguments) {
    & git @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed (exit $LASTEXITCODE)." }
}
function Invoke-Claude([string[]]$ClaudeArguments) {
    if ($DryRun) { Show-Command 'claude' $ClaudeArguments; return }
    & claude @ClaudeArguments
    if ($LASTEXITCODE -ne 0) { throw "Claude Code failed (exit $LASTEXITCODE). Earlier successful changes are not rolled back." }
}

try {
    if ($Help) {
        Write-Output @'
Aikya Mods online installer (Windows PowerShell 5.1+)
  -Mods aikya-flow,aikya-usage   Choose mods; default: all available mods
  -All                         Install all mods
  -Scope user|project|local     Claude configuration scope; default: user
  -Version vMAJOR.MINOR.PATCH   Install a release tag; default: main
  -Source PATH                 Use an existing checkout without downloading
  -DryRun                      Show commands; make no changes
  -List                        List mods without installing
AIKYA_MODS_HOME sets the persistent checkout directory.
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
    $ref = 'main'
    if ($Version) {
        if ($Version -cnotmatch '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
            throw 'Use a release version such as v1.2.3.'
        }
        if ($Source) { throw 'Choose -Version or -Source, not both.' }
        $ref = $Version
    }
    if ($List) { Write-Output 'Available mods:'; $available | ForEach-Object { Write-Output "  $_" }; return }
    if ($selected.Count -eq 0) { $selected = $available }
    if (-not $DryRun -and -not (Get-Command claude -ErrorAction SilentlyContinue)) {
        throw 'Claude Code was not found. Install it and ensure claude is on PATH.'
    }
    if (-not $Source) {
        if ($env:AIKYA_MODS_HOME) { $cacheRoot = $env:AIKYA_MODS_HOME }
        else { $cacheRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Aikya/Mods' }
        $Source = Join-Path $cacheRoot $ref
        if (-not $DryRun) {
            if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git was not found. Install Git and retry.' }
            New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
        }
        if (Test-Path -LiteralPath $Source) {
            if (-not $DryRun) {
                if (-not (Test-Path -LiteralPath (Join-Path $Source '.git') -PathType Container)) {
                    throw "The cache is not a Git checkout: $Source"
                }
                $origin = (Invoke-Git -GitArguments @('-C', $Source, 'remote', 'get-url', 'origin') | Out-String).Trim()
                if ($origin -cne $repository) { throw 'The cached checkout has an unexpected Git origin.' }
                & git -C $Source diff --quiet
                if ($LASTEXITCODE -ne 0) { throw 'The cached checkout has local changes. Preserve them before updating.' }
                & git -C $Source diff --cached --quiet
                if ($LASTEXITCODE -ne 0) { throw 'The cached checkout has staged changes. Preserve them before updating.' }
            }
            $fetch = @('-C', $Source, 'fetch', '--depth', '1', 'origin', $ref)
            $checkout = @('-C', $Source, 'checkout', '--detach', 'FETCH_HEAD')
            if ($DryRun) { Show-Command 'git' $fetch; Show-Command 'git' $checkout }
            else { Invoke-Git -GitArguments $fetch; Invoke-Git -GitArguments $checkout }
        }
        else {
            $clone = @('clone', '--depth', '1', '--branch', $ref, $repository, $Source)
            if ($DryRun) { Show-Command 'git' $clone }
            else { Invoke-Git -GitArguments $clone }
        }
    }
    if (-not $DryRun) {
        if (-not (Test-Path -LiteralPath (Join-Path $Source '.claude-plugin/marketplace.json') -PathType Leaf)) {
            throw "Not an Aikya Mods checkout: $Source"
        }
        $Source = (Resolve-Path -LiteralPath $Source).Path
    }
    Invoke-Claude -ClaudeArguments @('plugin', 'marketplace', 'add', $Source, '--scope', $Scope)
    foreach ($mod in $selected) { Invoke-Claude -ClaudeArguments @('plugin', 'install', "$mod@aikya-mods", '--scope', $Scope) }
    if ($DryRun) { Write-Output 'Dry run complete. Nothing was installed.' }
    else {
        Write-Output 'Installation complete. Restart Claude Code to load the selected mods.'
        Write-Output "Marketplace source retained at $Source"
    }
}
catch {
    [Console]::Error.WriteLine('Error: ' + $_.Exception.Message)
    exit 1
}
