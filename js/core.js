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
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="cl-five-clues"><circle cx="39" cy="26" r="14"/></clipPath></defs><g transform="translate(-3 4)"><path d="M26 39 11 54" stroke="#9c6d2a" stroke-width="10" stroke-linecap="round"/><path d="M24.5 40.5 12.5 52.5" stroke="#c79a4c" stroke-width="3.2" stroke-linecap="round" opacity=".55"/><circle cx="37" cy="26" r="21" fill="#c79a4c"/><circle cx="39.5" cy="26" r="19.2" fill="#e2b965"/><g clip-path="url(#cl-five-clues)"><rect x="20" y="8" width="40" height="40" fill="#e9d6a6"/><circle cx="45" cy="26" r="15" fill="#f7ecd0"/></g><path d="M35 21.4a4.6 4.6 0 1 1 6.3 4.3c-1.5.6-2.3 1.6-2.3 3.1v1.2" fill="none" stroke="#d65c5c" stroke-width="3.6" stroke-linecap="round"/><circle cx="39" cy="35" r="2.2" fill="#d65c5c"/></g></svg>',
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
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-order-events" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><circle cx="10.5" cy="45" r="8.4" fill="#e2b965" opacity=".22"/><path fill="url(#gi-order-events)" d="M10.5 36.6 a8.4 8.4 0 0 1 0 16.8 a4.62 8.4 0 0 0 0 -16.8Z"/><circle cx="25" cy="36.5" r="8.8" fill="#e2b965" opacity=".22"/><path fill="url(#gi-order-events)" d="M25 27.7 a8.8 8.8 0 0 1 0 17.6Z"/><circle cx="39.8" cy="28" r="9.2" fill="#e2b965" opacity=".22"/><path fill="url(#gi-order-events)" d="M39.8 18.8 a9.2 9.2 0 0 1 0 18.4 a5.06 9.2 0 0 1 0 -18.4Z"/><circle cx="53.5" cy="19" r="9.6" fill="#e2b965" opacity=".22"/><circle cx="53.5" cy="19" r="9.6" fill="url(#gi-order-events)"/></svg>',
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
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gi-missing-piece" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="60"><stop offset="0" stop-color="#fbe3a4"/><stop offset=".5" stop-color="#e2b965"/><stop offset="1" stop-color="#a8772e"/></linearGradient></defs><path fill="none" stroke="#e2b965" stroke-width="2.2" stroke-dasharray="3.2 2.6" stroke-linejoin="round" d="M37 20H60V46H37V38.5A5.6 5.6 0 0 0 37 27.3Z"/><path fill="#e2b965" opacity=".12" d="M37 20H60V46H37V38.5A5.6 5.6 0 0 0 37 27.3Z"/><g fill="url(#gi-missing-piece)"><rect x="5" y="20" width="24" height="26" rx="2.5"/><circle cx="33" cy="32.9" r="5.6"/><rect x="27" y="29.5" width="6" height="6.8"/><circle cx="17" cy="19" r="5.4"/></g><path fill="#9c6d2a" opacity=".35" d="M5 36h24v7.5a2.5 2.5 0 0 1-2.5 2.5h-19A2.5 2.5 0 0 1 5 43.5Z"/></svg>',
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
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs></defs><g><rect x="41" y="24" width="16" height="16" rx="3.6" fill="#43b06a" stroke="#24190a" stroke-width="1.6"/><rect x="41.8" y="24.8" width="14.4" height="5" rx="2.4" fill="#ffffff" opacity=".22"/><text x="49" y="36.2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#24190a" font-family="\'Amiri\',\'Noto Naskh Arabic\',\'Geeza Pro\',\'Segoe UI\',Arial,sans-serif">آ</text></g><g><rect x="24" y="24" width="16" height="16" rx="3.6" fill="#e2b965" stroke="#24190a" stroke-width="1.6"/><rect x="24.8" y="24.8" width="14.4" height="5" rx="2.4" fill="#ffffff" opacity=".22"/><text x="32" y="36.2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#24190a" font-family="\'Amiri\',\'Noto Naskh Arabic\',\'Geeza Pro\',\'Segoe UI\',Arial,sans-serif">ي</text></g><g><rect x="7" y="24" width="16" height="16" rx="3.6" fill="#43b06a" stroke="#24190a" stroke-width="1.6"/><rect x="7.8" y="24.8" width="14.4" height="5" rx="2.4" fill="#ffffff" opacity=".22"/><text x="15" y="36.2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#24190a" font-family="\'Amiri\',\'Noto Naskh Arabic\',\'Geeza Pro\',\'Segoe UI\',Arial,sans-serif">ة</text></g><g transform="rotate(-14 14 12)"><rect x="6" y="4" width="16" height="16" rx="3.6" fill="#d65c5c" stroke="#24190a" stroke-width="1.6"/><rect x="6.8" y="4.8" width="14.4" height="5" rx="2.4" fill="#ffffff" opacity=".22"/><text x="14" y="16.2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#24190a" font-family="\'Amiri\',\'Noto Naskh Arabic\',\'Geeza Pro\',\'Segoe UI\',Arial,sans-serif">ب</text></g><g transform="rotate(12 48 52)"><rect x="40" y="44" width="16" height="16" rx="3.6" fill="#e2b965" stroke="#24190a" stroke-width="1.6"/><rect x="40.8" y="44.8" width="14.4" height="5" rx="2.4" fill="#ffffff" opacity=".22"/><text x="48" y="56.2" text-anchor="middle" font-size="10.5" font-weight="700" fill="#24190a" font-family="\'Amiri\',\'Noto Naskh Arabic\',\'Geeza Pro\',\'Segoe UI\',Arial,sans-serif">ن</text></g></svg>',
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
      icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><defs></defs><path fill="#8f4230" d="M40 33.5 46.5 35.5 16 58.5 9 56.5Z"/><path fill="#c2613a" d="M40 33.5 43 34.4 13 57.7 9 56.5Z"/><path fill="#d6834a" d="M24 33.5 17.5 35.5 48 58.5 55 56.5Z"/><path fill="#b8653a" d="M17.5 35.5 20.5 34.6 51.5 57.4 48 58.5Z"/><path fill="#2b7f66" d="M4.5 23.5Q19 23.5 32 34.5V37.5Q18.5 26.5 4 26.5Z"/><path fill="#5fbf9b" d="M59.5 23.5Q45 23.5 32 34.5V37.5Q45.5 26.5 60 26.5Z"/><path fill="#e9c46a" d="M6 21Q19 21 32 32V34.5Q19 23.5 5 23.5Z"/><path fill="#f6dc98" d="M58 21Q45 21 32 32V34.5Q45 23.5 59 23.5Z"/><path fill="#ead3ad" d="M32 22Q20 12 7 13L6 21Q19 21 32 32Z"/><path fill="#f7e9cf" d="M32 22Q44 12 57 13L58 21Q45 21 32 32Z"/><g fill="none" stroke="#c4a173" stroke-width="1" stroke-linecap="round"><path d="M11 16.2Q20 15.6 28.5 21.6M10.6 18.6Q19.5 18.2 28.5 24.4"/><path d="M53 16.2Q44 15.6 35.5 21.6M53.4 18.6Q44.5 18.2 35.5 24.4"/><path d="M14 21Q21 21 28.5 27M50 21Q43 21 35.5 27"/></g></svg>',
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
