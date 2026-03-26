# ============================================================
# 비주얼 가계부 - 로컬 개발 서버
# ============================================================
# 사용법: PowerShell에서 .\serve.ps1 실행
# 기본 포트: 8080 (이미 사용 중이면 자동으로 다음 포트 시도)
# 종료: Ctrl+C
# ============================================================

$port = 8080
$maxRetries = 10  # 포트 충돌 시 최대 10번까지 다른 포트 시도

# --- 사용 가능한 포트 찾기 ---
for ($i = 0; $i -lt $maxRetries; $i++) {
    $testPort = $port + $i
    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $testPort)
        $listener.Start()
        $listener.Stop()
        $port = $testPort
        break
    } catch {
        Write-Host "포트 $testPort 이(가) 사용 중입니다. 다음 포트를 시도합니다..." -ForegroundColor Yellow
        if ($i -eq ($maxRetries - 1)) {
            Write-Host "사용 가능한 포트를 찾을 수 없습니다." -ForegroundColor Red
            exit 1
        }
    }
}

# --- MIME 타입 매핑 ---
# 브라우저가 파일을 올바르게 해석하려면 Content-Type 헤더가 필요
$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
}

# --- HTTP 리스너 생성 및 시작 ---
$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$port/")

try {
    $http.Start()
} catch {
    Write-Host "서버 시작 실패: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  비주얼 가계부 서버가 실행 중입니다!" -ForegroundColor Green
Write-Host "  http://localhost:$port" -ForegroundColor Yellow
Write-Host "  종료하려면 Ctrl+C를 누르세요" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# --- 서버 루트 디렉토리 (이 스크립트가 위치한 폴더) ---
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- 요청 처리 루프 ---
try {
    while ($http.IsListening) {
        # 클라이언트 요청을 비동기로 대기
        $context = $http.GetContext()
        $request = $context.Request
        $response = $context.Response

        # 요청된 URL 경로를 로컬 파일 경로로 변환
        $localPath = $request.Url.LocalPath
        if ($localPath -eq '/') { $localPath = '/index.html' }

        $filePath = Join-Path $root ($localPath -replace '/', '\')

        $timestamp = Get-Date -Format "HH:mm:ss"

        if (Test-Path $filePath -PathType Leaf) {
            # 파일이 존재하면 읽어서 응답
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = $mimeTypes[$extension]
            if (-not $contentType) { $contentType = 'application/octet-stream' }

            $response.ContentType = $contentType
            $response.StatusCode = 200

            $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $fileBytes.Length
            $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)

            Write-Host "[$timestamp] 200 $localPath" -ForegroundColor Green
        } else {
            # 파일이 없으면 404 응답
            $response.StatusCode = 404
            $response.ContentType = 'text/plain; charset=utf-8'
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)

            Write-Host "[$timestamp] 404 $localPath" -ForegroundColor Red
        }

        $response.Close()
    }
} finally {
    $http.Stop()
    Write-Host "`n서버가 종료되었습니다." -ForegroundColor Yellow
}
