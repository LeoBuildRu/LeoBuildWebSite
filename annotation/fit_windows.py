"""Растягивает рамки окон на всю толщину стены: python annotation/fit_windows.py <ЖК> [тег ...] [--apply]

Толщина берётся по простенкам у концов окна: тёмный отрезок поперёк стены,
проходящий через середину рамки. Без --apply только печатает, что поменялось бы.
"""
import glob
import json
import os
import sys

from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
DARK = 110          # порог яркости заливки стены
OFFSETS = (4, 7, 10, 14)
MIN_T, MAX_T = 12, 95


def dark_run(px, n, fixed, c, horizontal):
    """Тёмный отрезок поперёк стены, проходящий через c (или рядом)."""
    get = (lambda t: px[fixed, t]) if horizontal else (lambda t: px[t, fixed])
    start = None
    for d in range(0, 8):
        for t in (c - d, c + d):
            if 0 <= t < n and get(t) < DARK:
                start = t
                break
        if start is not None:
            break
    if start is None:
        return None
    a = b = start
    while a > 0 and get(a - 1) < DARK:
        a -= 1
    while b < n - 1 and get(b + 1) < DARK:
        b += 1
    return a, b + 1


def fit(px, size, bbox):
    w, h = size
    x1, y1, x2, y2 = bbox
    horizontal = x2 - x1 >= y2 - y1
    if horizontal:
        c, n, ends = (y1 + y2) // 2, h, [(x1 - o) for o in OFFSETS] + [(x2 + o) for o in OFFSETS]
        lim = w
    else:
        c, n, ends = (x1 + x2) // 2, w, [(y1 - o) for o in OFFSETS] + [(y2 + o) for o in OFFSETS]
        lim = h
    runs = []
    for e in ends:
        if 0 <= e < lim:
            r = dark_run(px, n, e, c, horizontal)
            if r and MIN_T <= r[1] - r[0] <= MAX_T:
                runs.append(r)
    if len(runs) < 2:
        return None
    # самый частый отрезок: угол здания или поперечная стена дают выбросы
    runs.sort(key=lambda r: r[1] - r[0])
    a, b = runs[len(runs) // 2 - (1 if len(runs) % 2 == 0 else 0)]
    # стекло бывает вынесено за наружную грань стены — его не обрезаем
    if horizontal:
        return [x1, min(a, y1), x2, max(b, y2)]
    return [min(a, x1), y1, max(b, x2), y2]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    zk, tags = args[0], args[1:]
    files = sorted(glob.glob(os.path.join(here, "..", "dataset", zk, "*.labels.json")))
    if tags:
        files = [f for f in files if any(f.endswith(t + ".labels.json") for t in tags)]
    changed = skipped = 0
    for p in files:
        d = json.load(open(p, encoding="utf-8"))
        px = Image.open(os.path.join(os.path.dirname(p), d["image"])).convert("L").load()
        dirty = False
        for o in d["objects"]:
            if o["cls"] not in ("window", "window-block"):
                continue
            new = fit(px, d["size"], o["bbox"])
            if new is None:
                skipped += 1
                print(p[-20:-12], o["cls"], o["bbox"], "-> не нашёл стену")
                continue
            if new != o["bbox"]:
                print(p[-20:-12], o["cls"], o["bbox"], "->", new)
                o["bbox"] = new
                changed += 1
                dirty = True
        if apply and dirty:
            json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"изменено {changed}, без стены {skipped}", "(записано)" if apply else "(без записи)")


if __name__ == "__main__":
    main()
