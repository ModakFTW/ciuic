# scripts/refresh_and_retrain.ps1
# Retrain RiskScope risk classification model on fresh completed daily closes.
# Refuses to run if engine/ml/models/_synthetic_backup is missing.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

$backupDir = Join-Path $repoRoot "engine\ml\models\_synthetic_backup"
if (-not (Test-Path $backupDir)) {
    Write-Error "Refusing to run: synthetic backup folder '$backupDir' is missing."
    exit 1
}

Write-Host "=== Step 1: Building dataset from cache with refresh ==="
python -m engine.ml.build_dataset --source cache --refresh
if ($LASTEXITCODE -ne 0) {
    Write-Error "build_dataset failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "=== Step 2: Training risk model with cache and refresh ==="
python -m engine.ml.train --source cache --refresh
if ($LASTEXITCODE -ne 0) {
    Write-Error "train failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "=== Retraining complete ==="
