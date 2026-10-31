"""Перевести рамки из пикселей увеличенного фрагмента в пиксели исходной картинки.

    python annotation/px.py <x0> <y0> <масштаб> < objects_px.json > objects.json

objects_px.json — список [класс, [x1, y1, x2, y2]] в пикселях фрагмента, сделанного overlay.py zoom.
"""
import json
import sys

x0, y0, s = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
objs = json.load(sys.stdin)
print(json.dumps([[c, [round(x0 + b[0] / s), round(y0 + b[1] / s), round(x0 + b[2] / s), round(y0 + b[3] / s)]] for c, b in objs]))
