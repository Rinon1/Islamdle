"""Generate Order the Events puzzles from the vetted table in tools/events.json.

Two events are only combined when their order is certain: the first one's
latest possible date (hi) comes before the second one's earliest (lo). So a
disputed date (the Isra and Mi'raj, Yarmuk, Qadisiyyah...) can never decide
an answer; it only appears next to events that are clearly before or after it.

  easy    2 well-known events, at least 5 years apart
  medium  3 events, each clearly after the one before
  hard    5 events within about 40 years of each other

Writes tools/additions/order-events-s1.json. Existing puzzles are skipped by
merge_additions.py. Run:  python tools/gen_order_events.py
"""
import itertools
import json
import os
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
EVENTS = json.load(open(os.path.join(TOOLS, "events.json"), encoding="utf-8"))["events"]
CONTENT = json.load(open(os.path.join(TOOLS, "content.json"), encoding="utf-8"))
TARGET = 200


def before(a, b):
    return a["hi"] < b["lo"]


def ordered(chain):
    return all(before(a, b) for a, b in zip(chain, chain[1:]))


def phrase(e, first=False):
    text = e["text"]
    if not first and text.startswith("The "):
        text = "the " + text[4:]
    when = e["when"].replace(" (", ", ").replace(")", "")
    return "%s (%s)" % (text, when)


def explain(chain):
    parts = [phrase(e, i == 0) for i, e in enumerate(chain)]
    if len(parts) == 2:
        text = "First %s, then %s." % (parts[0][0].lower() + parts[0][1:] if parts[0].startswith("The ") else parts[0], parts[1])
    else:
        first = parts[0][0].lower() + parts[0][1:] if parts[0].startswith("The ") else parts[0]
        text = "First %s, then %s, and last %s." % (first, ", then ".join(parts[1:-1]), parts[-1])
    if any("disputed" in e["when"] or "some " in e["when"] for e in chain):
        text += " Historians give different years for some of these, but the order here is clear either way."
    return text


def sources(chain):
    out = []
    for e in chain:
        for s in e["sources"]:
            if s not in out:
                out.append(s)
    return out


def candidates(level):
    ev = sorted(EVENTS, key=lambda e: e["lo"])
    if level == "easy":
        pool = [e for e in ev if e["fame"] == 1]
        for a, b in itertools.combinations(pool, 2):
            if b["lo"] - a["hi"] >= 5:
                yield (a, b)
    elif level == "medium":
        pool = [e for e in ev if e["fame"] <= 2]
        for c in itertools.combinations(pool, 3):
            if ordered(c) and c[2]["hi"] - c[0]["lo"] <= 200:
                yield c
    else:
        for c in itertools.combinations(ev, 5):
            if ordered(c) and c[4]["hi"] - c[0]["lo"] <= 40:
                yield c


def pick(level, need, rng):
    taken = {tuple(e["text"] for e in it["events"]) for it in CONTENT["order-events"][level]}
    cands = [c for c in candidates(level) if tuple(e["text"] for e in c) not in taken]
    rng.shuffle(cands)
    use = {}
    chosen = []
    # Greedy: always take the candidate whose events have been used least, so
    # the whole table gets played rather than the same few events.
    while cands and len(chosen) < need:
        cands.sort(key=lambda c: sum(use.get(e["text"], 0) for e in c))
        c = cands.pop(0)
        chosen.append(c)
        for e in c:
            use[e["text"]] = use.get(e["text"], 0) + 1
    return chosen, len(cands) + len(chosen)


def main():
    rng = random.Random(1447)
    out = {}
    for level in ("easy", "medium", "hard"):
        have = len(CONTENT["order-events"][level])
        need = max(0, TARGET - have)
        chosen, total = pick(level, need, rng)
        out[level] = [{
            "events": [{"text": e["text"], "when": e["when"]} for e in c],
            "explain": explain(c),
            "sources": sources(c),
        } for c in chosen]
        print("%-6s have %3d, need %3d, possible %6d, generated %3d" % (level, have, need, total, len(chosen)))
    dest = os.path.join(TOOLS, "additions", "order-events-s1.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("->", dest)


if __name__ == "__main__":
    main()
