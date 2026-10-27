"""Check the sources cited by new puzzles before they are merged.

Every item in tools/additions/<mode>-s<N>.json carries
    "sources": [["Quran 2:183", "fasting"], ["Bukhari 8", "five"], ["Ar-Raheeq Al-Makhtum", null]]
Each entry is a reference plus a keyword that must appear in it.

  Quran S:A or S:A-B   the verse(s) must exist and the keyword must appear in
                       Pickthall's English (tools/raw) or the Arabic.
  Bukhari N, Muslim N, Abu Dawud N, Tirmidhi N, Nasai N, Ibn Majah N, Malik N,
  Nawawi40 N, Riyad N  fetched from sunnah.com (cached in tools/.source_cache);
                       the keyword must appear in the hadith, and outside
                       Bukhari and Muslim the grade must be sahih or hasan.
  Quran.com data       facts generated from tools/raw; nothing to fetch.
  anything else        a book reference; listed for manual review.

Run:  python tools/check_sources.py            (all *-s*.json files)
      python tools/check_sources.py FILE...
Exit code 1 if anything failed.
"""
import glob
import html
import json
import os
import re
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
RAW = os.path.join(TOOLS, "raw")
CACHE = os.path.join(TOOLS, ".source_cache")

HADITH = {
    "bukhari": "bukhari", "muslim": "muslim", "abu dawud": "abudawud",
    "tirmidhi": "tirmidhi", "nasai": "nasai", "ibn majah": "ibnmajah",
    "malik": "malik", "nawawi40": "nawawi40", "riyad": "riyadussalihin",
}
SAHIHAYN = {"bukhari", "muslim"}
LABEL = re.compile(r"(Sahih al-Bukhari|Sahih Muslim|Sunan Abi Dawud|Jami` at-Tirmidhi|Sunan an-Nasa'i|"
                   r"Sunan Ibn Majah|Muwatta Malik|40 Hadith Nawawi|Riyad as-Salihin)\s+\d+")


def load_quran():
    chapters = json.load(open(os.path.join(RAW, "chapters_raw.json"), encoding="utf-8"))["chapters"]
    pick = json.load(open(os.path.join(RAW, "pickthall_raw.json"), encoding="utf-8"))
    flat = [v["text"] if isinstance(v, dict) else v for v in (pick.get("verses") or pick.get("translations") or pick)]
    english, i = {}, 0
    for c in chapters:
        for n in range(1, c["verses_count"] + 1):
            english["%d:%d" % (c["id"], n)] = re.sub(r"<[^>]+>", "", flat[i])
            i += 1
    arabic = {v["verse_key"]: v["text_uthmani"]
              for v in json.load(open(os.path.join(RAW, "uthmani_raw.json"), encoding="utf-8"))["verses"]}
    return english, arabic


ENGLISH, ARABIC = load_quran()


def check_quran(ref, keyword):
    m = re.fullmatch(r"(\d+):(\d+)(?:-(\d+))?", ref)
    if not m:
        return "bad Quran reference %r" % ref
    s, a, b = int(m.group(1)), int(m.group(2)), int(m.group(3) or m.group(2))
    keys = ["%d:%d" % (s, n) for n in range(a, b + 1)]
    missing = [k for k in keys if k not in ENGLISH]
    if missing:
        return "no such verse %s" % missing[0]
    if keyword:
        text = " ".join(ENGLISH[k] + " " + ARABIC.get(k, "") for k in keys)
        if keyword.lower() not in text.lower():
            return "keyword %r not in Quran %s: %s" % (keyword, ref, ENGLISH[keys[0]][:140])
    return None


def fetch(slug, num):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "%s_%s.txt" % (slug, num))
    if os.path.exists(path):
        return open(path, encoding="utf-8").read()
    url = "https://sunnah.com/%s:%s" % (slug, num)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Islamdle source checker)"})
    try:
        raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    except Exception as e:
        return "FETCH-ERROR %s" % e
    text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S)
    text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)))
    open(path, "w", encoding="utf-8").write(text)
    time.sleep(1.2)   # be polite to sunnah.com
    return text


def check_hadith(book, num, keyword):
    slug = HADITH[book]
    text = fetch(slug, num)
    if text.startswith("FETCH-ERROR"):
        return "%s %s: %s" % (book, num, text)
    if "Page not found" in text[:3000] or len(text) < 2000:
        return "%s %s does not exist on sunnah.com" % (book, num)
    # Only the hadith itself counts: from its "<Collection> N" label to the
    # first "Reference", not the menus and chapter lists around it.
    end = text.find("Reference")
    labels = [m.start() for m in re.finditer(LABEL, text[:end] if end > 0 else text)]
    body = text[labels[-1]:end] if labels and end > 0 else text
    if keyword and keyword.lower() not in body.lower():
        return "keyword %r not in %s %s" % (keyword, book, num)
    if book not in SAHIHAYN:
        g = re.search(r"Grade\s*:\s*([^()]{2,40})\(", text)
        grade = g.group(1).strip().lower() if g else ""
        if not re.search(r"sahih|hasan", grade):
            return "%s %s grade is %r, need sahih or hasan" % (book, num, grade or "unknown")
    return None


def check_ref(ref, keyword):
    """None when fine, 'MANUAL' for a book reference, else an error string."""
    r = ref.strip()
    if r.lower().startswith("quran.com data"):
        return None
    m = re.fullmatch(r"(?i)quran\s+(.+)", r)
    if m:
        return check_quran(m.group(1).strip(), keyword)
    m = re.fullmatch(r"(?i)(bukhari|muslim|abu dawud|tirmidhi|nasai|ibn majah|malik|nawawi40|riyad)\s+(\d+[a-z]?)", r)
    if m:
        return check_hadith(m.group(1).lower(), m.group(2), keyword)
    return "MANUAL"


def main(files):
    failed, manual, checked = 0, {}, 0
    for f in files:
        data = json.load(open(f, encoding="utf-8"))
        for level, items in data.items():
            for n, item in enumerate(items):
                label = "%s %s #%d" % (os.path.basename(f), level, n + 1)
                srcs = item.get("sources")
                if not srcs:
                    print("FAIL  %s: no sources" % label)
                    failed += 1
                    continue
                for ref, kw in srcs:
                    checked += 1
                    res = check_ref(ref, kw)
                    if res == "MANUAL":
                        manual[ref] = manual.get(ref, 0) + 1
                    elif res:
                        print("FAIL  %s: %s" % (label, res))
                        failed += 1
    print("\n%d references checked, %d failed." % (checked, failed))
    if manual:
        print("Book references (review by hand):")
        for ref, c in sorted(manual.items(), key=lambda x: -x[1]):
            print("  %3d  %s" % (c, ref))
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:] or sorted(glob.glob(os.path.join(TOOLS, "additions", "*-s[0-9]*.json")))
    sys.exit(main(args))
