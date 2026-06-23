param(
  [string]$NormalizedDir = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\normalized-v2",
  [string]$SourceImages = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\preview\assets",
  [string]$R2ReadyRoot = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\r2-ready",
  [string]$RcloneRemote = "bepsi-r2",
  [string]$Bucket = "bep-si",
  [switch]$Publish
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$pricePreflight = Join-Path $PSScriptRoot "phase4-price-preflight.mjs"
$prepareScript = Join-Path $PSScriptRoot "prepare-phase4-r2.mjs"
$uploadScript = Join-Path $PSScriptRoot "phase4-upload-r2.ps1"

foreach ($required in @($NormalizedDir, $SourceImages, $pricePreflight, $prepareScript, $uploadScript)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Phase 4 path does not exist: $required"
  }
}

& node $pricePreflight `
  "--normalized-dir=$NormalizedDir" `
  "--output-dir=$R2ReadyRoot"

if ($LASTEXITCODE -ne 0) {
  $priceReport = Join-Path $R2ReadyRoot "price-pending.csv"
  throw "Phase 4 blocked: missing or zero prices exist. Fill the prices in the source catalog first. Report: $priceReport"
}

& node $prepareScript `
  "--normalized-dir=$NormalizedDir" `
  "--source-images=$SourceImages" `
  "--r2-ready-root=$R2ReadyRoot"

if ($LASTEXITCODE -ne 0) {
  throw "Phase 4 R2 preparation failed."
}

if ($Publish) {
  & $uploadScript `
    -R2ReadyRoot $R2ReadyRoot `
    -RcloneRemote $RcloneRemote `
    -Bucket $Bucket `
    -Publish
} else {
  & $uploadScript `
    -R2ReadyRoot $R2ReadyRoot `
    -RcloneRemote $RcloneRemote `
    -Bucket $Bucket
}

if ($LASTEXITCODE -ne 0) {
  throw "Phase 4 R2 validation or upload failed."
}
