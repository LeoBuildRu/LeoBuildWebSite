"""Лист проверки: наложения рамок для нескольких планировок одной картинкой.

    python annotation/contact.py <ЖК> <выход.jpg> <тег> [<тег> ...]
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from overlay import COLORS, DEFAULT  # noqa: E402

zk, out, tags = sys.argv[1], sys.argv[2], sys.argv[3:]
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)
cell = 760
sheet = Image.new("RGB", (cell * min(2, len(tags)), cell * ((len(tags) + 1) // 2)), "white")
for i, tag in enumerate(tags):
    img = [f for f in glob.glob(os.path.join(root, "*.jpg")) if f[-12:-4] == tag][0]
    data = json.load(open(img[:-4] + ".labels.json", encoding="utf-8"))
    im = Image.open(img).convert("RGB")
    d = ImageDraw.Draw(im)
    for o in data["objects"]:
        d.rectangle(o["bbox"], outline=COLORS.get(o["cls"], DEFAULT), width=4)
    d.text((10, 10), tag, fill=(255, 0, 0))
    im.thumbnail((cell - 10, cell - 10))
    sheet.paste(im, ((i % 2) * cell + 5, (i // 2) * cell + 5))
sheet.save(out, quality=88)
