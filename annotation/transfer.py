"""Перенести разметку на почти одинаковую планировку того же ЖК.

    python annotation/transfer.py <ЖК> <тег-источник> <тег-цель>

Каждую рамку сдвигает на своё смещение: ищет по картинке-цели лучшее совпадение фрагмента
вокруг рамки в пределах ±12 px. Печатает рамки с плохим совпадением — их надо проверить глазами.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

zk, src_tag, dst_tag = sys.argv[1:4]
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)


def find(tag):
    return [f for f in glob.glob(os.path.join(root, "*.jpg")) if f[-12:-4] == tag][0]


src_img, dst_img = find(src_tag), find(dst_tag)
A = np.asarray(Image.open(src_img).convert("L"), dtype=float)
B = np.asarray(Image.open(dst_img).convert("L"), dtype=float)
H, W = A.shape
labels = json.load(open(src_img[:-4] + ".labels.json", encoding="utf-8"))
R, PAD = 12, 10
out, worst = [], []
for o in labels["objects"]:
    x1, y1, x2, y2 = o["bbox"]
    cx1, cy1, cx2, cy2 = max(R, x1 - PAD), max(R, y1 - PAD), min(W - R, x2 + PAD), min(H - R, y2 + PAD)
    patch = A[cy1:cy2, cx1:cx2]
    best = None
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            d = np.abs(patch - B[cy1 + dy:cy2 + dy, cx1 + dx:cx2 + dx]).mean()
            if best is None or d < best[0]:
                best = (d, dx, dy)
    d, dx, dy = best
    nb = [max(0, x1 + dx), max(0, y1 + dy), min(W, x2 + dx), min(H, y2 + dy)]
    out.append({"cls": o["cls"], "bbox": nb})
    worst.append((round(d, 1), o["cls"], nb, (dx, dy)))
data = dict(labels, image=os.path.basename(dst_img), objects=out)
with open(dst_img[:-4] + ".labels.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
for w in sorted(worst, reverse=True)[:6]:
    print("совпадение", *w)
