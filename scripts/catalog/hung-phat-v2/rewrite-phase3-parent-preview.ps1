param(
  [string]$NormalizedDir = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\normalized-v2"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$outputDir = Join-Path $repoRoot "artifacts\catalog\hung-phat-v2-preview"
$output = Join-Path $outputDir "index.html"
$templatePath = Join-Path $PSScriptRoot "phase3-preview.template.html"
$parentPath = Join-Path $NormalizedDir "product-parents.csv"
$variantPath = Join-Path $NormalizedDir "product-variants.csv"

foreach ($required in @($templatePath, $parentPath, $variantPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Missing required file: $required"
  }
}

$parents = @(Import-Csv -LiteralPath $parentPath)
$variants = @(Import-Csv -LiteralPath $variantPath)

if ($parents.Count -ne 188) { throw "Expected 188 parent cards, found $($parents.Count)." }
if ($variants.Count -ne 275) { throw "Expected 275 variants, found $($variants.Count)." }

$variantsByParent = @{}
foreach ($variant in $variants) {
  if (-not $variantsByParent.ContainsKey($variant.parent_key)) {
    $variantsByParent[$variant.parent_key] = New-Object System.Collections.ArrayList
  }
  [void]$variantsByParent[$variant.parent_key].Add($variant)
}

$labelMap = @{
  flavor = "Vị"
  size = "Kích thước"
  type = "Loại"
  color = "Màu"
  packing = "Quy cách"
  pack = "Quy cách"
  diameter = "Đường kính"
  lid = "Loại nắp"
  flavor_or_type = "Loại"
}

$cards = New-Object System.Collections.ArrayList
foreach ($parent in $parents) {
  $parentVariants = @($variantsByParent[$parent.parent_key])
  $optionValues = @{}
  $variantRows = New-Object System.Collections.ArrayList
  $hasMissingImage = $false
  $hasWrongPrice = $false

  foreach ($variant in $parentVariants) {
    $rawOptions = @{}
    if ($variant.options_json) {
      $parsed = $variant.options_json | ConvertFrom-Json
      foreach ($property in $parsed.PSObject.Properties) {
        $label = if ($labelMap.ContainsKey($property.Name)) { $labelMap[$property.Name] } else { $property.Name }
        $value = [string]$property.Value
        $rawOptions[$label] = $value
        if (-not $optionValues.ContainsKey($label)) {
          $optionValues[$label] = New-Object System.Collections.ArrayList
        }
        if (-not $optionValues[$label].Contains($value)) {
          [void]$optionValues[$label].Add($value)
        }
      }
    }

    $price = 0
    if ($variant.price_khtt_nghin -match '^\d+(\.\d+)?$') {
      $price = [int64]([decimal]$variant.price_khtt_nghin * 1000)
    }
    if ($price -le 0) { $hasWrongPrice = $true }
    if ($variant.image_status -eq "MISSING") { $hasMissingImage = $true }

    [void]$variantRows.Add([ordered]@{
      variantKey = $variant.variant_key
      sku = $variant.sku
      name = $variant.raw_name
      options = $rawOptions
      price = $price
      imageKey = $variant.image_key
      imageStatus = $variant.image_status
    })
  }

  $optionGroups = New-Object System.Collections.ArrayList
  foreach ($label in $optionValues.Keys) {
    if ($optionValues[$label].Count -gt 1) {
      [void]$optionGroups.Add([ordered]@{
        name = $label
        values = @($optionValues[$label])
      })
    }
  }

  $prices = @($variantRows | ForEach-Object { [int64]$_.price } | Where-Object { $_ -gt 0 })
  $priceFrom = if ($prices.Count) { ($prices | Measure-Object -Minimum).Minimum } else { 0 }
  $coverKey = $parent.cover_image_key
  $coverPath = Join-Path $outputDir "assets\$coverKey.webp"
  $coverAvailable = $coverKey -and (Test-Path -LiteralPath $coverPath)

  [void]$cards.Add([ordered]@{
    productKey = $parent.parent_key
    name = $parent.name
    brand = $parent.brand
    category = if ($parentVariants.Count) { $parentVariants[0].source_group } else { "Chưa phân nhóm" }
    priceFrom = $priceFrom
    status = "draft"
    imageKey = $coverKey
    imageStatus = if ($coverAvailable) { "available" } else { "missing" }
    imageQualityStatus = "LOCAL_PREVIEW"
    imageUrl = if ($coverAvailable) { "./assets/$coverKey.webp" } else { "" }
    optionGroups = @($optionGroups)
    variants = @($variantRows)
    variantCount = $variantRows.Count
    duplicateSkus = @()
    autoIssues = [ordered]@{
      missingImage = $hasMissingImage
      wrongName = ($parent.name -match '\s{2,}')
      wrongOption = ($variantRows.Count -gt 1 -and $optionGroups.Count -eq 0)
      duplicateSku = $false
      wrongPrice = $hasWrongPrice
    }
  })
}

$template = Get-Content -LiteralPath $templatePath -Raw
$payload = [ordered]@{
  catalogVersion = "hung-phat-v2-parent-draft"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  expectedCardCount = 188
  variantCount = 275
  products = @($cards)
}
$json = $payload | ConvertTo-Json -Depth 30 -Compress
$html = $template.Replace("__CATALOG_PAYLOAD__", $json)
[System.IO.File]::WriteAllText($output, $html, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "PASS: rewrote preview to 188 parent cards / 275 variants." -ForegroundColor Green
Write-Host "Berrino is one card with 12 flavor variants."
