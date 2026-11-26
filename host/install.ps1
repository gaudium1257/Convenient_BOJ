# Convenient BOJ - 내 PC 실행 도우미 설치 (Windows, 관리자 권한 필요 없음)
#
# 하는 일
#   1. Python 확인 (없으면 winget으로 설치할지 물어봄)
#      PyPy3 확인 (없으면 winget으로 PyPy 3.11 설치할지 물어봄, PyPy3를 안 쓰면 건너뛰어도 됨)
#   2. C/C++ 컴파일러 gcc/g++ 확인 (없으면 winget으로 WinLibs 설치할지 물어봄)
#   3. Java(JDK) 확인 (없으면 winget으로 Temurin JDK 21 설치할지 물어봄, Java를 안 쓰면 건너뛰어도 됨)
#   4. Rust(rustc) 확인 (없으면 winget으로 Rust GNU 판 설치할지 물어봄, Rust를 안 쓰면 건너뛰어도 됨)
#   5. 도우미를 %LOCALAPPDATA%\ConvenientBOJ 에 복사하고 크롬·엣지·웨일에 등록
#
# 실행: install.bat 더블클릭, 또는
#   powershell -ExecutionPolicy Bypass -File install.ps1 [-Yes]
param(
  [switch]$Yes  # 모든 질문에 '예'로 답하기
)

$ErrorActionPreference = 'Stop'
$HostName = 'com.convenient_boj.runner'
# 도우미를 쓸 수 있는 확장 ID 목록
#  - mabfdomb… : 저장소(ZIP)에서 개발자 모드로 설치한 버전 (manifest.json의 key로 고정)
#  - pljhagfd… : 크롬 웹 스토어 버전 (스토어가 준 ID)
$ExtensionIds = @(
  'mabfdombglhmfnjklbnoglebinejifdi',
  'pljhagfdkkdpgjmkkdpalhdihpopjgem'
)
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA 'ConvenientBOJ'

function Write-Step($text) { Write-Host "`n▶ $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "  ✔ $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "  ! $text" -ForegroundColor Yellow }

function Confirm-Action($question) {
  if ($Yes) { return $true }
  $answer = Read-Host "  $question (Y/n)"
  return ($answer -eq '' -or $answer -match '^[yYㅛ]')
}

function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:LOCALAPPDATA\Microsoft\WinGet\Links"
}

function Find-Python {
  foreach ($name in 'python', 'python3') {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    # WindowsApps 안의 python.exe는 스토어로 안내하는 가짜라서 건너뛴다
    if ($cmd -and $cmd.Source -notlike '*\WindowsApps\*') { return $cmd.Source }
  }
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    $exe = & $py.Source -3 -c 'import sys; print(sys.executable)' 2>$null
    if ($LASTEXITCODE -eq 0 -and $exe) { return $exe.Trim() }
  }
  foreach ($dir in Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Directory -ErrorAction SilentlyContinue) {
    $exe = Join-Path $dir.FullName 'python.exe'
    if (Test-Path $exe) { return $exe }
  }
  return $null
}

