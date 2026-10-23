/* Islamdle — turn a recorded donation into an ad-free token.
 *
 * POST /api/supporter
 *   { action: "account", access_token, secret? }
 *       Signed in with Google: the verified account email is matched against
 *       Buy Me a Coffee donors. A supporter secret, if sent, links that code's
 *       donations to the account too, so a donor who paid with another email
 *       is ad-free on every device they sign in on.
 *   { action: "claim", secret }  not signed in: the browser's supporter code
 *   { action: "check", token }   re-check a token, so refunds switch ads back on
 *   { action: "status" }         when BMC last called the webhook, and whether it was signed right
 *
 * Answers { ok: true, token, total, currency } or { ok: false, reason, ... }.
 *
 * There is deliberately no "type an email" claim: anyone could type a donor's
 * address. Emails only count when Google has proven the person owns them.
 */
import {
  MIN_AMOUNT, codeFromSecret, emailKey, json, readJSON, readToken, secret,
  signToken, tally, verifiedEmail, writeJSON
} from "../lib/supporters.mjs";

export const config = { path: "/api/supporter" };

const SECRET_RE = /^[A-Za-z0-9_-]{32}$/;

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

function granted(ref, found) {
  return json(200, { ok: true, token: signToken(ref), total: found.sum.total, currency: found.sum.currency });
}

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });
  if (!secret("SUPPORTER_SECRET")) return json(503, { error: "Supporter secrets are not configured" });

  let body;
  try { body = await req.json(); } catch (e) { return json(400, { error: "Bad JSON" }); }

  if (body.action === "status") {
    return json(200, { last_delivery: (await readJSON("diag/last")) || null });
  }

  if (body.action === "check") {
    const t = readToken(body.token);
    if (!t || !t.ref) return json(200, { ok: false, reason: "invalid" });
    const found = await lookup(t.ref);
    if (found && found.sum.ok) return json(200, { ok: true });
    return json(200, refusal(found));
  }

  if (body.action === "account") {
    const who = await verifiedEmail(body.access_token);
    if (who === undefined) return json(503, { error: "Login is not configured" });
    if (!who) return json(401, { ok: false, reason: "signed_out" });
    if (!who.email) {
      // Email not provable: a supporter code from this browser still counts.
      if (typeof body.secret === "string" && SECRET_RE.test(body.secret)) {
        const codeRef = "code:" + codeFromSecret(body.secret);
        const byCode = await lookup(codeRef);
        if (byCode && byCode.sum.ok) return granted(codeRef, byCode);
      }
      return json(200, { ok: false, reason: who.reason });
    }
    const email = who.email;

    const ref = "email:" + emailKey(email);
    const rec = (await readJSON("email/" + emailKey(email))) || { donations: [] };

    // Fold a supporter code's donations into the account (needs the secret,
    // so only the browser that made the code can do this).
    if (typeof body.secret === "string" && SECRET_RE.test(body.secret)) {
      const code = await readJSON("code/" + codeFromSecret(body.secret));
      let added = false;
      for (const id of (code && code.donations) || []) {
        if (!rec.donations.includes(id)) { rec.donations.push(id); added = true; }
      }
      if (added) await writeJSON("email/" + emailKey(email), rec);
    }

    const found = rec.donations.length ? { rec: rec, sum: await tally(rec.donations) } : null;
    if (!found || !found.sum.ok) return json(200, refusal(found));
    return granted(ref, found);
  }

  if (body.action === "claim") {
    if (typeof body.secret !== "string" || !SECRET_RE.test(body.secret)) return json(400, { error: "Bad secret" });
    const ref = "code:" + codeFromSecret(body.secret);
    const found = await lookup(ref);
    if (!found || !found.sum.ok) return json(200, refusal(found));
    return granted(ref, found);
  }

  return json(400, { error: "Unknown action" });
}
