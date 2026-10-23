/* Islamdle — turn a recorded donation into an ad-free token.
 *
 * POST /api/supporter
 *   { action: "claim", secret }  the browser's supporter secret (its code is derived here)
 *   { action: "claim", email }   the email the donor used on Buy Me a Coffee
 *   { action: "check", token }   re-check a token, so refunds switch ads back on
 *   { action: "status" }         when BMC last called the webhook, and whether it was signed right
 *
 * Answers { ok: true, token, total, currency } or { ok: false, reason, ... }.
 */
import {
  MAX_EMAIL_DEVICES, MIN_AMOUNT, codeFromSecret, emailKey, json, readJSON,
  readToken, secret, signToken, tally, writeJSON
} from "../lib/supporters.mjs";

export const config = { path: "/api/supporter" };

const SECRET_RE = /^[A-Za-z0-9_-]{32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function lookup(ref) {
  const rec = await readJSON(ref.replace(":", "/"));
  return rec ? { rec: rec, sum: await tally(rec.donations) } : null;
}

function refusal(found) {
  if (!found || (found.sum.total === 0 && found.sum.refunded === 0)) return { ok: false, reason: "not_found" };
  if (found.sum.total === 0) return { ok: false, reason: "refunded" };
  return {
    ok: false,
    reason: "below_minimum",
    total: found.sum.total,
    currency: found.sum.currency,
    min: MIN_AMOUNT
  };
}

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!secret("SUPPORTER_SECRET")) return json(503, { error: "Supporter secrets are not configured" });

  let body;
  try { body = await req.json(); } catch (e) { return json(400, { error: "Bad JSON" }); }

  if (body.action === "check") {
    const t = readToken(body.token);
    if (!t || !t.ref) return json(200, { ok: false, reason: "invalid" });
    const found = await lookup(t.ref);
    if (found && found.sum.ok) return json(200, { ok: true });
    return json(200, refusal(found));
  }

  if (body.action === "status") {
    return json(200, { last_delivery: (await readJSON("diag/last")) || null });
  }

  if (body.action !== "claim") return json(400, { error: "Unknown action" });

  if (typeof body.secret === "string") {
    if (!SECRET_RE.test(body.secret)) return json(400, { error: "Bad secret" });
    const ref = "code:" + codeFromSecret(body.secret);
    const found = await lookup(ref);
    if (!found || !found.sum.ok) return json(200, refusal(found));
    return json(200, { ok: true, token: signToken(ref), total: found.sum.total, currency: found.sum.currency });
  }

  if (typeof body.email === "string") {
    const email = body.email.trim();
    if (email.length > 254 || !EMAIL_RE.test(email)) return json(400, { error: "Bad email" });
    const ref = "email:" + emailKey(email);
    const found = await lookup(ref);
    if (!found || !found.sum.ok) return json(200, refusal(found));
    if ((found.rec.claims || 0) >= MAX_EMAIL_DEVICES) {
      return json(200, { ok: false, reason: "device_limit", max: MAX_EMAIL_DEVICES });
    }
    found.rec.claims = (found.rec.claims || 0) + 1;
    await writeJSON(ref.replace(":", "/"), found.rec);
    return json(200, { ok: true, token: signToken(ref), total: found.sum.total, currency: found.sum.currency });
  }

  return json(400, { error: "Send a secret or an email" });
}
