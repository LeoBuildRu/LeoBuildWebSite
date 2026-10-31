"""Экспорт разметки dataset/ в формат YOLO для обучения детектора.

    python ml/export_yolo.py                 # валидация — ЖК 56842 (честная проверка на незнакомом ЖК)
    python ml/export_yolo.py --val 70198     # другой ЖК в валидацию
    python ml/export_yolo.py --all           # финальная модель: в train идут все ЖК, val = тот же 56842

Классы и их номера — annotation/classes.yaml. Служебный `unknown` в экспорт не попадает.
Результат — ml/data/{train,val}/{images,labels} и ml/data/data.yaml.
"""
import argparse
import glob
import json
import os
import re
import shutil

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ml", "data")


def load_classes():
    names = []
    with open(os.path.join(ROOT, "annotation", "classes.yaml"), encoding="utf-8") as f:
        for line in f:
            m = re.match(r"\s+\d+:\s*(.+?)\s*$", line)
            if m:
                names.append(m.group(1))
    return names


def image_ok(path):
    try:
        with Image.open(path) as im:
            im.verify()
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--val", default="56842", help="ЖК, целиком уходящие в валидацию (через запятую)")
    ap.add_argument("--all", action="store_true", help="все ЖК в train (для финальной модели)")
    args = ap.parse_args()
    val_zk = set(args.val.split(","))

    names = load_classes()
    index = {n: i for i, n in enumerate(names)}

    shutil.rmtree(OUT, ignore_errors=True)
    for split in ("train", "val"):
        os.makedirs(os.path.join(OUT, split, "images"))
        os.makedirs(os.path.join(OUT, split, "labels"))

    stats = {"train": 0, "val": 0, "boxes": 0, "skipped": []}
    for lbl_path in sorted(glob.glob(os.path.join(ROOT, "dataset", "*", "*.labels.json"))):
        with open(lbl_path, encoding="utf-8") as f:
            data = json.load(f)
        img_path = os.path.join(os.path.dirname(lbl_path), data["image"])
        if not image_ok(img_path):
            stats["skipped"].append(img_path)
            continue

        w, h = data["size"]
        lines = []
        for obj in data["objects"]:
            cls = obj["cls"].rstrip("!")
            if cls not in index:
                continue
            x1, y1, x2, y2 = obj["bbox"]
            x1, x2 = max(0, min(x1, x2)), min(w, max(x1, x2))
            y1, y2 = max(0, min(y1, y2)), min(h, max(y1, y2))
            if x2 - x1 < 1 or y2 - y1 < 1:
                continue
            lines.append(f"{index[cls]} {(x1 + x2) / 2 / w:.6f} {(y1 + y2) / 2 / h:.6f} "
                         f"{(x2 - x1) / w:.6f} {(y2 - y1) / h:.6f}")

        zk = data["zk"]
        stem = f"{zk}_{data['image'][-36:-4]}"
        splits = ["val"] if zk in val_zk else ["train"]
        if args.all and zk in val_zk:
            splits.append("train")
        for split in splits:
            shutil.copyfile(img_path, os.path.join(OUT, split, "images", stem + ".jpg"))
            with open(os.path.join(OUT, split, "labels", stem + ".txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
            stats[split] += 1
        stats["boxes"] += len(lines)

    with open(os.path.join(OUT, "data.yaml"), "w", encoding="utf-8") as f:
        f.write(f"path: {OUT.replace(os.sep, '/')}\ntrain: train/images\nval: val/images\nnames:\n")
        for i, n in enumerate(names):
            f.write(f"  {i}: {n}\n")

    print(f"train: {stats['train']} картинок, val: {stats['val']} (ЖК {', '.join(sorted(val_zk))}), "
          f"рамок: {stats['boxes']}, классов: {len(names)}")
    for p in stats["skipped"]:
        print("пропущена битая картинка:", os.path.relpath(p, ROOT))


if __name__ == "__main__":
    main()
