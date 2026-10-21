/* Islamdle — the game page.
 *
 * One shell, six mechanics. Each mechanic supplies: the puzzle for today at the
 * chosen level, how to render it, and how to judge an answer. Progress, timing
 * and scoring are handled once, here, for all of them.
 *
 * Every mode is unlimited: a wrong answer is marked and you keep going. The
 * answer is never revealed before you get it right.
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

  /* ------------------------------------------------- arrangement state --- */
  /* Shared by the two ordering modes (Order the Events, Ayah Scramble).
   * `placed` holds item indices or null per position; `marks` holds the
   * correctness of each position from the last check, and survives until that
   * position changes, so you can see what you already had right.            */

  function initArrangement(count) {
    var saved = RUN.layout;
    var placed, marks;
    if (saved && saved.placed && saved.placed.length === count) {
      placed = saved.placed.slice();
      marks = (saved.marks || []).slice();
    } else {
      placed = new Array(count).fill(null);
      marks = new Array(count).fill(null);
    }
    while (marks.length < count) marks.push(null);
    return { placed: placed, marks: marks, held: null };
  }

  function saveArrangement() {
    RUN.layout = { placed: PUZZLE.placed.slice(), marks: PUZZLE.marks.slice() };
    I.persist();
  }

  function clearMark(pos) {
    if (pos >= 0 && pos < PUZZLE.marks.length) PUZZLE.marks[pos] = null;
  }

  // Put `item` (an index) at `pos`. If something is already there it is
  // displaced — swapped with where `item` came from, or returned to the pool.
  function placeAt(pos, item, fromPos) {
    var existing = PUZZLE.placed[pos];
    PUZZLE.placed[pos] = item;
    clearMark(pos);
    if (fromPos !== null && fromPos !== undefined) {
      PUZZLE.placed[fromPos] = existing;   // may be null; that is a plain move
      clearMark(fromPos);
    }
    PUZZLE.held = null;
    saveArrangement();
  }

  function removeAt(pos) {
    PUZZLE.placed[pos] = null;
    clearMark(pos);
    PUZZLE.held = null;
    saveArrangement();
  }

  function arrangementComplete() {
    return PUZZLE.placed.every(function (v) { return v !== null; });
  }

  // Marks every position, returns true when the whole arrangement is right.
  function checkArrangement() {
    var right = true;
    PUZZLE.placed.forEach(function (v, i) {
      var ok = v === i;
      PUZZLE.marks[i] = ok ? "ok" : "bad";
      if (!ok) right = false;
    });
    saveArrangement();
    return right;
  }

  /* --- wiring shared by both ordering modes ------------------------------
   * Dragging uses Pointer Events rather than HTML5 drag-and-drop, because
   * HTML5 DnD never fires on touch screens — on a phone a finger drag would
   * do nothing at all. Pointer events give one code path for mouse, finger
   * and stylus alike. A press that does not travel past DRAG_SLOP is treated
   * as a tap instead, so tap-a-word-then-tap-a-slot still works.           */

  var DRAG_SLOP = 6;   // px of travel before a press becomes a drag

  // A real pointerup is followed by a click. Without this the click would land
  // on the slot just dropped into and pick the word straight back up.
  var suppressClicksUntil = 0;

  function wireArrangement(stage, onCheck) {
    if (RUN.done) return;

    function refresh() { draw(); }
    var drag = null;

    function targetUnder(x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el) return null;
      var slot = el.closest("[data-slot]");
      if (slot) return { kind: "slot", pos: Number(slot.dataset.slot), el: slot };
      if (el.closest("[data-pool]")) return { kind: "pool", el: el.closest("[data-pool]") };
      return null;
    }

    function highlight(target) {
      Array.prototype.forEach.call(stage.querySelectorAll(".over"), function (e) {
        e.classList.remove("over");
      });
      if (target && target.kind === "slot") target.el.classList.add("over");
    }

    function endDrag() {
      if (drag && drag.ghost) drag.ghost.remove();
      if (drag && drag.el) drag.el.classList.remove("dragging");
      highlight(null);
      drag = null;
    }

    Array.prototype.forEach.call(stage.querySelectorAll("[data-item]"), function (el) {
      var item = Number(el.dataset.item);
      var from = el.dataset.pos === undefined ? null : Number(el.dataset.pos);

      el.addEventListener("pointerdown", function (e) {
        if (e.button) return;                       // primary button / touch only
        drag = {
          item: item, from: from, el: el,
          x0: e.clientX, y0: e.clientY, moved: false, ghost: null
        };
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not captureable */ }
      });

      el.addEventListener("pointermove", function (e) {
        if (!drag || drag.el !== el) return;
        var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;

        if (!drag.moved && Math.sqrt(dx * dx + dy * dy) < DRAG_SLOP) return;

        if (!drag.moved) {
          drag.moved = true;
          PUZZLE.held = { item: drag.item, from: drag.from };
          el.classList.add("dragging");
          // A clone that follows the pointer. pointer-events:none keeps it out
          // of the way of elementFromPoint.
          var g = el.cloneNode(true);
          g.className = el.className.replace("dragging", "") + " drag-ghost";
          g.style.width = el.getBoundingClientRect().width + "px";
          document.body.appendChild(g);
          drag.ghost = g;
        }
        e.preventDefault();
        drag.ghost.style.left = e.clientX + "px";
        drag.ghost.style.top = e.clientY + "px";
        highlight(targetUnder(e.clientX, e.clientY));
      });

      function finish(e) {
        if (!drag || drag.el !== el) return;
        if (!drag.moved) {
          // A tap: pick this item up, or put down the one already held.
          if (PUZZLE.held && PUZZLE.held.item === item) PUZZLE.held = null;
          else PUZZLE.held = { item: item, from: from };
          endDrag();
          refresh();
          return;
        }
        if (drag.ghost) drag.ghost.style.display = "none";   // so it is not hit-tested
        var target = targetUnder(e.clientX, e.clientY);
        var held = { item: drag.item, from: drag.from };
        endDrag();
        suppressClicksUntil = Date.now() + 400;

        if (target && target.kind === "slot") {
          placeAt(target.pos, held.item, held.from);
        } else if (target && target.kind === "pool" && held.from !== null) {
          removeAt(held.from);
        } else {
          PUZZLE.held = null;                                 // dropped nowhere
        }
        refresh();
      }

      el.addEventListener("pointerup", finish);
      el.addEventListener("pointercancel", function () { endDrag(); refresh(); });
    });

    // Tapping a slot: place what is held, or lift out what is sitting there.
    Array.prototype.forEach.call(stage.querySelectorAll("[data-slot]"), function (el) {
      var pos = Number(el.dataset.slot);
      el.addEventListener("click", function (e) {
        if (Date.now() < suppressClicksUntil) return;         // the drag handled it
        if (e.target.closest("[data-item]") && !PUZZLE.held) return;
        if (PUZZLE.held) placeAt(pos, PUZZLE.held.item, PUZZLE.held.from);
        else if (PUZZLE.placed[pos] !== null) PUZZLE.held = { item: PUZZLE.placed[pos], from: pos };
        refresh();
      });
    });

    // Tapping empty pool space returns a held word to the pool.
    var pool = stage.querySelector("[data-pool]");
    if (pool) {
      pool.addEventListener("click", function (e) {
        if (Date.now() < suppressClicksUntil) return;
        if (e.target.closest("[data-item]")) return;
        if (PUZZLE.held && PUZZLE.held.from !== null) removeAt(PUZZLE.held.from);
        PUZZLE.held = null;
        refresh();
      });
    }

    var check = $("check");
    if (check) check.onclick = onCheck;
  }

  // `base` keeps the two ordering modes visually independent: the timeline uses
  // bordered rows, the ayah line uses bare underlines.
  function slotClass(pos, base) {
    var m = PUZZLE.marks[pos];
    var filled = PUZZLE.placed[pos] !== null;
    var held = PUZZLE.held && PUZZLE.held.from === pos;
    return (base || "slot") + (filled ? " filled" : " empty") +
           (m ? " " + m : "") + (held ? " held" : "");
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
          if (i < shown) {
            html += '<li class="clue-item"><span>Clue ' + (i + 1) + "</span>" + esc(p.clues[i]) + "</li>";
          } else {
            html += '<li class="clue-item locked"><span>Clue ' + (i + 1) + "</span>Locked</li>";
          }
        }
        html += "</ol>";

        html += '<div class="options">';
        PUZZLE.options.forEach(function (opt) {
          var picked = RUN.tries.indexOf(opt) !== -1;
          var right = RUN.solved && opt === p.answer;
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
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Spot the Mistake: pick the false statement ---------- */
    "spot-mistake": {
      prompt: "One of these is wrong. Which one?",
      sub: "Two statements are correct. Keep going until you find the odd one out.",
      load: function () { return { p: todaysItem("spot-mistake") }; },
      render: function (stage) {
        var p = PUZZLE.p;
        var html = '<div class="statements">';
        p.statements.forEach(function (s, i) {
          var picked = RUN.tries.indexOf(String(i)) !== -1;
          var cls = "stmt";
          if (RUN.solved && i === p.wrong) cls += " ok";
          else if (picked) cls += " bad";
          html += '<button type="button" class="' + cls + '" data-opt="' + i + '"' +
                  (picked || RUN.done ? " disabled" : "") + ">" +
                  '<span class="stmt-n">' + (i + 1) + "</span>" + esc(s) +
                  (RUN.solved && i === p.wrong ? '<em class="stmt-tag">this one is wrong</em>' : "") +
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
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Order the Events: build the sequence ---------------- */
    "order-events": {
      prompt: "Put these in the order they happened.",
      sub: "Drag them onto the timeline, earliest first. Check as often as you like.",
      load: function () {
        var p = todaysItem("order-events");
        var a = initArrangement(p.events.length);
        a.p = p;
        a.shuffled = seededShuffle(p.events.map(function (_, i) { return i; }),
                                   "oe" + LEVEL + I.puzzleNumber());
        return a;
      },
      render: function (stage) {
        var p = PUZZLE.p;
        var html = '<ol class="timeline">';
        PUZZLE.placed.forEach(function (item, pos) {
          html += '<li class="' + slotClass(pos) + '" data-slot="' + pos + '">' +
                  '<span class="slot-n">' + (pos + 1) + "</span>";
          if (item === null) {
            html += '<span class="slot-hint">drop an event here</span>';
          } else {
            html += '<span class="chip in-slot" data-item="' + item + '" data-pos="' + pos + '">' +
                    esc(p.events[item].text) + "</span>";
            if (RUN.solved) html += '<em class="when">' + esc(p.events[item].when) + "</em>";
          }
          html += "</li>";
        });
        html += "</ol>";

        if (!RUN.done) {
          var remaining = PUZZLE.shuffled.filter(function (i) {
            return PUZZLE.placed.indexOf(i) === -1;
          });
          html += '<div class="pool" data-pool>';
          if (!remaining.length) {
            html += '<span class="pool-empty">All placed — press Check.</span>';
          } else {
            remaining.forEach(function (item) {
              var held = PUZZLE.held && PUZZLE.held.item === item && PUZZLE.held.from === null;
              html += '<button type="button" class="chip' + (held ? " held" : "") +
                      '" data-item="' + item + '">' + esc(p.events[item].text) + "</button>";
            });
          }
          html += "</div>";
          html += '<button type="button" class="btn" id="check"' +
                  (arrangementComplete() ? "" : " disabled") + ">Check my order</button>";
        }
        stage.innerHTML = html;

        wireArrangement(stage, function () {
          var right = checkArrangement();
          submit(PUZZLE.placed.join(","), right);
        });
      },
      answerText: function () {
        return PUZZLE.p.events.map(function (e, i) { return (i + 1) + ". " + e.text; }).join("  ·  ");
      },
      explain: function () { return PUZZLE.p.explain; },
      score: function () { return RUN.tries.length; }
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
            html += '<li class="gap' + (RUN.solved ? " revealed" : "") + '">' +
                    (RUN.solved ? esc(it) : "?") + "</li>";
          } else {
            html += "<li>" + esc(it) + "</li>";
          }
        });
        html += "</ol>";

        html += '<div class="options">';
        PUZZLE.options.forEach(function (opt) {
          var picked = RUN.tries.indexOf(opt) !== -1;
          var right = RUN.solved && opt === PUZZLE.answer;
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
      score: function () { return RUN.tries.length; }
    },

    /* ------------- Ayah Scramble --------------------------------------- */
    "scramble": {
      prompt: "Put the words back in order.",
      sub: "Drag each word onto a line. Check as often as you like — correct words turn green.",
      load: function () {
        var pool = DATA.scramble[LEVEL];
        var p = pool[I.dailyIndex("scramble:" + LEVEL, pool.length)];
        var a = initArrangement(p.words.length);
        a.p = p;
        a.shuffled = seededShuffle(p.words.map(function (_, i) { return i; }),
                                   "sc" + LEVEL + I.puzzleNumber());
        return a;
      },
      render: function (stage) {
        var p = PUZZLE.p;

        // The line of slots. Rendered RTL so position 1 is the rightmost.
        var html = '<div class="ayah-line" dir="rtl">';
        PUZZLE.placed.forEach(function (item, pos) {
          html += '<span class="' + slotClass(pos, "word-slot") + '" data-slot="' + pos + '">';
          if (item !== null) {
            html += '<span class="word in-slot" data-item="' + item + '" data-pos="' + pos + '">' +
                    esc(p.words[item]) + "</span>";
          }
          html += "</span>";
        });
        html += "</div>";

        if (!RUN.done) {
          var remaining = PUZZLE.shuffled.filter(function (i) {
            return PUZZLE.placed.indexOf(i) === -1;
          });
          html += '<div class="pool words" data-pool dir="rtl">';
          if (!remaining.length) {
            html += '<span class="pool-empty" dir="ltr">All placed — press Check.</span>';
          } else {
            remaining.forEach(function (item) {
              var held = PUZZLE.held && PUZZLE.held.item === item && PUZZLE.held.from === null;
              html += '<button type="button" class="word' + (held ? " held" : "") +
                      '" data-item="' + item + '">' + esc(p.words[item]) + "</button>";
            });
          }
          html += "</div>";
          html += '<button type="button" class="btn" id="check"' +
                  (arrangementComplete() ? "" : " disabled") + ">Check</button>";
        }
        stage.innerHTML = html;

        wireArrangement(stage, function () {
          var right = checkArrangement();
          submit(PUZZLE.placed.join(","), right);
        });
      },
      answerText: function () {
        return PUZZLE.p.words.join(" ");
      },
      explain: function () {
        var p = PUZZLE.p;
        return "Surah " + p.name + ", ayah " + p.ayah + ". “" + p.translation + "”";
      },
      score: function () { return RUN.tries.length; }
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
      // On a phone the keyboard covers the lower half of the screen; eight
      // suggestion rows would push the last few underneath it.
      DATA.surahs.filter(function (s) {
        return RUN.tries.indexOf(s.name) === -1 && normalise(s.name).indexOf(q) !== -1;
      }).slice(0, window.innerWidth < 760 ? 5 : 8).forEach(function (s, i) {
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

  // Unlimited tries. Only a correct answer finishes a puzzle — the answer is
  // never revealed to someone who has not got there.
  function submit(value, correct) {
    if (RUN.done) return;
    RUN.tries.push(value);

    if (correct) {
      RUN.solved = true;
      RUN.done = true;
      I.stopClock(RUN);
      I.finish(MODE, LEVEL, true, RUN.tries.length);
      flash("");
    } else {
      flash(wrongMessage());
    }
    I.persist();
    draw();
  }

  function wrongMessage() {
    if (MODE === "five-clues") {
      var left = PUZZLE.p.clues.length - RUN.tries.length;
      if (left > 0) return "Not quite — here is clue " + (RUN.tries.length + 1) + ".";
      return "Not quite. Keep trying.";
    }
    if (MODE === "order-events" || MODE === "scramble") {
      var right = PUZZLE.marks.filter(function (m) { return m === "ok"; }).length;
      return right
        ? right + " in the right place. Move the red ones and check again."
        : "None in the right place yet. Try another arrangement.";
    }
    return "Not quite. Try again.";
  }

  function flash(t) { $("msg").textContent = t || ""; }

  /* ------------------------------------------------------------ result -- */

  function renderResult() {
    var box = $("result");
    box.innerHTML = "";
    if (!RUN.done) return;

    var game = GAMES[MODE];
    var title = RUN.tries.length === 1
      ? "Right, first time — mā shāʾ Allāh!"
      : "Solved in " + RUN.tries.length + " tries";

    var el = document.createElement("div");
    el.className = "result";
    el.innerHTML =
      "<h2>" + title + "</h2>" +
      '<div class="answer">' + esc(game.answerText()) + "</div>" +
      '<div class="result-meta">' +
        "<span>" + I.formatDuration(RUN.ms) + "</span>" +
        "<span>" + Math.max(0, RUN.tries.length - 1) +
        (RUN.tries.length - 1 === 1 ? " mistake" : " mistakes") + "</span>" +
      "</div>" +
      '<p class="learn">' + esc(game.explain()) + "</p>" +
      '<div class="grid-preview">' + shareGrid() + "</div>" +
      "<button class='btn' id='btn-share'>Share result</button> " +
      "<button class='btn ghost' id='btn-next'>Next puzzle</button>" +
      "<p>Next set in <span class='countdown' id='countdown'>…</span></p>";
    box.appendChild(el);

    $("btn-share").onclick = share;
    $("btn-next").onclick = function () { openResults(); };
    tick();
  }

  // Wrapped into rows so a long run of guesses does not overflow the card.
  function shareGrid() {
    var squares = RUN.tries.map(function (_, i) {
      return i === RUN.tries.length - 1 && RUN.solved ? "🟩" : "🟥";
    });
    var rows = [];
    for (var i = 0; i < squares.length; i += 10) {
      rows.push(squares.slice(i, i + 10).join(""));
    }
    return rows.join("\n") || "🟥";
  }

  function share() {
    var text = "Islamdle #" + I.puzzleNumber() + " · " + I.MODES[MODE].label +
      " (" + LEVEL + ")\n" + shareGrid() + "\n" +
      (RUN.solved ? RUN.tries.length + (RUN.tries.length === 1 ? " try" : " tries") : "missed") +
      " · " + I.formatDuration(RUN.ms) +
      "\n" + location.origin + "/";
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

  /* ------------------------------------------------- results summary --- */

  function nextUnsolved() {
    var from = I.ORDER.indexOf(MODE);
    for (var i = 1; i <= I.ORDER.length; i++) {
      var k = I.ORDER[(from + i) % I.ORDER.length];
      if (!I.run(k, LEVEL).done) return k;
    }
    return null;
  }

  function openResults() {
    var s = I.summary(LEVEL);
    var next = nextUnsolved();
    var all = s.solved === s.total;

    var rows = s.rows.map(function (r) {
      var state = r.solved
        ? '<span class="rs-ok">' + r.tries + (r.tries === 1 ? " try" : " tries") + "</span>"
        : r.played ? '<span class="rs-part">in progress</span>'
                   : '<span class="rs-none">not started</span>';
      return '<tr class="' + (r.mode === MODE ? "rs-current" : "") + '">' +
             "<td>" + esc(r.label) + "</td>" +
             "<td>" + state + "</td>" +
             "<td>" + (r.played ? r.misses : "–") + "</td>" +
             "<td>" + (r.played ? I.formatDuration(r.ms) : "–") + "</td>" +
             "</tr>";
    }).join("");

    var num = $("rs-num");
    if (num) num.textContent = "#" + I.puzzleNumber() + " · " + LEVEL;

    $("results-body").innerHTML =
      '<div class="stats">' +
        "<div><b>" + s.solved + " / " + s.total + "</b><span>Solved</span></div>" +
        "<div><b>" + s.misses + "</b><span>Mistakes</span></div>" +
        "<div><b>" + I.formatDuration(s.ms) + "</b><span>Total time</span></div>" +
      "</div>" +
      '<table class="rs-table"><tr><th>Puzzle</th><th>Result</th><th>Mistakes</th><th>Time</th></tr>' +
      rows + "</table>" +
      (all ? '<p class="rs-done">All six solved today — jazāk Allāhu khayran.</p>' : "") +
      '<div class="pref-actions">' +
        "<button class='btn' id='rs-next'>" +
          (next ? "Next: " + esc(I.MODES[next].label) : "Back to all puzzles") +
        "</button>" +
        "<button class='btn ghost' id='rs-share'>Share the set</button>" +
        "<button class='btn ghost' data-close>Close</button>" +
      "</div>";

    $("modal-results").hidden = false;

    $("rs-next").onclick = function () {
      location.href = next
        ? "play.html?mode=" + next + "&level=" + LEVEL
        : "index.html";
    };
    $("rs-share").onclick = function () {
      var line = s.rows.filter(function (r) { return r.played; }).map(function (r) {
        return I.MODES[r.mode].label + ": " + (r.solved ? r.tries : "–");
      }).join(" · ");
      copy("Islamdle #" + I.puzzleNumber() + " (" + LEVEL + ")\n" +
           s.solved + "/" + s.total + " solved · " + s.misses + " mistakes · " +
           I.formatDuration(s.ms) + "\n" + line + "\n" + location.origin + "/");
      $("modal-results").hidden = true;
    };
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
        I.stopClock(RUN);
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
    var res = document.createElement("button");
    res.type = "button";
    res.className = "rs-open";
    res.textContent = "Results";
    res.onclick = openResults;
    other.appendChild(res);
  }

  function tick() {
    var el = $("countdown");
    if (el) el.textContent = I.formatCountdown(I.msToReset());
    var t = $("p-timer");
    if (t) t.textContent = I.formatDuration(I.elapsed(RUN));
  }

  /* ---------------------------------------------------------------- draw */

  function draw() {
    var game = GAMES[MODE];
    $("prompt").textContent = game.prompt;
    $("sub").textContent = RUN.done ? "Come back tomorrow for the next one." : game.sub;
    game.render($("stage"));
    renderResult();
    renderChrome();
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
        if (!RUN.done) I.startClock();
        draw();
        setInterval(tick, 1000);

        // Stop the clock when the puzzle is not actually in front of anyone.
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) { I.stopClock(RUN); I.persist(); }
          else if (!RUN.done) I.startClock();
        });
        window.addEventListener("pagehide", function () {
          I.stopClock(RUN); I.persist();
        });

        Array.prototype.forEach.call(document.querySelectorAll(".modal"), function (m) {
          m.addEventListener("click", function (e) {
            if (e.target === m || e.target.hasAttribute("data-close")) m.hidden = true;
          });
        });
        document.addEventListener("keydown", function (e) {
          if (e.key === "Escape") {
            Array.prototype.forEach.call(document.querySelectorAll(".modal"), function (m) {
              m.hidden = true;
            });
          }
        });
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
