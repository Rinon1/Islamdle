"""The Missing Piece sets drawn from the Qur'an itself (Quran.com data in
data/islamdle.json and tools/raw), so every set is a checkable fact:

  - surahs that open with the same disconnected letters or the same words
  - surahs with the same number of ayat (Hafs count)
  - surahs named after times of day, heavenly bodies, names of the Last Day,
    or places
  - runs of consecutive surahs that do not overlap existing surah sets

Opening groups were read off the Uthmani text, not matched automatically:
Ash-Sharh and Al-Fil also begin with the letters alif-lam-mim, but as a word
(alam), not as disconnected letters.

Writes tools/additions/missing-piece-s1.json. Run: python tools/gen_missing_sets.py
"""
import json
import os
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "data", "islamdle.json"), encoding="utf-8"))
CONTENT = json.load(open(os.path.join(ROOT, "tools", "content.json"), encoding="utf-8"))
UTH = {v["verse_key"]: v["text_uthmani"]
       for v in json.load(open(os.path.join(ROOT, "tools", "raw", "uthmani_raw.json"), encoding="utf-8"))["verses"]}
S = {s["id"]: s for s in DATA["surahs"]}
NAME = {s["id"]: s["name"] for s in DATA["surahs"]}
def norm(name):
    x = "".join(ch for ch in name.lower().replace("surah ", "") if ch.isalpha())
    for a, b in (("aa", "a"), ("ee", "i"), ("ii", "i"), ("oo", "u"), ("uu", "u")):
        x = x.replace(a, b)
    return x[:-1] if x.endswith("h") else x


ID = {norm(v): k for k, v in NAME.items()}


def bare(t):
    t = unicodedata.normalize("NFD", t)
    return "".join(ch for ch in t if not unicodedata.combining(ch)).replace("ٱ", "ا")


def words(sid):
    return bare(UTH["%d:1" % sid]).split()


def first_word(sid):
    return words(sid)[0]


def second_word(sid):
    w = words(sid)
    return w[1] if len(w) > 1 else ""


def oath(sid):
    w = first_word(sid)
    return w.startswith("و") and not w.startswith("ويل")


# (level, set title, surah ids, how they share it, check)
GROUPS = [
    ("easy", "Surahs that open with “Qul” (say)", [72, 109, 112, 113, 114], "open with the word qul", lambda s: first_word(s) == "قل"),
    ("medium", "Surahs that open with “Idha” (when)", [56, 63, 81, 82, 84, 99, 110], "open with the word idha", lambda s: first_word(s) == "اذا"),
    ("medium", "Surahs that open with “Inna” (indeed We)", [48, 71, 97, 108], "open with inna", lambda s: first_word(s) in ("انا",)),
    ("medium", "Surahs that open with “O you who believe”", [5, 49, 60], "open with ya ayyuha alladhina amanu", lambda s: second_word(s) == "الذين" and first_word(s).startswith("يـايها")),
    ("medium", "Surahs that open with “O Prophet”", [33, 65, 66], "open with ya ayyuha an-nabi", lambda s: second_word(s) == "النبى"),
    ("medium", "Surahs that open with a single letter", [38, 50, 68], "open with one disconnected letter (Sad, Qaf, Nun)", lambda s: first_word(s) in ("ص", "ق", "ن")),
    ("medium", "Surahs that open with Alif Lam Ra", [10, 11, 12, 14, 15], "open with the letters Alif Lam Ra", lambda s: first_word(s) == "الر"),
    ("medium", "Surahs that open with Ta Sin", [26, 27, 28], "open with Ta Sin (two of them Ta Sin Mim)", lambda s: first_word(s) in ("طسم", "طس")),
    ("hard", "Surahs that open with Alif Lam Mim", [2, 3, 29, 30, 31, 32], "open with the letters Alif Lam Mim", lambda s: words(s) == ["الم"]),
    ("hard", "Surahs that open with Ha Mim", [40, 41, 42, 43, 44, 45, 46], "open with Ha Mim, known together as the Hawamim", lambda s: words(s) == ["حم"]),
    ("medium", "Surahs outside Juz 'Amma that open with an oath", [37, 51, 52, 53, 77], "open with an oath (wa...)", lambda s: s < 78 and oath(s)),
    ("easy", "Six Juz 'Amma surahs that open with an oath", [79, 85, 86, 91, 95, 100], "open with an oath (wa...)", lambda s: s >= 78 and oath(s), "partial"),
    ("hard", "Surahs with exactly 8 ayat", [94, 95, 98, 99, 102], "have exactly 8 ayat", lambda s: S[s]["verses"] == 8),
    ("hard", "Surahs with exactly 11 ayat", [62, 63, 93, 100, 101], "have exactly 11 ayat", lambda s: S[s]["verses"] == 11),
    ("hard", "Surahs with exactly 19 ayat", [82, 87, 96], "have exactly 19 ayat", lambda s: S[s]["verses"] == 19),
    ("hard", "Surahs with exactly 29 ayat", [48, 57, 81], "have exactly 29 ayat", lambda s: S[s]["verses"] == 29),
    ("hard", "Surahs with exactly 30 ayat", [32, 67, 89], "have exactly 30 ayat", lambda s: S[s]["verses"] == 30),
    ("hard", "Surahs with exactly 52 ayat", [14, 68, 69], "have exactly 52 ayat", lambda s: S[s]["verses"] == 52),
    ("easy", "Surahs named after a time of day", [89, 92, 93, 103, 113], "are named after a time of day (dawn, night, forenoon, the declining day, daybreak)", None),
    ("easy", "Surahs named after something in the sky", [53, 54, 85, 86, 91], "are named after the star, the moon, the constellations, the night star and the sun", None),
    ("medium", "Surahs named after a name of the Last Day", [56, 69, 75, 88, 101], "are named after names of the Last Day (al-Waqi'ah, al-Haqqah, al-Qiyamah, al-Ghashiyah, al-Qari'ah)", None),
    ("medium", "Surahs named after a place", [15, 18, 34, 46, 52, 90], "are named after places (the Rocky Tract, the Cave, Sheba, the sandhills, the Mount, the City)", None),
]


