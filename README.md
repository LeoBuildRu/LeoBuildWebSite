# LeoBuild — Web Site

Веб-платформа для 3D-визуализации интерьеров: пользователь выбирает мебель из каталога, расставляет её в браузерной 3D-сцене (Babylon.js), сохраняет расстановки в личный кабинет и делится по ссылке. Есть парсер планировок квартир с наш.дом.рф и proxy к Roboflow для CV-обработки чертежей.

**Кому этот README:** второму разработчику / его AI-ассистенту, чтобы поднять проект с нуля и понимать, где что лежит.

---

## Стек

| Слой | Технологии |
|---|---|
| Бэкенд | Python 3.12 · Django 5.1.2 · SQLite (dev) · Gunicorn (prod) |
| Фронтенд | Babylon.js 7 · @dxfom/dxf + dxf-viewer · Tailwind CSS · vanilla JS |
| CV / AI | Roboflow (serverless workflow, HTTP-прокси через Django) · OpenCV.js в браузере |
| Парсер | Playwright + Chrome DevTools Protocol (обход ServicePipe антибота) |
| Прод | nginx + gunicorn + systemd, HTTPS |

---

## Требования к машине

- **Python 3.12** (в проекте лежат `.pyc` под 3.12 — другая версия будет их пересобирать)
- **Node.js 18+** и **npm** — для сборки фронтовых зависимостей
- **Google Chrome** — если планируется запускать парсер `parse_dataset.py`
- **Git**

---

## Быстрый старт (dev)

```powershell
# 1. Клонируем
git clone https://github.com/LeoBuildRu/LeoBuildWebSite.git
cd LeoBuildWebSite

# 2. Python-окружение
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt

# 3. Переменные окружения
Copy-Item .env.example .env
# → открой .env и подставь реальные значения (см. раздел «Секреты»)

# 4. База и суперюзер
python manage.py migrate
python manage.py createsuperuser

# 5. Фронтовые зависимости
cd application\static
npm install
cd ..\..

# 6. Запуск
python manage.py runserver
```

Открой http://127.0.0.1:8000. Админка — http://127.0.0.1:8000/admin/.

Если PowerShell ругается на активацию venv:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

---

## Переменные окружения

Все секреты и настройки читаются из переменных окружения (см. `.env.example`). В dev, если переменная не задана, берётся безопасный fallback из [core/settings.py](core/settings.py). На проде systemd передаёт значения в gunicorn.

| Переменная | Обязательна | Что это |
|---|---|---|
| `DJANGO_SECRET_KEY` | prod: да, dev: нет | Секрет для подписи cookie/CSRF. Сгенерировать: `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DJANGO_DEBUG` | нет | `True` (dev) / `False` (prod). По умолчанию `True`. |
| `DJANGO_ALLOWED_HOSTS` | prod: да | Список хостов через запятую: `leobuild.ru,www.leobuild.ru,IP` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | prod: да | С схемой: `https://leobuild.ru,https://www.leobuild.ru` |
| `ROBOFLOW_API_KEY` | да, если пользоваться CV-фичей | Ключ Roboflow-аккаунта. Взять в https://app.roboflow.com/settings/api |
| `ROBOFLOW_WORKSPACE` | нет | Имя workspace в Roboflow. По умолчанию `leobuild`. |
| `ROBOFLOW_WORKFLOW_ID` | нет | ID workflow. По умолчанию `detect-count-and-visualize-3`. |

**Как получить реальные значения:** попроси владельца репозитория (larleonx@gmail.com) — он передаст их лично (Telegram/1Password/Bitwarden). В git их нет и быть не должно.

---

## Ассеты вне репозитория

Часть тяжёлых файлов **не** хранится в git (см. [.gitignore](.gitignore)) и должна быть получена отдельно:

