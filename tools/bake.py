"""Bake all raw sources into a single static data/islamdle.json.

Mirrors the LoLdle architecture: the whole game ships as one static JSON on a
CDN, so the site needs no backend at runtime.

Run:  python tools/bake.py
"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TOOLS = os.path.join(ROOT, "tools")
RAW = os.path.join(TOOLS, "raw")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- surahs ----
chapters = load(os.path.join(RAW, "chapters_raw.json"))["chapters"]
juz_raw = load(os.path.join(RAW, "juzs_raw.json"))["juzs"]

# The API returns hizb-level rows; collapse to the first row per juz number.
first_juz_of_surah = {}
for row in sorted(juz_raw, key=lambda r: (r["juz_number"], r["first_verse_id"])):
    for surah_id in row["verse_mapping"]:
        sid = int(surah_id)
        n = row["juz_number"]
        if sid not in first_juz_of_surah or n < first_juz_of_surah[sid]:
            first_juz_of_surah[sid] = n

# Verses that carry a sajdah (prostration), by surah.
SAJDAH_SURAHS = {7, 13, 16, 17, 19, 22, 25, 27, 32, 38, 41, 53, 84, 96}


def length_band(n):
    if n <= 20:
        return "Very short"
    if n <= 60:
        return "Short"
    if n <= 128:
        return "Medium"
    return "Long"


surahs = []
for c in chapters:
    sid = c["id"]
    surahs.append({
        "id": sid,
        "name": c["name_simple"],
        "arabic": c["name_arabic"],
        "meaning": c["translated_name"]["name"],
        "place": "Makki" if c["revelation_place"] == "makkah" else "Madani",
        "verses": c["verses_count"],
        "juz": first_juz_of_surah.get(sid, 1),
        "order": c["revelation_order"],
        "length": length_band(c["verses_count"]),
        "sajdah": "Yes" if sid in SAJDAH_SURAHS else "No",
    })
assert len(surahs) == 114, len(surahs)

# ------------------------------------------------------------- 99 names ----
asma = load(os.path.join(RAW, "asma_raw.json"))["data"]
names = [{
    "id": a["number"],
    "name": a["transliteration"].strip(),
    "arabic": a["name"],
    "meaning": a["en"]["meaning"].strip(),
} for a in asma]
assert len(names) == 99, len(names)

# ----------------------------------------------------------------- ayat ----
# Flat Pickthall list (public domain, 1930) -> (surah, ayah, text).
flat = [t["text"] for t in load(os.path.join(RAW, "pickthall_raw.json"))["translations"]]
assert len(flat) == 6236, len(flat)

ayat = []
i = 0
for s in surahs:
    for n in range(1, s["verses"] + 1):
        text = flat[i].strip()
        i += 1
        # Playable clues only: long enough to be identifiable, short enough to read.
        if not (110 <= len(text) <= 330):
            continue
        ayat.append({"s": s["id"], "a": n, "t": text})
assert i == 6236, i

# Cap how many clues come from any single surah so the pool stays spread out.
PER_SURAH_CAP = 6
seen = {}
spread = []
for row in ayat:
    k = row["s"]
    if seen.get(k, 0) >= PER_SURAH_CAP:
        continue
    seen[k] = seen.get(k, 0) + 1
    spread.append(row)
ayat = spread

# ---------------------------------------------------------------- people ----
people = load(os.path.join(TOOLS, "people.json"))

# ------------------------------------------------------------- scramble ----
# Generated rather than hand-authored: pick verses by word count, and keep the
# easy tier inside surahs most people have actually memorised.
uthmani = {v["verse_key"]: v["text_uthmani"].strip()
           for v in load(os.path.join(RAW, "uthmani_raw.json"))["verses"]}

# Al-Fatihah plus the short closing surahs most people have actually memorised
# (Ad-Duha onwards), which is what keeps the easy tier genuinely easy.
MEMORISED = {1} | set(range(93, 115))
JUZ_AMMA = set(range(78, 115))

english = {}
i = 0
for s in surahs:
    for n in range(1, s["verses"] + 1):
        english["%d:%d" % (s["id"], n)] = flat[i].strip()
        i += 1

surah_name = {s["id"]: s["name"] for s in surahs}


def scramble_pool(allowed_surahs, lo, hi):
    out = []
    for key, text in uthmani.items():
        sid, ayah = (int(x) for x in key.split(":"))
        if sid not in allowed_surahs:
            continue
        words = text.split()
        if not (lo <= len(words) <= hi):
            continue
        out.append({
            "surah": sid,
            "name": surah_name[sid],
            "ayah": ayah,
            "words": words,
            "translation": english.get(key, ""),
        })
    out.sort(key=lambda r: (r["surah"], r["ayah"]))
    return out


scramble = {
    "easy": scramble_pool(MEMORISED, 3, 5),
    "medium": scramble_pool(JUZ_AMMA | {1}, 6, 8),
    "hard": scramble_pool(set(range(1, 115)), 9, 13),
}

# ---------------------------------------------------------- hand-written ----
content = load(os.path.join(TOOLS, "content.json"))

# Trim the hard scramble pool; it is enormous and we only need variety.
scramble["hard"] = scramble["hard"][:400]

out = {
    "version": 2,
    "built": "static",
    "surahs": surahs,
    "names": names,
    "ayat": ayat,
    "prophets": people["prophets"],
    "figures": people["figures"],
    "scramble": scramble,
    "five-clues": content["five-clues"],
    "spot-mistake": content["spot-mistake"],
    "order-events": content["order-events"],
    "missing-piece": content["missing-piece"],
}

dest = os.path.join(DATA, "islamdle.json")
with open(dest, "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

print(f"surahs   {len(surahs)}")
print(f"names    {len(names)}")
print(f"ayat     {len(ayat)} (from {len(seen)} surahs)")
print(f"prophets {len(people['prophets'])}")
print(f"figures  {len(people['figures'])}")
print()
print("days of content per mode and level:")
for mode in ("five-clues", "spot-mistake", "order-events", "missing-piece", "scramble"):
    pools = out[mode]
    counts = "  ".join(f"{lvl}={len(pools[lvl]):>4}" for lvl in ("easy", "medium", "hard"))
    low = min(len(pools[lvl]) for lvl in ("easy", "medium", "hard"))
    flag = "   <-- add more" if low < 10 else ""
    print(f"  {mode:<14} {counts}{flag}")
print()
print(f"-> {dest}  ({os.path.getsize(dest):,} bytes)")
