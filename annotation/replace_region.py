"""Заменить разметку в прямоугольной области планировки: python annotation/replace_region.py <ЖК> <тег> x1 y1 x2 y2 < objects.json

Удаляет все рамки, целиком лежащие в области (кроме окон и дверей), и добавляет переданные.
Нужен для почти одинаковых планировок, где отличается одна комната.
"""
import glob
import json
import os
import sys

zk, tag = sys.argv[1], sys.argv[2]
rx1, ry1, rx2, ry2 = map(int, sys.argv[3:7])
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)
path = [f for f in glob.glob(os.path.join(root, "*.labels.json")) if f[-20:-12] == tag][0]
data = json.load(open(path, encoding="utf-8"))
TOL = 4
keep = {"window", "window-block", "door box", "door arch"}


def inside(o):
    x1, y1, x2, y2 = o["bbox"]
    return x1 >= rx1 - TOL and y1 >= ry1 - TOL and x2 <= rx2 + TOL and y2 <= ry2 + TOL and o["cls"] not in keep


removed = [o["cls"] for o in data["objects"] if inside(o)]
data["objects"] = [o for o in data["objects"] if not inside(o)] + [{"cls": c, "bbox": b} for c, b in json.load(sys.stdin)]
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print("удалено", len(removed), "-> всего", len(data["objects"]))
