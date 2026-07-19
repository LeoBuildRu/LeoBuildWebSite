# Batch optimize PBR GLB models.
# For each base_basic_pbr.glb -> base_basic_pbr.opt.glb next to it.
# Uses gltf-transform optimize (draco + webp + dedup + prune).
# simplify disabled to avoid geometry damage on furniture.

$ErrorActionPreference = 'Continue'
$root = "application\static\models\glb"

$files = Get-ChildItem -Recurse -Path $root -Filter "base_basic_pbr.glb" -File |
         Where-Object { $_.Name -eq 'base_basic_pbr.glb' }

$total = $files.Count
$totalIn = 0L
$totalOut = 0L
$idx = 0

Write-Host "Found $total models" -ForegroundColor Cyan

foreach ($file in $files) {
    $idx++
    $inPath  = $file.FullName
    $outPath = Join-Path $file.DirectoryName "base_basic_pbr.opt.glb"
    $inSize  = $file.Length
    $totalIn += $inSize

    $inMB = [math]::Round($inSize / 1MB, 2)
    Write-Host "[$idx/$total] $($file.Directory.Name): $inMB MB ... " -NoNewline

    $output = & gltf-transform optimize $inPath $outPath --compress draco --texture-compress webp --simplify false 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outPath)) {
        Write-Host "ERROR" -ForegroundColor Red
        $output | Select-Object -Last 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkRed }
        continue
    }

    $outSize = (Get-Item $outPath).Length
    $totalOut += $outSize
    $outMB = [math]::Round($outSize / 1MB, 2)
    $ratio = [math]::Round($inSize / $outSize, 1)
    Write-Host "-> $outMB MB (x$ratio)" -ForegroundColor Green
}

Write-Host ""
Write-Host "===== TOTAL =====" -ForegroundColor Cyan
$totalInMB  = [math]::Round($totalIn / 1MB, 2)
$totalOutMB = [math]::Round($totalOut / 1MB, 2)
$totalRatio = if ($totalOut -gt 0) { [math]::Round($totalIn / $totalOut, 1) } else { 0 }
Write-Host "Before: $totalInMB MB"
Write-Host "After:  $totalOutMB MB"
Write-Host "Ratio:  x$totalRatio"
