param(
  [string]$R2ReadyRoot = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\r2-ready",
  [string]$RcloneRemote = "bepsi-r2",
  [string]$Bucket = "bep-si",
  [switch]$Publish
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Equal {
  param([object]$Actual, [object]$Expected, [string]$Label)
  if ($Actual -ne $Expected) {
    throw "$Label must be $Expected, found $Actual."
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) {
    throw $Message
  }
}

function Get-RelativeFileNames {
  param([string]$Root, [string]$Filter = "*")
  $rootFull = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
  return @(
    Get-ChildItem -LiteralPath $rootFull -File -Recurse -Filter $Filter |
      ForEach-Object {
        $_.FullName.Substring($rootFull.Length + 1).Replace('\', '/')
      } |
      Sort-Object
  )
}

function Get-DuplicatesCaseInsensitive {
  param([string[]]$Values)
  return @(
    $Values |
      Group-Object { $_.ToLowerInvariant() } |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { $_.Group -join ' | ' }
  )
}

function Write-Utf8Json {
  param([string]$Path, [object]$Value, [int]$Depth = 20)
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText(
    $Path,
    $json + [Environment]::NewLine,
    (New-Object System.Text.UTF8Encoding($false))
  )
}

$ProductsDir = Join-Path $R2ReadyRoot "products"
$ManifestsDir = Join-Path $R2ReadyRoot "manifests"
$ProductImagesManifest = Join-Path $ManifestsDir "product-images.json"
$CatalogVersionManifest = Join-Path $ManifestsDir "catalog-version.json"
$ProductsManifest = Join-Path $ManifestsDir "products.json"
$ReportPath = Join-Path $R2ReadyRoot "phase4-upload-report.json"

foreach ($requiredPath in @(
  $R2ReadyRoot,
  $ProductsDir,
  $ManifestsDir,
  $ProductImagesManifest,
  $CatalogVersionManifest,
  $ProductsManifest
)) {
  Assert-True (Test-Path -LiteralPath $requiredPath) "Required Phase 4 path does not exist: $requiredPath"
}

$localProductFiles = Get-RelativeFileNames -Root $ProductsDir -Filter "*.webp"
$localManifestFiles = Get-RelativeFileNames -Root $ManifestsDir -Filter "*.json"

Assert-True ($localProductFiles.Count -gt 0) "No product images found in $ProductsDir"
Assert-True ($localManifestFiles.Count -gt 0) "No manifests found in $ManifestsDir"

$productFileDuplicates = Get-DuplicatesCaseInsensitive -Values $localProductFiles
$manifestFileDuplicates = Get-DuplicatesCaseInsensitive -Values $localManifestFiles
Assert-Equal $productFileDuplicates.Count 0 "duplicate local product filename count"
Assert-Equal $manifestFileDuplicates.Count 0 "duplicate local manifest filename count"

$catalogVersion = Get-Content -LiteralPath $CatalogVersionManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$productsManifest = @(Get-Content -LiteralPath $ProductsManifest -Raw -Encoding UTF8 | ConvertFrom-Json)
$productImagesManifest = @(Get-Content -LiteralPath $ProductImagesManifest -Raw -Encoding UTF8 | ConvertFrom-Json)

$parentCardCount = if ($null -ne $catalogVersion.parentCardCount) {
  [int]$catalogVersion.parentCardCount
} elseif ($null -ne $catalogVersion.cardCount) {
  [int]$catalogVersion.cardCount
} else {
  $productsManifest.Count
}

$variantCount = if ($null -ne $catalogVersion.variantCount) {
  [int]$catalogVersion.variantCount
} else {
  [int](($productsManifest | ForEach-Object { @($_.variants).Count } | Measure-Object -Sum).Sum)
}

Assert-Equal $parentCardCount 188 "parentCardCount"
Assert-Equal $variantCount 275 "variantCount"
Assert-Equal $productsManifest.Count 188 "products manifest parent count"
Assert-Equal $productImagesManifest.Count $localProductFiles.Count "product-images manifest count"

$expectedPrefix = "catalog/hung-phat/v2/products/"
$localProductSet = @{}
foreach ($file in $localProductFiles) {
  $localProductSet[$file.ToLowerInvariant()] = $true
}

$manifestObjectKeys = New-Object System.Collections.ArrayList
$badObjectKeys = New-Object System.Collections.ArrayList
$missingLocalObjects = New-Object System.Collections.ArrayList

foreach ($record in $productImagesManifest) {
  $objectKey = [string]$record.objectKey
  if ([string]::IsNullOrWhiteSpace($objectKey) -or -not $objectKey.StartsWith($expectedPrefix)) {
    [void]$badObjectKeys.Add($objectKey)
    continue
  }

  $relativeName = $objectKey.Substring($expectedPrefix.Length).Replace('\', '/')
  [void]$manifestObjectKeys.Add($relativeName)

  if (-not $localProductSet.ContainsKey($relativeName.ToLowerInvariant())) {
    [void]$missingLocalObjects.Add($relativeName)
  }
}

$manifestObjectDuplicates = Get-DuplicatesCaseInsensitive -Values @($manifestObjectKeys)
Assert-Equal $badObjectKeys.Count 0 "invalid manifest objectKey count"
Assert-Equal $missingLocalObjects.Count 0 "manifest object missing locally count"
Assert-Equal $manifestObjectDuplicates.Count 0 "duplicate manifest objectKey count"
Assert-Equal (@($manifestObjectKeys | Sort-Object -Unique).Count) $localProductFiles.Count "unique manifest object count"

$remoteName = "$RcloneRemote`:"
$remoteBase = "$RcloneRemote`:$Bucket/catalog/hung-phat/v2"
$remoteProducts = "$remoteBase/products"
$remoteManifests = "$remoteBase/manifests"

if ($Publish) {
  Assert-True ($null -ne (Get-Command rclone -ErrorAction SilentlyContinue)) "rclone is not installed or not available in PATH."
  Assert-True ((rclone listremotes) -contains $remoteName) "rclone remote '$remoteName' is not configured."

  Write-Host "Uploading product images with rclone copy..." -ForegroundColor Cyan
  rclone copy $ProductsDir $remoteProducts --include "*.webp" --progress
  if ($LASTEXITCODE -ne 0) { throw "R2 product image upload failed." }

  Write-Host "Uploading manifests with rclone copy..." -ForegroundColor Cyan
  rclone copy $ManifestsDir $remoteManifests --include "*.json" --progress
  if ($LASTEXITCODE -ne 0) { throw "R2 manifest upload failed." }

  $remoteProductFiles = @(
    rclone lsf $remoteProducts --files-only --include "*.webp" |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ } |
      Sort-Object
  )
  $remoteManifestFiles = @(
    rclone lsf $remoteManifests --files-only --include "*.json" |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ } |
      Sort-Object
  )

  Assert-Equal $remoteProductFiles.Count $localProductFiles.Count "remote R2 product image count"
  Assert-Equal $remoteManifestFiles.Count $localManifestFiles.Count "remote R2 manifest count"

  $remoteProductSet = @{}
  foreach ($file in $remoteProductFiles) { $remoteProductSet[$file.ToLowerInvariant()] = $true }
  $remoteManifestSet = @{}
  foreach ($file in $remoteManifestFiles) { $remoteManifestSet[$file.ToLowerInvariant()] = $true }

  $missingRemoteProducts = @($localProductFiles | Where-Object { -not $remoteProductSet.ContainsKey($_.ToLowerInvariant()) })
  $extraRemoteProducts = @($remoteProductFiles | Where-Object { -not $localProductSet.ContainsKey($_.ToLowerInvariant()) })

  $localManifestSet = @{}
  foreach ($file in $localManifestFiles) { $localManifestSet[$file.ToLowerInvariant()] = $true }
  $missingRemoteManifests = @($localManifestFiles | Where-Object { -not $remoteManifestSet.ContainsKey($_.ToLowerInvariant()) })
  $extraRemoteManifests = @($remoteManifestFiles | Where-Object { -not $localManifestSet.ContainsKey($_.ToLowerInvariant()) })

  Assert-Equal $missingRemoteProducts.Count 0 "missing remote product object count"
  Assert-Equal $extraRemoteProducts.Count 0 "extra remote product object count"
  Assert-Equal $missingRemoteManifests.Count 0 "missing remote manifest object count"
  Assert-Equal $extraRemoteManifests.Count 0 "extra remote manifest object count"

  rclone check $ProductsDir $remoteProducts --one-way --size-only
  if ($LASTEXITCODE -ne 0) { throw "R2 product image verification failed." }

  rclone check $ManifestsDir $remoteManifests --one-way --size-only
  if ($LASTEXITCODE -ne 0) { throw "R2 manifest verification failed." }

  $report = [ordered]@{
    phase = 4
    status = "PASS"
    uploadedAt = (Get-Date).ToUniversalTime().ToString("o")
    catalogVersion = "hung-phat-v2"
    parentCardCount = $parentCardCount
    variantCount = $variantCount
    localImageCount = $localProductFiles.Count
    remoteImageCount = $remoteProductFiles.Count
    localManifestCount = $localManifestFiles.Count
    remoteManifestCount = $remoteManifestFiles.Count
    duplicateLocalProductFilenameCount = 0
    duplicateManifestObjectKeyCount = 0
    missingRemoteProductObjectCount = 0
    missingRemoteManifestObjectCount = 0
    manifestReferenceMissingCount = 0
    uploadMode = "copy"
    productsTarget = $remoteProducts
    manifestsTarget = $remoteManifests
    legacyPrefixesModified = $false
  }

  Write-Utf8Json -Path $ReportPath -Value $report -Depth 10

  Write-Host "PASS: Phase 4 R2 upload and verification completed." -ForegroundColor Green
  Write-Host "Images:    $($localProductFiles.Count) local = $($remoteProductFiles.Count) R2"
  Write-Host "Manifests: $($localManifestFiles.Count) local = $($remoteManifestFiles.Count) R2"
  Write-Host "Missing objects: 0"
  Write-Host "Duplicate filenames: 0"
  Write-Host "Manifest references missing: 0"
  Write-Host "Products:  $remoteProducts"
  Write-Host "Manifests: $remoteManifests"
  Write-Host "Report: $ReportPath"
} else {
  $report = [ordered]@{
    phase = 4
    status = "LOCAL_VALIDATION_PASS"
    catalogVersion = "hung-phat-v2"
    parentCardCount = $parentCardCount
    variantCount = $variantCount
    localImageCount = $localProductFiles.Count
    localManifestCount = $localManifestFiles.Count
    duplicateLocalProductFilenameCount = 0
    duplicateManifestObjectKeyCount = 0
    manifestReferenceMissingCount = 0
    uploadPerformed = $false
  }

  Write-Utf8Json -Path $ReportPath -Value $report -Depth 10
  Write-Host "PASS: Phase 4 local validation completed. No upload was performed." -ForegroundColor Green
  Write-Host "Run again with -Publish to upload using rclone copy."
  Write-Host "Report: $ReportPath"
}

Write-Host "Legacy prefixes were not modified:" -ForegroundColor Yellow
Write-Host "  catalog/hung-phat/products/"
Write-Host "  catalog/hung-phat/covers/"
Write-Host "No sync or delete command is used by this script."
