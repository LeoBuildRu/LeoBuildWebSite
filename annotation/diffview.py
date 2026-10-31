"""Показать, где копия планировки отличается от исходной: python annotation/diffview.py <ЖК> <тег-источник> <тег-копия> <выход.jpg>

Красным закрашены отличающиеся пиксели (после подбора общего сдвига), поверх — рамки разметки копии.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

zk, src, dst, out = sys.argv[1:5]
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)


def find(tag):
    return [f for f in glob.glob(os.path.join(root, "*.jpg")) if f[-12:-4] == tag][0]


A = np.asarray(Image.open(find(src)).convert("L"), dtype=float)
B_img = Image.open(find(dst)).convert("RGB")
B = np.asarray(B_img.convert("L"), dtype=float)
h, w = min(A.shape[0], B.shape[0]), min(A.shape[1], B.shape[1])
best = None
for dy in range(-12, 13, 2):
    for dx in range(-12, 13, 2):
        a = A[max(0, dy):h + min(0, dy), max(0, dx):w + min(0, dx)]
        b = B[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)]
        d = np.abs(a - b).mean()
        if best is None or d < best[0]:
            best = (d, dx, dy)
_, dx, dy = best
shifted = np.full_like(B, 255.0)
src_box = A[max(0, -dy):A.shape[0] - max(0, dy), max(0, -dx):A.shape[1] - max(0, dx)]
shifted[max(0, dy):max(0, dy) + src_box.shape[0], max(0, dx):max(0, dx) + src_box.shape[1]] = src_box[:B.shape[0] - max(0, dy), :B.shape[1] - max(0, dx)]
mask = Image.fromarray((np.abs(shifted - B) > 60).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
red = Image.new("RGB", B_img.size, (255, 0, 0))
im = Image.composite(Image.blend(B_img, red, 0.6), B_img, mask)
labels = json.load(open(find(dst)[:-4] + ".labels.json", encoding="utf-8"))
d = ImageDraw.Draw(im)
for o in labels["objects"]:
    d.rectangle(o["bbox"], outline=(0, 120, 255), width=2)
im.save(out, quality=88)
print("shift", dx, dy)

# Области отличий: блоки 16x16 с заметной разницей, склеенные по соседству
S = 16
m = np.asarray(mask) > 0
gh, gw = m.shape[0] // S, m.shape[1] // S
blocks = m[:gh * S, :gw * S].reshape(gh, S, gw, S).sum(axis=(1, 3)) > 12
seen = np.zeros_like(blocks)
for by in range(gh):
    for bx in range(gw):
        if blocks[by, bx] and not seen[by, bx]:
            stack, cells = [(by, bx)], []
            seen[by, bx] = True
            while stack:
                cy, cx = stack.pop()
                cells.append((cy, cx))
                for ny in range(cy - 1, cy + 2):
                    for nx in range(cx - 1, cx + 2):
                        if 0 <= ny < gh and 0 <= nx < gw and blocks[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            ys, xs = [c[0] for c in cells], [c[1] for c in cells]
            print("отличие", [min(xs) * S, min(ys) * S, (max(xs) + 1) * S, (max(ys) + 1) * S], "блоков", len(cells))
