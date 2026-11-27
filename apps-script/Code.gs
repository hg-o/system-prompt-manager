/**
 * System Prompt Manager - 로그인 / 권한 신청 (Google Apps Script 웹 앱)
 *
 * 프로젝트 파일: Code.gs, Index.html, Stylesheet.html, JavaScript.html
 *
 * 시트 열(1행 헤더). 시트가 비어 있으면 자동으로 만든다.
 *   name | id | password_hash | salt | role | activate | requested_at
 *
 * 관리자가 activate 를 TRUE 로 바꾸면 해당 계정으로 로그인할 수 있다.
 */

const SPREADSHEET_ID = '1DZaLuzsIrT3cKZqDXv-Z65bEuGMi1Vah8TchlGrsahg';
const SHEET_GID = 0;
const HEADERS = ['name', 'id', 'password_hash', 'salt', 'role', 'activate', 'requested_at'];
const ROLES = ['Editor', 'Viewer'];
// 아이디는 @webtoon.com 회사 이메일만 허용한다
const EMAIL_RE = /^[^\s@]+@webtoon\.com$/;

/** 웹 앱 주소로 들어오면 로그인 화면(Index.html)을 띄운다. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('System Prompt Manager · 로그인')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Index.html 에서 Stylesheet.html, JavaScript.html 을 끼워 넣는다. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 화면에서 google.script.run.api(action, payload) 로 부르는 함수 */
function api(action, payload) {
  try {
    switch (action) {
      case 'signup': return signup_(payload || {});
      case 'login':  return login_(payload || {});
      default:       return { ok: false, message: '알 수 없는 요청입니다.' };
    }
  } catch (err) {
    console.error(err);
    return { ok: false, message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}

// ---------- 권한 신청 ----------
function signup_(b) {
  const name = String(b.name || '').trim();
  const id = String(b.id || '').trim().toLowerCase();
  const password = String(b.password || '');
  const role = String(b.role || '');

  if (!name || name.length > 16) return { ok: false, field: 'name', message: '이름은 1~16자로 입력해 주세요.' };
  if (!EMAIL_RE.test(id)) return { ok: false, field: 'id', message: '@webtoon.com 이메일 주소만 사용할 수 있습니다.' };
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return { ok: false, field: 'password', message: '영문, 숫자, 기호를 모두 포함해 8자 이상 입력해 주세요.' };
  }
  if (ROLES.indexOf(role) === -1) return { ok: false, field: 'role', message: '권한을 선택해 주세요.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const col = getColumns_(sheet);

    if (findRow_(sheet, col, id)) {
      return { ok: false, field: 'id', message: '이미 등록(신청)된 아이디입니다.' };
    }

    const salt = Utilities.getUuid();
    const row = new Array(sheet.getLastColumn()).fill('');
    row[col.name] = safeText_(name);
    row[col.id] = safeText_(id);
    row[col.password_hash] = hash_(password, salt);
    row[col.salt] = salt;
    row[col.role] = role;
    row[col.activate] = false;
    row[col.requested_at] = new Date();

    sheet.appendRow(row);
    // activate 칸을 체크박스로 만들어 관리자가 클릭으로 승인할 수 있게 한다
    sheet.getRange(sheet.getLastRow(), col.activate + 1).insertCheckboxes();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------- 로그인 ----------
function login_(b) {
  const id = String(b.id || '').trim().toLowerCase();
  const password = String(b.password || '');
  const fail = { ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  if (!id || !password) return fail;

  const sheet = getSheet_();
  const col = getColumns_(sheet);
  const row = findRow_(sheet, col, id);
  if (!row) return fail;

  if (hash_(password, String(row[col.salt])) !== String(row[col.password_hash])) return fail;

  if (!isTrue_(row[col.activate])) {
    return { ok: false, message: '관리자 승인 대기 중입니다. 승인이 완료되면 로그인이 가능합니다.' };
  }

  return { ok: true, user: { id: id, name: String(row[col.name]), role: String(row[col.role]) } };
}

// ---------- helpers ----------
function getSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheets().filter(function (s) { return s.getSheetId() === SHEET_GID; })[0] || ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 헤더 이름으로 열 위치(0부터)를 찾는다. 없는 헤더는 오른쪽 끝에 추가한다. */
function getColumns_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const col = {};
  HEADERS.forEach(function (h) {
    let idx = header.indexOf(h);
    if (idx === -1) {
      idx = header.length;
      header.push(h);
      sheet.getRange(1, idx + 1).setValue(h).setFontWeight('bold');
    }
    col[h] = idx;
  });
  return col;
}

function findRow_(sheet, col, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][col.id]).trim().toLowerCase().replace(/^'/, '') === id) return values[i];
  }
  return null;
}

function hash_(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

/** =, +, -, @ 로 시작하는 입력이 수식으로 실행되지 않도록 막는다. */
function safeText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
