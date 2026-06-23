param(
  [string]$RepoRoot = "F:\1_A_Disk_D\F&B-Order",
  [string]$SourceImages = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\preview\assets",
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

function Write-Utf8Json {
  param([string]$Path, [object]$Value, [int]$Depth = 20)
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
}

$DataDir = Join-Path $RepoRoot "data\catalog\hung-phat\v2"
$ManifestDir = Join-Path $DataDir "manifests"
$RequiredPhase1Files = @(
  "products.csv",
  "product-options.csv",
  "product-variants.csv",
  "product-images.csv",
  "missing-images.csv",
  "catalog-summary.json"
)

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$missingPhase1Files = @($RequiredPhase1Files | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $DataDir $_))
})

if ($missingPhase1Files.Count -gt 0) {
  $zipCandidates = @()
  $repoZip = Join-Path $RepoRoot "bepsi-catalog-v2-phase1-final.zip"
  if (Test-Path -LiteralPath $repoZip) {
    $zipCandidates += Get-Item -LiteralPath $repoZip
  }

  $workRoot = "F:\1_A_Disk_D\khuong-binh\bep-si\work"
  if (Test-Path -LiteralPath $workRoot) {
    $zipCandidates += Get-ChildItem -LiteralPath $workRoot -Filter "bepsi-catalog-v2-phase1-final.zip" -File -Recurse -ErrorAction SilentlyContinue
  }

  $phase1Zip = $zipCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $phase1Zip) {
    throw "Phase 1 files are missing and bepsi-catalog-v2-phase1-final.zip was not found. Missing: $($missingPhase1Files -join ', ')"
  }

  $extractDir = Join-Path $env:TEMP "bepsi-phase1-final-extract"
  Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -LiteralPath $phase1Zip.FullName -DestinationPath $extractDir -Force
  $sourceData = Join-Path $extractDir "data\catalog\hung-phat\v2"

  foreach ($file in $RequiredPhase1Files) {
    $source = Join-Path $sourceData $file
    if (-not (Test-Path -LiteralPath $source)) {
      throw "Phase 1 archive is missing required file: $file"
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $DataDir $file) -Force
  }
}

foreach ($file in $RequiredPhase1Files) {
  $path = Join-Path $DataDir $file
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required Phase 1 file does not exist: $path"
  }
}

$products = @(Import-Csv -LiteralPath (Join-Path $DataDir "products.csv"))
$options = @(Import-Csv -LiteralPath (Join-Path $DataDir "product-options.csv"))
$variants = @(Import-Csv -LiteralPath (Join-Path $DataDir "product-variants.csv"))
$images = @(Import-Csv -LiteralPath (Join-Path $DataDir "product-images.csv"))
$missingImages = @(Import-Csv -LiteralPath (Join-Path $DataDir "missing-images.csv"))

Assert-Equal $products.Count 275 "cardCount"
Assert-Equal $variants.Count 275 "variantCount"
Assert-Equal $images.Count 275 "imageRecords"
Assert-Equal $missingImages.Count 6 "missingImageCount"
Assert-Equal (@($products.product_key | Sort-Object -Unique).Count) 275 "unique product_key count"
Assert-Equal (@($variants.sku | Sort-Object -Unique).Count) 275 "unique SKU count"

$missingImageKeys = @($missingImages.image_key | Sort-Object -Unique)
$missingImageKeySet = @{}
foreach ($key in $missingImageKeys) { $missingImageKeySet[$key] = $true }

foreach ($image in $images) {
  if ($missingImageKeySet.ContainsKey($image.image_key)) {
    $image.r2_object_key = ""
    $image.mapping_status = "missing"
    $image.quality_status = "MISSING"
  } else {
    $image.r2_object_key = "catalog/hung-phat/v2/products/$($image.image_key).webp"
    $image.mapping_status = "exact"
  }
}

$images | Export-Csv -LiteralPath (Join-Path $DataDir "product-images.csv") -NoTypeInformation -Encoding UTF8

$optionsByProduct = @{}
foreach ($option in $options) {
  if (-not $optionsByProduct.ContainsKey($option.product_key)) {
    $optionsByProduct[$option.product_key] = @{}
  }
  $groups = $optionsByProduct[$option.product_key]
  if (-not $groups.ContainsKey($option.option_group)) {
    $groups[$option.option_group] = New-Object System.Collections.ArrayList
  }
  if (-not $groups[$option.option_group].Contains($option.option_value)) {
    [void]$groups[$option.option_group].Add($option.option_value)
  }
}

$variantsByProduct = @{}
foreach ($variant in $variants) {
  if (-not $variantsByProduct.ContainsKey($variant.product_key)) {
    $variantsByProduct[$variant.product_key] = New-Object System.Collections.ArrayList
  }
  $parsedOptions = @{}
  if ($variant.options_json) {
    $parsed = $variant.options_json | ConvertFrom-Json
    foreach ($property in $parsed.PSObject.Properties) {
      $parsedOptions[$property.Name] = $property.Value
    }
  }
  [void]$variantsByProduct[$variant.product_key].Add([ordered]@{
    variantKey = $variant.variant_key
    sku = $variant.sku
    options = $parsedOptions
    price = [int64]$variant.price
    imageKey = $variant.image_key
  })
}

$imageByProduct = @{}
foreach ($image in $images) { $imageByProduct[$image.product_key] = $image }

