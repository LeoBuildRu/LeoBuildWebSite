"""Сохранить разметку планировки с подгонкой рамок и собрать картинку для проверки.

    python annotation/snap.py <ЖК> <тег> < objects.json

objects.json — список [класс, [x1, y1, x2, y2]] с запасом в несколько пикселей вокруг значка.

- window, window-block, door box: по длине — до простенков (разрыв в стене вокруг середины
  рамки), по толщине — на всю толщину стены; рама цвета стены и ниша в толстой стене
  (ЖК 56269) учитываются. Если стену не нашёл, рамка остаётся как есть и печатается.
- shaft сохраняется как есть: его заливка та же, что у стены.
- остальные: каждая сторона сдвигается внутрь, пока на ней нет линий значка; стены при этом
  не считаются линиями, так что запас может заходить на стену.
- класс с «!» в конце («door box!») сохраняется как есть, без подгонки.

Пишет dataset/<ЖК>/<id>.labels.json и dataset/<ЖК>/_review/<тег>.jpg.
"""
import glob
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OPENINGS = {"window", "window-block", "door box"}
KEEP = {"shaft"}  # тёмная рамка — та же заливка, что у стены
DARK = 135  # стены: 56269 — серые ~120, 67276 и 68781 — почти чёрные


def masks(img):
    a = np.asarray(img.convert("RGB"), dtype=int)
    gray = a.mean(axis=2)
    bg = np.median(gray)
    sat = a.max(axis=2) - a.min(axis=2)
    ink = (bg - gray > 25) | (sat > 60)  # линии мебели в 67276 светлые, до 230
    dark = (gray < DARK).astype(np.uint8)
    wall = cv2.morphologyEx(dark, cv2.MORPH_OPEN, np.ones((6, 6), np.uint8)) > 0
    # край стены после сглаживания светлее порога стены — его тоже не считаем линией
    near_wall = cv2.dilate(wall.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    return ink & ~near_wall, wall


def tighten(ink, box, share=0.1):
    """Сдвигает стороны внутрь, пока на стороне мало линий (меньше share длины). Не сдвигает, если по краю
    рамки идёт линия значка: так стол или диван, упёртый в стену без своей линии, не обрезается."""
    x1, y1, x2, y2 = box

    def empty_row(y):
        return ink[y, x1:x2].sum() < max(2, share * (x2 - x1)) and not (ink[y, x1:x1 + 3].any() or ink[y, x2 - 3:x2].any())

    def empty_col(x):
        return ink[y1:y2, x].sum() < max(2, share * (y2 - y1)) and not (ink[y1:y1 + 3, x].any() or ink[y2 - 3:y2, x].any())

    # стороны сдвигаются по одному пикселю по очереди: так угловая проверка видит
    # уже подогнанные соседние стороны, а не исходный запас
    moved = True
    while moved:
        moved = False
        if y2 - y1 > 4 and empty_row(y1):
            y1 += 1
            moved = True
        if y2 - y1 > 4 and empty_row(y2 - 1):
            y2 -= 1
            moved = True
        if x2 - x1 > 4 and empty_col(x1):
            x1 += 1
            moved = True
        if x2 - x1 > 4 and empty_col(x2 - 1):
            x2 -= 1
            moved = True
    # схлопнулась сторона (линии значка слились со стеной) — оставляем исходный запас по этой оси
    if x2 - x1 < max(8, 0.4 * (box[2] - box[0])):
        print("не подогнал по ширине:", box)
        x1, x2 = box[0], box[2]
    if y2 - y1 < max(8, 0.4 * (box[3] - box[1])):
        print("не подогнал по высоте:", box)
        y1, y2 = box[1], box[3]
    return [int(x1), int(y1), int(x2), int(y2)]


def fit_opening(wall, ink, box, reach=30, stub=12, frame=14, depth=130):
    """Проём: по каждой строке поперёк стены ищет разрыв вокруг середины рамки, ограниченный
    с обеих сторон стеной длиной не меньше stub (импосты окна короче). Строки с таким разрывом —
    толщина стены, медиана концов разрыва — концы проёма. None, если стену не нашёл."""
    horizontal = box[2] - box[0] >= box[3] - box[1]
    m, k = (wall, ink) if horizontal else (wall.T, ink.T)
    x1, y1, x2, y2 = box if horizontal else (box[1], box[0], box[3], box[2])
    n, rows_n = m.shape[1], m.shape[0]
    c = (x1 + x2) // 2
    lo, hi = max(0, x1 - reach), min(n, x2 + reach)
    def end(row, i, step, limit):
        # идёт от середины до стены длиной не меньше stub; короткие тёмные куски (импосты) пропускает
        while 0 <= i + step < len(row) and (i + step - limit) * step < 0:
            if not row[i + step]:
                i += step
                continue
            j = i + step
            while 0 <= j < len(row) and row[j] and abs(j - i) <= stub:
                j += step
            if abs(j - i) > stub:
                return i
            i = j - step
        return None

    found = {}
    mid = (y1 + y2) // 2
    # depth — толстая стена с нишей у окна (ЖК 56269), до ~130 px
    for r in range(max(0, min(y1 - 30, mid - depth)), min(rows_n, max(y2 + 30, mid + depth))):
        row = m[r]
        if row[c]:
            continue
        a, b = end(row, c, -1, lo), end(row, c, 1, hi)
        if a is not None and b is not None:
            found[r] = (a, b + 1)
    mid = (y1 + y2) // 2
    near = [r for r in found if abs(r - mid) <= 12]
    if not near:
        return None
    start = min(near, key=lambda r: abs(r - mid))
    def grow(r, step):
        # рама окна бывает нарисована толстой линией цвета стены (ЖК 56269):
        # перескакиваем её, если за ней разрыв продолжается
        while True:
            if r + step in found:
                r += step
                continue
            k = r + step
            while abs(k - r) <= frame and 0 <= k < rows_n and k not in found and m[k, c]:
                k += step
            if k in found and abs(k - r) <= frame:
                r = k
                continue
            return r

    p, q = grow(start, -1), grow(start, 1) + 1
    # Обычно концы — медиана по строкам. Если часть строк упирается в стену заметно раньше
    # (окно в нише толстой стены), берётся этот более узкий разрыв; рама и откосы (до 20 px) не в счёт.
    sa = [found[r][0] for r in range(p, q) if r in found]
    sb = [found[r][1] for r in range(p, q) if r in found]
    a, a75 = int(np.median(sa)), int(np.percentile(sa, 75))
    b, b25 = int(np.median(sb)), int(np.percentile(sb, 25))
    if a75 - a > 20:
        a = a75
    if b - b25 > 20:
        b = b25
    # толщина — без строк ниши комнаты перед окном
    # (строки, где разрыв длиннее проёма больше чем на 20 px); строки с торцами рамы, где разрыв короче, остаются
    rows = [r for r in range(p, q) if r in found and found[r][0] >= a - 20 and found[r][1] <= b + 20]
    if rows:
        p, q = min(rows), max(rows) + 1
    # наружная и внутренняя линии рамы цвета стены входят в проём
    for _ in range(frame):
        if p > 0 and m[p - 1, a:b].mean() > 0.9:
            p -= 1
    for _ in range(frame):
        if q < rows_n and m[q, a:b].mean() > 0.9:
            q += 1
    # стекло бывает вынесено за грань стены — его не обрезаем
    for _ in range(10):
        if p > 0 and k[p - 1, a:b].mean() > 0.5:
            p -= 1
    for _ in range(10):
        if q < rows_n and k[q, a:b].mean() > 0.5:
            q += 1
    return [a, p, b, q] if horizontal else [p, a, q, b]


def main():
    zk, tag = sys.argv[1], sys.argv[2]
    root = os.path.join(HERE, "..", "dataset", zk)
    img = [f for f in glob.glob(os.path.join(root, "*.jpg")) if f[-12:-4] == tag][0]
    im = Image.open(img)
    w, h = im.size
    ink, wall = masks(im)
    objs = []
    for c, b in json.load(sys.stdin):
        b = [max(0, min(w, b[0])), max(0, min(h, b[1])), max(0, min(w, b[2])), max(0, min(h, b[3]))]
        if c in KEEP or c.endswith("!"):
            c = c.rstrip("!")
        elif c in OPENINGS:
            # у дверей ниш и толстых рам нет: глубокий поиск только мешает
            fit = fit_opening(wall, ink, b) if c != "door box" else fit_opening(wall, ink, b, frame=0, depth=0)
            if fit is None:
                print("проём без стены:", c, b)
            else:
                b = fit
        else:
            # дуга двери — тонкая кривая: на крайних строках у неё всего несколько точек
            b = tighten(ink, b, 0 if c == "door arch" else 0.1)
        objs.append({"cls": c, "bbox": b})
    data = {"image": os.path.basename(img), "zk": zk, "size": [w, h], "status": "draft", "objects": objs}
    path = img[:-4] + ".labels.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(root, "_review"), exist_ok=True)
    subprocess.run([sys.executable, os.path.join(HERE, "overlay.py"), "overlay", path,
                    os.path.join(root, "_review", tag + ".jpg")], check=True)


if __name__ == "__main__":
    main()