def decoys(ids, check):
    """Nearby surahs that clearly do not share the property."""
    out = []
    for d in sorted(S, key=lambda x: min(abs(x - i) for i in ids)):
        if d in ids:
            continue
        if check is not None and check(d):
            continue
        out.append(NAME[d])
        if len(out) == 4:
            break
    return out


def surah_sets_existing():
    sets = []
    for lv in CONTENT["missing-piece"].values():
        for it in lv:
            ids = [ID.get(norm(x)) for x in it["items"]]
            ids = [i for i in ids if i]
            if len(ids) >= 3:
                sets.append(set(ids))
    return sets


def runs(existing):
    plan = [("easy", range(78, 115), 4), ("medium", range(50, 78), 5), ("hard", range(2, 50), 6)]
    taken = set()
    out = []
    for level, span, size in plan:
        ids = list(span)
        i = 0
        while i + size <= len(ids):
            run = set(ids[i:i + size])
            clash = any(len(run & e) >= 3 for e in existing) or run & taken
            if clash:
                i += 1
                continue
            taken |= run
            out.append((level, sorted(run)))
            i += size
    return out


def main():
    out = {"easy": [], "medium": [], "hard": []}
    problems = []
    for group in GROUPS:
        level, title, ids, how, check = group[:5]
        partial = len(group) > 5
        if check is not None:
            bad = [i for i in ids if not check(i)]
            members = [s for s in S if check(s)]
            if bad or (not partial and sorted(members) != sorted(ids)):
                problems.append("%s: listed %s, text says %s" % (title, ids, sorted(members)))
                continue
        names = [NAME[i] for i in ids]
        out[level].append({
            "set": title,
            "items": names,
            "decoys": decoys(ids, check),
            "explain": "Surahs %s %s." % (", ".join(names[:-1]) + " and " + names[-1], how),
            "sources": [["Quran.com data", None]] + [["Quran %d:1" % i, None] for i in ids],
        })
    for level, ids in runs(surah_sets_existing()):
        names = [NAME[i] for i in ids]
        out[level].append({
            "set": "Surahs %d to %d, in order" % (ids[0], ids[-1]),
            "items": names,
            "decoys": [NAME[i] for i in (ids[0] - 2, ids[0] - 1, ids[-1] + 1, ids[-1] + 2) if i in NAME],
            "explain": "In the mushaf, surahs %d to %d are %s." % (ids[0], ids[-1], ", ".join(names)),
            "sources": [["Quran.com data", None]],
        })
    if problems:
        print("NOT WRITTEN, the text disagrees:")
        for p in problems:
            print("  ", p)
        return 1
    dest = os.path.join(ROOT, "tools", "additions", "missing-piece-s1.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for lv in out:
        print(lv, len(out[lv]), [x["set"] for x in out[lv]][:12])
    print("->", dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
