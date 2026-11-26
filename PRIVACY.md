# 개인정보처리방침 (Privacy Policy)

Convenient BOJ(이하 "확장 프로그램")는 백준 온라인 저지(acmicpc.net)에서 코드 작성·실행·제출을 편하게 해 주는 **비공식** 크롬 확장 프로그램입니다. 백준·스타트링크·데이원컴퍼니와 관련이 없습니다.

마지막 수정: 2026-11-26

## 요약
- 개발자는 **어떤 개인정보도 수집하지 않습니다.** 개발자가 운영하는 서버가 없고, 사용 통계·광고·추적 코드도 없습니다.
- 작성한 코드와 설정은 **내 브라우저 안**(`chrome.storage`)에만 저장됩니다.
- 코드를 **실행**할 때, 내 PC 실행 도우미가 없으면 코드와 입력이 공개 온라인 컴파일러 **Wandbox**(wandbox.org)로 보내집니다.

## 저장하는 정보 (내 브라우저 안)
| 정보 | 위치 | 용도 |
| --- | --- | --- |
| 문제별·언어별 작성 중인 코드, 커서 위치 | `chrome.storage.local` | 다시 열었을 때 이어서 작성 |
| 나만의 테스트케이스, 풀이 타이머 | `chrome.storage.local` | 문제별 기록 |
| 백준 언어 목록, 실행 서버 컴파일러 목록 | `chrome.storage.local` | 화면 표시·실행 |
| 제출 중인 코드(제출 탭에 채워 넣을 때까지) | `chrome.storage.local` | 제출 페이지에 코드 채우기 |
| 설정(테마, 들여쓰기, 기본 코드 등) | `chrome.storage.sync` | 설정 유지 (크롬 동기화를 켰다면 내 구글 계정으로 동기화) |

이 정보는 개발자에게 전송되지 않습니다. 확장 프로그램을 삭제하면 함께 지워집니다.

## 외부로 보내는 정보
- **Wandbox (wandbox.org)**: [실행]을 눌렀을 때, 내 PC 실행 도우미가 설치되어 있지 않거나 해당 언어가 없으면 **코드와 입력(예제·테스트케이스)** 을 Wandbox에 보내 컴파일·실행 결과를 받습니다. 그 밖의 정보(아이디, 브라우저 정보 등)는 보내지 않습니다. Wandbox의 정보 처리는 Wandbox의 정책을 따릅니다.
- **백준 (acmicpc.net)**: [제출]을 누르면 백준의 공식 제출 페이지를 열어 코드와 언어를 채워 둡니다. 실제 제출은 사용자가 백준의 [제출] 버튼을 직접 눌러야 합니다. 확장 프로그램은 백준 비밀번호·로그인 정보를 읽거나 저장하지 않습니다. 화면에 표시된 내 아이디는 "내 제출 기록" 링크를 만드는 데만 씁니다.

## 내 PC 실행 도우미 (선택)
Windows에서 따로 설치하는 도우미(`cboj_host.py`)는 코드를 **내 PC에서** 컴파일·실행합니다. 네트워크를 쓰지 않으며, 실행에 쓴 임시 파일은 끝나면 지웁니다. 크롬의 네이티브 메시징으로 이 확장 프로그램하고만 통신합니다.

## 권한을 쓰는 이유
| 권한 | 이유 |
| --- | --- |
| `storage` | 작성 중인 코드·설정 저장 |
| `nativeMessaging` | 내 PC 실행 도우미와 통신 (도우미를 설치한 경우에만 사용) |
| `https://wandbox.org/*` | 도우미가 없을 때 Wandbox로 코드 실행 |
| `acmicpc.net` 의 문제·제출·채점 현황 페이지 | 분할 화면 표시, 제출 페이지에 코드 채우기, 채점 결과 읽기 |

## 문의
[GitHub Issues](https://github.com/gaudium1257/Convenient_BOJ/issues)

---

## English summary
Convenient BOJ is an **unofficial** Chrome extension for Baekjoon Online Judge (acmicpc.net). It is not affiliated with Baekjoon, Startlink, or Day1 Company.

- The developer **collects no personal data**. There is no developer server, analytics, ads, or tracking.
- Your code and settings are stored **only in your browser** (`chrome.storage`; settings sync with your Google account if Chrome sync is on).
- When you press **Run** and the optional local helper is not installed (or lacks that language), your **code and test input** are sent to the public online compiler **Wandbox** (wandbox.org) to compile and run it. Nothing else is sent.
- When you press **Submit**, the extension opens BOJ's official submit page and fills in your code; **you** press BOJ's submit button. The extension never reads or stores your BOJ password or login data.
- The optional Windows helper runs code locally, uses no network, and deletes its temporary files.
- Contact: [GitHub Issues](https://github.com/gaudium1257/Convenient_BOJ/issues)
