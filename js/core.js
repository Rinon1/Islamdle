/* Islamdle — shared core.
 *
 * Everything the homepage and the game both need: the daily seed, the mode
 * registry, difficulty, and saved progress. No DOM work happens here.
 */
window.Islamdle = (function () {
  "use strict";

  var EPOCH = Date.UTC(2026, 0, 1);   // set #1 = 1 Jan 2026 UTC
  var DAY = 86400000;
  var STORE = "islamdle.v2";
  var LEVEL_KEY = "islamdle.level";

  var LEVELS = ["easy", "medium", "hard"];

  /* ----------------------------------------------------------- modes --- */

  // Order here is the order shown on the homepage.
  var MODES = {
    "five-clues": {
      label: "Five Clues",
      tag: "Name it before the clues run out",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-five-clues" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-five-clues)" stroke="url(#gi-five-clues)"><path stroke="none" fill-rule="evenodd" d="M27 7a20 20 0 1 1 0 40a20 20 0 1 1 0-40Zm0 7.5a12.5 12.5 0 1 0 0 25a12.5 12.5 0 1 0 0-25Z"/><path fill="none" stroke-width="10" stroke-linecap="round" d="M42.5 42.5 55 55"/><g stroke="none"><circle cx="27" cy="27" r="2.9"/><circle cx="21.2" cy="21.2" r="2.9"/><circle cx="32.8" cy="21.2" r="2.9"/><circle cx="21.2" cy="32.8" r="2.9"/><circle cx="32.8" cy="32.8" r="2.9"/></g></g></svg>',
      blurb: "Clues appear one at a time. Name the thing before you run out — " +
             "the earlier you get it, the better your score.",
      time: "1 min",
      levels: {
        easy: "Pillars and terms everyone knows.",
        medium: "More context needed before it clicks.",
        hard: "Specific, but still fair."
      }
    },
    "spot-mistake": {
      label: "Spot the Mistake",
      tag: "One of three statements is false",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-spot-mistake" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-spot-mistake)" stroke="url(#gi-spot-mistake)"><g stroke="none"><rect x="6" y="9" width="52" height="11" rx="5.5"/><rect x="6" y="26.5" width="28" height="11" rx="5.5" opacity=".5"/><rect x="6" y="44" width="52" height="11" rx="5.5"/></g><path fill="none" stroke-width="6" stroke-linecap="round" d="M42 25l13 13M55 25 42 38"/></g></svg>',
      blurb: "Two statements are correct and one is not. Find the one that is wrong.",
      time: "1 min",
      levels: {
        easy: "The error is obvious once you read it.",
        medium: "One subtle error among plausible facts.",
        hard: "Two statements both sound right."
      }
    },
    "order-events": {
      label: "Order the Events",
      tag: "Put the Seerah back in order",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-order-events" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-order-events)" stroke="url(#gi-order-events)"><g stroke="none"><path d="M12 33a7.5 7.5 0 1 1 0 15a4.2 7.5 0 1 0 0-15Z"/><path d="M30 25.5a10 10 0 1 1 0 20Z"/><path d="M30 25.5a10 10 0 1 0 0 20" opacity=".35"/><circle cx="50" cy="26" r="11.5"/><path d="M50 49l9 6-9 6Z"/></g><path fill="none" stroke-width="4.5" stroke-linecap="round" d="M6 55h44"/></g></svg>',
      blurb: "Events from the Seerah and early Islamic history, shuffled. " +
             "Put them back into the order they happened.",
      time: "2 min",
      levels: {
        easy: "Two events, far apart in time.",
        medium: "Three events to sequence.",
        hard: "Five events with close timelines."
      }
    },
    "missing-piece": {
      label: "The Missing Piece",
      tag: "Complete a well-known set",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-missing-piece" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-missing-piece)" stroke="url(#gi-missing-piece)"><path stroke="none" d="M32 8 39 15 49 25 56 32 49 39V49H39L32 56 25 49H15V39L8 32 15 25V15H25Z"/><path fill="none" stroke-width="1.8" stroke-dasharray="2.6 2.2" stroke-linejoin="round" opacity=".75" d="M39.5 15.5H48.5V24.5Z"/><path stroke="none" d="M46 8h11v11Z"/></g></svg>',
      blurb: "A well-known set is shown with one item taken out. Name what is missing.",
      time: "1 min",
      levels: {
        easy: "Sets almost everyone can complete.",
        medium: "Sets you need to have learned.",
        hard: "Longer sets, and the order matters."
      }
    },
    "scramble": {
      label: "Ayah Scramble",
      tag: "Rebuild an ayah word by word",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-scramble" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-scramble)" stroke="url(#gi-scramble)"><g stroke="none"><rect x="3" y="34" width="16" height="12" rx="3"/><rect x="22" y="10" width="14" height="12" rx="3"/><rect x="22" y="44" width="14" height="4" rx="2"/><path d="M24 28h10l-5 6Z"/><path fill-rule="evenodd" d="M51 29a11 11 0 1 1 0 22a11 11 0 1 1 0-22Zm0 4.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z"/><circle cx="51" cy="40" r="2.6"/></g></g></svg>',
      blurb: "The words of a short, familiar ayah are shuffled. Put them back " +
             "in the right order.",
      time: "2 min",
      levels: {
        easy: "Four or five words, very familiar.",
        medium: "Six to eight words.",
        hard: "Longer passages, fewer moves."
      }
    },
    "surah": {
      label: "Which Surah",
      tag: "Close in on the surah of the day",
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-surah" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><g fill="url(#gi-surah)" stroke="url(#gi-surah)"><g stroke="none"><path d="M6 15 29.5 21v19L6 34Z"/><path d="M58 15 34.5 21v19L58 34Z"/></g><path fill="none" stroke-width="6" stroke-linecap="round" d="M15 59 46 41M49 59 18 41"/></g></svg>',
      blurb: "Guess the surah. Each guess compares revelation place, length, " +
             "juz and verse count against the answer.",
      time: "2 min",
      levels: {
        easy: "Drawn from the best-known surahs.",
        medium: "Any surah of reasonable length.",
        hard: "All 114, including the short ones."
      }
    }
  };

  var ORDER = Object.keys(MODES);

  /* ------------------------------------------------------ daily seed --- */

  function puzzleNumber() {
    var now = new Date();
    var today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.floor((today - EPOCH) / DAY) + 1;
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }

  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }

  // Walks the pool in a fixed pseudo-random order, keyed by mode AND level so
  // the three levels move through their pools independently.
  //
  // The step is coprime to the pool length, which makes this a single endless
  // cycle: every entry appears once per poolLength days and the gap between
  // any entry's repeats is always exactly poolLength. Re-seeding the offset
  // per cycle would look more random but lets an entry recur a few days after
  // its last appearance, right across a cycle boundary — so it is not done.
  function dailyIndex(key, poolLength, n) {
    if (poolLength <= 1) return 0;
    n = n || puzzleNumber();
    var offset = hash(key + "|offset") % poolLength;
    var step = 1 + (hash(key + "|step") % (poolLength - 1));
    while (gcd(step, poolLength) !== 1) step = (step % (poolLength - 1)) + 1;
    return (offset + (n - 1) * step) % poolLength;
  }

  function msToReset() {
    var now = new Date();
    var next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(0, next - now.getTime());
  }

  function formatCountdown(ms) {
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return pad(Math.floor(ms / 3600000)) + ":" +
           pad(Math.floor(ms / 60000) % 60) + ":" +
           pad(Math.floor(ms / 1000) % 60);
  }

  /* --------------------------------------------------------- storage --- */

  var SAVE;

  function load() {
    try { SAVE = JSON.parse(localStorage.getItem(STORE) || "{}"); }
    catch (e) { SAVE = {}; }
    if (!SAVE.runs) SAVE.runs = {};      // progress, keyed "mode:level"
    if (!SAVE.stats) SAVE.stats = {};    // per mode:level
    if (!SAVE.daily) SAVE.daily = { lastN: 0, streak: 0, best: 0 };
    // Every day something was solved, so streaks can be merged across devices
    // when signed in. Older saves only had the streak; rebuild what it implies.
    if (!SAVE.days) {
      var d = SAVE.daily;
      SAVE.days = [];
      for (var i = Math.max(1, d.lastN - Math.min(d.streak, 400) + 1); d.streak && i <= d.lastN; i++) SAVE.days.push(i);
    }
    return SAVE;
  }

  function persist() {
    try { localStorage.setItem(STORE, JSON.stringify(SAVE)); } catch (e) { /* private mode */ }
  }

  function getLevel() {
    var v;
    try { v = localStorage.getItem(LEVEL_KEY); } catch (e) { v = null; }
    return LEVELS.indexOf(v) === -1 ? "medium" : v;
  }

  function setLevel(level) {
    if (LEVELS.indexOf(level) === -1) return;
    try { localStorage.setItem(LEVEL_KEY, level); } catch (e) { /* ignore */ }
  }

  function runKey(mode, level) { return mode + ":" + level; }

  // Per-day progress for one mode at one level.
  //
  // `ms` accumulates only the time a puzzle was actually open and unsolved, so
  // leaving a tab sitting overnight does not count against the player.
  function run(mode, level) {
    var k = runKey(mode, level);
    var n = puzzleNumber();
    var r = SAVE.runs[k];
    if (!r || r.n !== n) {
      r = { n: n, tries: [], solved: false, done: false, ms: 0, layout: null };
      SAVE.runs[k] = r;
    }
    if (typeof r.ms !== "number") r.ms = 0;   // migrate older saves
    if (r.layout === undefined) r.layout = null;
    return r;
  }

  // Clock for the puzzle currently on screen. The page calls startClock when it
  // renders an unsolved puzzle and stopClock when it is solved or left.
  var clockFrom = null;

  function startClock() {
    if (clockFrom === null) clockFrom = Date.now();
  }

  function stopClock(r) {
    if (clockFrom === null) return;
    if (r) r.ms += Date.now() - clockFrom;
    clockFrom = null;
  }

  // Elapsed including the in-flight segment, for a live display.
  function elapsed(r) {
    return r.ms + (clockFrom === null ? 0 : Date.now() - clockFrom);
  }

  function formatDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    if (m < 60) return m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }

  // Today's totals across every mode at one level, for the results summary.
  function summary(level) {
    var n = puzzleNumber();
    var rows = ORDER.map(function (m) {
      var r = SAVE.runs[runKey(m, level)];
      var fresh = !r || r.n !== n;
      return {
        mode: m,
        label: MODES[m].label,
        played: !fresh && r.tries.length > 0,
        solved: !fresh && r.solved,
        tries: fresh ? 0 : r.tries.length,
        misses: fresh ? 0 : Math.max(0, r.tries.length - (r.solved ? 1 : 0)),
        ms: fresh ? 0 : elapsed(r)
      };
    });
    return {
      rows: rows,
      solved: rows.filter(function (r) { return r.solved; }).length,
      total: rows.length,
      misses: rows.reduce(function (a, r) { return a + r.misses; }, 0),
      ms: rows.reduce(function (a, r) { return a + r.ms; }, 0)
    };
  }

  function stats(mode, level) {
    var k = runKey(mode, level);
    if (!SAVE.stats[k]) {
      SAVE.stats[k] = { played: 0, solved: 0, streak: 0, best: 0, lastN: 0, dist: {} };
    }
    return SAVE.stats[k];
  }

  // Called once when a puzzle finishes, win or lose.
  function finish(mode, level, won, tries) {
    var st = stats(mode, level);
    var n = puzzleNumber();
    if (st.lastN !== n) {
      st.played += 1;
      st.lastN = n;
      if (won) {
        st.solved += 1;
        st.streak = st.lastN === n ? (st.streak || 0) + 1 : 1;
        st.best = Math.max(st.best, st.streak);
        var bucket = tries >= 6 ? "6+" : String(tries);
        st.dist[bucket] = (st.dist[bucket] || 0) + 1;
      } else {
        st.streak = 0;
      }
    }
    if (won) bumpDailyStreak();
    persist();
  }

  // One overall streak for "played something today", which is the number
  // people actually care about.
  var dayListeners = [];

  function bumpDailyStreak() {
    var d = SAVE.daily;
    var n = puzzleNumber();
    if (d.lastN === n) return;
    d.streak = d.lastN === n - 1 ? d.streak + 1 : 1;
    d.best = Math.max(d.best, d.streak);
    d.lastN = n;
    if (SAVE.days.indexOf(n) === -1) SAVE.days.push(n);
    dayListeners.forEach(function (fn) { fn(n); });
  }

  // Merge days played on other devices (from the account) and recount the
  // streak from the full list.
  function mergeDays(list) {
    var seen = {};
    SAVE.days.concat(list || []).forEach(function (n) { if (n > 0) seen[n] = true; });
    var days = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    SAVE.days = days.slice(-1000);

    var best = 0, run = 0, prev = null;
    days.forEach(function (n) {
      run = prev === n - 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = n;
    });
    var d = SAVE.daily;
    if (days.length) {
      d.lastN = days[days.length - 1];
      d.streak = run;
    }
    d.best = Math.max(d.best, best);
    persist();
  }

  function dailyStreak() {
    var d = SAVE.daily;
    var n = puzzleNumber();
    return (d.lastN === n || d.lastN === n - 1) ? d.streak : 0;
  }

  function solvedToday(level) {
    var n = puzzleNumber();
    return ORDER.filter(function (m) {
      var r = SAVE.runs[runKey(m, level)];
      return r && r.n === n && r.solved;
    }).length;
  }

  function doneToday(level) {
    var n = puzzleNumber();
    return ORDER.filter(function (m) {
      var r = SAVE.runs[runKey(m, level)];
      return r && r.n === n && r.done;
    }).length;
  }

  load();

  return {
    LEVELS: LEVELS,
    MODES: MODES,
    ORDER: ORDER,
    puzzleNumber: puzzleNumber,
    hash: hash,
    dailyIndex: dailyIndex,
    msToReset: msToReset,
    formatCountdown: formatCountdown,
    formatDuration: formatDuration,
    getLevel: getLevel,
    setLevel: setLevel,
    run: run,
    stats: stats,
    finish: finish,
    startClock: startClock,
    stopClock: stopClock,
    elapsed: elapsed,
    summary: summary,
    dailyStreak: dailyStreak,
    bestStreak: function () { return SAVE.daily.best; },
    playedDays: function () { return SAVE.days.slice(); },
    mergeDays: mergeDays,
    onDayPlayed: function (fn) { dayListeners.push(fn); },
    solvedToday: solvedToday,
    doneToday: doneToday,
    persist: persist,
    save: function () { return SAVE; }
  };
})();
