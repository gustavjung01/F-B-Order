param(
  [string]$PublicBaseUrl = "https://img.bepsi.click"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$builder = Join-Path $PSScriptRoot "build-phase3-preview.mjs"
$output = Join-Path $repoRoot "artifacts\catalog\hung-phat-v2-preview\index.html"

Push-Location $repoRoot
try {
  & node $builder "--public-base-url=$PublicBaseUrl"
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 preview builder failed with exit code $LASTEXITCODE."
  }

  if (-not (Test-Path -LiteralPath $output)) {
    throw "Preview output was not created: $output"
  }

  Write-Host "PASS: Phase 3 popup preview generated." -ForegroundColor Green
  Write-Host "Preview: $output"
  Start-Process -FilePath $output
} finally {
  Pop-Location
}
