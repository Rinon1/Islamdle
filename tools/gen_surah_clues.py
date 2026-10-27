"""Five Clues puzzles whose answer is a surah, built only from Quran.com data
(tools/raw via data/islamdle.json), so every clue is a fact about the mushaf:

  1. Makki or Madani (or that scholars differ, for the surahs where they do)
  2. the juz it begins in
  3. how many ayat it has (the Hafs count used in the standard mushaf)
  4. the surah it follows
  5. what its name means

Surahs that are already Five Clues answers are skipped.
Writes tools/additions/five-clues-s1.json.  Run:  python tools/gen_surah_clues.py
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "data", "islamdle.json"), encoding="utf-8"))
CONTENT = json.load(open(os.path.join(ROOT, "tools", "content.json"), encoding="utf-8"))

# Surahs whose Makki/Madani status the scholars of 'ulum al-Qur'an differ on.
DISPUTED = {1, 13, 22, 55, 57, 61, 64, 76, 83, 97, 98, 99, 100, 107, 108, 112, 113, 114}

# Long surahs most Muslims know by name, which would be wrongly "hard" by position.
WELL_KNOWN = {3, 4, 12, 19, 20}
KNOWN = {5, 6, 7, 10, 11, 14, 17, 21, 23, 24, 25, 31, 32}

# Surahs named after the separate letters they open with.
LETTERS = {20, 36, 38, 50}
# Where the meaning equals the name, say what the name refers to, with the ayah
# that shows it (checked by check_sources.py).
NAMED_FOR = {
    11: ("It is named after the prophet sent to the people of 'Ad.", ["Quran 11:50", "Hud"]),
    31: ("It is named after a wise man whose advice to his son it records.", ["Quran 31:13", "son"]),
    106: ("It is named after the Prophet's own tribe.", ["Quran 106:1", "Qureysh"]),
}
# Quran.com meanings with a typo or very awkward wording.
MEANING_FIX = {86: "The Nightcomer", 102: "Rivalry in increase", 107: "Small kindnesses"}


def norm(name):
    """Compare names ignoring 'Surah', apostrophes, hyphens and a final h."""
    x = "".join(ch for ch in name.lower().replace("surah ", "") if ch.isalpha())
    return x[:-1] if x.endswith("h") else x


surahs = {s["id"]: s for s in DATA["surahs"]}
used = {norm(x["answer"]) for lv in CONTENT["five-clues"].values() for x in lv if x["answer"].startswith("Surah ")}


def label(s):
    return "Surah " + s["name"]


def place_clue(s):
    if s["id"] in DISPUTED:
        return "Scholars differ on whether it was revealed in Makkah or in Madinah."
    return "It was revealed in Makkah." if s["place"] == "Makki" else "It was revealed in Madinah."


def meaning_clue(s):
    if s["id"] in LETTERS:
        return "It is named after the letters it opens with."
    if s["id"] in NAMED_FOR:
        return NAMED_FOR[s["id"]][0]
    m = MEANING_FIX.get(s["id"], s["meaning"].strip())
    return "Its name means “%s”." % m


def decoys(s):
    """Three nearby surahs of the same kind and similar length."""
    near = sorted(
        (x for x in surahs.values() if x["id"] != s["id"]),
        key=lambda x: (x["place"] != s["place"], abs(x["verses"] - s["verses"]) + abs(x["id"] - s["id"]) * 0.6),
    )
    return [label(x) for x in near[:3]]


def item(s):
    prev = surahs.get(s["id"] - 1)
    opts = [label(s)] + decoys(s)
    # Stable but not always-first position for the answer.
    k = s["id"] % 4
    opts = opts[1:k + 1] + [opts[0]] + opts[k + 1:]
    clues = [
        place_clue(s),
        "It begins in juz %d." % s["juz"],
        "It has %d ayat." % s["verses"],
        ("It comes right after Surah %s in the mushaf." % prev["name"]) if prev else "It is the first surah of the mushaf.",
        meaning_clue(s),
    ]
    explain = "Surah %s is surah %d of the mushaf, with %d ayat, beginning in juz %d." % (
        s["name"], s["id"], s["verses"], s["juz"])
    if s["id"] in DISPUTED:
        explain += " Scholars differ on whether it is Makki or Madani."
    else:
        explain += " It is a %s surah." % s["place"]
    return {
        "answer": label(s),
        "options": opts,
        "clues": clues,
        "explain": explain,
        "sources": [["Quran.com data", None], ["Quran %d:1" % s["id"], None]] +
                   ([NAMED_FOR[s["id"]][1]] if s["id"] in NAMED_FOR else []),
    }


def main():
    out = {"easy": [], "medium": [], "hard": []}
    for sid, s in sorted(surahs.items()):
        if norm(label(s)) in used:
            continue
        level = ("easy" if sid >= 78 or sid in WELL_KNOWN else
                 "medium" if sid >= 50 or sid in KNOWN else "hard")
        out[level].append(item(s))
    dest = os.path.join(ROOT, "tools", "additions", "five-clues-s1.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for lv in out:
        print(lv, len(out[lv]))
    print("->", dest)


if __name__ == "__main__":
    main()
