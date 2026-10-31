"""Увеличенные фрагменты с сеткой для первой планировки каждой группы копий.

    python annotation/make_zooms.py <ЖК> <groups.json> <папка>

Делит чертёж на 2 части (если масштаб выходит не меньше 1.45) или на 4.
"""
import glob
import json
import os
import subprocess
import sys

from PIL import Image, ImageOps

zk, groups_path, out = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))
groups = json.load(open(groups_path))
for i, g in enumerate(groups, 1):
    tag = g[0]
    f = [x for x in glob.glob(os.path.join(here, "..", "dataset", zk, "*.jpg")) if x.endswith(tag + ".jpg")][0]
    im = Image.open(f).convert("L")
    x1, y1, x2, y2 = ImageOps.invert(im).point(lambda v: 255 if v > 25 else 0).getbbox()
    x1, y1, x2, y2 = max(0, x1 - 8), max(0, y1 - 8), min(im.width, x2 + 8), min(im.height, y2 + 8)
    w, h = x2 - x1, y2 - y1
    mx, my = (x1 + x2) // 2, (y1 + y2) // 2
    if w >= h:
        two = [(x1, y1, mx + 15, y2), (mx - 15, y1, x2, y2)]
        s2 = min(1130 / (mx + 15 - x1), 1000 / h, 3.0)
    else:
        two = [(x1, y1, x2, my + 15), (x1, my - 15, x2, y2)]
        s2 = min(1130 / w, 1000 / (my + 15 - y1), 3.0)
    if s2 >= 1.45:
        parts, sc = two, s2
    else:
        parts = [(x1, y1, mx + 15, my + 15), (mx - 15, y1, x2, my + 15), (x1, my - 15, mx + 15, y2), (mx - 15, my - 15, x2, y2)]
        sc = min(1130 / (mx + 15 - x1), 1000 / (my + 15 - y1), 3.0)
    sc = round(sc, 2)
    for k, q in enumerate(parts, 1):
        subprocess.run([sys.executable, os.path.join(here, "overlay.py"), "zoom", f, f"{out}/g{i:02d}_{tag}_{k}.jpg", *map(str, q), str(sc)], check=True)
    print(i, tag, (x1, y1, x2, y2), len(parts), "parts, scale", sc)
