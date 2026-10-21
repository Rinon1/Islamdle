/* Islamdle — "Support Islamdle" and the ad-free switch.
 *
 * A one-time gift of MIN_AMOUNT or more on Buy Me a Coffee removes ads on
 * this device. Pressing the button proves nothing: the browser only becomes
 * ad-free once /api/supporter confirms that Buy Me a Coffee reported a real
 * donation carrying this browser's supporter code (or the donor's email).
 *
 * The code shown here is derived from a random secret kept in localStorage.
 * Only the secret can claim, so a code visible in a public BMC message is
 * useless to anyone else. Must derive codes exactly like netlify/lib/supporters.mjs.
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

  /* ---------------------------------------------------------- dialog ---- */

  function el(id) { return d.getElementById(id); }

  function money(n, cur) {
    var sym = { EUR: "€", USD: "$" }[cur] || "";
    return sym ? sym + n : n + " " + (cur || "");
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
          '<p>Ads are off on this device. Thank you for keeping Islamdle free for everyone.</p>' +
        "</div>" +

        '<div id="sp-steps">' +
          "<p>Islamdle is free for everyone. A one-time gift of <b>€" + MIN_AMOUNT + " / $" + MIN_AMOUNT +
          " or more</b> removes the ads on this device for good.</p>" +
          '<ol class="sp-list">' +
            "<li><span>Copy your supporter code</span>" +
              '<div class="sp-code-row"><code id="sp-code">…</code>' +
              '<button class="btn ghost" type="button" id="sp-copy">Copy</button></div></li>' +
            "<li><span>Donate on Buy Me a Coffee and <b>paste the code in the message</b>. " +
              "You can tick “make this message private”.</span>" +
              '<a class="btn" id="sp-open" target="_blank" rel="noopener">Open Buy Me a Coffee ↗</a></li>' +
            "<li><span>Come back here.</span>" +
              '<button class="btn ghost" type="button" id="sp-check">I’ve donated — remove ads</button></li>' +
          "</ol>" +
          '<p class="sp-status" id="sp-status" role="status"></p>' +
          '<details class="sp-email">' +
            "<summary>Forgot the code, or on another device?</summary>" +
            "<p>Enter the email you used on Buy Me a Coffee.</p>" +
            '<form id="sp-email-form" class="sp-email-row">' +
              '<input type="email" id="sp-email" required autocomplete="email" placeholder="you@example.com" aria-label="Donation email">' +
              '<button class="btn ghost" type="submit">Check</button>' +
            "</form>" +
          "</details>" +
        "</div>" +
      "</div>";
    d.body.appendChild(box);

    el("sp-open").href = BMC_URL;
    el("sp-close").onclick = close;
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });

    el("sp-copy").onclick = function () {
      var text = el("sp-code").textContent;
      var done = function () { el("sp-copy").textContent = "Copied ✓"; };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, selectCode);
      else selectCode();
    };

    // Coming back from the Buy Me a Coffee tab checks once by itself.
    el("sp-open").addEventListener("click", function () { awaitingReturn = true; });
    d.addEventListener("visibilitychange", function () {
      if (d.visibilityState === "visible" && awaitingReturn && !box.hidden) {
        awaitingReturn = false;
        poll(3);
      }
    });

    el("sp-check").onclick = function () { poll(12); };

    el("sp-email-form").onsubmit = function (e) {
      e.preventDefault();
      status("Checking…");
      call({ action: "claim", email: el("sp-email").value }).then(function (r) {
        if (!answer(r)) status("We haven’t received a donation from that email yet. It can take a minute to arrive.", "bad");
      }, offline);
    };
  }

  var awaitingReturn = false;
  var polling = null;

  function selectCode() {
    var r = d.createRange();
    r.selectNodeContents(el("sp-code"));
    var s = w.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function status(text, kind) {
    var s = el("sp-status");
    s.textContent = text;
    s.className = "sp-status" + (kind ? " " + kind : "");
  }

  function offline() { status("Couldn’t reach Islamdle. Check your connection and try again.", "bad"); }

  // Handle a claim answer. Returns true when there is no point asking again.
  function answer(r) {
    if (r.ok && r.token) {
      unlock(r.token);
      showThanks();
      return true;
    }
    if (r.reason === "below_minimum") {
      status("We received " + money(r.total, r.currency) + " — thank you! Ad-free starts at " +
        money(r.min, r.currency) + " in total; another gift with the same code adds up.", "partial");
      return true;
    }
    if (r.reason === "device_limit") {
      status("That email has already removed ads on " + r.max + " devices.", "bad");
      return true;
    }
    if (r.reason === "refunded") {
      status("That donation was refunded, so ads stay on.", "bad");
      return true;
    }
    if (r.status && r.status >= 400) {
      status("Something went wrong on our side. Please try again later.", "bad");
      return true;
    }
    status("We haven’t received a donation with this code yet. It can take a minute to arrive.", "bad");
    return false;
  }

  // Donations arrive a few seconds after payment, so keep asking for a while.
  function poll(times) {
    if (polling) clearTimeout(polling);
    status("Checking for your donation…");
    var left = times;
    (function ask() {
      call({ action: "claim", secret: secret() }).then(function (r) {
        var final = answer(r);
        if (!final && --left > 0) {
          status("Waiting for Buy Me a Coffee to confirm… (this can take up to a minute)");
          polling = setTimeout(ask, 5000);
        }
      }, offline);
    })();
  }

  function showThanks() {
    el("sp-steps").hidden = true;
    el("sp-thanks").hidden = false;
  }

  function open(e) {
    if (e) e.preventDefault();
    if (!el("modal-support")) inject();
    var box = el("modal-support");
    el("sp-steps").hidden = adFree();
    el("sp-thanks").hidden = !adFree();
    status("");
    code().then(function (c) { el("sp-code").textContent = c; });
    box.hidden = false;
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
    Array.prototype.forEach.call(d.querySelectorAll("[data-support]"), function (a) {
      a.hidden = !BMC_URL;
      a.onclick = open;
    });
    Array.prototype.forEach.call(d.querySelectorAll("[data-support-cta]"), function (a) {
      a.textContent = adFree()
        ? "Jazāk Allāhu khayran — ads are off on this device"
        : "Enjoying Islamdle? Support it and remove the ads";
    });
  }

  function boot() {
    paintEntryPoints();
    recheck();
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", boot);
  else boot();

  w.IslamdleSupport = { adFree: adFree, open: open };
})(window, document);
