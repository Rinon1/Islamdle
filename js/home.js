/* Islamdle — homepage.
 * The difficulty switch, the six games as LoLdle-style buttons, and the reset
 * countdown. Nothing else.
 */
(function (I) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var level = I.getLevel();

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function paintLevels() {
    Array.prototype.forEach.call(document.querySelectorAll(".level"), function (b) {
      var on = b.dataset.level === level;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.classList.toggle("on", on);
    });
  }

  function wireLevels() {
    Array.prototype.forEach.call(document.querySelectorAll(".level"), function (b) {
      b.onclick = function () {
        level = b.dataset.level;
        I.setLevel(level);
        paintLevels();
        paintModes();
      };
    });
  }

  function paintModes() {
    var list = $("game-grid");
    list.innerHTML = "";

    I.ORDER.forEach(function (key) {
      var mode = I.MODES[key];
      var done = I.run(key, level).solved;

      var a = document.createElement("a");
      a.className = "mode" + (done ? " done" : "");
      a.href = "play.html?mode=" + encodeURIComponent(key) + "&level=" + encodeURIComponent(level);
      a.innerHTML =
        '<span class="mode-icon" aria-hidden="true">' + mode.icon + "</span>" +
        '<span class="mode-body">' +
          "<b>" + esc(mode.label) + "</b>" +
          "<small>" + esc(mode.tag) + "</small>" +
        "</span>" +
        (done ? '<span class="mode-done" aria-label="Solved today">✓</span>' : "");
      list.appendChild(a);
    });
  }

  function tick() {
    $("t-reset").textContent = I.formatCountdown(I.msToReset());
  }

  function boot() {
    wireLevels();
    paintLevels();
    paintModes();
    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.Islamdle);
