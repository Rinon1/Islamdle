"""Merge tools/additions/<mode>.json into tools/content.json.

Validates the schema of every incoming item and refuses to add duplicates, so
the script is safe to re-run. Run:  python tools/merge_additions.py
"""
import json
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(ROOT, "tools")
ADD = os.path.join(TOOLS, "additions")
CONTENT = os.path.join(TOOLS, "content.json")
LEVELS = ("easy", "medium", "hard")

MODES = ("five-clues", "spot-mistake", "order-events", "missing-piece")


def load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh, object_pairs_hook=collections.OrderedDict)


def identity(mode, item):
    """What makes two puzzles 'the same', for duplicate detection."""
    if mode == "five-clues":
        return item["answer"]
    if mode == "spot-mistake":
        return tuple(item["statements"])
    if mode == "order-events":
        return tuple(e["text"] for e in item["events"])
    return item["set"]


def validate(mode, level, item, sourced=False):
    """Return a list of problems; empty means the item is well formed.

    Items from sourced batches (<mode>-s<N>.json) must cite their sources;
    tools/check_sources.py verifies them against the Qur'an and sunnah.com.
    """
    bad = []
    if sourced:
        srcs = item.get("sources")
        if not isinstance(srcs, list) or not srcs:
            bad.append("missing sources")
        elif not all(isinstance(x, list) and len(x) == 2 and isinstance(x[0], str) for x in srcs):
            bad.append("sources must be [reference, keyword] pairs")
    if mode == "five-clues":
        for f in ("answer", "options", "clues", "explain"):
            if f not in item:
                bad.append(f"missing {f}")
        if "options" in item:
            if len(item["options"]) != 4:
                bad.append(f"{len(item['options'])} options, expected 4")
            if item.get("answer") not in item["options"]:
                bad.append("answer is not among the options")
            if len(set(item["options"])) != len(item["options"]):
                bad.append("duplicate options")
        if "clues" in item and len(item["clues"]) != 5:
            bad.append(f"{len(item['clues'])} clues, expected 5")

    elif mode == "spot-mistake":
        if len(item.get("statements", [])) != 3:
            bad.append("expected exactly 3 statements")
        w = item.get("wrong")
        if not isinstance(w, int) or not (0 <= w <= 2):
            bad.append(f"'wrong' must be 0-2, got {w!r}")

    elif mode == "order-events":
        evs = item.get("events", [])
        expect = {"easy": 2, "medium": 3, "hard": 5}[level]
        if len(evs) != expect:
            bad.append(f"{len(evs)} events at level {level}, expected {expect}")
        for e in evs:
            if "text" not in e or "when" not in e:
                bad.append("an event is missing text or when")

    elif mode == "missing-piece":
        if len(item.get("items", [])) < 3:
            bad.append("needs at least 3 items")
        if len(item.get("decoys", [])) < 3:
            bad.append("needs at least 3 decoys")
        overlap = set(item.get("decoys", [])) & set(item.get("items", []))
        if overlap:
            bad.append(f"decoys overlap the set itself: {sorted(overlap)}")

    if not str(item.get("explain", "")).strip():
        bad.append("empty explain")
    return bad


def main():
    content = load(CONTENT)
    added = collections.Counter()
    skipped = collections.Counter()
    problems = []

    for mode in MODES:
        # <mode>.json plus any batch files like <mode>-b2.json
        paths = sorted(
            os.path.join(ADD, f)
            for f in os.listdir(ADD)
            if f == mode + ".json" or f.startswith(mode + "-")
        )
        if not paths:
            print(f"  (no additions file for {mode})")
            continue
        incoming = {lv: [] for lv in LEVELS}
        for path in paths:
            batch = load(path)
            sourced = bool(re.search(r"-s\d+\.json$", path))
            for lv in LEVELS:
                incoming[lv].extend((item, sourced) for item in batch.get(lv, []))

        # One answer or set per mode across all three levels, so someone who
        # plays every level never meets the same puzzle twice.
        seen = {identity(mode, it) for lv in LEVELS for it in content[mode][lv]}
        for level in LEVELS:
            existing = content[mode][level]

            for item, sourced in incoming.get(level, []):
                errs = validate(mode, level, item, sourced)
                if errs:
                    problems.append(f"{mode}/{level}: {identity(mode, item)!r} -> " + "; ".join(errs))
                    continue
                key = identity(mode, item)
                if key in seen:
                    skipped[mode] += 1
                    continue
                seen.add(key)
                existing.append(item)
                added[mode] += 1

    if problems:
        print("REFUSING TO WRITE — fix these first:\n")
        for p in problems:
            print("  !", p)
        return 1

    with open(CONTENT, "w", encoding="utf-8") as fh:
        json.dump(content, fh, ensure_ascii=False, indent=2)

    for mode in MODES:
        counts = "  ".join(f"{lv}={len(content[mode][lv]):>3}" for lv in LEVELS)
        print(f"  {mode:<14} +{added[mode]:<3} (skipped {skipped[mode]} dupes)   {counts}")
    print(f"\nwrote {CONTENT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
