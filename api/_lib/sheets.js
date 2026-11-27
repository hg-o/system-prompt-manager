// Google Sheets 접근 (서비스 계정, 외부 패키지 없음)
//
// 환경 변수
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  서비스 계정 이메일 (...@...iam.gserviceaccount.com)
//   GOOGLE_PRIVATE_KEY            서비스 계정 키 JSON 의 private_key 값
//   SPREADSHEET_ID                (선택) 시트 ID. 기본값은 아래 DEFAULT_SPREADSHEET_ID
//   SHEET_GID                     (선택) 탭 gid. 기본값 0

import crypto from "node:crypto";

const DEFAULT_SPREADSHEET_ID = "1DZaLuzsIrT3cKZqDXv-Z65bEuGMi1Vah8TchlGrsahg";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const HEADERS = ["name", "id", "password_hash", "salt", "role", "activate", "requested_at"];

const spreadsheetId = () => process.env.SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
const sheetGid = () => Number(process.env.SHEET_GID || 0);

// ---------- 인증 ----------
let cachedToken = null; // { token, exp }

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 환경 변수가 없습니다.");

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Google 인증 실패: " + JSON.stringify(data));

  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

async function sheetsFetch(path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_API}/${spreadsheetId()}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

// ---------- 시트 ----------
let cachedSheet = null; // { title, sheetId }

async function getSheet() {
  if (cachedSheet) return cachedSheet;
  const meta = await sheetsFetch("?fields=sheets.properties(sheetId,title)");
  const sheets = meta.sheets.map((s) => s.properties);
  const sheet = sheets.find((s) => s.sheetId === sheetGid()) || sheets[0];
  cachedSheet = { title: sheet.title, sheetId: sheet.sheetId };
  return cachedSheet;
}

const a1 = (title, range) => encodeURIComponent(`'${title.replace(/'/g, "''")}'!${range}`);

/** 시트 전체를 읽어 헤더 위치(col)와 데이터 행(rows)을 돌려준다. 없는 헤더는 추가한다. */
export async function readSheet() {
  const { title, sheetId } = await getSheet();
  const data = await sheetsFetch(`/values/${a1(title, "A:ZZ")}?valueRenderOption=UNFORMATTED_VALUE`);
  const values = data.values || [];
  const header = (values[0] || []).map((h) => String(h).trim().toLowerCase());

  const missing = HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    const start = header.length;
    header.push(...missing);
    await sheetsFetch(`/values/${a1(title, colLetter(start) + "1")}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [missing] }),
    });
  }

  const col = Object.fromEntries(HEADERS.map((h) => [h, header.indexOf(h)]));
  return { title, sheetId, col, width: header.length, rows: values.slice(1) };
}

export function findRow(rows, col, id) {
  return rows.find((r) => String(r[col.id] ?? "").trim().toLowerCase().replace(/^'/, "") === id) || null;
}

/** 한 행을 추가하고 activate 칸을 체크박스로 만든다. */
export async function appendRow({ title, sheetId, col, width }, record) {
  const row = new Array(width).fill("");
  for (const [k, v] of Object.entries(record)) row[col[k]] = v;

  const data = await sheetsFetch(
    `/values/${a1(title, "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) }
  );

  // 예: "'시트1'!A5:G5" → 5
  const m = /![A-Z]+(\d+)/.exec(data.updates?.updatedRange || "");
  if (m) {
    const r = Number(m[1]) - 1;
    await sheetsFetch(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: col.activate, endColumnIndex: col.activate + 1 },
              rule: { condition: { type: "BOOLEAN" } },
            },
          },
        ],
      }),
    });
  }
}

function colLetter(i) {
  let s = "";
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
