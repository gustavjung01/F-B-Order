param(
  [string]$SourceImages = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\preview\assets"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$builder = Join-Path $PSScriptRoot "build-phase3-preview.mjs"
$output = Join-Path $repoRoot "artifacts\catalog\hung-phat-v2-preview\index.html"

if (-not (Test-Path -LiteralPath $SourceImages)) {
  throw "Local preview image source does not exist: $SourceImages"
}

Push-Location $repoRoot
try {
  & node $builder "--source-images=$SourceImages"
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 preview builder failed with exit code $LASTEXITCODE."
  }

  if (-not (Test-Path -LiteralPath $output)) {
    throw "Preview output was not created: $output"
  }

  Write-Host "PASS: Phase 3 ordering-style popup preview generated." -ForegroundColor Green
  Write-Host "Preview: $output"
  Write-Host "Images: local assets (no img.bepsi.click DNS dependency)"
  Start-Process -FilePath $output
} finally {
  Pop-Location
}
