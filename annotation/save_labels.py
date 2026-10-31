"""Сохранить разметку одной планировки: python annotation/save_labels.py <ЖК> <тег> < objects.json

objects.json — список [класс, [x1, y1, x2, y2]]; тег — последние 8 символов имени файла.
"""
import glob
import json
import os
import sys

from PIL import Image

zk, tag = sys.argv[1], sys.argv[2]
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)
img = [f for f in glob.glob(os.path.join(root, "*.jpg")) if f[-12:-4] == tag][0]
objs = json.load(sys.stdin)
w, h = Image.open(img).size
data = {"image": os.path.basename(img), "zk": zk, "size": [w, h], "status": "draft",
        "objects": [{"cls": c, "bbox": b} for c, b in objs]}
with open(img[:-4] + ".labels.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(f"dataset/{zk}/{os.path.basename(img)[:-4]}.labels.json")
