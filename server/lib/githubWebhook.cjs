// ===== GitHub Webhook handler =====
// Přijímá GitHub webhook events, ověřuje HMAC podpis a spouští akce.

const crypto = require("crypto");

const DEFAULT_SECRET = process.env.GITHUB_WEBHOOK_SECRET || null;

/**
 * Ověří GitHub webhook podpis.
 * GitHub posílá: X-Hub-Signature-256: sha256=<hex_hmac>
 */
function verifySignature(payload, signature, secret) {
  if (!secret) return { valid: false, reason: "secret not configured" };
  if (!signature || !signature.startsWith("sha256=")) {
    return { valid: false, reason: "missing or invalid signature format" };
  }
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const actual = signature;
  // Constant-time compare
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
    return { valid: ok, reason: ok ? null : "signature mismatch" };
  } catch {
    return { valid: false, reason: "signature compare failed" };
  }
}

/**
 * Extrahuje název repozitáře z payloadu.
 */
function getRepoName(payload) {
  if (!payload) return null;
  if (payload.repository?.name) return payload.repository.name;
  if (payload.repository?.full_name) return payload.repository.full_name.split("/").pop();
  return null;
}

/**
 * Určí typ eventu.
 */
function getEventType(headers) {
  return headers["x-github-event"] || headers["X-GitHub-Event"] || "unknown";
}

/**
 * Vytvoří payload pro GitHub webhook ping.
 */
function pingResponse() {
  return { ok: true, message: "Webhook configured" };
}

module.exports = {
  verifySignature,
  getRepoName,
  getEventType,
  pingResponse,
  DEFAULT_SECRET,
};