function Find-Gpp {
  $cmd = Get-Command g++ -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @("$env:LOCALAPPDATA\Microsoft\WinGet\Links\g++.exe", 'C:\msys64\ucrt64\bin\g++.exe', 'C:\msys64\mingw64\bin\g++.exe')
  $candidates += Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\BrechtSanders.WinLibs*\mingw64\bin\g++.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Find-Javac {
  $cmd = Get-Command javac -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += Join-Path $env:JAVA_HOME 'bin\javac.exe' }
  foreach ($base in 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft', 'C:\Program Files\Java', 'C:\Program Files\Zulu') {
    $candidates += Get-ChildItem "$base\*jdk*\bin\javac.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Find-Rustc {
  $cmd = Get-Command rustc -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $candidates = @("$env:USERPROFILE\.cargo\bin\rustc.exe")
  foreach ($base in 'C:\Program Files', "$env:LOCALAPPDATA\Programs") {
    $candidates += Get-ChildItem "$base\Rust*\bin\rustc.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  }
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Find-PyPy {
  foreach ($name in 'pypy3', 'pypy') {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  $candidates = @("$env:LOCALAPPDATA\Microsoft\WinGet\Links\pypy3.exe")
  $candidates += Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\PyPy.PyPy.3*\*\pypy3.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  $candidates += Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\PyPy.PyPy.3*\pypy3.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  $candidates += Get-ChildItem 'C:\pypy3*\pypy3.exe', "$env:LOCALAPPDATA\Programs\pypy3*\pypy3.exe" -ErrorAction SilentlyContinue | ForEach-Object FullName
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

function Install-WithWinget($id, $label) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Warn "winget이 없어서 $label 을(를) 자동으로 설치할 수 없어요. 직접 설치한 뒤 다시 실행해 주세요."
    return $false
  }
  Write-Host "  $label 설치 중… (몇 분 걸릴 수 있어요)"
  & winget install -e --id $id --scope user --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) {
    # 일부 패키지는 사용자 범위 설치를 지원하지 않아서 범위 없이 한 번 더 시도
    & winget install -e --id $id --accept-package-agreements --accept-source-agreements --silent
  }
  Update-PathFromRegistry
  return $true
}

Write-Host 'Convenient BOJ - 내 PC 실행 도우미 설치' -ForegroundColor White

# 1) Python
Write-Step 'Python 확인'
$python = Find-Python
if (-not $python) {
  Write-Warn 'Python이 없어요. 도우미가 Python으로 동작하고, Python 코드 실행에도 필요해요.'
  if (Confirm-Action 'winget으로 Python 3.13을 설치할까요?') {
    Install-WithWinget 'Python.Python.3.13' 'Python 3.13' | Out-Null
    $python = Find-Python
  }
}
if (-not $python) {
  Write-Host "`nPython을 찾지 못해 설치를 멈춰요. https://www.python.org 에서 설치한 뒤 다시 실행해 주세요." -ForegroundColor Red
  exit 1
}
Write-Ok "Python: $python"

# 1-2) PyPy3 (백준 PyPy3로 제출할 때 내 PC에서도 PyPy로 실행)
Write-Step 'PyPy3 확인'
$pypy = Find-PyPy
if (-not $pypy) {
  Write-Warn 'PyPy3가 없어요. 언어를 PyPy3로 골랐을 때 내 PC에서 PyPy로 실행하려면 필요해요. (Python 3만 쓰면 없어도 돼요)'
  if (Confirm-Action 'winget으로 PyPy 3.11(약 100MB)을 설치할까요?') {
    Install-WithWinget 'PyPy.PyPy.3.11' 'PyPy 3.11' | Out-Null
    $pypy = Find-PyPy
  }
}
if ($pypy) { Write-Ok "PyPy3: $pypy" } else { Write-Warn 'PyPy3 없이 계속해요. PyPy3는 지금처럼 Wandbox(온라인)에서 실행돼요.' }

# 2) gcc / g++
Write-Step 'C/C++ 컴파일러(gcc/g++) 확인'
$gpp = Find-Gpp
if (-not $gpp) {
  Write-Warn 'gcc/g++가 없어요. C/C++ 코드를 내 PC에서 실행하려면 필요해요. (Python만 쓰면 없어도 돼요)'
  if (Confirm-Action 'winget으로 WinLibs(gcc/g++, 약 250MB)를 설치할까요?') {
    Install-WithWinget 'BrechtSanders.WinLibs.POSIX.UCRT' 'WinLibs (gcc/g++)' | Out-Null
    $gpp = Find-Gpp
  }
}
if ($gpp) { Write-Ok "g++: $gpp" } else { Write-Warn 'gcc/g++ 없이 계속해요. C/C++은 지금처럼 Wandbox(온라인)에서 실행돼요.' }

# 3) Java (JDK)
Write-Step 'Java(JDK) 확인'
$javac = Find-Javac
if (-not $javac) {
  Write-Warn 'Java(JDK)가 없어요. Java 코드를 내 PC에서 실행하려면 필요해요. (Java를 안 쓰면 없어도 돼요)'
  if (Confirm-Action 'winget으로 Temurin JDK 21(약 200MB)을 설치할까요?') {
    Install-WithWinget 'EclipseAdoptium.Temurin.21.JDK' 'Temurin JDK 21' | Out-Null
    $javac = Find-Javac
  }
}
if ($javac) { Write-Ok "javac: $javac" } else { Write-Warn 'JDK 없이 계속해요. Java는 지금처럼 Wandbox(온라인)에서 실행돼요.' }

# 4) Rust
Write-Step 'Rust(rustc) 확인'
$rustc = Find-Rustc
if (-not $rustc) {
  Write-Warn 'Rust가 없어요. Rust 코드를 내 PC에서 실행하려면 필요해요. (Rust를 안 쓰면 없어도 돼요)'
  # GNU 판은 링커가 함께 들어 있어 Visual Studio 없이 바로 컴파일된다
  if (Confirm-Action 'winget으로 Rust(GNU 판, 약 300MB)를 설치할까요?') {
    Install-WithWinget 'Rustlang.Rust.GNU' 'Rust (GNU)' | Out-Null
    $rustc = Find-Rustc
  }
}
if ($rustc) { Write-Ok "rustc: $rustc" } else { Write-Warn 'Rust 없이 계속해요. Rust는 지금처럼 Wandbox(온라인)에서 실행돼요.' }

# 5) 도우미 복사·등록
Write-Step '도우미 설치'
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item (Join-Path $Here 'cboj_host.py') $Dest -Force
$bat = Join-Path $Dest 'cboj_host.bat'
$batText = "@echo off`r`n`"$python`" -u `"%~dp0cboj_host.py`" %*`r`n"
[IO.File]::WriteAllText($bat, $batText, [Text.Encoding]::Default)

$manifestPath = Join-Path $Dest "$HostName.json"
$manifest = [ordered]@{
  name            = $HostName
  description     = 'Convenient BOJ local runner'
  path            = $bat
  type            = 'stdio'
  allowed_origins = @($ExtensionIds | ForEach-Object { "chrome-extension://$_/" })
} | ConvertTo-Json
[IO.File]::WriteAllText($manifestPath, $manifest, (New-Object Text.UTF8Encoding $false))

$browsers = [ordered]@{
  'Chrome'      = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
  'Edge'        = 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
  'Naver Whale' = 'HKCU:\Software\Naver\Naver Whale\NativeMessagingHosts'
}
foreach ($b in $browsers.GetEnumerator()) {
  $key = Join-Path $b.Value $HostName
  New-Item -Path $key -Force -Value $manifestPath | Out-Null
}
Write-Ok "설치 위치: $Dest"
Write-Ok '크롬·엣지·웨일에 등록했어요.'

Write-Host "`n완료! 백준 문제 탭을 새로고침하면 터미널이 '내 PC'에서 실행돼요." -ForegroundColor Green
if (-not $Yes) { Read-Host "`n엔터를 누르면 창이 닫혀요" | Out-Null }
