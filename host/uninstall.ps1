# Convenient BOJ - 내 PC 실행 도우미 제거
# (Python, gcc 같은 설치한 프로그램은 지우지 않아요)
$HostName = 'com.convenient_boj.runner'
$Dest = Join-Path $env:LOCALAPPDATA 'ConvenientBOJ'
foreach ($base in 'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
                  'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts',
                  'HKCU:\Software\Naver\Naver Whale\NativeMessagingHosts') {
  Remove-Item -Path (Join-Path $base $HostName) -Recurse -Force -ErrorAction SilentlyContinue
}
Remove-Item -Path $Dest -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '도우미를 제거했어요. 이제 코드는 Wandbox(온라인)에서 실행돼요.' -ForegroundColor Green
Read-Host '엔터를 누르면 창이 닫혀요' | Out-Null