| Папка | Размер | Что | Как получить |
|---|---|---|---|
| `application/static/models/glb/` | ~1.7 ГБ | Готовые 3D-модели мебели и сцен (`.glb`, некоторые `.blend`) | Попросить у владельца — передаст архивом (Google Drive / Яндекс.Диск) |
| `application/static/js/valid/`, `non valid/` | ~50 МБ | Тестовые DXF-чертежи для парсера | По необходимости |
| `dataset/` | переменный | Спарсенные карточки квартир с наш.дом.рф | Генерируется локально через `parse_dataset.py` |
| `db.sqlite3` | ~2 МБ | Локальная БД с demo-данными | Создаётся с нуля через `migrate` + фикстуры, либо получить дамп у владельца |

Без `models/glb/` builder запустится, но 3D-мебель не отобразится.

---

## Структура проекта

```
LeoBuildWebSite/
├── core/                       # Django project (settings, urls, wsgi)
│   ├── settings.py             # ← читает env vars, prod/dev через DJANGO_DEBUG
│   └── urls.py
├── application/                # Django app — вся бизнес-логика
│   ├── models.py               # Company_Furniture, Product_Item, Product_Image,
│   │                           #   Model_Class, SavedScene (сохранённые сцены)
│   ├── views.py                # 32 view — API карточек, корзина, auth, сцены, roboflow-proxy
│   ├── urls.py                 # роутинг
│   ├── admin.py
│   ├── migrations/             # 30 миграций
│   ├── templates/              # HTML: index, builder, accounts/*
│   └── static/                 # ВЕСЬ фронт
│       ├── js/                 # builder.js — главный 3D-редактор Babylon
│       ├── css/                # tailwind.css + output.css
│       ├── models/             # 3D-ассеты (glb/ игнорится, GLTF/ и Blender/ частично в git)
│       ├── img/, fonts/, ies/  # текстуры, шрифты, IES-профили света
│       ├── package.json        # tailwind + babylonjs + dxf-viewer
│       └── node_modules/       # ← в git не хранится
├── AIapi.py                    # ⚠ standalone-скрипт: тест Roboflow workflow из CLI (не запускается веб-приложением)
├── parse_dataset.py            # Парсер наш.дом.рф через Chrome CDP
├── probe_image.py              # Диагностика парсера
├── start_chrome_cdp.bat        # Запуск Chrome с remote-debugging для парсера
├── optimize_models.ps1         # Скрипт оптимизации 3D-моделей
├── manage.py
├── requirements.txt            # ТОЛЬКО прод-набор (Django + requests + gunicorn + Pillow)
├── .env.example                # шаблон переменных окружения
└── .gitignore
```

---

## Ключевые эндпоинты

Из [application/urls.py](application/urls.py):

**Публичные страницы**
- `/` — главная (каталог)
- `/builder/` — 3D-редактор
- `/cart/` — корзина

**API каталога**
- `GET /api/compiledJsonCompanys/` — список компаний-производителей
- `GET /api/compiledJsonClasses/` — классы мебели
- `GET /api/compiledJsonProducts/` — товары
- `GET /search/` — поиск по товарам
- `GET /get-item-info/` — карточка товара
- `POST /add_to_cart/`, `POST /remove_from_cart/`, `GET /get-cart-info/`

**CV / Roboflow**
- `POST /api/proxy-roboflow/` — прокси к Roboflow workflow (тело: base64 картинка + workflow_id). Ключ подставляется на сервере, фронт его не видит.

**Auth (кастомный)**
- `/accounts/login/`, `/accounts/register/`, `/accounts/logout/`, `/accounts/profile/`

**Сохранённые сцены**
- `POST /api/scenes/save/` — сохранить сцену
- `GET /api/scenes/list/` — свои сцены
- `GET /api/scenes/<id>/`, `POST /api/scenes/<id>/delete/`
- `POST /api/scenes/<id>/share/` — получить/сгенерировать `share_token`
- `GET /api/scenes/shared/<uuid:token>/` — публичный просмотр по токену

---

## Дополнительные скрипты

### `AIapi.py` — тест Roboflow из CLI
Standalone (не связан с Django). Нужен ML-набор пакетов, которых **нет** в `requirements.txt`:
```powershell
pip install inference-sdk supervision opencv-python numpy
python AIapi.py
```

