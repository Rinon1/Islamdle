/* Islamdle — ad loader.
 *
 * Does nothing until ADSENSE_CLIENT is filled in after AdSense approves the
 * site. Then it fills the .ad-slot boxes on the page, never inside a puzzle,
 * and never for supporters (see js/support.js).
 *
 * Consent is handled by Consent Mode in consent.js: until a visitor accepts
 * ads, Google only serves limited, non-personalised ads.
 */
(function (w, d) {
  "use strict";

  var ADSENSE_CLIENT = "";   // "ca-pub-0000000000000000"
  // data-slot name on the page -> AdSense ad unit id.
  var UNITS = {
    "home-bottom": "",
    "play-bottom": ""
  };

  function start() {
    if (!ADSENSE_CLIENT) return;
    if (w.IslamdleSupport && w.IslamdleSupport.adFree()) return;

    var slots = d.querySelectorAll(".ad-slot[data-slot]");
    var filled = 0;
    Array.prototype.forEach.call(slots, function (slot) {
      var unit = UNITS[slot.dataset.slot];
      if (!unit) return;
      var ins = d.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.display = "block";
      ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
      ins.setAttribute("data-ad-slot", unit);
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
      slot.appendChild(ins);
      filled++;
    });
    if (!filled) return;

    var s = d.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADSENSE_CLIENT);
    d.head.appendChild(s);
    for (var i = 0; i < filled; i++) (w.adsbygoogle = w.adsbygoogle || []).push({});
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start);
  else start();
})(window, document);
