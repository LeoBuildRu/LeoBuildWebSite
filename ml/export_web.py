"""Выгрузка обученного детектора в ONNX для браузера (builder.js → modules/PlanDetector.js).

    python ml/export_web.py                              # ml/runs/final/weights/best.pt
    python ml/export_web.py ml/runs/holdout/weights/best.pt
    python ml/export_web.py <best.pt> --conf 0.4         # порог уверенности для браузера

Кладёт plan-detector.onnx и model.json в application/static/models/plan-detector/.
Порог стоит брать по максимуму F1 на отложенном ЖК (ml/runs/holdout).
"""
import argparse
import csv
import datetime
import json
import os
import shutil

from ultralytics import YOLO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "application", "static", "models", "plan-detector")


def best_metrics(run_dir):
    path = os.path.join(run_dir, "results.csv")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        rows = [{k.strip(): v for k, v in r.items()} for r in csv.DictReader(f)]
    best = max(rows, key=lambda r: float(r["metrics/mAP50-95(B)"]))
    return {"epoch": int(float(best["epoch"])),
            "mAP50": round(float(best["metrics/mAP50(B)"]), 3),
            "mAP50_95": round(float(best["metrics/mAP50-95(B)"]), 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("weights", nargs="?", default=os.path.join(ROOT, "ml", "runs", "final", "weights", "best.pt"))
    ap.add_argument("--conf", type=float, default=0.35)
    args = ap.parse_args()
    weights = args.weights
    model = YOLO(weights)
    imgsz = int(model.ckpt["train_args"]["imgsz"]) if getattr(model, "ckpt", None) else 1280
    # nms=False — NMS-free голова YOLO26: выход [1, 300, 6] уже без дублей, браузеру не нужен NMS.
    onnx_path = model.export(format="onnx", imgsz=imgsz, opset=17, simplify=True, dynamic=False, nms=False)

    os.makedirs(OUT, exist_ok=True)
    shutil.copyfile(onnx_path, os.path.join(OUT, "plan-detector.onnx"))
    meta = {
        "file": "plan-detector.onnx",
        "imgsz": imgsz,
        "conf": args.conf,
        "names": [model.names[i] for i in range(len(model.names))],
        "weights": os.path.relpath(weights, ROOT).replace(os.sep, "/"),
        "exported": datetime.date.today().isoformat(),
        # Честная оценка — прогон, где ЖК валидации не было в train (ml/export_yolo.py без --all).
        # У финальной модели val входит в train, её метрики завышены.
        "holdout": best_metrics(os.path.join(ROOT, "ml", "runs", "holdout")),
    }
    with open(os.path.join(OUT, "model.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    size_mb = os.path.getsize(os.path.join(OUT, "plan-detector.onnx")) / 2**20
    print(f"{os.path.relpath(OUT, ROOT)}: plan-detector.onnx ({size_mb:.1f} МБ), model.json")


if __name__ == "__main__":
    main()
