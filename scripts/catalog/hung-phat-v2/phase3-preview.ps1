param(
  [string]$SourceImages = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\preview\assets",
  [string]$NormalizedDir = "F:\1_A_Disk_D\khuong-binh\bep-si\image\bepsi-link-mapper\bepsi_link_mapper\catalog-v2\normalized-v2",
  [int]$Port = 4183
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$builder = Join-Path $PSScriptRoot "build-phase3-preview.mjs"
$parentRewriter = Join-Path $PSScriptRoot "rewrite-phase3-parent-preview.ps1"
$server = Join-Path $PSScriptRoot "serve-phase3-preview.mjs"
$output = Join-Path $repoRoot "artifacts\catalog\hung-phat-v2-preview\index.html"
$outputDir = Split-Path -Parent $output
$url = "http://127.0.0.1:$Port/"

foreach ($required in @($SourceImages, $NormalizedDir, $parentRewriter, $server)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required Phase 3 path does not exist: $required"
  }
}

function Test-PreviewServer {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "Preview catalog Hưng Phát v2"
  } catch {
    return $false
  }
}

Push-Location $repoRoot
try {
  & node $builder "--source-images=$SourceImages"
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 asset builder failed with exit code $LASTEXITCODE."
  }

  & $parentRewriter -NormalizedDir $NormalizedDir
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 3 parent preview rewrite failed with exit code $LASTEXITCODE."
  }

  if (-not (Test-Path -LiteralPath $output)) {
    throw "Preview output was not created: $output"
  }

  if (-not (Test-PreviewServer)) {
    $env:BEPSI_PREVIEW_ROOT = $outputDir
    $env:BEPSI_PREVIEW_PORT = [string]$Port
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $serverProcess = Start-Process `
      -FilePath $nodePath `
      -WorkingDirectory $PSScriptRoot `
      -ArgumentList "serve-phase3-preview.mjs" `
      -WindowStyle Hidden `
      -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
      Start-Sleep -Milliseconds 200
      if (Test-PreviewServer) {
        $ready = $true
        break
      }
      if ($serverProcess.HasExited) {
        break
      }
    }

    Remove-Item Env:BEPSI_PREVIEW_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:BEPSI_PREVIEW_PORT -ErrorAction SilentlyContinue

    if (-not $ready) {
      if (-not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
      }
      throw "Could not start Phase 3 preview server on $url"
    }

    Set-Content -LiteralPath (Join-Path $outputDir ".server.pid") -Value $serverProcess.Id -Encoding ASCII
  }

  Write-Host "PASS: Phase 3 parent-card popup preview generated." -ForegroundColor Green
  Write-Host "Preview URL: $url"
  Write-Host "Model: 188 parent cards / 275 sellable variants"
  Write-Host "Images: local assets served over localhost"
  Start-Process $url
} finally {
  Pop-Location
}
