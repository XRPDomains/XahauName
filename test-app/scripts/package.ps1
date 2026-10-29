$ErrorActionPreference = 'Stop'
$taskAppRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $taskAppRoot
try {
    node (Join-Path $PSScriptRoot 'build.mjs') --base=/xahauname/
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
    $taskReleasePath = Join-Path $taskAppRoot 'release'
    New-Item -ItemType Directory -Path $taskReleasePath -Force | Out-Null
    $taskUploadPath = [IO.Path]::GetFullPath((Join-Path $taskReleasePath 'xahauname'))
    $taskExpectedPath = [IO.Path]::GetFullPath((Join-Path $taskAppRoot 'release/xahauname'))
    if ($taskUploadPath -ne $taskExpectedPath -or -not $taskUploadPath.StartsWith($taskAppRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Invalid FTP output directory' }
    if (Test-Path -LiteralPath $taskUploadPath) { Remove-Item -LiteralPath $taskUploadPath -Recurse -Force }
    New-Item -ItemType Directory -Path $taskUploadPath -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $taskAppRoot 'dist') -Force | Copy-Item -Destination $taskUploadPath -Recurse -Force
    Write-Output "Ready to upload folder: $taskUploadPath"
    Write-Output 'Public paths: /xahauname/ and /xahauname/docs/'
} finally {
    Pop-Location
}
