# System Prompt Manager · 로그인

Vercel에 배포합니다. 정적 화면(`index.html`)이 Vercel 서버 함수(`/api/login`, `/api/signup`)를 부르고,
서버 함수가 Google 서비스 계정으로 시트를 직접 읽고 씁니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html`, `style.css`, `app.js` | 로그인 화면, ID 등록 및 권한 요청 모달, 신청 완료 안내, 로그인 후 임시 화면 |
| `api/login.js` | 로그인. 아이디·비밀번호·activate 확인 |
| `api/signup.js` | 권한 신청. 시트에 한 행 추가 |
| `api/_lib/sheets.js` | Google Sheets API 호출 (서비스 계정 인증) |
| `api/_lib/auth.js` | 비밀번호 해시, 입력 검사 |

외부 npm 패키지는 쓰지 않습니다 (Node 18 이상).

## 설정

### 1. Google 서비스 계정 만들기

1. [Google Cloud 콘솔](https://console.cloud.google.com/)에서 프로젝트를 고르거나 새로 만듭니다.
2. **API 및 서비스 → 라이브러리**에서 **Google Sheets API**를 사용 설정합니다.
3. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**로 계정을 만듭니다 (역할은 주지 않아도 됩니다).
4. 만든 계정의 **키 → 키 추가 → 새 키 만들기 → JSON**으로 키 파일을 받습니다.

### 2. 시트 공유

[시트](https://docs.google.com/spreadsheets/d/1DZaLuzsIrT3cKZqDXv-Z65bEuGMi1Vah8TchlGrsahg/edit)의 **공유**에 서비스 계정 이메일(`...@...iam.gserviceaccount.com`)을 **편집자**로 추가합니다.

> 회사 정책으로 외부 계정과 공유가 막혀 있으면 이 단계가 실패합니다. 그때는 Workspace 관리자에게 서비스 계정 공유 허용을 요청해야 합니다.

### 3. Vercel 환경 변수

Vercel 프로젝트 **Settings → Environment Variables**에 넣고 다시 배포합니다.

| 이름 | 값 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 키 JSON의 `client_email` |
| `GOOGLE_PRIVATE_KEY` | 키 JSON의 `private_key` 전체 (`-----BEGIN PRIVATE KEY-----`부터 `-----END PRIVATE KEY-----\n`까지) |
| `SPREADSHEET_ID` | (선택) 기본값은 위 시트 |
| `SHEET_GID` | (선택) 기본값 `0` |

키 JSON 파일은 저장소에 올리지 마세요.

## 시트 구조

1행 헤더가 없으면 자동으로 만듭니다. 열 순서는 바꿔도 헤더 이름으로 찾습니다.

| name | id | password_hash | salt | role | activate | requested_at |
| --- | --- | --- | --- | --- | --- | --- |

- 아이디는 `@webtoon.com` 이메일만 받습니다.
- 비밀번호는 원문이 아니라 salt를 붙인 SHA-256 해시로 저장됩니다.
- `activate`는 체크박스(FALSE)로 들어갑니다. 관리자가 **TRUE**로 바꾸면 로그인할 수 있습니다.
- 승인 전 로그인하면 "관리자 승인 대기 중입니다." 안내가 나옵니다.
- 로그인 상태는 페이지 안에서만 유지됩니다. 새로고침하면 다시 로그인해야 합니다.
