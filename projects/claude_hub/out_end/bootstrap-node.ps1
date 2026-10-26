# Windows PowerShell 5.1: UTF-8 BOM is required for bilingual console text.
$ErrorActionPreference = 'Stop'
Write-Host '[node] 正在安装 Node.js，请勿关闭窗口。预计约需 10 分钟（取决于网络速度）。'
Write-Host '[node] Installing Node.js. Please do not close this window. Allow about 10 minutes (depending on your connection).'
$job = $null
$exitCode = 1
try {
    $job = Start-Job -ArgumentList $PSScriptRoot, $env:NODE_URL, $env:NODE_MIRROR, $env:NODE_PKG -ScriptBlock {
        param($directory, $official, $mirror, $package)
        $ErrorActionPreference = 'Stop'
        $ProgressPreference = 'SilentlyContinue'
        Set-Location -LiteralPath $directory
        Write-Output '[node] 下载 / downloading ...'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $official -OutFile 'node.zip' -TimeoutSec 60
        } catch {
            Write-Output '[node] 官方源失败，切换镜像 / official source failed, trying mirror ...'
            Invoke-WebRequest -UseBasicParsing -Uri $mirror -OutFile 'node.zip' -TimeoutSec 600
        }
        Write-Output '[node] 解压 / extracting ...'
        if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package -Recurse -Force }
        Expand-Archive -LiteralPath 'node.zip' -DestinationPath '.' -Force
        if (!(Test-Path -LiteralPath "$package/node.exe")) { throw 'Node.js missing after extraction' }
        if (Test-Path -LiteralPath 'node') { Remove-Item -LiteralPath 'node' -Recurse -Force }
        Rename-Item -LiteralPath $package -NewName 'node'
        Remove-Item -LiteralPath 'node.zip' -Force
    }
    $frame = 0
    while ($job.State -in @('NotStarted', 'Running')) {
        Write-Host ("`r[node] 正在安装 / Installing Node.js {0,-3}" -f ('.' * ($frame % 3 + 1))) -NoNewline
        Start-Sleep -Milliseconds 500
        if ($job.HasMoreData) {
            Write-Host ''
            Receive-Job -Job $job -ErrorAction Stop
        }
        $frame++
    }
    Write-Host ''
    Receive-Job -Job $job -ErrorAction Stop
    if ($job.State -ne 'Completed') { throw 'Node.js installation did not complete' }
    if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node/node.exe'))) { throw 'Node.js missing after installation' }
    Write-Host '[node] 安装完成 / installation complete'
    $exitCode = 0
} catch {
    Write-Host ''
    Write-Host "[node] 安装失败 / installation failed: $_"
} finally {
    if ($null -ne $job) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
}
exit $exitCode
