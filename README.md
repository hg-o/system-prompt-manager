# System Prompt Manager · 로그인 (FE 프로토타입)

화면과 동작을 보여주기 위한 프론트엔드 프로토타입입니다. **서버·DB와 연결되어 있지 않습니다.**

- 어떤 아이디·비밀번호로도 로그인됩니다.
- 권한 신청은 어디에도 저장되지 않고, 신청 완료 안내만 띄웁니다.

## 파일

| 파일 | 설명 |
| --- | --- |
| `index.html` | 로그인 화면, ID 등록 및 권한 요청 모달, 신청 완료 안내, 로그인 후 임시 화면 |
| `style.css` | 스타일 |
| `app.js` | 화면 동작. 서버 호출은 `callApi()` 목업 하나로 모여 있음 |

빌드 과정이 없는 정적 파일입니다. `index.html`을 브라우저로 열거나 Vercel 같은 정적 호스팅에 그대로 올리면 됩니다.

## 화면 흐름

1. **로그인**: ID(회사 이메일)·PW 입력 → 로그인 → 로그인 후 화면
2. **ID 등록 및 권한 요청**: 이름·아이디·비밀번호·권한 입력 → 권한 신청하기
3. **신청 완료 안내**: "권한이 신청되었습니다. 관리자 승인이 완료되면 로그인이 가능합니다." → 확인 또는 X로 닫으면 로그인 화면

## 입력 규칙 (화면에서 검사함)

| 항목 | 규칙 |
| --- | --- |
| 이름 | 1~16자 |
| 아이디 | `@webtoon.com` 이메일만 |
| 비밀번호 | 영문, 숫자, 기호를 모두 포함해 8자 이상 |
| 권한 | `Editor` 또는 `Viewer` |

## 백엔드 연결 시 (개발자 참고)

`app.js`의 `callApi(action, payload)`를 실제 API 호출로 바꾸면 됩니다. 화면은 아래 응답 형식을 기대합니다.

| action | 요청 | 성공 | 실패 |
| --- | --- | --- | --- |
| `login` | `{ id, password }` | `{ ok: true, user: { id, name, role } }` | `{ ok: false, message }` |
| `signup` | `{ name, id, password, role }` | `{ ok: true }` | `{ ok: false, field?, message }` |

- `message`는 화면에 그대로 표시됩니다. `signup`에서 `field`(`name`·`id`·`password`·`role`)를 주면 해당 입력칸 아래에 표시됩니다.
- 기획 요구사항
  - 신청 정보 저장소: [Google 시트](https://docs.google.com/spreadsheets/d/1DZaLuzsIrT3cKZqDXv-Z65bEuGMi1Vah8TchlGrsahg/edit)
  - 관리자가 `activate`를 `TRUE`로 바꾼 계정만 로그인 가능. 승인 전이면 "관리자 승인 대기 중입니다." 같은 안내
  - 이미 신청한 아이디는 다시 신청 불가
- 서버에서도 위 입력 규칙을 다시 검사하고, 비밀번호는 해시로 저장해야 합니다.
- Google 시트 연결을 시도했던 코드(Vercel 서버 함수 + 서비스 계정)는 커밋 `e1b21a1`에 남아 있습니다.
