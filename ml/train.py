"""Обучение детектора мебели/проёмов на планировках (Ultralytics YOLO).

    python ml/export_yolo.py && python ml/train.py --name holdout     # проверка на незнакомом ЖК
    python ml/export_yolo.py --all && python ml/train.py --name final  # модель для сайта

Веса — ml/runs/<name>/weights/best.pt. Перенос в браузер — ml/export_web.py.
"""
import argparse
import os

from ultralytics import YOLO

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="holdout")
    ap.add_argument("--model", default="yolo26s.pt")
    ap.add_argument("--epochs", type=int, default=150)
    ap.add_argument("--imgsz", type=int, default=1280)
    # 8 ГБ видеопамяти при imgsz=1280 хватает на batch 4; больше — Windows уводит
    # память в shared RAM, и эпоха замедляется в разы.
    ap.add_argument("--batch", type=int, default=4)
    args = ap.parse_args()

    model = YOLO(args.model)
    model.train(
        data=os.path.join(ROOT, "ml", "data", "data.yaml"),
        project=os.path.join(ROOT, "ml", "runs"),
        name=args.name,
        exist_ok=True,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=40,
        workers=6,
        # Из папки OneDrive картинки читаются ~10 МБ/с — держим датасет в RAM (~2 ГБ).
        cache="ram",
        cos_lr=True,
        # Чертёж не имеет «верха»: отражения по обеим осям законны.
        fliplr=0.5,
        flipud=0.5,
        # Поворот на произвольный угол ломает рамки по осям — не используем.
        degrees=0.0,
        # ЖК различаются палитрой и толщиной линий — сильнее шевелим цвет и масштаб.
        hsv_h=0.05,
        hsv_s=0.6,
        hsv_v=0.3,
        scale=0.4,
        mosaic=1.0,
        close_mosaic=15,
        plots=True,
    )


if __name__ == "__main__":
    main()
