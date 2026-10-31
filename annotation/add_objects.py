"""Добавить рамки к разметке планировки: python annotation/add_objects.py <ЖК> <тег> < objects.json"""
import glob
import json
import os
import sys

zk, tag = sys.argv[1], sys.argv[2]
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset", zk)
path = [f for f in glob.glob(os.path.join(root, "*.labels.json")) if f[-20:-12] == tag][0]
data = json.load(open(path, encoding="utf-8"))
data["objects"] += [{"cls": c, "bbox": b} for c, b in json.load(sys.stdin)]
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(len(data["objects"]))
