import crypto from "node:crypto";
import { readSheet, findRow, appendRow } from "./_lib/sheets.js";
import { EMAIL_RE, ROLES, hashPassword, readBody, serverError } from "./_lib/auth.js";

export default async function handler(req, res) {
  const body = readBody(req, res);
  if (!body) return;

  const name = String(body.name || "").trim();
  const id = String(body.id || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "");

  const invalid = (field, message) => res.status(200).json({ ok: false, field, message });
  if (!name || name.length > 16) return invalid("name", "이름은 1~16자로 입력해 주세요.");
  if (!EMAIL_RE.test(id)) return invalid("id", "@webtoon.com 이메일 주소만 사용할 수 있습니다.");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return invalid("password", "영문, 숫자, 기호를 모두 포함해 8자 이상 입력해 주세요.");
  }
  if (!ROLES.includes(role)) return invalid("role", "권한을 선택해 주세요.");

  try {
    const sheet = await readSheet();
    if (findRow(sheet.rows, sheet.col, id)) return invalid("id", "이미 등록(신청)된 아이디입니다.");

    const salt = crypto.randomUUID();
    // RAW 로 쓰므로 =, + 로 시작하는 입력도 수식으로 실행되지 않는다.
    await appendRow(sheet, {
      name,
      id,
      password_hash: hashPassword(password, salt),
      salt,
      role,
      activate: false,
      requested_at: new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err);
  }
}
