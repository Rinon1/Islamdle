/* Islamdle — "Support Islamdle" and the ad-free switch.
 *
 * A one-time gift of MIN_AMOUNT or more on Buy Me a Coffee removes ads.
 * Pressing the button proves nothing: the browser only becomes ad-free once
 * /api/supporter confirms that Buy Me a Coffee reported a real donation that
 * belongs to this person. Two ways to show that:
 *
 *  - Signed in with Google (js/account.js): the donation's email matches the
 *    account's. Ads switch off by themselves on every device signed in.
 *  - A supporter code pasted into the BMC message, for anyone who doesn't sign
 *    in or paid with a different email. The code is derived from a random
 *    secret kept in localStorage; only the secret can claim, so a code visible
 *    in a public BMC message is useless to anyone else. Must derive codes
 *    exactly like netlify/lib/supporters.mjs.
 *
 * Loaded in <head> right after consent.js so the ad-free class is set before
 * any ad slot renders.
 */
(function (w, d) {
  "use strict";

  // Your Buy Me a Coffee page, e.g. "https://buymeacoffee.com/islamdle".
  // While empty, the support button stays hidden.
  var BMC_URL = "https://buymeacoffee.com/duajournal";
  var MIN_AMOUNT = 5;
  var KEY = "islamdle.support.v1";
  var RECHECK_MS = 7 * 24 * 3600 * 1000;
  var ACCOUNT_RECHECK_MS = 6 * 3600 * 1000;
  var API = "/api/supporter";
  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

  /* ----------------------------------------------------------- state ---- */

  function load() {
    try { return JSON.parse(w.localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { w.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  var state = load();

  function adFree() { return !!state.token; }

  function paintAdFree() {
    d.documentElement.classList.toggle("ad-free", adFree());
  }
  paintAdFree();

  function secret() {
    if (!state.secret) {
      var bytes = new Uint8Array(24);
      w.crypto.getRandomValues(bytes);
      var bin = "";
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      state.secret = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      save();
    }
    return state.secret;
  }

  // ISL-XXXXX-XXXXX: the first 50 bits of sha256 of the secret, in base32.
  function code() {
    var text = new TextEncoder().encode("islamdle-support|" + secret());
    return w.crypto.subtle.digest("SHA-256", text).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var bits = "";
      for (var i = 0; i < 7; i++) bits += ("00000000" + bytes[i].toString(2)).slice(-8);
      var out = "";
      for (var j = 0; j < 50; j += 5) out += ALPHABET[parseInt(bits.slice(j, j + 5), 2)];
      return "ISL-" + out.slice(0, 5) + "-" + out.slice(5);
    });
  }

  function call(body) {
    return fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { j.status = r.status; return j; });
    });
  }

  function unlock(token) {
    state.token = token;
    state.checked = Date.now();
    save();
    paintAdFree();
    paintEntryPoints();
  }

  // Refunds switch ads back on. A network failure never does.
  function recheck() {
    if (!state.token || Date.now() - (state.checked || 0) < RECHECK_MS) return;
    call({ action: "check", token: state.token }).then(function (r) {
      if (r.ok) {
        state.checked = Date.now();
      } else if (r.reason) {
        delete state.token;
        delete state.checked;
      }
      save();
      paintAdFree();
      paintEntryPoints();
    }, function () { /* offline: keep the token */ });
  }

  /* --------------------------------------------------------- account ---- */

  function account() { return w.IslamdleAccount && w.IslamdleAccount.configured() ? w.IslamdleAccount : null; }
  function signedIn() { var a = account(); return a ? a.user() : null; }

  // Ask whether the signed-in account has donated. Quietly, at most every few
  // hours, unless `force` (the visitor just pressed "I've donated").
  function claimAccount(force) {
    var a = account();
    if (!a || !a.user()) return Promise.resolve(null);
    if (!force && Date.now() - (state.accountChecked || 0) < ACCOUNT_RECHECK_MS) return Promise.resolve(null);
    return a.accessToken().then(function (token) {
      if (!token) return null;
      state.accountChecked = Date.now();
      save();
      var body = { action: "account", access_token: token };
      if (state.secret) body.secret = state.secret;
      return call(body);
    }).then(function (r) {
      if (r && r.ok && r.token) unlock(r.token);
      return r;
    });
  }

  /* ---------------------------------------------------------- dialog ---- */

  function el(id) { return d.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(d.querySelectorAll(sel)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n, cur) {
    var sym = { EUR: "€", USD: "$" }[cur] || "";
    return sym ? sym + n : n + " " + (cur || "");
  }

  var OPEN_BMC = '<a class="btn sp-open" target="_blank" rel="noopener">Open Buy Me a Coffee ↗</a>';
  var CHECK = '<button class="btn ghost sp-check" type="button">I’ve donated — remove ads</button>';
  var CODE_ROW = '<div class="sp-code-row"><code class="sp-code">…</code>' +
                 '<button class="btn ghost sp-copy" type="button">Copy</button></div>';

  function codeSteps() {
    return '<ol class="sp-list">' +
      "<li><span>Copy your supporter code</span>" + CODE_ROW + "</li>" +
      "<li><span>Donate on Buy Me a Coffee and <b>paste the code in the message</b>. " +
        "You can tick “make this message private”.</span>" + OPEN_BMC + "</li>" +
      "<li><span>Come back here.</span>" + CHECK + "</li>" +
    "</ol>";
  }

  function stepsHtml() {
    var intro = "<p>Islamdle is free for everyone. A one-time gift of <b>€" + MIN_AMOUNT + " / $" + MIN_AMOUNT +
                " or more</b> removes the ads for good.</p>";
    var a = account();
    var u = signedIn();

    if (!a) return intro + codeSteps();
    if (!u) return intro + codeSteps();

    return intro +
      '<p class="sp-who">Signed in as <b>' + esc(u.email) + "</b></p>" +
      '<ol class="sp-list">' +
        "<li><span>Donate on Buy Me a Coffee and pay with <b>" + esc(u.email) + "</b>.</span>" + OPEN_BMC + "</li>" +
        "<li><span>Come back here. Ads switch off by themselves, on every device you sign in on.</span>" + CHECK + "</li>" +
      "</ol>" +
      '<details class="sp-alt"><summary>Paying with a different email?</summary>' +
        "<p>Paste this code into your Buy Me a Coffee message, then press the button above.</p>" + CODE_ROW +
      "</details>";
  }

  function inject() {
    var box = d.createElement("div");
    box.className = "modal";
    box.id = "modal-support";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "sp-title");
    box.innerHTML =
      '<div class="box support">' +
        '<button class="btn ghost close" type="button" id="sp-close">Close</button>' +
        '<h2 id="sp-title">Support Islamdle</h2>' +
        '<div id="sp-thanks" hidden>' +
          '<p class="sp-big">Jazāk Allāhu khayran!</p>' +
          '<p>Ads are off. Thank you for keeping Islamdle free for everyone.</p>' +
        "</div>" +
        '<div id="sp-steps"></div>' +
        '<p class="sp-status" id="sp-status" role="status"></p>' +
      "</div>";
    d.body.appendChild(box);

    el("sp-close").onclick = close;
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });

    // Coming back from the Buy Me a Coffee tab checks once by itself.
    d.addEventListener("visibilitychange", function () {
      if (d.visibilityState === "visible" && awaitingReturn && !box.hidden) {
        awaitingReturn = false;
        poll(3);
      }
    });

    if (account()) account().onChange(function () { if (!box.hidden) render(); });
  }

  // Draw the steps for the current sign-in state and wire their buttons.
  function render() {
    var free = adFree();
    el("sp-thanks").hidden = !free;
    el("sp-steps").hidden = free;
    if (free) { status(""); return; }

    el("sp-steps").innerHTML = stepsHtml();
    all("#sp-steps .sp-open").forEach(function (a) {
      a.href = BMC_URL;
      a.addEventListener("click", function () {
        awaitingReturn = true;
        // They may come back later without reopening this window: check on the next visit.
        state.accountChecked = 0;
        save();
      });
    });
    all("#sp-steps .sp-check").forEach(function (b) { b.onclick = function () { poll(12); }; });
    all("#sp-steps .sp-copy").forEach(function (b) {
      b.onclick = function () {
        var codeEl = b.parentNode.querySelector(".sp-code");
        var done = function () { b.textContent = "Copied ✓"; };
        if (navigator.clipboard) navigator.clipboard.writeText(codeEl.textContent).then(done, function () { selectText(codeEl); });
        else selectText(codeEl);
      };
    });
    if (d.querySelector("#sp-steps .sp-code")) {
      code().then(function (c) { all("#sp-steps .sp-code").forEach(function (x) { x.textContent = c; }); });
    }
  }

  var awaitingReturn = false;
  var polling = null;

  function selectText(node) {
    var r = d.createRange();
    r.selectNodeContents(node);
    var s = w.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function status(text, kind) {
    var s = el("sp-status");
    if (!s) return;
    s.textContent = text;
    s.className = "sp-status" + (kind ? " " + kind : "");
  }

  function offline() { status("Couldn’t reach Islamdle. Check your connection and try again.", "bad"); }

  // Handle a claim answer. Returns true when there is no point asking again.
  function answer(r) {
    if (r.ok && r.token) {
      unlock(r.token);
      render();
      return true;
    }
    if (r.reason === "below_minimum") {
      status("We received " + money(r.total, r.currency) + " — thank you! Ad-free starts at " +
        money(r.min, r.currency) + " in total; another gift adds up.", "partial");
      return true;
    }
    if (r.reason === "refunded") {
      status("That donation was refunded, so ads stay on.", "bad");
      return true;
    }
    if (r.reason === "signed_out") {
      status("Your sign-in has expired. Please sign in again.", "bad");
      return true;
    }
    if (r.status && r.status >= 400) {
      status("Something went wrong on our side. Please try again later.", "bad");
      return true;
    }
    status(signedIn()
      ? "We haven’t received a donation from " + signedIn().email + " yet. It can take a minute to arrive."
      : "We haven’t received a donation with this code yet. It can take a minute to arrive.", "bad");
    return false;
  }

  // Donations arrive a few seconds after payment, so keep asking for a while.
  function poll(times) {
    if (polling) clearTimeout(polling);
    status("Checking for your donation…");
    var left = times;
    (function ask() {
      var req = signedIn() ? claimAccount(true) : call({ action: "claim", secret: secret() });
      req.then(function (r) {
        if (!r) { status("Please sign in again.", "bad"); return; }
        var final = answer(r);
        if (!final && --left > 0) {
          status("Waiting for Buy Me a Coffee to confirm… (this can take up to a minute)");
          polling = setTimeout(ask, 5000);
        }
      }, offline);
    })();
  }

  // Signed out: sign in first (Google or email), then this window opens by
  // itself. opts.code skips that for donors who prefer a supporter code.
  function open(e, opts) {
    if (e && e.preventDefault) e.preventDefault();
    var a = account();
    if (a && !a.user() && !adFree() && !(opts && opts.code)) {
      a.openSignIn({
        title: "Sign in to remove ads",
        why: "Sign in, then donate on Buy Me a Coffee with the same email. " +
             "Ads switch off by themselves on every device you sign in on.",
        next: "support",
        codeLink: true
      });
      return;
    }
    if (!el("modal-support")) inject();
    status("");
    render();
    el("modal-support").hidden = false;
    el("sp-close").focus();
  }

  function close() {
    if (polling) clearTimeout(polling);
    el("modal-support").hidden = true;
  }

  /* ---------------------------------------------------- entry points ---- */

  // Any [data-support] element opens the dialog; [data-support-cta] text
  // changes once this device is ad-free.
  function paintEntryPoints() {
    all("[data-support]").forEach(function (a) {
      a.hidden = !BMC_URL;
      a.onclick = open;
    });
    all("[data-support-cta]").forEach(function (a) {
      a.textContent = adFree()
        ? "Jazāk Allāhu khayran — ads are off"
        : "Donate to remove the ads";
    });
  }

  function boot() {
    paintEntryPoints();
    recheck();
    // Signed in and not ad-free yet: see whether this account has donated.
    if (account()) account().onChange(function (u) { if (u && !adFree()) claimAccount(false); });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();

  w.IslamdleSupport = { adFree: adFree, open: open };
})(window, document);
