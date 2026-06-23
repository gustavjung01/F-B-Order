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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$pricePolicy = Join-Path $repoRoot "data\catalog\hung-phat\v2\price-policies.csv"
$pricePreflight = Join-Path $PSScriptRoot "phase4-price-preflight.mjs"
$prepareScript = Join-Path $PSScriptRoot "prepare-phase4-r2-v2.mjs"
$uploadScript = Join-Path $PSScriptRoot "phase4-upload-r2.ps1"

foreach ($required in @($NormalizedDir, $SourceImages, $pricePolicy, $pricePreflight, $prepareScript, $uploadScript)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Phase 4 path does not exist: $required"
  }
}

Push-Location $repoRoot
try {
  & node $pricePreflight `
    "--normalized-dir=$NormalizedDir" `
    "--output-dir=$R2ReadyRoot" `
    "--policy=$pricePolicy"

  if ($LASTEXITCODE -ne 0) {
    $priceReport = Join-Path $R2ReadyRoot "price-pending.csv"
    throw "Phase 4 blocked: an unclassified missing price remains. Report: $priceReport"
  }

  & node $prepareScript `
    "--normalized-dir=$NormalizedDir" `
    "--source-images=$SourceImages" `
    "--r2-ready-root=$R2ReadyRoot" `
    "--policy=$pricePolicy"

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
} finally {
  Pop-Location
}
