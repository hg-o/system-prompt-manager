import crypto from "node:crypto";
import { readSheet, findRow } from "./_lib/sheets.js";
import { hashPassword, isTrue, readBody, serverError } from "./_lib/auth.js";

export default async function handler(req, res) {
  const body = readBody(req, res);
  if (!body) return;

  const id = String(body.id || "").trim().toLowerCase();
  const password = String(body.password || "");
  const fail = { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  if (!id || !password) return res.status(200).json(fail);

  try {
    const { col, rows } = await readSheet();
    const row = findRow(rows, col, id);
    if (!row) return res.status(200).json(fail);

    const expected = Buffer.from(String(row[col.password_hash] ?? ""));
    const actual = Buffer.from(hashPassword(password, String(row[col.salt] ?? "")));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return res.status(200).json(fail);
    }

    if (!isTrue(row[col.activate])) {
      return res.status(200).json({ ok: false, message: "관리자 승인 대기 중입니다. 승인이 완료되면 로그인이 가능합니다." });
    }

    return res.status(200).json({
      ok: true,
      user: { id, name: String(row[col.name] ?? "").replace(/^'/, ""), role: String(row[col.role] ?? "") },
    });
  } catch (err) {
    return serverError(res, err);
  }
}
