"""Spot the Mistake puzzles from the sourced fact tables in tools/facts/.

Each fact has a true form (t), a clearly false form (f), a correction (x) and
sources (s). A puzzle takes three different facts of one level, shows one in
its false form and two in their true form. Every fact is used at most twice,
least-used first, so the whole table gets played.

Fills each level up to 200 together with the existing puzzles and the surah
puzzles in spot-mistake-s1.json. Writes tools/additions/spot-mistake-s2.json.
Run: python tools/gen_spot_facts.py
"""
import json
import os
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
TARGET = 200
MAX_USES = 2

content = json.load(open(os.path.join(TOOLS, "content.json"), encoding="utf-8"))
surah = json.load(open(os.path.join(TOOLS, "additions", "spot-mistake-s1.json"), encoding="utf-8"))


def build(level, facts, need, rng):
    use = [0] * len(facts)
    wrong_use = [0] * len(facts)
    out = []
    order = list(range(len(facts)))
    while len(out) < need:
        rng.shuffle(order)
        order.sort(key=lambda i: use[i])
        trio = [i for i in order if use[i] < MAX_USES][:3]
        if len(trio) < 3:
            break
        # The false statement goes to the fact shown false least often.
        trio.sort(key=lambda i: wrong_use[i])
        wrong_fact = trio[0]
        rng.shuffle(trio)
        wrong = trio.index(wrong_fact)
        for i in trio:
            use[i] += 1
        wrong_use[wrong_fact] += 1
        sources = []
        for i in trio:
            for s in facts[i]["s"]:
                if s not in sources:
                    sources.append(s)
        out.append({
            "statements": [facts[i]["f"] if i == wrong_fact else facts[i]["t"] for i in trio],
            "wrong": wrong,
            "explain": facts[wrong_fact]["x"] + " The other two statements are correct.",
            "sources": sources,
        })
    return out


def main():
    rng = random.Random(1446)
    out = {}
    for level in ("easy", "medium", "hard"):
        facts = json.load(open(os.path.join(TOOLS, "facts", level + ".json"), encoding="utf-8"))
        have = len(content["spot-mistake"][level]) + len(surah.get(level, []))
        need = max(0, TARGET - have)
        out[level] = build(level, facts, need, rng)
        print("%-6s facts %3d  have %3d  need %3d  made %3d" % (level, len(facts), have, need, len(out[level])))
    dest = os.path.join(TOOLS, "additions", "spot-mistake-s2.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("->", dest)


if __name__ == "__main__":
    main()
