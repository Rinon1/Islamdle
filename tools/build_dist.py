"""Assemble a clean dist/ for deployment.

Copies only what the site actually serves — tools/ and its 3 MB of raw API
dumps are left behind — and appends a short content hash to every CSS and JS
reference so those files can be cached permanently while still updating the
moment their contents change.

Run:  python tools/build_dist.py
"""
import hashlib
import os
import re
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

PAGES = ["index.html", "play.html", "privacy.html"]
ASSET_DIRS = ["css", "js"]
VERBATIM = ["data", "favicon.svg", "robots.txt", "sitemap.xml", "_headers"]

# Only these get a ?v= hash; data/ must stay un-versioned so the page can
# fetch it by a stable path.
HASHABLE = (".css", ".js")


def short_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()[:10]


def main():
    if not os.path.exists(os.path.join(ROOT, "data", "islamdle.json")):
        print("data/islamdle.json is missing — run tools/bake.py first.")
        return 1

    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    # Copy assets and record their hashes.
    hashes = {}
    for d in ASSET_DIRS:
        src = os.path.join(ROOT, d)
        if not os.path.isdir(src):
            continue
        shutil.copytree(src, os.path.join(DIST, d))
        for name in sorted(os.listdir(src)):
            full = os.path.join(src, name)
            if os.path.isfile(full) and name.endswith(HASHABLE):
                hashes[f"{d}/{name}"] = short_hash(full)

    for item in VERBATIM:
        src = os.path.join(ROOT, item)
        if not os.path.exists(src):
            print(f"  (skipping {item}, not present)")
            continue
        dst = os.path.join(DIST, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # Rewrite asset references in the HTML to carry the hash.
    pattern = re.compile(r'((?:href|src)=")((?:css|js)/[^"?]+)(")')
    rewritten = 0

    for page in PAGES:
        src = os.path.join(ROOT, page)
        if not os.path.exists(src):
            print(f"  (skipping {page}, not present)")
            continue
        with open(src, encoding="utf-8") as fh:
            html = fh.read()

        def sub(m):
            nonlocal rewritten
            path = m.group(2)
            h = hashes.get(path)
            if not h:
                return m.group(0)
            rewritten += 1
            return f"{m.group(1)}{path}?v={h}{m.group(3)}"

        html = pattern.sub(sub, html)
        with open(os.path.join(DIST, page), "w", encoding="utf-8") as fh:
            fh.write(html)

    # Report.
    total = 0
    for base, _, files in os.walk(DIST):
        for f in files:
            total += os.path.getsize(os.path.join(base, f))

    print("dist/ contents:")
    for base, dirs, files in os.walk(DIST):
        dirs.sort()
        rel = os.path.relpath(base, DIST)
        prefix = "" if rel == "." else rel + "/"
        for f in sorted(files):
            size = os.path.getsize(os.path.join(base, f))
            print(f"  {prefix + f:<28} {size:>9,} bytes")

    print(f"\n{rewritten} asset references versioned")
    for k, v in sorted(hashes.items()):
        print(f"  {k} -> ?v={v}")
    print(f"\ntotal {total:,} bytes  ->  {DIST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
