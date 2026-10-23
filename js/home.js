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

  // Signed out: a quiet "Sign in". Signed in: the streak, which is the only
  // reason to sign in besides ad-free.
  function paintAccount(user) {
    var bar = $("account-bar");
    var acc = window.IslamdleAccount;
    if (!acc || !acc.configured()) { bar.hidden = true; return; }
    bar.hidden = false;
    if (!user) {
      bar.innerHTML = '<button type="button" class="link-btn" id="acc-in">Sign in to keep your streak</button>';
      $("acc-in").onclick = function () {
        acc.signIn().catch(function () { $("acc-in").textContent = "Sign-in isn't available right now"; });
      };
      return;
    }
    var streak = I.dailyStreak();
    bar.innerHTML =
      '<span class="acc-streak" title="Best: ' + I.bestStreak() + ' days">' +
        '<b>' + streak + '</b> day streak</span>' +
      '<span class="acc-sep">·</span>' +
      '<button type="button" class="link-btn" id="acc-out" title="' + esc(user.email) + '">Sign out</button>';
    $("acc-out").onclick = function () { acc.signOut(); };
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
    if (window.IslamdleAccount) window.IslamdleAccount.onChange(paintAccount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.Islamdle);