$productManifest = New-Object System.Collections.ArrayList
foreach ($product in $products) {
  $image = $imageByProduct[$product.product_key]
  $available = -not $missingImageKeySet.ContainsKey($image.image_key)
  $optionGroups = New-Object System.Collections.ArrayList
  if ($optionsByProduct.ContainsKey($product.product_key)) {
    foreach ($groupName in $optionsByProduct[$product.product_key].Keys) {
      [void]$optionGroups.Add([ordered]@{
        name = $groupName
        values = @($optionsByProduct[$product.product_key][$groupName])
      })
    }
  }

  [void]$productManifest.Add([ordered]@{
    productKey = $product.product_key
    name = $product.name
    brand = $product.brand
    category = $product.category
    priceFrom = [int64]$product.price_from
    status = $product.status
    imageKey = $product.image_key
    image = [ordered]@{
      status = $(if ($available) { "available" } else { "missing" })
      objectKey = $(if ($available) { $image.r2_object_key } else { $null })
      qualityStatus = $image.quality_status
    }
    optionGroups = @($optionGroups)
    variants = @($variantsByProduct[$product.product_key])
  })
}

$imageManifest = New-Object System.Collections.ArrayList
foreach ($image in $images) {
  if ($missingImageKeySet.ContainsKey($image.image_key)) { continue }
  [void]$imageManifest.Add([ordered]@{
    productKey = $image.product_key
    imageKey = $image.image_key
    sourceFilename = $image.filename
    objectKey = $image.r2_object_key
    role = $image.image_role
    qualityStatus = $image.quality_status
    mappingStatus = "exact"
  })
}

Assert-Equal $productManifest.Count 275 "products manifest count"
Assert-Equal $imageManifest.Count 269 "mapped image manifest count"

$catalogVersion = [ordered]@{
  catalogVersion = "hung-phat-v2"
  status = "staging"
  sourceRows = 276
  excludedRows = 1
  cardCount = 275
  variantCount = 275
  mappedImageCount = 269
  missingImageCount = 6
  duplicateProductKey = 0
  duplicateSku = 0
  r2Prefixes = [ordered]@{
    products = "catalog/hung-phat/v2/products/"
    manifests = "catalog/hung-phat/v2/manifests/"
  }
  missingImageKeys = $missingImageKeys
  excludedLocalImageKeys = @("bgkq-0039")
  phase2MappingStatus = "PASS"
}

Write-Utf8Json -Path (Join-Path $ManifestDir "products.json") -Value @($productManifest) -Depth 30
Write-Utf8Json -Path (Join-Path $ManifestDir "product-images.json") -Value @($imageManifest) -Depth 10
Write-Utf8Json -Path (Join-Path $ManifestDir "catalog-version.json") -Value $catalogVersion -Depth 10

$summary = [ordered]@{
  catalogVersion = "hung-phat-v2"
  sourceRows = 276
  excludedRows = 1
  cardCount = 275
  variantCount = 275
  productOptionRows = $options.Count
  imageRecords = 275
  mappedImageCount = 269
  missingImageCount = 6
  duplicateProductKey = 0
  duplicateSku = 0
  phase1Status = "PASS"
  phase2MappingStatus = "PASS"
  r2Prefixes = $catalogVersion.r2Prefixes
}
Write-Utf8Json -Path (Join-Path $DataDir "catalog-summary.json") -Value $summary -Depth 10

$stageRoot = Join-Path $env:TEMP "bepsi-hung-phat-v2-r2-stage"
$stageProducts = Join-Path $stageRoot "products"
Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageProducts | Out-Null

if (-not (Test-Path -LiteralPath $SourceImages)) {
  throw "Source image directory does not exist: $SourceImages"
}

foreach ($image in $imageManifest) {
  $source = Join-Path $SourceImages "$($image.imageKey).webp"
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Mapped image file is missing: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $stageProducts "$($image.imageKey).webp") -Force
}

$stageCount = @(Get-ChildItem -LiteralPath $stageProducts -File -Filter "*.webp").Count
Assert-Equal $stageCount 269 "R2 staging image count"

if ($Publish) {
  if (-not (Get-Command rclone -ErrorAction SilentlyContinue)) {
    throw "rclone is not installed or not available in PATH."
  }

  $remoteName = "$RcloneRemote`:"
  if (-not ((rclone listremotes) -contains $remoteName)) {
    throw "rclone remote '$remoteName' is not configured. Run: rclone config"
  }

  $remoteBase = "$RcloneRemote`:$Bucket/catalog/hung-phat/v2"
  rclone copy $stageProducts "$remoteBase/products" --include "*.webp" --immutable --progress
  rclone copy $ManifestDir "$remoteBase/manifests" --include "*.json" --immutable --progress

  $remoteProductCount = [int](rclone lsf "$remoteBase/products" --files-only --include "*.webp" | Measure-Object -Line).Lines
  Assert-Equal $remoteProductCount 269 "remote R2 product image count"

  rclone check $stageProducts "$remoteBase/products" --one-way --size-only
  Write-Host "PASS: uploaded and verified 269 images and 3 manifests." -ForegroundColor Green
  Write-Host "R2 products:  $remoteBase/products"
  Write-Host "R2 manifests: $remoteBase/manifests"
} else {
  Write-Host "PASS: Phase 2 mapping generated locally." -ForegroundColor Green
  Write-Host "Mapped images: 269"
  Write-Host "Missing images: 6"
  Write-Host "Staging: $stageProducts"
  Write-Host "Run again with -Publish to upload safely to R2."
}

Write-Host "Legacy R2 prefixes were not modified. No sync/delete command was used."
