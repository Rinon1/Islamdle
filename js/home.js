/* Islamdle — homepage.
 * Renders the level picker, the six game cards, and today's status line.
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

  /* ---------------------------------------------------------- levels -- */

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
        paintCards();
        paintToday();
      };
    });
  }

  /* ----------------------------------------------------------- cards -- */

  function paintCards() {
    var grid = $("game-grid");
    grid.innerHTML = "";

    I.ORDER.forEach(function (key) {
      var mode = I.MODES[key];
      var r = I.run(key, level);

      var a = document.createElement("a");
      a.className = "game-card" + (r.done ? " done" : "");
      a.href = "play.html?mode=" + encodeURIComponent(key) + "&level=" + encodeURIComponent(level);

      var status = r.done
        ? (r.solved
            ? '<span class="pill ok">Solved in ' + r.tries.length + '</span>'
            : '<span class="pill miss">Finished</span>')
        : '<span class="pill">Play</span>';

      a.innerHTML =
        '<div class="gc-top">' +
          '<span class="gc-icon" aria-hidden="true">' + mode.icon + "</span>" +
          "<div>" +
            "<b>" + esc(mode.label) + "</b>" +
            '<span class="gc-tag">' + esc(mode.tag) + "</span>" +
          "</div>" +
          status +
        "</div>" +
        "<p>" + esc(mode.blurb) + "</p>" +
        '<p class="gc-level"><span>' + level + "</span> " + esc(mode.levels[level]) + "</p>" +
        '<span class="gc-time">' + esc(mode.time) + "</span>";

      grid.appendChild(a);
    });
  }

  /* ----------------------------------------------------------- today -- */

  function paintToday() {
    $("t-number").textContent = "#" + I.puzzleNumber();
    $("t-done").textContent = I.solvedToday(level) + " / " + I.ORDER.length;
    $("t-streak").textContent = "🔥 " + I.dailyStreak();
  }

  function tick() {
    $("t-reset").textContent = I.formatCountdown(I.msToReset());
  }

  /* ------------------------------------------------------------ boot -- */

  function boot() {
    wireLevels();
    paintLevels();
    paintCards();
    paintToday();
    tick();
    setInterval(tick, 1000);

    var report = $("report-link");
    if (report) {
      report.onclick = function (e) {
        e.preventDefault();
        report.insertAdjacentHTML("afterend",
          ' <span class="inline-note">— put your contact address here before launch.</span>');
        report.onclick = null;
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.Islamdle);
