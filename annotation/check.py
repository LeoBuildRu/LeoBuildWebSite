"""Проверка разметки ЖК: python annotation/check.py <ЖК> [<ЖК> ...]

Классы из classes.yaml, рамки внутри картинки, пары door box/door arch,
и подозрительные дубли — две рамки одного класса с IoU > 0.6.
"""
import glob
import json
import os
import re
import sys

here = os.path.dirname(os.path.abspath(__file__))
names = [re.match(r"\s+\d+:\s*(.+?)\s*$", l).group(1) for l in open(os.path.join(here, "classes.yaml"), encoding="utf-8") if re.match(r"\s+\d+:", l)]
allowed = set(names) | {"unknown"}


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0])); iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua else 0


for zk in sys.argv[1:]:
    files = sorted(glob.glob(os.path.join(here, "..", "dataset", zk, "*.labels.json")))
    jpgs = len(glob.glob(os.path.join(here, "..", "dataset", zk, "*.jpg")))
    total, problems = 0, []
    for p in files:
        d = json.load(open(p, encoding="utf-8")); w, h = d["size"]; objs = d["objects"]; tag = p[-20:-12]
        total += len(objs)
        for o in objs:
            x1, y1, x2, y2 = o["bbox"]
            if o["cls"] not in allowed or not (0 <= x1 < x2 <= w and 0 <= y1 < y2 <= h):
                problems.append((tag, "bad", o))
        db = sum(o["cls"] == "door box" for o in objs); da = sum(o["cls"] == "door arch" for o in objs)
        if db != da:
            problems.append((tag, "doors", db, da))
        for i in range(len(objs)):
            for j in range(i + 1, len(objs)):
                if objs[i]["cls"] == objs[j]["cls"] and iou(objs[i]["bbox"], objs[j]["bbox"]) > 0.6:
                    problems.append((tag, "dup", objs[i]["cls"], objs[i]["bbox"], objs[j]["bbox"]))
    print(f"{zk}: {len(files)}/{jpgs} файлов, {total} объектов, проблем {len(problems)}")
    for pr in problems:
        print("  ", pr)
