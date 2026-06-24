$ErrorActionPreference = "Stop"
$launcher = Join-Path $PSScriptRoot "phase3-preview-parent.cmd"

if (-not (Test-Path -LiteralPath $launcher)) {
  throw "Missing launcher: $launcher"
}

# Invoke the .cmd directly so PowerShell preserves the full path,
# including the ampersand in F&B-Order.
& $launcher

if ($LASTEXITCODE -ne 0) {
  throw "Phase 3 parent preview failed with exit code $LASTEXITCODE."
}
