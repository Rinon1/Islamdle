"""Spot the Mistake puzzles about the surahs, built only from Quran.com data.

Each puzzle has three statements about three different surahs; one is false.
False statements are always clearly false:
  - ayat counts are off by at least 4 and at least 15%, so they cannot match
    any of the other verse-counting traditions, which differ by a verse or two
  - Makki/Madani is never used for surahs whose classification is disputed
  - juz, position and neighbour are exact facts of the standard mushaf

Writes tools/additions/spot-mistake-s1.json. Run: python tools/gen_surah_statements.py
"""
import json
import os
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "data", "islamdle.json"), encoding="utf-8"))
PER_LEVEL = 70

DISPUTED = {1, 13, 22, 55, 57, 61, 64, 76, 83, 97, 98, 99, 100, 107, 108, 112, 113, 114}
LETTERS = {20, 36, 38, 50}
MEANING_FIX = {86: "The Nightcomer", 102: "Rivalry in increase", 107: "Small kindnesses"}
NAMED_SAME = {11, 31, 106}          # meaning equals the name; skip meaning statements
FAMOUS = {1, 2, 3, 4, 12, 18, 19, 36, 55, 56, 67}

S = {s["id"]: s for s in DATA["surahs"]}


def meaning(s):
    return MEANING_FIX.get(s["id"], s["meaning"].strip())


def wrong_count(n, rng):
    gap = max(4, round(n * 0.15))
    for _ in range(50):
        k = n + rng.choice([-1, 1]) * rng.randint(gap, gap * 2)
        if k >= 3 and k not in {x["verses"] for x in S.values() if x["id"] in (n,)}:
            return k
    return n + gap


def facts(s, kinds, rng):
    """(true statement, false statement, correction) for each kind that applies."""
    out = []
    name = "Surah " + s["name"]
    if "ayat" in kinds:
        k = wrong_count(s["verses"], rng)
        out.append(("%s has %d ayat." % (name, s["verses"]),
                    "%s has %d ayat." % (name, k),
                    "%s has %d ayat, not %d." % (name, s["verses"], k)))
    if "place" in kinds and s["id"] not in DISPUTED:
        real = "Makkah" if s["place"] == "Makki" else "Madinah"
        other = "Madinah" if real == "Makkah" else "Makkah"
        out.append(("%s was revealed in %s." % (name, real),
                    "%s was revealed in %s." % (name, other),
                    "%s is a %s surah, revealed in %s." % (name, s["place"], real)))
    if "juz" in kinds:
        j = s["juz"] + rng.choice([-2, -1, 1, 2])
        if 1 <= j <= 30 and j != s["juz"]:
            out.append(("%s begins in juz %d." % (name, s["juz"]),
                        "%s begins in juz %d." % (name, j),
                        "%s begins in juz %d, not juz %d." % (name, s["juz"], j)))
    if "position" in kinds:
        p = s["id"] + rng.choice([-3, -2, 2, 3])
        if 1 <= p <= 114:
            out.append(("%s is surah number %d in the mushaf." % (name, s["id"]),
                        "%s is surah number %d in the mushaf." % (name, p),
                        "%s is surah number %d, not %d." % (name, s["id"], p)))
    if "after" in kinds and s["id"] > 1:
        prev = S[s["id"] - 1]
        far = S[max(1, min(113, s["id"] + rng.choice([-4, -3, 3, 4])))]
        if far["id"] not in (s["id"], s["id"] - 1):
            out.append(("%s comes right after Surah %s." % (name, prev["name"]),
                        "%s comes right after Surah %s." % (name, far["name"]),
                        "%s comes right after Surah %s, not Surah %s." % (name, prev["name"], far["name"])))
    if "meaning" in kinds and s["id"] not in LETTERS and s["id"] not in NAMED_SAME:
        others = [x for x in S.values() if x["id"] not in LETTERS | NAMED_SAME | {s["id"]}
                  and abs(x["id"] - s["id"]) > 3]
        o = rng.choice(others)
        out.append(("The name %s means “%s”." % (name, meaning(s)),
                    "The name %s means “%s”." % (name, meaning(o)),
                    "%s means “%s”. “%s” is the meaning of Surah %s." % (name, meaning(s), meaning(o), o["name"])))
    return out


LEVELS = {
    "easy": ([s for s in S.values() if s["id"] >= 78 or s["id"] in FAMOUS], ["place", "meaning", "after", "ayat"]),
    "medium": ([s for s in S.values() if s["id"] >= 36 or s["id"] in FAMOUS | {5, 6, 7, 10, 14, 17, 21, 23, 24, 25, 31, 32}],
               ["place", "ayat", "juz", "after", "meaning"]),
    "hard": (list(S.values()), ["ayat", "juz", "position", "after", "place"]),
}


def main():
    rng = random.Random(786)
    out = {}
    seen = set()
    for level, (pool, kinds) in LEVELS.items():
        items = []
        use = {}
        tries = 0
        while len(items) < PER_LEVEL and tries < 20000:
            tries += 1
            trio = rng.sample(pool, 3)
            cap = 4 if level == "easy" else 3
            if any(use.get(s["id"], 0) >= cap for s in trio):
                continue
            picks = []
            for s in trio:
                fs = facts(s, kinds, rng)
                if not fs:
                    break
                picks.append(rng.choice(fs))
            if len(picks) < 3:
                continue
            # Three different kinds of statement where possible.
            if len({p[0].split(" ")[-2] for p in picks}) < 2:
                continue
            wrong = rng.randrange(3)
            statements = [p[1] if i == wrong else p[0] for i, p in enumerate(picks)]
            key = tuple(statements)
            if key in seen:
                continue
            seen.add(key)
            for s in trio:
                use[s["id"]] = use.get(s["id"], 0) + 1
            items.append({
                "statements": statements,
                "wrong": wrong,
                "explain": picks[wrong][2] + " The other two statements are correct." +
                           (" Ayat counts follow the standard Hafs mushaf." if any(" ayat." in x for x in statements) else ""),
                "sources": [["Quran.com data", None]] + [["Quran %d:1" % s["id"], None] for s in trio],
            })
        out[level] = items
        print(level, len(items))
    dest = os.path.join(ROOT, "tools", "additions", "spot-mistake-s1.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("->", dest)


if __name__ == "__main__":
    main()
