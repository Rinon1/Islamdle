/* Islamdle — the game page.
 *
 * One shell, six mechanics. Each mechanic supplies: the puzzle for today at the
 * chosen level, how to render it, and how to judge an answer. Progress and
 * scoring are handled once, here, for all of them.
 */
(function (I) {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var DATA = null;
  var MODE, LEVEL, RUN, PUZZLE;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function qs(name, fallback) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : fallback;
  }

  // Deterministic shuffle, so the scrambled order is the same for everyone.
  function seededShuffle(arr, seedStr) {
    var a = arr.slice();
    var h = I.hash(seedStr);
    for (var i = a.length - 1; i > 0; i--) {
      h = (h * 1664525 + 1013904223) >>> 0;
      var j = h % (i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function todaysItem(poolKey) {
    var pool = DATA[poolKey][LEVEL];
    return pool[I.dailyIndex(poolKey + ":" + LEVEL, pool.length)];
  }

  /* ===================================================== the mechanics === */

  var GAMES = {

    /* ---- Five Clues: clues reveal one at a time as you get it wrong ---- */
    "five-clues": {
      prompt: "What is being described?",
      sub: "A new clue appears each time you get it wrong. Fewer clues is a better score.",
      load: function () {
        var p = todaysItem("five-clues");
        return { p: p, options: seededShuffle(p.options, "fc" + LEVEL + I.puzzleNumber()) };
      },
      render: function (stage) {
        var p = PUZZLE.p;
        var shown = Math.min(RUN.tries.length + 1, p.clues.length);

        var html = '<ol class="clues">';
        for (var i = 0; i < p.clues.length; i++) {
          if (i < shown || RUN.done) {
            html += '<li class="clue-item"><span>Clue ' + (i + 1) + "</span>" + esc(p.clues[i]) + "</li>";
          } else {
            html += '<li class="clue-item locked"><span>Clue ' + (i + 1) + "</span>Locked</li>";
          }
        }
        html += "</ol>";

        html += '<div class="options">';
        PUZZLE.options.forEach(function (opt) {
          var picked = RUN.tries.indexOf(opt) !== -1;
          var right = RUN.done && opt === p.answer;
          var cls = right ? "opt ok" : picked ? "opt bad" : "opt";
          html += '<button type="button" class="' + cls + '" data-opt="' + esc(opt) + '"' +
                  (picked || RUN.done ? " disabled" : "") + ">" + esc(opt) + "</button>";
        });
        html += "</div>";
        stage.innerHTML = html;

        bindOptions(stage, function (opt) { return opt === p.answer; });
      },
      answerText: function () { return PUZZLE.p.answer; },
      explain: function () { return PUZZLE.p.explain; },
      // Out of clues and still wrong -> the puzzle ends.
      exhausted: function () { return RUN.tries.length >= PUZZLE.p.clues.length; },
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Spot the Mistake: one pick, three statements -------- */
    "spot-mistake": {
      prompt: "One of these is wrong. Which one?",
      sub: "Two statements are correct. You get one attempt.",
      load: function () { return { p: todaysItem("spot-mistake") }; },
      render: function (stage) {
        var p = PUZZLE.p;
        var html = '<div class="statements">';
        p.statements.forEach(function (s, i) {
          var picked = RUN.tries.indexOf(String(i)) !== -1;
          var cls = "stmt";
          if (RUN.done) cls += i === p.wrong ? " ok" : " dim";
          if (picked && i !== p.wrong) cls += " bad";
          html += '<button type="button" class="' + cls + '" data-opt="' + i + '"' +
                  (RUN.done ? " disabled" : "") + ">" +
                  '<span class="stmt-n">' + (i + 1) + "</span>" + esc(s) +
                  (RUN.done && i === p.wrong ? '<em class="stmt-tag">this one is wrong</em>' : "") +
                  "</button>";
        });
        html += "</div>";
        stage.innerHTML = html;

        bindOptions(stage, function (v) { return Number(v) === p.wrong; });
      },
      answerText: function () {
        return "Statement " + (PUZZLE.p.wrong + 1);
      },
      explain: function () { return PUZZLE.p.explain; },
      exhausted: function () { return RUN.tries.length >= 1; },
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Order the Events: build the sequence ---------------- */
    "order-events": {
      prompt: "Put these in the order they happened.",
      sub: "Tap to add them to the timeline, earliest first. Tap one in the timeline to take it back out.",
      load: function () {
        var p = todaysItem("order-events");
        return {
          p: p,
          shuffled: seededShuffle(p.events.map(function (_, i) { return i; }),
                                  "oe" + LEVEL + I.puzzleNumber())
        };
      },
      render: function (stage) {
        var p = PUZZLE.p;
        var placed = PUZZLE.placed || (PUZZLE.placed = []);

        var html = '<ol class="timeline">';
        for (var i = 0; i < p.events.length; i++) {
          if (i < placed.length) {
            var ev = p.events[placed[i]];
            var cls = "slot filled";
            if (RUN.done) cls += placed[i] === i ? " ok" : " bad";
            html += '<li class="' + cls + '" data-slot="' + i + '">' +
                    '<span class="slot-n">' + (i + 1) + "</span>" + esc(ev.text) +
                    (RUN.done ? '<em class="when">' + esc(ev.when) + "</em>" : "") + "</li>";
          } else {
            html += '<li class="slot empty"><span class="slot-n">' + (i + 1) + "</span>—</li>";
          }
        }
        html += "</ol>";

        if (!RUN.done) {
          html += '<div class="pool">';
          PUZZLE.shuffled.forEach(function (idx) {
            if (placed.indexOf(idx) !== -1) return;
            html += '<button type="button" class="chip" data-add="' + idx + '">' +
                    esc(p.events[idx].text) + "</button>";
          });
          html += "</div>";
          if (placed.length === p.events.length) {
            html += '<button type="button" class="btn" id="check">Check my order</button>';
          }
        }
        stage.innerHTML = html;

        if (RUN.done) return;

        Array.prototype.forEach.call(stage.querySelectorAll("[data-add]"), function (b) {
          b.onclick = function () {
            placed.push(Number(b.dataset.add));
            draw();
          };
        });
        Array.prototype.forEach.call(stage.querySelectorAll(".slot.filled"), function (b) {
          b.onclick = function () {
            placed.splice(Number(b.dataset.slot), 1);
            draw();
          };
        });
        var check = $("check");
        if (check) {
          check.onclick = function () {
            var correct = placed.every(function (v, i) { return v === i; });
            submit(placed.join(","), correct);
          };
        }
      },
      answerText: function () {
        return PUZZLE.p.events.map(function (e, i) { return (i + 1) + ". " + e.text; }).join("  ·  ");
      },
      explain: function () { return PUZZLE.p.explain; },
      exhausted: function () { return RUN.tries.length >= 3; },
      score: function () { return RUN.tries.length; },
      // Wrong order: clear the board so the next attempt starts fresh.
      onWrong: function () { PUZZLE.placed = []; }
    },

    /* ------------- The Missing Piece ----------------------------------- */
    "missing-piece": {
      prompt: "One item is missing. Which is it?",
      sub: "The set is shown with a gap. Name what belongs there.",
      load: function () {
        var pool = DATA["missing-piece"][LEVEL];
        var p = pool[I.dailyIndex("missing-piece:" + LEVEL, pool.length)];
        var hidden = I.hash("mp" + LEVEL + I.puzzleNumber()) % p.items.length;
        var answer = p.items[hidden];

        // Decoys must be same-category to be any challenge at all — a month
        // offered against a list of prophets gives the answer away. Each set
        // supplies its own; only fall back to other sets if it has none.
        var others = p.decoys ? p.decoys.slice() : [];
        if (others.length < 3) {
          pool.forEach(function (q) {
            if (q === p) return;
            q.items.forEach(function (it) {
              if (p.items.indexOf(it) === -1 && others.indexOf(it) === -1) others.push(it);
            });
          });
        }
        others = seededShuffle(others, "mpd" + LEVEL + I.puzzleNumber())
                   .filter(function (it) { return it !== answer; })
                   .slice(0, 3);

        return {
          p: p, hidden: hidden, answer: answer,
          options: seededShuffle(others.concat([answer]), "mpo" + LEVEL + I.puzzleNumber())
        };
      },
      render: function (stage) {
        var p = PUZZLE.p;
        var html = '<p class="setname">' + esc(p.set) + "</p>";
        html += '<ol class="setlist">';
        p.items.forEach(function (it, i) {
          if (i === PUZZLE.hidden) {
            html += '<li class="gap' + (RUN.done ? " revealed" : "") + '">' +
                    (RUN.done ? esc(it) : "?") + "</li>";
          } else {
            html += "<li>" + esc(it) + "</li>";
          }
        });
        html += "</ol>";

        html += '<div class="options">';
        PUZZLE.options.forEach(function (opt) {
          var picked = RUN.tries.indexOf(opt) !== -1;
          var right = RUN.done && opt === PUZZLE.answer;
          var cls = right ? "opt ok" : picked ? "opt bad" : "opt";
          html += '<button type="button" class="' + cls + '" data-opt="' + esc(opt) + '"' +
                  (picked || RUN.done ? " disabled" : "") + ">" + esc(opt) + "</button>";
        });
        html += "</div>";
        stage.innerHTML = html;

        bindOptions(stage, function (opt) { return opt === PUZZLE.answer; });
      },
      answerText: function () { return PUZZLE.answer; },
      explain: function () { return PUZZLE.p.explain; },
      exhausted: function () { return RUN.tries.length >= 2; },
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Ayah Scramble --------------------------------------- */
    "scramble": {
      prompt: "Put the words back in order.",
      sub: "Tap the words in the right order. Tap a placed word to take it back.",
      load: function () {
        var pool = DATA.scramble[LEVEL];
        var p = pool[I.dailyIndex("scramble:" + LEVEL, pool.length)];
        return {
          p: p,
          shuffled: seededShuffle(p.words.map(function (_, i) { return i; }),
                                  "sc" + LEVEL + I.puzzleNumber()),
          placed: []
        };
      },
      render: function (stage) {
        var p = PUZZLE.p;
        var placed = PUZZLE.placed;

        var html = '<div class="ayah-line' + (RUN.done ? " done" : "") + '" dir="rtl">';
        if (!placed.length) {
          html += '<span class="ayah-empty">Tap the words below…</span>';
        } else {
          placed.forEach(function (idx, pos) {
            var cls = "word placed";
            if (RUN.done) cls += idx === pos ? " ok" : " bad";
            html += '<button type="button" class="' + cls + '" data-remove="' + pos + '"' +
                    (RUN.done ? " disabled" : "") + ">" + esc(p.words[idx]) + "</button>";
          });
        }
        html += "</div>";

        if (!RUN.done) {
          html += '<div class="pool" dir="rtl">';
          PUZZLE.shuffled.forEach(function (idx) {
            if (placed.indexOf(idx) !== -1) return;
            html += '<button type="button" class="word" data-add="' + idx + '">' +
                    esc(p.words[idx]) + "</button>";
          });
          html += "</div>";
          if (placed.length === p.words.length) {
            html += '<button type="button" class="btn" id="check">Check</button>';
          }
        }
        stage.innerHTML = html;

        if (RUN.done) return;

        Array.prototype.forEach.call(stage.querySelectorAll("[data-add]"), function (b) {
          b.onclick = function () { placed.push(Number(b.dataset.add)); draw(); };
        });
        Array.prototype.forEach.call(stage.querySelectorAll("[data-remove]"), function (b) {
          b.onclick = function () { placed.splice(Number(b.dataset.remove), 1); draw(); };
        });
        var check = $("check");
        if (check) {
          check.onclick = function () {
            var correct = placed.every(function (v, i) { return v === i; });
            submit(placed.join(","), correct);
          };
        }
      },
      answerText: function () {
        return PUZZLE.p.words.join(" ");
      },
      explain: function () {
        var p = PUZZLE.p;
        return "Surah " + p.name + ", ayah " + p.ayah + ". “" + p.translation + "”";
      },
      exhausted: function () { return RUN.tries.length >= 3; },
      score: function () { return RUN.tries.length; },
      onWrong: function () { PUZZLE.placed = []; }
    },

    /* ------------- Which Surah: the comparison grid --------------------- */
    "surah": {
      prompt: "Guess today's surah.",
      sub: "Each guess is compared against the answer. Unlimited guesses.",
      columns: [
        { key: "place", label: "Revealed", type: "exact" },
        { key: "length", label: "Length", type: "exact" },
        { key: "sajdah", label: "Has sajdah", type: "exact" },
        { key: "juz", label: "Starts in juz", type: "number" },
        { key: "verses", label: "Verses", type: "number" },
        { key: "id", label: "Number", type: "number" }
      ],
      load: function () {
        var pool = surahPool();
        return { p: pool[I.dailyIndex("surah:" + LEVEL, pool.length)], pool: pool };
      },
      render: function (stage) {
        var cols = GAMES.surah.columns;
        var answer = PUZZLE.p;

        var html = "";
        if (!RUN.done) {
          html += '<div class="guessbox"><input id="guess" type="text" autocomplete="off" ' +
                  'spellcheck="false" placeholder="Type a surah name…" aria-label="Your guess">' +
                  '<div class="suggestions" id="suggestions" role="listbox"></div></div>';
        }

        if (RUN.tries.length) {
          html += '<div class="board"><table><tr><th>Surah</th>';
          cols.forEach(function (c) { html += "<th>" + esc(c.label) + "</th>"; });
          html += "</tr>";
          RUN.tries.slice().reverse().forEach(function (nm, row) {
            var g = byName(DATA.surahs, nm);
            html += '<tr><td class="cell name">' + esc(g.name) +
                    '<span class="ar">' + esc(g.arabic) + "</span></td>";
            cols.forEach(function (c, i) {
              var r = compare(c, g, answer);
              html += '<td class="cell ' + r.cls + '" style="animation-delay:' +
                      (row === 0 ? i * 0.15 : 0) + 's">' + esc(r.text) +
                      (r.arrow ? '<span class="arrow">' + r.arrow + "</span>" : "") + "</td>";
            });
            html += "</tr>";
          });
          html += "</table></div>" +
            '<div class="legend">' +
            '<span><i class="swatch" style="background:var(--ok)"></i> Correct</span>' +
            '<span><i class="swatch" style="background:var(--bad)"></i> Incorrect</span>' +
            "<span>⬆️ Higher</span><span>⬇️ Lower</span></div>";
        }
        stage.innerHTML = html;

        if (!RUN.done) wireTypeahead();
      },
      answerText: function () {
        return PUZZLE.p.name + " (" + PUZZLE.p.meaning + ")";
      },
      explain: function () {
        var s = PUZZLE.p;
        return "Surah " + s.name + " — " + s.arabic + ", “" + s.meaning + "”. Number " + s.id +
               " in the mushaf, " + s.verses + " ayahs, revealed in " +
               (s.place === "Makki" ? "Makkah" : "Madinah") + ", beginning in juz " + s.juz + ".";
      },
      exhausted: function () { return false; },     // unlimited
      score: function () { return RUN.tries.length; }
    }
  };

  /* ---- helpers used by the surah grid ---- */

  function surahPool() {
    if (LEVEL === "easy") {
      // Surahs most people could name: the opening, and the short closing ones.
      return DATA.surahs.filter(function (s) { return s.id === 1 || s.id >= 103; });
    }
    if (LEVEL === "medium") {
      return DATA.surahs.filter(function (s) { return s.verses >= 10; });
    }
    return DATA.surahs;
  }

  function byName(pool, name) {
    for (var i = 0; i < pool.length; i++) if (pool[i].name === name) return pool[i];
    return null;
  }

  function compare(col, guess, answer) {
    var g = guess[col.key], a = answer[col.key];
    if (col.type === "number") {
      if (g === a) return { cls: "ok", text: String(g) };
      return { cls: "bad", text: String(g), arrow: a > g ? "⬆️" : "⬇️" };
    }
    return { cls: g === a ? "ok" : "bad", text: String(g) };
  }

  function normalise(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/['’ʿʾ`\-\s]/g, "");
  }

  function wireTypeahead() {
    var input = $("guess"), box = $("suggestions");
    if (!input) return;
    input.focus();

    input.addEventListener("input", function () {
      box.innerHTML = "";
      var q = normalise(input.value);
      if (!q) return;
      DATA.surahs.filter(function (s) {
        return RUN.tries.indexOf(s.name) === -1 && normalise(s.name).indexOf(q) !== -1;
      }).slice(0, 8).forEach(function (s, i) {
        var row = document.createElement("div");
        if (i === 0) row.className = "active";
        row.innerHTML = "<span>" + esc(s.name) + '</span><span class="ar">' + esc(s.arabic) + "</span>";
        row.onmousedown = function (e) { e.preventDefault(); pick(s.name); };
        box.appendChild(row);
      });
    });

    input.addEventListener("keydown", function (e) {
      var rows = Array.prototype.slice.call(box.children);
      var at = rows.findIndex(function (r) { return r.className === "active"; });
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!rows.length) return;
        var to = e.key === "ArrowDown" ? Math.min(at + 1, rows.length - 1) : Math.max(at - 1, 0);
        rows.forEach(function (r) { r.className = ""; });
        rows[to].className = "active";
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (rows.length) pick(rows[Math.max(at, 0)].firstChild.textContent);
        else flash("No surah by that name.");
      }
    });

    function pick(name) {
      var s = byName(DATA.surahs, name);
      if (!s) { flash("No surah by that name."); return; }
      if (RUN.tries.indexOf(name) !== -1) { flash("Already guessed."); return; }
      submit(name, name === PUZZLE.p.name);
    }
  }

  /* ===================================================== shared engine === */

  function bindOptions(stage, isCorrect) {
    Array.prototype.forEach.call(stage.querySelectorAll("[data-opt]"), function (b) {
      b.onclick = function () {
        var v = b.dataset.opt;
        submit(v, isCorrect(v));
      };
    });
  }

  function submit(value, correct) {
    if (RUN.done) return;
    RUN.tries.push(value);

    var game = GAMES[MODE];
    if (correct) {
      RUN.solved = true;
      RUN.done = true;
      I.finish(MODE, LEVEL, true, RUN.tries.length);
    } else if (game.exhausted()) {
      RUN.done = true;
      I.finish(MODE, LEVEL, false, RUN.tries.length);
    } else {
      if (game.onWrong) game.onWrong();
      flash(wrongMessage());
    }
    I.persist();
    draw();
  }

  function wrongMessage() {
    var left = MODE === "five-clues"
      ? PUZZLE.p.clues.length - RUN.tries.length
      : null;
    if (left !== null) return "Not quite — here is clue " + (RUN.tries.length + 1) + ".";
    return "Not quite. Try again.";
  }

  function flash(t) { $("msg").textContent = t || ""; }

  /* ------------------------------------------------------------ result -- */

  function renderResult() {
    var box = $("result");
    box.innerHTML = "";
    if (!RUN.done) return;

    var game = GAMES[MODE];
    var title = RUN.solved
      ? (RUN.tries.length === 1 ? "Right, first time — mā shāʾ Allāh!"
                                : "Solved in " + RUN.tries.length + " tries")
      : "Not this time";

    var el = document.createElement("div");
    el.className = "result";
    el.innerHTML =
      "<h2>" + title + "</h2>" +
      '<div class="answer">' + esc(game.answerText()) + "</div>" +
      '<p class="learn">' + esc(game.explain()) + "</p>" +
      '<div class="grid-preview">' + shareGrid() + "</div>" +
      "<button class='btn' id='btn-share'>Share result</button> " +
      "<button class='btn ghost' id='btn-next'>Next puzzle</button>" +
      "<p>Next set in <span class='countdown' id='countdown'>…</span></p>";
    box.appendChild(el);

    $("btn-share").onclick = share;
    $("btn-next").onclick = goNext;
    tick();
  }

  function shareGrid() {
    if (MODE === "surah") {
      return RUN.tries.map(function (nm, i) {
        return i === RUN.tries.length - 1 && RUN.solved ? "🟩" : "🟥";
      }).join("");
    }
    return RUN.tries.map(function (_, i) {
      return i === RUN.tries.length - 1 && RUN.solved ? "🟩" : "🟥";
    }).join("") || "🟥";
  }

  function share() {
    var text = "Islamdle #" + I.puzzleNumber() + " · " + I.MODES[MODE].label +
      " (" + LEVEL + ")\n" + shareGrid() + "\n" +
      (RUN.solved ? RUN.tries.length + (RUN.tries.length === 1 ? " try" : " tries") : "missed") +
      "\n" + location.origin + location.pathname.replace(/play\.html$/, "");
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { copy(text); });
    } else { copy(text); }
  }

  function copy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(function () { flash("Copied to clipboard."); },
              function () { flash("Could not copy."); });
    } else { flash("Copying is not available here."); }
  }

  function goNext() {
    var from = I.ORDER.indexOf(MODE);
    for (var i = 1; i <= I.ORDER.length; i++) {
      var k = I.ORDER[(from + i) % I.ORDER.length];
      if (!I.run(k, LEVEL).done) {
        location.href = "play.html?mode=" + k + "&level=" + LEVEL;
        return;
      }
    }
    location.href = "index.html";
  }

  /* -------------------------------------------------------------- chrome */

  function renderChrome() {
    var mode = I.MODES[MODE];
    $("p-title").textContent = mode.label;
    $("p-meta").textContent = "#" + I.puzzleNumber() + " · " + LEVEL;
    document.title = "Islamdle — " + mode.label;

    var sw = $("levelswitch");
    sw.innerHTML = "";
    I.LEVELS.forEach(function (lv) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = lv[0].toUpperCase() + lv.slice(1);
      b.className = lv === LEVEL ? "on" : "";
      b.onclick = function () {
        I.setLevel(lv);
        location.href = "play.html?mode=" + MODE + "&level=" + lv;
      };
      sw.appendChild(b);
    });

    var other = $("othergames");
    other.innerHTML = "<span>Today:</span>";
    I.ORDER.forEach(function (k) {
      var r = I.run(k, LEVEL);
      var a = document.createElement("a");
      a.href = "play.html?mode=" + k + "&level=" + LEVEL;
      a.textContent = I.MODES[k].label + (r.done ? (r.solved ? " ✓" : " ·") : "");
      if (k === MODE) a.className = "here";
      other.appendChild(a);
    });
  }

  function tick() {
    var el = $("countdown");
    if (el) el.textContent = I.formatCountdown(I.msToReset());
  }

  /* ---------------------------------------------------------------- draw */

  function draw() {
    var game = GAMES[MODE];
    $("prompt").textContent = game.prompt;
    $("sub").textContent = RUN.done ? "Come back tomorrow for the next one." : game.sub;
    game.render($("stage"));
    renderResult();
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    MODE = qs("mode", "five-clues");
    LEVEL = qs("level", I.getLevel());
    if (!I.MODES[MODE]) MODE = "five-clues";
    if (I.LEVELS.indexOf(LEVEL) === -1) LEVEL = "medium";
    I.setLevel(LEVEL);

    fetch("data/islamdle.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        DATA = json;
        RUN = I.run(MODE, LEVEL);
        PUZZLE = GAMES[MODE].load();
        renderChrome();
        draw();
        setInterval(tick, 1000);
      })
      .catch(function (err) {
        $("prompt").textContent = "Could not load the puzzles.";
        $("sub").textContent = String(err.message || err) +
          " — if you opened this file directly, serve the folder over http instead.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})(window.Islamdle);