### `parse_dataset.py` — парсер наш.дом.рф
Сайт защищён антиботом ServicePipe, поэтому парсер работает **через живой Chrome** по протоколу CDP:

```powershell
# 1. Установить Playwright (один раз)
pip install playwright requests
python -m playwright install chromium

# 2. Запустить Chrome с remote debugging
.\start_chrome_cdp.bat
# → в открывшемся Chrome дождаться, пока антибот пропустит на страницу каталога

# 3. Запустить парсер
python parse_dataset.py                 # активная вкладка каталога
python parse_dataset.py 70198           # по ID проекта
python parse_dataset.py <полный-url>
```

Результат — в `dataset/<project_id>/<жк>/*.json` + картинки.

### `probe_image.py` — диагностика селекторов на карточках квартир (для отладки парсера).

### `optimize_models.ps1` — прогон 3D-моделей через оптимизатор (снижение веса `.glb`).

### `ml/` — детектор мебели на чертеже
YOLO-модель, обученная на разметке `dataset/<ЖК>/*.labels.json` (32 класса из `annotation/classes.yaml`: мебель, сантехника, окна, двери, вентшахты). В builder она работает **в браузере** через onnxruntime-web (`application/static/js/modules/PlanDetector.js`), сервер её не запускает: кнопка «Найти мебель» в предпросмотре плана подсвечивает предметы, а после «Построить 3D» предметы, для которых есть модель в каталоге, расставляются по местам с чертежа.

Веса для сайта — `application/static/models/plan-detector/plan-detector.onnx` + `model.json` (классы, размер входа, метрики). Переобучить после новой разметки (нужна NVIDIA GPU, отдельное окружение — в прод-набор не входит):
```powershell
py -3.12 -m venv ml\.venv
ml\.venv\Scripts\pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130
ml\.venv\Scripts\pip install ultralytics onnx onnxslim onnxruntime

ml\.venv\Scripts\python ml\export_yolo.py              # валидация на незнакомом ЖК 56842
ml\.venv\Scripts\python ml\train.py --name holdout     # честная оценка качества
ml\.venv\Scripts\python ml\export_yolo.py --all
ml\.venv\Scripts\python ml\train.py --name final       # модель на всех ЖК
ml\.venv\Scripts\python ml\export_web.py               # → application/static/models/plan-detector/
```

---

## Деплой (prod)

Кратко (детали — у владельца):
- сервер: nginx + gunicorn под systemd
- HTTPS через Let's Encrypt
- `settings.py` учитывает `X-Forwarded-Proto` за прокси
- `collectstatic` → `staticfiles/`, отдаётся nginx'ом
- переменные окружения — в systemd-юните, **не в файле в репо**

Перед деплоем:
```powershell
python manage.py collectstatic --noinput
python manage.py migrate
```

---

## Типовые проблемы

| Симптом | Причина | Решение |
|---|---|---|
| `django.core.exceptions.ImproperlyConfigured` при старте | Забыл создать `.env` или скопировать из `.env.example` | `Copy-Item .env.example .env` и заполнить |
| Скрипт активации venv не работает | Политика PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Builder открывается, но мебели нет | Нет `application/static/models/glb/` | Запросить архив у владельца |
| Roboflow-прокси возвращает 401/403 | Не задан `ROBOFLOW_API_KEY` или невалидный | Проверить `.env`, ключ активен в Roboflow-панели |
| Парсер не находит вкладку | Chrome не запущен через `.bat`, или CDP-порт 9222 занят | Закрыть все окна Chrome, запустить заново через `start_chrome_cdp.bat` |
| `CSRF verification failed` на POST | В prod не задан `DJANGO_CSRF_TRUSTED_ORIGINS` | Прописать `https://<домен>` |
| GitHub Desktop показывает тысячи изменений | В прошлом были закоммичены `venv/`, `node_modules/`, `__pycache__/` — уже почищено, обнови ветку | `git pull` |

---

## Контакт

Владелец репозитория: **larleonx@gmail.com**. За реальными ключами, дампом БД и архивом 3D-моделей — сюда.
