import cv2
import supervision as sv
import numpy as np
import base64
from inference_sdk import InferenceHTTPClient

client = InferenceHTTPClient(
    api_url="https://serverless.roboflow.com",
    api_key="QZUFzS50qDDJ48nKrGlS"
)

result = client.run_workflow(
    workspace_name="leobuild",
    workflow_id="detect-count-and-visualize-3",
    images={"image": "example.png"},
    use_cache=True
)

# result может быть списком – берём первый элемент
if isinstance(result, list):
    result = result[0]

# Посмотрим, какие ключи есть в ответе
print("Ключи ответа:", result.keys())

# --- Извлечение детекций ---
# В вашем выводе была структура: result['predictions']['predictions']
if 'predictions' in result:
    predictions = result['predictions']['predictions']
    image_dims = result['predictions']['image']
    print(f"Найдено объектов: {len(predictions)}")

    # --- Ручная отрисовка (если нет готового изображения) ---
    image = cv2.imread("example.png")
    boxes = []
    confidences = []
    for pred in predictions:
        x, y, w, h = pred['x'], pred['y'], pred['width'], pred['height']
        x_min = x - w/2
        y_min = y - h/2
        x_max = x + w/2
        y_max = y + h/2
        boxes.append([x_min, y_min, x_max, y_max])
        confidences.append(pred['confidence'])

    detections = sv.Detections(
        xyxy=np.array(boxes),
        confidence=np.array(confidences),
        class_id=np.zeros(len(boxes), dtype=int)
    )

    annotated = sv.BoxAnnotator().annotate(scene=image.copy(), detections=detections)
    annotated = sv.LabelAnnotator().annotate(scene=annotated, detections=detections)
    cv2.imwrite("manual_visualization.jpg", annotated)
    print("Ручная визуализация сохранена как manual_visualization.jpg")

# --- Извлечение готового изображения из ответа (если workflow его возвращает) ---
# В вашем выводе была строка, похожая на base64, возможно это поле "visualization" или "output_image"
for key in ['visualization', 'output_image', 'image', 'annotated']:
    if key in result and isinstance(result[key], str):
        # Декодируем base64 и сохраняем
        img_data = base64.b64decode(result[key])
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        cv2.imwrite(f"workflow_visualization_{key}.jpg", img)
        print(f"Готовое изображение из поля '{key}' сохранено как workflow_visualization_{key}.jpg")
        break