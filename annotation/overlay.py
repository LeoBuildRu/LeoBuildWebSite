"""Вспомогательные картинки для разметки планировок.

    python annotation/overlay.py grid    <plan.jpg>         <out.jpg>   # сетка с координатами поверх чертежа
    python annotation/overlay.py zoom    <plan.jpg>         <out.jpg> x1 y1 x2 y2 [scale]   # увеличенный фрагмент с сеткой
    python annotation/overlay.py overlay <plan.labels.json> <out.jpg> [x1 y1 x2 y2 [scale]] # рамки разметки поверх чертежа

Формат разметки — annotation/RULES.md, раздел «Хранение и экспорт».
"""
import json
import os
import re
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SERVICE_CLASSES = {"unknown"}


def load_classes():
    names = []
    with open(os.path.join(HERE, "classes.yaml"), encoding="utf-8") as f:
        for line in f:
            m = re.match(r"\s+\d+:\s*(.+?)\s*$", line)
            if m:
                names.append(m.group(1))
    return names


COLORS = {
    "window": (0, 120, 255), "window-block": (0, 170, 255),
    "door box": (0, 170, 90), "door arch": (230, 120, 0),
    "unknown": (255, 0, 200),
}
DEFAULT = (220, 30, 30)


def grid(src, out, step=50):
    im = Image.open(src).convert("RGB")
    d = ImageDraw.Draw(im)
    for x in range(0, im.width, step):
        major = x % (step * 2) == 0
        d.line([(x, 0), (x, im.height)], fill=(120, 200, 255) if major else (200, 230, 255), width=1)
        if major:
            for y in range(0, im.height, 200):
                d.text((x + 2, y + 2), str(x), fill=(0, 90, 200))
    for y in range(0, im.height, step):
        major = y % (step * 2) == 0
        d.line([(0, y), (im.width, y)], fill=(120, 200, 255) if major else (200, 230, 255), width=1)
        if major:
            for x in range(0, im.width, 200):
                d.text((x + 2, y + 2), str(y), fill=(0, 90, 200))
    im.save(out, quality=90)


def zoom(src, out, x1, y1, x2, y2, scale=2.0, step=25):
    """Увеличенный фрагмент с сеткой; подписи — в координатах исходной картинки."""
    x1, y1, x2, y2, scale = int(x1), int(y1), int(x2), int(y2), float(scale)
    im = Image.open(src).convert("RGB").crop((x1, y1, x2, y2))
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for x in range((x1 // step + 1) * step, x2, step):
        major = x % (step * 2) == 0
        px = (x - x1) * scale
        d.line([(px, 0), (px, im.height)], fill=(120, 200, 255) if major else (215, 235, 255), width=1)
        if major:
            for py in range(0, im.height, 300):
                d.text((px + 2, py + 2), str(x), fill=(0, 90, 200))
    for y in range((y1 // step + 1) * step, y2, step):
        major = y % (step * 2) == 0
        py = (y - y1) * scale
        d.line([(0, py), (im.width, py)], fill=(120, 200, 255) if major else (215, 235, 255), width=1)
        if major:
            for px in range(0, im.width, 300):
                d.text((px + 2, py + 2), str(y), fill=(0, 90, 200))
    im.save(out, quality=90)


def overlay(labels_path, out, *crop):
    data = json.load(open(labels_path, encoding="utf-8"))
    allowed = set(load_classes()) | SERVICE_CLASSES
    bad = [o["cls"] for o in data["objects"] if o["cls"] not in allowed]
    if bad:
        sys.exit(f"Неизвестные классы: {sorted(set(bad))}")
    img = os.path.join(os.path.dirname(labels_path), data["image"])
    im = Image.open(img).convert("RGB")
    d = ImageDraw.Draw(im)
    for o in data["objects"]:
        x1, y1, x2, y2 = o["bbox"]
        if not (0 <= x1 < x2 <= im.width and 0 <= y1 < y2 <= im.height):
            sys.exit(f"Рамка вне картинки или пустая: {o}")
        col = COLORS.get(o["cls"], DEFAULT)
        d.rectangle([x1, y1, x2, y2], outline=col, width=2)
        d.text((x1 + 3, y1 + 2), o["cls"], fill=col)
    if crop:
        cx1, cy1, cx2, cy2 = [int(v) for v in crop[:4]]
        scale = float(crop[4]) if len(crop) > 4 else 2.0
        im = im.crop((cx1, cy1, cx2, cy2))
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    im.save(out, quality=90)
    counts = {}
    for o in data["objects"]:
        counts[o["cls"]] = counts.get(o["cls"], 0) + 1
    print(len(data["objects"]), "объектов:", dict(sorted(counts.items())))


if __name__ == "__main__":
    cmd, a, b, *rest = sys.argv[1:]
    {"grid": grid, "zoom": zoom, "overlay": overlay}[cmd](a, b, *rest)
