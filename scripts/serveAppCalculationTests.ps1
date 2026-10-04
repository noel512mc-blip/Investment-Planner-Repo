$ErrorActionPreference = 'Stop'
$scriptDirectory = $PSScriptRoot
if (-not $scriptDirectory) { $scriptDirectory = Join-Path (Get-Location).Path 'scripts' }
$root = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory '..'))
$rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8765)

try {
  $listener.Start()
  Write-Host 'Serving Milestone test files at http://127.0.0.1:8765/'
  Write-Host 'Calculation checks: http://127.0.0.1:8765/tests/appCalculation.test.html'
  Write-Host 'Retirement checks:  http://127.0.0.1:8765/tests/retirementCalculation.test.html'
  Write-Host 'Press Ctrl+C to stop.'

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $requestLine = $reader.ReadLine()
      if (-not $requestLine) { continue }
      while (($headerLine = $reader.ReadLine()) -ne '') { }

      $requestPath = ($requestLine -split ' ')[1].Split('?')[0]
      $relativePath = [System.Uri]::UnescapeDataString($requestPath.TrimStart('/'))
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      $isInsideRoot = $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)

      if ($isInsideRoot -and (Test-Path $filePath -PathType Leaf)) {
        $body = [System.IO.File]::ReadAllBytes($filePath)
        $status = '200 OK'
        $contentType = switch ([System.IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
          '.html' { 'text/html; charset=utf-8' }
          '.js'   { 'text/javascript; charset=utf-8' }
          '.css'  { 'text/css; charset=utf-8' }
          '.svg'  { 'image/svg+xml' }
          default { 'application/octet-stream' }
        }
      } else {
        $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $status = '404 Not Found'
        $contentType = 'text/plain; charset=utf-8'
      }

      $header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n")
      $stream.Write($header, 0, $header.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } finally {
      if ($reader) { $reader.Dispose() }
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}