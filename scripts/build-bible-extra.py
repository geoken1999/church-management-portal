#!/usr/bin/env python3
"""Builds the extra bundled Bibles in src/data/bible/ in the same compact shape as kjv.json / web.json:
{"books": [ [ ["verse 1 text", ...], ...chapters ], ...66 books in canonical order ]}.

Sources:
  asv, bsb, ylt, darby, bbe (English; public domain): https://github.com/scrollmapper/bible_databases (formats/json/<NAME>.json)
  hin (Hindi IRV) and tam (Tamil IRV), Indian Revised Version, (c) Bridge Connectivity Solutions, CC BY-SA 4.0:
    https://ebible.org/Scriptures/hin2017_usfm.zip and tam2017_usfm.zip

Usage: python3 scripts/build-bible-extra.py <dir with ASV.json, BSB.json, YLT.json, Darby.json, BBE.json> <dir with hin2017/ and tam2017/ (unzipped USFM)>
"""
import json, os, re, sys, glob

USFM = ["GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT","1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH","EST","JOB","PSA","PRO","ECC","SNG","ISA","JER","LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON","MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT","MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL","EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT","PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN","JUD","REV"]
clean = lambda t: re.sub(r"\s+", " ", t.replace("[", "").replace("]", "")).strip()

def scrollmapper(path):
    data = json.load(open(path))
    assert len(data["books"]) == 66, path
    out = []
    for book in data["books"]:
        chapters = []
        for ch in sorted(book["chapters"], key=lambda c: c["chapter"]):
            verses = {v["verse"]: clean(v["text"]) for v in ch["verses"]}
            chapters.append([verses.get(i, "") for i in range(1, max(verses) + 1)])
        out.append(chapters)
    return out

def usfm_text(raw):
    t = re.sub(r"\\(f|x|fe)\b.*?\\\1\*", "", raw, flags=re.S)       # footnotes and cross references
    t = re.sub(r"\\w\s+([^|\\]*?)(\|[^\\]*)?\\w\*", r"\1", t)        # \w word|strong\w*
    t = re.sub(r"\\[+a-z0-9]+\*?", " ", t)                           # remaining markers
    return clean(t)

def usfm_dir(folder):
    books = {}
    for path in glob.glob(os.path.join(folder, "*.usfm")):
        text = open(path, encoding="utf-8").read()
        m = re.search(r"\\id\s+(\w+)", text)
        if not m: continue
        code, chapters, c = m.group(1), {}, 0
        body = text.split("\n", 1)[1] if "\n" in text else ""
        for line in body.split("\n"):
            cm = re.match(r"\\c\s+(\d+)", line)
            if cm: c = int(cm.group(1)); chapters.setdefault(c, {}); continue
            if not c: continue
            vm = re.match(r"\\v\s+(\d+)(?:-(\d+))?\s*(.*)", line)
            if vm:
                last = int(vm.group(1)); chapters[c].setdefault(last, []).append(vm.group(3))
                cur = last
            elif "cur" in dir() and chapters.get(c) is not None and cur in chapters[c] and not re.match(r"\\(s\d?|r|d|h|toc\d|mt\d?|b|ms\d?|sp)\b", line):
                chapters[c][cur].append(line)
        books[code] = chapters
    out = []
    for code in USFM:
        chapters = books.get(code, {})
        out.append([[usfm_text(" ".join(chapters[c].get(v, []))) for v in range(1, max(chapters[c]) + 1)] if chapters[c] else [] for c in sorted(chapters)])
    return out

def counts(b): return sum(len(c) for bk in b for c in bk)

if __name__ == "__main__":
    en_dir, usfm_root = sys.argv[1], sys.argv[2]
    here = os.path.join(os.path.dirname(__file__), "..", "src", "data", "bible")
    jobs = {name.lower(): scrollmapper(os.path.join(en_dir, name + ".json")) for name in ["ASV", "BSB", "YLT", "Darby", "BBE"]}
    for key, folder in {"hin": "hin2017", "tam": "tam2017"}.items():
        jobs[key] = usfm_dir(os.path.join(usfm_root, folder))
    for key, bible in jobs.items():
        with open(os.path.join(here, key + ".json"), "w", encoding="utf-8") as f:
            json.dump({"books": bible}, f, ensure_ascii=False, separators=(",", ":"))
        print(key, "verses:", counts(bible), "empty:", sum(1 for bk in bible for c in bk for v in c if not v))
