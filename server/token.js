const crypto = require("crypto");

function secret() {
  return process.env.GATE_TOKEN_SECRET || "digi-exam-hmac-change-me";
}

function signPayload(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return { ok: false, reason: "MALFORMED_TOKEN" };
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "INVALID_PAYLOAD" };
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(check, "hex"));
}

function sessionToken(userId, role) {
  return signPayload({ typ: "session", userId, role, iat: Date.now() });
}

module.exports = { signPayload, verifyToken, hashPassword, verifyPassword, sessionToken };
