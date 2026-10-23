/* Buy Me a Coffee → Islamdle.
 *
 * BMC calls this on every donation and refund. The body is signed with the
 * webhook's secret (HMAC-SHA256 of the raw body, hex, in x-signature-sha256),
 * so nobody can fake a donation by posting here.
 *
 * Set in Netlify → Site configuration → Environment variables:
 *   BMC_WEBHOOK_SECRET  the secret shown on the BMC webhook page
 *   SUPPORTER_SECRET    any long random string (also used by supporter.mjs)
 */
import { createHmac } from "node:crypto";
import {
  codesInText, emailKey, json, readJSON, safeEqual, secret, writeJSON
} from "../lib/supporters.mjs";

export const config = { path: "/api/bmc-webhook" };

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const hookSecret = secret("BMC_WEBHOOK_SECRET");
  if (!hookSecret || !secret("SUPPORTER_SECRET")) {
    return json(503, { error: "Supporter secrets are not configured" });
  }

  const raw = await req.text();
  const want = createHmac("sha256", hookSecret).update(raw).digest("hex");
  const signed = safeEqual((req.headers.get("x-signature-sha256") || "").toLowerCase(), want);

  let event = null;
  try { event = JSON.parse(raw); } catch (e) { /* reported below */ }

  // Last delivery attempt, for /api/supporter {action:"status"}: shows whether
  // BMC reaches us at all and whether the secrets match. No supporter data.
  await writeJSON("diag/last", {
    at: new Date().toISOString(),
    type: event && event.type || null,
    live_mode: event ? event.live_mode : null,
    signature_ok: signed,
    signature_sent: req.headers.has("x-signature-sha256")
  });

  if (!signed) return json(401, { error: "Bad signature" });
  if (!event) return json(400, { error: "Bad JSON" });

  // "Send test event" in the BMC dashboard: prove the wiring works, store nothing.
  if (event.live_mode === false) return json(200, { ok: true, test: true });

  const data = event.data || {};
  if (data.id == null) return json(200, { ok: true, ignored: "no id" });
  const donationKey = "donation/" + data.id;

  if (event.type === "donation.refunded") {
    const d = await readJSON(donationKey);
    if (d) {
      d.refunded = true;
      await writeJSON(donationKey, d);
    }
    return json(200, { ok: true });
  }

  if (event.type !== "donation.created") return json(200, { ok: true, ignored: event.type });

  // Retries deliver the same donation again; record it once.
  if (await readJSON(donationKey)) return json(200, { ok: true, duplicate: true });

  const codes = codesInText(data.support_note);
  const email = data.supporter_email ? emailKey(data.supporter_email) : null;

  await writeJSON(donationKey, {
    amount: Number(data.amount) || 0,
    currency: String(data.currency || "").toUpperCase(),
    refunded: data.status === "refunded" || data.refunded === "true",
    codes: codes,
    email: email,
    created: data.created_at || event.created || null
  });

  for (const code of codes) {
    const rec = (await readJSON("code/" + code)) || { donations: [] };
    if (!rec.donations.includes(data.id)) rec.donations.push(data.id);
    await writeJSON("code/" + code, rec);
  }

  if (email) {
    const rec = (await readJSON("email/" + email)) || { donations: [], claims: 0 };
    if (!rec.donations.includes(data.id)) rec.donations.push(data.id);
    await writeJSON("email/" + email, rec);
  }

  return json(200, { ok: true, codes: codes.length });
}
