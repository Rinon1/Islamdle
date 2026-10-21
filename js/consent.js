/* Islamdle — consent manager.
 *
 * Loads BEFORE anything that could set a cookie or call an ad/analytics
 * endpoint. Nothing non-essential runs until the visitor has chosen.
 *
 * Signals Google Consent Mode v2, so when Google tags (AdSense, GA4, Ad
 * Manager) are added later they respect this choice from the first page view
 * instead of firing and asking afterwards.
 *
 * NOTE: this banner is not an IAB TCF-certified CMP. Google requires a
 * certified CMP to serve ads to visitors in the EEA and the UK. See README.
 */
(function (w, d) {
  "use strict";

  var KEY = "islamdle.consent.v1";
  var VERSION = 1;
  var MAX_AGE_DAYS = 180;      // re-ask after six months, the usual practice

  /* ------------------------------------------------- consent mode v2 ---- */

  // The dataLayer must exist and be set to "denied" before any Google tag
  // loads, otherwise the tag fires once before consent is known.
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  w.gtag = w.gtag || gtag;

  function pushConsent(state, how) {
    gtag("consent", how, {
      ad_storage: state.ads ? "granted" : "denied",
      ad_user_data: state.ads ? "granted" : "denied",
      ad_personalization: state.ads ? "granted" : "denied",
      analytics_storage: state.analytics ? "granted" : "denied",
      functionality_storage: "granted",   // the game itself
      security_storage: "granted"
    });
  }

  /* --------------------------------------------------------- storage ---- */

  function read() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!raw || raw.version !== VERSION) return null;
      var age = (Date.now() - raw.ts) / 86400000;
      if (age > MAX_AGE_DAYS) return null;
      return raw;
    } catch (e) { return null; }
  }

  function write(state) {
    var rec = {
      version: VERSION,
      ts: Date.now(),
      analytics: !!state.analytics,
      ads: !!state.ads
    };
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { /* private mode */ }
    return rec;
  }

  /* ----------------------------------------------------------- state ---- */

  var current = read();
  var listeners = [];

  // The default is always denied — it represents the pre-consent state, and
  // hard-coding it means tampered storage can never produce a granted default.
  // A stored choice is then applied as an update, on every page load.
  pushConsent({ analytics: false, ads: false }, "default");
  if (current) pushConsent(current, "update");

  function apply(state, persist) {
    current = persist ? write(state) : state;
    pushConsent(current, "update");
    listeners.forEach(function (fn) {
      try { fn(current); } catch (e) { /* a listener must not break the rest */ }
    });
    hide();
  }

  /* ------------------------------------------------------------- ui ----- */

  var banner, panel;

  function el(id) { return d.getElementById(id); }

  // Injected rather than copied into every page, so the wording and the
  // purposes can only ever be defined in one place.
  var MARKUP =
    '<div class="consent" id="consent" role="dialog" aria-label="Privacy choices" hidden>' +
      '<div class="consent-inner">' +
        '<div>' +
          '<strong>Your privacy choice</strong>' +
          '<p>Islamdle needs a little storage on your device to remember today\'s ' +
          'puzzle and your streak — that part is essential and always on. We would ' +
          'also like to use analytics and advertising cookies. You can say no, and ' +
          'the game works exactly the same. ' +
          '<a href="privacy.html">Read the privacy policy</a>.</p>' +
        '</div>' +
        '<div class="consent-actions">' +
          '<button class="btn" type="button" id="consent-accept">Accept all</button>' +
          '<button class="btn ghost" type="button" id="consent-reject">Reject non-essential</button>' +
          '<button class="btn ghost" type="button" id="consent-manage">Manage</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="modal" id="consent-panel" hidden><div class="box">' +
      '<h2>Privacy settings</h2>' +
      '<div class="pref"><div><strong>Essential</strong>' +
        '<p>Remembers today\'s puzzle, your guesses, your streak and this choice. ' +
        'Stored only in your browser and never sent anywhere.</p></div>' +
        '<span class="always">Always on</span></div>' +
      '<label class="pref" for="consent-analytics"><div><strong>Analytics</strong>' +
        '<p>Anonymous counts of which modes get played and how hard the puzzles are, ' +
        'so they can be tuned.</p></div>' +
        '<input type="checkbox" id="consent-analytics"></label>' +
      '<label class="pref" for="consent-ads"><div><strong>Advertising</strong>' +
        '<p>Lets advertising partners use cookies to measure and personalise ads. ' +
        'Turning this off means ads, if any are shown, are non-personalised.</p></div>' +
        '<input type="checkbox" id="consent-ads"></label>' +
      '<div class="pref-actions">' +
        '<button class="btn" type="button" id="consent-save">Save choices</button>' +
        '<button class="btn ghost" type="button" id="consent-panel-close">Cancel</button>' +
      '</div>' +
    '</div></div>';

  function inject() {
    if (el("consent")) return;           // a page may still supply its own
    var host = d.createElement("div");
    host.innerHTML = MARKUP;
    while (host.firstChild) d.body.appendChild(host.firstChild);
  }

  // The banner is fixed to the bottom and is tall on a phone — around a third
  // of the viewport. Without this the page cannot scroll far enough to clear
  // it and the content underneath, including answer buttons, is unreachable.
  function reserveSpaceForBanner() {
    if (!banner || banner.hidden) {
      document.body.style.paddingBottom = "";
      return;
    }
    document.body.style.paddingBottom = (banner.offsetHeight + 24) + "px";
  }

  // Watching the element is more reliable than guessing when layout settles:
  // it fires on the 0 -> full-height transition when the banner is shown, and
  // again whenever the text reflows (rotation, address bar, font loading).
  function watchBannerSize() {
    if (!banner || typeof ResizeObserver === "undefined") return;
    if (watchBannerSize.observing) return;
    watchBannerSize.observing = true;
    new ResizeObserver(reserveSpaceForBanner).observe(banner);
  }

  function show() {
    banner = el("consent");
    if (banner) {
      banner.hidden = false;
      watchBannerSize();
      reserveSpaceForBanner();
      requestAnimationFrame(reserveSpaceForBanner);
    }
  }

  function hide() {
    if (banner) banner.hidden = true;
    reserveSpaceForBanner();
    closePanel();
  }

  function openPanel() {
    panel = el("consent-panel");
    if (!panel) return;
    el("consent-analytics").checked = !!(current && current.analytics);
    el("consent-ads").checked = !!(current && current.ads);
    // Never stack the two — the banner would cover the Save button.
    if (banner) banner.hidden = true;
    reserveSpaceForBanner();          // release the banner's space with it
    panel.hidden = false;
  }

  function closePanel() {
    if (panel) panel.hidden = true;
    // Cancelled without ever choosing? Put the banner back.
    if (!current && banner) banner.hidden = false;
    reserveSpaceForBanner();
  }

  function wire() {
    inject();
    banner = el("consent");
    panel = el("consent-panel");
    if (!banner) return;

    el("consent-accept").onclick = function () {
      apply({ analytics: true, ads: true }, true);
    };
    el("consent-reject").onclick = function () {
      apply({ analytics: false, ads: false }, true);
    };
    el("consent-manage").onclick = openPanel;

    el("consent-save").onclick = function () {
      apply({
        analytics: el("consent-analytics").checked,
        ads: el("consent-ads").checked
      }, true);
    };
    el("consent-panel-close").onclick = closePanel;

    panel.addEventListener("click", function (e) {
      if (e.target === panel) closePanel();
    });

    // Footer link, so a choice can always be changed.
    var reopen = el("consent-reopen");
    if (reopen) {
      reopen.onclick = function (e) {
        e.preventDefault();
        show();
        openPanel();
      };
    }

    if (!current) show();

    // Rotating the phone or an address bar collapsing changes the height.
    window.addEventListener("resize", reserveSpaceForBanner);
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }

  /* ---------------------------------------------------------- public ---- */

  w.IslamdleConsent = {
    get: function () { return current ? { analytics: current.analytics, ads: current.ads } : null; },
    allows: function (what) { return !!(current && current[what]); },
    // Run fn now if already allowed, and again whenever consent changes to allow it.
    when: function (what, fn) {
      if (current && current[what]) fn(current);
      listeners.push(function (state) { if (state[what]) fn(state); });
    },
    onChange: function (fn) { listeners.push(fn); },
    reopen: function () { show(); openPanel(); }
  };
})(window, document);
