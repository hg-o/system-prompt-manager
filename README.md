# byUs Story Builder · 로그인

정적 로그인 화면(`index.html`)과 Google Sheets에 계정을 저장하는 Apps Script API로 구성됩니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html`, `style.css`, `app.js` | 로그인 화면, ID 등록 및 권한 요청 모달, 신청 완료 안내 |
| `config.js` | Apps Script 웹 앱 URL, 로그인 후 이동할 페이지 |
| `home.html` | 로그인 후 이동하는 임시 메인 페이지 |
| `apps-script/Code.gs` | 시트에 신청 정보를 쓰고 로그인을 확인하는 API |

## 설정

1. [Apps Script 프로젝트](https://script.google.com/home/projects/1DFa0C8MxAmG00d-wptIR3CHuVRO7DgsTW8SDuqdZ5ru1N2VfDb383lkS/edit)를 열고 `apps-script/Code.gs` 내용을 붙여 넣은 뒤 저장합니다.
2. **배포 → 새 배포 → 웹 앱**을 고릅니다.
   - 다음 사용자 인증 정보로 실행: **나**
   - 액세스 권한이 있는 사용자: **모든 사용자**
3. 받은 `https://script.google.com/macros/s/.../exec` 주소를 `config.js`의 `API_URL`에 넣습니다.
4. `index.html`을 정적 호스팅(GitHub Pages 등)이나 로컬 서버(`npx serve .`)로 엽니다.

> `Code.gs`를 고친 뒤에는 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 반영됩니다.

## 시트 구조

첫 신청 때 1행 헤더가 자동으로 생깁니다. 열 순서는 바꿔도 헤더 이름으로 찾습니다.

| name | id | password_hash | salt | role | activate | requested_at |
| --- | --- | --- | --- | --- | --- | --- |

- 비밀번호는 원문이 아니라 salt를 붙인 SHA-256 해시로 저장됩니다.
- `activate`는 체크박스(FALSE)로 들어갑니다. 관리자가 **TRUE**로 바꾸면 로그인할 수 있습니다.
- 승인 전 로그인하면 "관리자 승인 대기 중입니다." 안내가 나옵니다.
