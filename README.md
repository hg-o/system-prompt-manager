# System Prompt Manager · 로그인

Google Apps Script 웹 앱 하나로 동작합니다. 웹 앱이 로그인 화면을 띄우고, 신청 정보와 계정은 Google 시트에 저장합니다.
회사 Workspace 정책상 웹 앱은 webtoon.com 계정으로 Google에 로그인한 사람만 열 수 있습니다.

## 파일 (`apps-script/`)

| 파일 | 설명 |
| --- | --- |
| `Code.gs` | 화면을 띄우고(`doGet`), 권한 신청과 로그인을 처리(`api`) |
| `Index.html` | 로그인 화면, ID 등록 및 권한 요청 모달, 신청 완료 안내, 로그인 후 임시 화면 |
| `Stylesheet.html` | 스타일 |
| `JavaScript.html` | 화면 동작. `google.script.run`으로 서버 함수 `api`를 부름 |

## 배포

1. [Apps Script 프로젝트](https://script.google.com/home/projects/1DFa0C8MxAmG00d-wptIR3CHuVRO7DgsTW8SDuqdZ5ru1N2VfDb383lkS/edit)를 엽니다.
2. `Code.gs` 내용을 이 저장소의 `apps-script/Code.gs`로 바꿉니다.
3. 파일 옆 **+ → HTML**로 `Index`, `Stylesheet`, `JavaScript` 세 파일을 만들고(이름에 `.html`은 붙이지 않음) 같은 이름의 파일 내용을 붙여 넣은 뒤 저장합니다.
4. **배포 → 배포 관리 → 수정(연필) → 버전: 새 버전 → 배포**를 누릅니다. 웹 앱 URL은 그대로 유지됩니다.
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **webtoon.com 내 모든 사용자**
5. 웹 앱 URL을 브라우저로 열면 로그인 화면이 나옵니다.

> 코드를 고친 뒤에는 4번처럼 **새 버전**으로 다시 배포해야 반영됩니다.

## 시트 구조

첫 신청 때 1행 헤더가 자동으로 생깁니다. 열 순서는 바꿔도 헤더 이름으로 찾습니다.

| name | id | password_hash | salt | role | activate | requested_at |
| --- | --- | --- | --- | --- | --- | --- |

- 아이디는 `@webtoon.com` 이메일만 받습니다.
- 비밀번호는 원문이 아니라 salt를 붙인 SHA-256 해시로 저장됩니다.
- `activate`는 체크박스(FALSE)로 들어갑니다. 관리자가 **TRUE**로 바꾸면 로그인할 수 있습니다.
- 승인 전 로그인하면 "관리자 승인 대기 중입니다." 안내가 나옵니다.
- 로그인 상태는 페이지 안에서만 유지됩니다. 새로고침하면 다시 로그인해야 합니다.
