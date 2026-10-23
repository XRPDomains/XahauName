$ErrorActionPreference = 'Stop'
$taskAppRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $taskAppRoot
try {
    node (Join-Path $PSScriptRoot 'build.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
    $taskReleasePath = Join-Path $taskAppRoot 'release'
    New-Item -ItemType Directory -Path $taskReleasePath -Force | Out-Null
    $taskArchivePath = Join-Path $taskReleasePath 'xahauname-testnet.zip'
    Compress-Archive -Path (Join-Path $taskAppRoot 'dist/*') -DestinationPath $taskArchivePath -Force
    $taskChecksum = (Get-FileHash -LiteralPath $taskArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$taskChecksum  xahauname-testnet.zip" | Set-Content -LiteralPath (Join-Path $taskReleasePath 'xahauname-testnet.zip.sha256')
    Write-Output "Ready to upload: $taskArchivePath"
    Write-Output "SHA256: $taskChecksum"
} finally {
    Pop-Location
}
