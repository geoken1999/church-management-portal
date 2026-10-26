#!/usr/bin/env python3
"""Builds src/data/bible/kjv.json and web.json (public-domain English Bibles) in the compact shape the projector reads:
{"books": [ [ ["verse 1 text", "verse 2 text", ...], ...chapters ], ...66 books in canonical order ]}.

Sources (both public domain):
  KJV: https://github.com/scrollmapper/bible_databases (formats/json/KJV.json)
  WEB: https://github.com/TehShrike/world-english-bible (json/<book>.json), the World English Bible

Usage: python3 scripts/build-bible-data.py <dir with KJV.json> <dir with the WEB book files>
"""
import json, re, sys, os

BOOKS = ["genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth","1samuel","2samuel","1kings","2kings","1chronicles","2chronicles","ezra","nehemiah","esther","job","psalms","proverbs","ecclesiastes","songofsolomon","isaiah","jeremiah","lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah","nahum","habakkuk","zephaniah","haggai","zechariah","malachi","matthew","mark","luke","john","acts","romans","1corinthians","2corinthians","galatians","ephesians","philippians","colossians","1thessalonians","2thessalonians","1timothy","2timothy","titus","philemon","hebrews","james","1peter","2peter","1john","2john","3john","jude","revelation"]
clean = lambda t: re.sub(r"\s+", " ", t.replace("[", "").replace("]", "")).strip()

kjv_dir, web_dir = sys.argv[1], sys.argv[2]
kjv = json.load(open(os.path.join(kjv_dir, "KJV.json")))
assert len(kjv["books"]) == 66
out_kjv = []
for book in kjv["books"]:
    chapters = []
    for ch in sorted(book["chapters"], key=lambda c: c["chapter"]):
        verses = {v["verse"]: clean(v["text"]) for v in ch["verses"]}
        chapters.append([verses.get(i, "") for i in range(1, max(verses) + 1)])
    out_kjv.append(chapters)

out_web = []
for name in BOOKS:
    items = json.load(open(os.path.join(web_dir, name + ".json")))
    by = {}
    for it in items:
        if "chapterNumber" in it and "verseNumber" in it and isinstance(it.get("value"), str):
            by.setdefault(it["chapterNumber"], {}).setdefault(it["verseNumber"], []).append(it["value"])
    chapters = []
    for c in sorted(by):
        verses = {v: clean(" ".join(parts)) for v, parts in by[c].items()}
        chapters.append([verses.get(i, "") for i in range(1, max(verses) + 1)])
    out_web.append(chapters)

def counts(b): return sum(len(c) for bk in b for c in bk)
print("KJV verses", counts(out_kjv), "chapters", sum(len(b) for b in out_kjv))
print("WEB verses", counts(out_web), "chapters", sum(len(b) for b in out_web))
diff = 0
for bi in range(66):
    if len(out_kjv[bi]) != len(out_web[bi]): print("chapter count differs in book", bi, len(out_kjv[bi]), len(out_web[bi]))
    for ci in range(min(len(out_kjv[bi]), len(out_web[bi]))):
        if len(out_kjv[bi][ci]) != len(out_web[bi][ci]): diff += 1
print("chapters whose verse count differs between KJV and WEB:", diff)
os.makedirs("src/data/bible", exist_ok=True)
for fname, data in (("kjv", out_kjv), ("web", out_web)):
    with open(f"src/data/bible/{fname}.json", "w") as f:
        json.dump({"books": data}, f, ensure_ascii=False, separators=(",", ":"))
