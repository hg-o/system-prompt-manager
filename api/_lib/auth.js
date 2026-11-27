import crypto from "node:crypto";

// 아이디는 @webtoon.com 회사 이메일만 허용한다
export const EMAIL_RE = /^[^\s@]+@webtoon\.com$/;
export const ROLES = ["Editor", "Viewer"];

/** SHA-256(salt + password) hex. 이전 Apps Script 버전과 같은 방식이라 기존 계정도 그대로 로그인된다. */
export function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(salt + password, "utf8").digest("hex");
}

export function isTrue(v) {
  return v === true || String(v).trim().toUpperCase() === "TRUE";
}

/** POST + JSON 본문만 받는다. 아니면 응답을 보내고 null 을 돌려준다. */
export function readBody(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, message: "허용되지 않은 요청입니다." });
    return null;
  }
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return null;
  }
  return body;
}

export function serverError(res, err) {
  console.error(err);
  res.status(500).json({ ok: false, message: "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
}
