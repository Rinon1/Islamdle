/* Islamdle — supporter records shared by the two functions.
 *
 * A supporter is anyone whose Buy Me a Coffee donations add up to MIN_AMOUNT
 * in an accepted currency. The site never trusts the browser for this: the
 * webhook records what BMC actually received, and the claim function only
 * hands out an ad-free token when those records qualify.
 *
 * Two ways to link a donation to a person:
 *  - Google sign-in (Supabase). The account's verified email is matched with
 *    the email the donor used on BMC, so every device they sign in on is
 *    ad-free with nothing to type.
 *  - Supporter code, for donors who don't sign in or paid with another email.
 *    The browser keeps a random secret and shows a code derived from it
 *    (codeFromSecret). The donor pastes the code into the BMC message.
 *    Claiming needs the secret, so a code seen on the public BMC page is
 *    useless to anyone else.
 *
 * Emails are never stored: only an HMAC of them, keyed with SUPPORTER_SECRET.
 *
 * Blob keys:
 *   donation/<bmc id>  { amount, currency, refunded, codes, email }
 *   code/<code>        { donations: [id] }
 *   email/<hmac>       { donations: [id] }
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const MIN_AMOUNT = 5;
export const CURRENCIES = (process.env.SUPPORT_CURRENCIES || "EUR,USD")
  .split(",").map(function (c) { return c.trim().toUpperCase(); }).filter(Boolean);

// Crockford base32: no I, L, O or U, so a code survives being read aloud or
// retyped. Must match js/support.js exactly.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

let testStore = null;
export function useStoreForTests(store) { testStore = store; }

export function store() {
  return testStore || getStore({ name: "supporters", consistency: "strong" });
}

export function secret(name) {
  const v = process.env[name];
  return v && v.length >= 16 ? v : null;
}

/* ------------------------------------------------------------- codes ---- */

// 10 base32 characters = 50 bits of sha256(secret), shown as ISL-XXXXX-XXXXX.
export function codeFromSecret(deviceSecret) {
  const bytes = createHash("sha256").update("islamdle-support|" + deviceSecret).digest();
  let bits = "";
  for (const b of bytes.subarray(0, 7)) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < 50; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

// Every code a donor typed into their message, normalised. Tolerates spaces
// instead of dashes, lower case, and the usual O/0 and I/1 mix-ups.
export function codesInText(text) {
  if (!text) return [];
  const found = new Set();
  const re = /ISL[\s-]*([0-9A-Z]{5})[\s-]*([0-9A-Z]{5})/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = (m[1] + m[2]).toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
    if ([...raw].every(function (c) { return ALPHABET.includes(c); })) found.add(raw);
  }
  return [...found];
}

export function emailKey(email) {
  const key = secret("SUPPORTER_SECRET");
  return createHmac("sha256", key).update(String(email).trim().toLowerCase()).digest("hex");
}

// The email of a signed-in Islamdle account, read from Supabase with the
// user's own access token. Only Google-confirmed addresses count.
// Returns null when the token is not valid, undefined when login is not set up.
export async function verifiedEmail(accessToken) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return undefined;
  if (typeof accessToken !== "string" || accessToken.length < 20) return null;
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/auth/v1/user", {
      headers: { apikey: anon, authorization: "Bearer " + accessToken }
    });
    if (!r.ok) return null;
    const user = await r.json();
    return user && user.email && user.email_confirmed_at ? user.email : null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------ tokens ---- */

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }

export function signToken(ref) {
  const body = b64url(JSON.stringify({ ref: ref, iat: Date.now() }));
  const mac = createHmac("sha256", secret("SUPPORTER_SECRET")).update(body).digest("base64url");
  return body + "." + mac;
}

export function readToken(token) {
  if (typeof token !== "string" || token.indexOf(".") < 1) return null;
  const [body, mac] = token.split(".");
  const want = createHmac("sha256", secret("SUPPORTER_SECRET")).update(body).digest("base64url");
  if (!safeEqual(mac, want)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch (e) { return null; }
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ----------------------------------------------------------- records ---- */

export async function readJSON(key) {
  return (await store().get(key, { type: "json" })) || null;
}

export async function writeJSON(key, value) {
  await store().setJSON(key, value);
}

// Add up the donations behind a code or an email. Refunded donations and
// currencies we don't accept count for nothing.
export async function tally(ids) {
  let total = 0;
  let currency = null;
  let refunded = 0;
  for (const id of ids || []) {
    const d = await readJSON("donation/" + id);
    if (!d) continue;
    if (d.refunded) { refunded++; continue; }
    if (!CURRENCIES.includes(d.currency)) continue;
    total += d.amount;
    currency = currency || d.currency;
  }
  total = Math.round(total * 100) / 100;
  return { total: total, currency: currency, refunded: refunded, ok: total >= MIN_AMOUNT };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
