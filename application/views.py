from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.urls import reverse
import requests
from .models import *
from django.views.decorators.http import require_http_methods, require_POST
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q
from django.contrib.auth import logout, login, authenticate
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
import uuid
import json
import os

# Create your views here.
@csrf_exempt
@require_http_methods(["POST"])
def proxy_roboflow_workflow(request):
    import sys, json
    print("=== REAL PROXY CALLED ===", file=sys.stderr, flush=True)
    try:
        data = json.loads(request.body)
        image_base64 = data.get('image_base64')
        if not image_base64:
            return JsonResponse({'error': 'Missing image_base64'}, status=400)

        API_KEY = os.getenv("ROBOFLOW_API_KEY", "QZUFzS50qDDJ48nKrGlS")
        WORKSPACE = os.getenv("ROBOFLOW_WORKSPACE", "leobuild")
        WORKFLOW = data.get("workflow_id") or os.getenv("ROBOFLOW_WORKFLOW_ID", "detect-count-and-visualize-3")
        url = f"https://serverless.roboflow.com/{WORKSPACE}/workflows/{WORKFLOW}"
        print(f"=== USING WORKFLOW: {WORKSPACE}/{WORKFLOW} ===", file=sys.stderr, flush=True)

        payload = {
            "api_key": API_KEY,
            "inputs": {
                "image": {"type": "base64", "value": image_base64}
            }
        }

        resp = requests.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        result = resp.json()

        print("=== FULL RESULT KEYS ===", result.keys(), file=sys.stderr, flush=True)

        predictions = []
        if 'predictions' in result:
            pred_data = result['predictions']
            if isinstance(pred_data, dict) and 'predictions' in pred_data:
                predictions = pred_data['predictions']
            elif isinstance(pred_data, list):
                predictions = pred_data

        elif 'outputs' in result:
            outputs = result['outputs']
            print("=== OUTPUTS TYPE ===", type(outputs), file=sys.stderr, flush=True)
            if isinstance(outputs, list):
                for idx, out in enumerate(outputs):
                    print(f"Output {idx} keys: {out.keys() if isinstance(out, dict) else 'not a dict'}", file=sys.stderr, flush=True)
                    if isinstance(out, dict) and 'predictions' in out:
                        preds = out['predictions']
                        if isinstance(preds, list):
                            predictions.extend(preds)
                        elif isinstance(preds, dict) and 'predictions' in preds:
                            predictions.extend(preds['predictions'])
            elif isinstance(outputs, dict):
                if 'predictions' in outputs:
                    preds = outputs['predictions']
                    if isinstance(preds, list):
                        predictions = preds
                    elif isinstance(preds, dict) and 'predictions' in preds:
                        predictions = preds['predictions']

        print(f"=== FINAL PREDICTIONS COUNT: {len(predictions)} ===", file=sys.stderr, flush=True)
        if predictions:
            print("First prediction sample:", predictions[0], file=sys.stderr, flush=True)
            classes = sorted({str(p.get("class", "")).strip() for p in predictions if isinstance(p, dict)})
            print(f"=== CLASSES: {classes} ===", file=sys.stderr, flush=True)
        return JsonResponse({'predictions': predictions})

    except Exception as e:
        print("ERROR:", str(e), file=sys.stderr, flush=True)
        return JsonResponse({'error': str(e)}, status=500)

cart_total = 0

def index_page(request):
    return render(request, 'index.html')

def builder_page(request):
    # ВАЖНО: ранее тут стояли logout(request) + request.session.flush() при
    # каждом GET'е /builder/. Это кикало пользователя из аккаунта на каждом
    # заходе и делало невозможным любое состояние профиля. Убрано вместе с
    # вводом /accounts/. Если нужно сбросить корзину/сцену между заходами —
    # делай это явно в JS (или флагом ?reset=1), а не уничтожением сессии.

    from django.conf import settings as dj_settings
    static_root = os.path.join(dj_settings.BASE_DIR, 'application', 'static')

    # ------------------------------------------------------------------
    # Обои (стены): application/static/img/wallpapper/<slug>/<image>
    # ------------------------------------------------------------------
    wallpaper_root = os.path.join(static_root, 'img', 'wallpapper')
    wallpapers = []
    if os.path.isdir(wallpaper_root):
        for slug in sorted(os.listdir(wallpaper_root)):
            folder = os.path.join(wallpaper_root, slug)
            if not os.path.isdir(folder):
                continue
            picked = None
            for fname in sorted(os.listdir(folder)):
                low = fname.lower()
                if low.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    picked = fname
                    break
            if picked:
                wallpapers.append({
                    'slug': slug,
                    'url': f'img/wallpapper/{slug}/{picked}',
                    'label': slug.replace('-', ' ').replace('_', ' '),
                })

    # ------------------------------------------------------------------
    # Текстуры пола: application/static/img/floor/<slug>/<image>
    # ------------------------------------------------------------------
    floor_root = os.path.join(static_root, 'img', 'floor')
    floors = []
    if os.path.isdir(floor_root):
        for slug in sorted(os.listdir(floor_root)):
            folder = os.path.join(floor_root, slug)
            if not os.path.isdir(folder):
                continue
            picked = None
            for fname in sorted(os.listdir(folder)):
                low = fname.lower()
                if low.endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    picked = fname
                    break
            if picked:
                floors.append({
                    'slug': slug,
                    'url': f'img/floor/{slug}/{picked}',
                    'label': slug.replace('-', ' ').replace('_', ' '),
                })

    # ------------------------------------------------------------------
    # Каталог мебели: application/static/models/glb/<Category>/.../<Item>/*.glb
    # Lighting пока пропускаем (отдельная задача).
    # Полки (Shelves) монтируются на стену, всё остальное — на пол.
    # ------------------------------------------------------------------
    catalog_root = os.path.join(static_root, 'models', 'glb')
    # Scenes — служебные сборки сцен для отладки, не товары.
    # ВНИМАНИЕ: Windows СЮДА КЛАСТЬ НЕЛЬЗЯ. Окна — это специальные GLB-панели,
    # которые вставляются ТОЛЬКО через мини-меню на пустом проёме (см.
    # getWindowCatalogItems в builder.js). Это меню сканирует DOM на
    # .add-catalog-item[data-slug^="windows-"], поэтому категорию надо
    # ОТРЕНДЕРИТЬ в каталоге (чтобы slug'и существовали), а потом
    # СПРЯТАТЬ из глаз пользователя через CSS в builder.html.
    SKIP_TOP_CATEGORIES = {'Scenes'}
    CATEGORY_RU = {
        'Bath':       'Ванна',
        'Beds':       'Кровати',
        'Curbstones': 'Тумбочки',
        'Heating':    'Отопление',
        'Kitchen':    'Кухня',
        'Lighting':   'Освещение',
        'Shelves':    'Полки',
        'Sofas':      'Диваны',
        'Tables':     'Столы',
        'Wardrobe':   'Гардероб',
        'Windows':    'Окна',
    }
    # Heating — настенные панельные радиаторы; Windows — декоративные оконные
    # GLB-панели (НЕ путать с детекцией окон по чертежу: та режет CSG-отверстия
    # в стене, а эти просто навешиваются как полки/радиаторы).
    WALL_MOUNT_CATEGORIES = {'Shelves', 'Heating', 'Windows'}
    # Приоритет: сжатые .opt.glb (draco + webp, ~10x меньше) -> исходники.
    # .opt.glb генерируется скриптом optimize_models.ps1 рядом с base_basic_pbr.glb.
    # Старые base_basic_pbr.glb остаются как страховка/исходник для пересжатия.
    GLB_PRIORITY = ('base_basic_pbr.opt.glb', 'base_basic_pbr.glb', 'base_basic_shaded.glb')
    IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp')

    # ------------------------------------------------------------------
    # Прайс-лист (₽). Ключ — имя папки товара в каталоге GLB.
    # Если для предмета нет записи, цена не отображается (товар «по запросу»),
    # — пока не появятся реальные ссылки на покупку.
    # ВАЖНО для окон: первая буква "Р" — кириллическая, как у имени папки
    # на диске. Не заменять на латинскую "P".
    # ------------------------------------------------------------------
    PRICES_RUB = {
        # Beds
        'Kapri':            6999,
        'Khelen':           10999,
        'Harmony':          10999,
        # Wardrobe
        'Khilton':          26599,
        'Evans':            28999,
        'Shk':              15999,
        # Curbstones
        'Barselona':        4999,
        'Kvadro':           13999,
        'Astoria':          6999,
        # Sofas
        'Slim':             29999,
        'Uno':              21999,
        'Ishim':            32999,
        'Parma':            12999,
        # Tables
        'Slide':            11999,
        # Shelves
        'Hilton':           2999,
        # Kitchen
        'Azaliya':          19999,
        # Bath
        'Relisan Xenia':    74173,
        # Windows (Р — кириллица!)
        'Рexay Experience Constanta x3': 25862,
        'Рexay Experience Constanta x2': 18036,
        # Heating
        'Primoclima Premium': 6701,
        'Royal Thermo VC22':  6893,
        # Lighting
        'Moderli Scandi':   5399,   # потолочная люстра
        'Hygge':            8098,   # уличный торшер
        'FREYA':            1898,   # настенное бра
    }

    def _format_price_rub(value):
        # «29 999 ₽» — узкий неразрывный пробел между разрядами.
        return f"{value:,}".replace(",", " ") + " ₽"

    # ------------------------------------------------------------------
    # Полная карточка товара. Ключ — имя папки на диске (как у PRICES_RUB).
    # Поля:
    #   short    — 1-2 предложения для UI (тултип, превью карточки)
    #   full     — полное описание с переносами строк
    #   material — строка с материалами (новое поле)
    #   dim      — размер в человеческом виде ("193,5 × 83 × 75 см")
    #   url      — ссылка на покупку (партнёрская в будущем)
    # Если позиции нет в словаре — карточка живёт без меты (заглушка «—»).
    # ------------------------------------------------------------------
    ITEM_META = {
        # ============ SOFAS ============
        'Parma': {
            'short': 'Прямой диван-кровать с механизмом «еврокнижка» и вместительным ящиком для белья. Обивка — рогожка.',
            'full':  'Диван-кровать «Парма» выполнен в строгом минималистичном стиле. Все его поверхности имеют правильную геометрическую форму. Практичная обивка из рогожки позволяет легко и быстро удалить загрязнения. Универсальный механизм трансформации «еврокнижка» позволяет разложить диван в удобное спальное место, подходит для ежедневного использования. Под сиденьем расположен вместительный ящик для хранения.',
            'material': 'Обивка — рогожка; каркас — ЛДСП',
            'dim':   '193,5 × 83 × 75 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/divany/pryamye/divan_krovat_parma_id10925918/?articul=80778114',
        },
        'Slim': {
            'short': 'Угловой диван-кровать с механизмом «дельфин» и ящиком для белья. Обивка — серый велюр.',
            'full':  'Диван-кровать «Слим» благодаря универсальному углу можно легко адаптировать под любые планировки, а механизм трансформации «дельфин» обеспечивает простоту в использовании, превращая диван в комфортное спальное место. Обивка из серого велюра не только приятна на ощупь, но и обладает высокой стойкостью к истиранию, что гарантирует долговечность. Диван комплектуется декоративными подушками, которые добавляют уют и стиль пространству. Сиденья средней жесткости обеспечивают комфорт во время отдыха, а наличие ящика для белья позволяет удобно хранить постельные принадлежности. Диван также оснащён двумя подлокотниками, которые добавляют дополнительный комфорт.',
            'material': 'Обивка — велюр; наполнитель — ППУ',
            'dim':   '206 × 91 × 153 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/divany/uglovye/uglovoy_divan_krovat_slim_id9558157/?articul=80593873',
        },
        'Uno': {
            'short': 'Компактный прямой диван-кровать без подлокотников, с контрастным кантом.',
            'full':  'Диван-кровать Уно — модель с оригинальным дизайном и отличным качеством исполнения. Он подойдёт для установки даже в ограниченном пространстве: отсутствие подлокотников не ограничивает свободу передвижения даже в узком проходе. Контрастный кант подчеркивает красоту обивки и необычную форму сиденья. Эта модель доступна только в тех вариантах обивки, которые представлены в нашем ассортименте.',
            'material': 'Обивка — текстиль (на выбор)',
            'dim':   '204 × 89 × 87 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/divany/pryamye/divan_krovat_uno_id8924499/?articul=80546255',
        },
        'Ishim': {
            'short': 'Прямой диван-кровать с пружинами-«змейками», ППУ 35 кг/м³, ножки из массива. Обивка — велюр.',
            'full':  'Диван «Ишим» создан для максимального комфорта и расслабления. Пружины-«змейки» и пенополиуретан высокой плотности (35 кг/м³) обеспечивают упругую поддержку спины, сохраняя свои свойства на долгие годы. Мягкие подлокотники, удобная спинка и декоративные подушки обеспечивают комфортную посадку. Глубина сиденья 90 см делает диван удобным для сидения и сна. Мягкие, но упругие подушки создают равномерную поверхность без ощущения стыков. Обивка из велюра приятна на ощупь и устойчива к износу. Задняя спинка обита той же тканью, что и сам диван, что позволяет разместить диван в центре комнаты. Ножки из натурального дерева высотой 15 см добавляют эстетики и облегчают уборку.\n\nСтильный и функциональный диван «Ишим» идеально впишется в гостиную или зону отдыха на кухне-гостиной. Диван можно дополнить пуфом, креслом или кушеткой той же серии для создания гармоничной зоны отдыха.',
            'material': 'Обивка — велюр; ножки — массив дерева; ППУ 35 кг/м³ + пружина «змейка»',
            'dim':   '183 × 88 × 98 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/divany/pryamye/divan_krovat_ishim_id10745808/?articul=80709579',
        },

        # ============ BEDS ============
        'Harmony': {
            'short': 'Двуспальная кровать из ЛДСП с двумя выдвижными ящиками для постельных принадлежностей.',
            'full':  'Кровать «Гармония» — и удобное спальное место, и вместительная система хранения. Модель выполнена из прочной ЛДСП с эффектным покрытием, устойчива, рассчитана на значительные нагрузки. Спинка в изголовье позволяет удобно устроиться с книгой или планшетом, а отсутствие спинки в изножье даёт большую свободу движений во время сна. В нижней части корпуса расположены два ящика для постельных принадлежностей, сменной или сезонной одежды. Для выдвижения ящиков предназначены фигурные выемки, которые служат и декоративными элементами дизайна.',
            'material': 'ЛДСП',
            'dim':   '145 × 203 × 78 см (Ш × Д × В)',
            'url':   'https://hoff.ru/catalog/spalnya/krovati/krovati_bez_podemnogo_mehanizma/krovat_garmoniya_id10392991/?articul=80643288',
        },
        'Kapri': {
            'short': 'Двуспальная кровать в белом текстурном цвете, основание в комплекте.',
            'full':  'Кровать из коллекции «Капри» выполнена в белом текстурном цвете, который создаёт ощущение лёгкости и свежести в спальне. Аккуратный внешний вид каркаса сочетается с современными элементами интерьера. Основание входит в комплект, модель готова к использованию сразу после сборки.\n\nДетали конструкции продуманы для удобства размещения матраса и поддержания порядка в комнате. Белый текстурный оттенок подчёркивает лаконичность линий и визуально расширяет пространство, придавая помещению светлый и спокойный характер.\n\nКоллекция «Капри» отличается универсальным стилем, который легко вписывается в разные интерьерные решения.',
            'material': 'ЛДСП, основание входит в комплект',
            'dim':   '145 × 203 × 70 см (Ш × Д × В)',
            'url':   'https://hoff.ru/catalog/spalnya/krovati/krovati_bez_podemnogo_mehanizma/krovat_kapri_id10087631/?articul=80622507',
        },
        'Khelen': {
            'short': 'Двуспальная кровать с основанием на ламелях, цвет «дуб крафт золотой», текстура шагрень.',
            'full':  'Кровать «Хелен» представлена в элегантном цвете «дуб крафт золотой» с текстурой шагрень, что придаёт ей современный вид и позволяет легко вписаться в любой интерьер. Основание на ламелях обеспечивает хорошую вентиляцию, отличную поддержку и способствует правильному распределению нагрузки, что положительно сказывается на качестве сна. Кровать оснащена прочными ножками, которые придают ей устойчивость и упрощают процесс уборки под ней.',
            'material': 'ЛДСП «дуб крафт золотой»; ламели в основании',
            'dim':   '97 × 211 × 93 см (Ш × Д × В)',
            'url':   'https://hoff.ru/catalog/spalnya/krovati/krovati_bez_podemnogo_mehanizma/krovat_khelen_id9725899/?articul=80597607',
        },

        # ============ WARDROBE ============
        'Khilton': {
            'short': 'Трёхдверный шкаф с зеркальной вставкой. Фасад — «графит матовый», корпус — «дуб крафт золотой».',
            'full':  'Комбинированный шкаф из коллекции «Хилтон» сочетает выразительный фасад в цвете «графит матовый» и каркас в оттенке «дуб крафт золотой». Три двери, одна из которых оснащена зеркальной вставкой, делают хранение одежды и аксессуаров удобным и визуально расширяют пространство. Внутри предусмотрена стандартная штанга для размещения одежды на вешалках, что помогает поддерживать порядок и экономить время при выборе наряда.\n\nМатовая поверхность фасада подчёркивает современный стиль шкафа и гармонирует с теплотой древесного оттенка корпуса.',
            'material': 'ЛДСП, матовый фасад, зеркальная вставка',
            'dim':   '135 × 53 × 226 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/spalnya/shkafy_dlya_spalni/shkafy_raspashnye/shkaf_3_dvernyy_khilton_id8615717/?articul=80527841',
        },
        'Evans': {
            'short': 'Шкаф-витрина с тремя ящиками. Массив сосны, белый цвет, стеклянные дверцы витрины.',
            'full':  'Шкаф-витрина Эванс изготовлен из массива сосны, окрашен в белый цвет, сохраняя при этом видимую структуру дерева. Имеет высоту ножек 11 см, что облегчает уборку под ним.\n\nВ шкафу предусмотрено три ящика на роликовых направляющих, которые изнутри не покрашены в белый цвет, как основная часть шкафа, что придает им естественный вид. Витринная часть шкафа представляет собой стеклянные дверцы, за которыми можно разместить книги, декоративные элементы, такие как вазы, фигурки или свечи.',
            'material': 'Массив сосны; стекло (витринные дверцы)',
            'dim':   '90 × 37 × 198 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/mebel_dlya_gostinykh/vitriny_i_bufety/shkaf_vitrina_s_3_yashchikami_evans_id9538765/?articul=80593459',
        },
        'Shk': {
            'short': 'Четырёхстворчатый шкаф ШК-1 с двумя выдвижными ящиками и отделением со штангой.',
            'full':  'Четырёхстворчатый шкаф ШК-1 представляет собой вместительную комбинированную систему хранения, которая в малогабаритной квартире способна заменить полноценный гардероб. В наполнении шкафа предусмотрено и отделение со штангой для вешалок-плечиков, и два стеллажных отсека с полками — каждый за отдельной дверцей, что очень удобно. Удачное функциональное дополнение модели — два больших выдвижных ящика, в которых удобно хранить нижнее бельё, аксессуары, полезные мелочи. Шкаф выполнен из ЛДСП с покрытием под дерево приятного светлого оттенка.',
            'material': 'ЛДСП',
            'dim':   '60 × 52 × 205 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/spalnya/shkafy_dlya_spalni/shkafy_raspashnye/shkaf_shk_1_id10253439/?articul=80634097',
        },

        # ============ CURBSTONES ============
        'Astoria': {
            'short': 'Прикроватная тумба с двумя ящиками. Матовый фасад МДФ, корпус «дуб кастелло медовый».',
            'full':  'Тумба прикроватная из коллекции «Астория» сочетает выразительный дизайн и продуманную функциональность. Фасад выполнен из МДФ с матовым покрытием в оттенке «графит софт тач». Каркас изготовлен в цвете «дуб кастелло медовый», благодаря чему мебель выглядит тепло и уютно.\n\nДва выдвижных ящика обеспечивают удобное хранение необходимых мелочей рядом с кроватью, помогая поддерживать порядок в спальне. Серый фасад гармонирует с древесной текстурой корпуса, подчёркивая стиль интерьера.\n\nТумба подходит для размещения светильника, книг или аксессуаров, делая зону отдыха более организованной.',
            'material': 'Фасад — МДФ матовый «графит софт тач»; корпус — ЛДСП',
            'dim':   '46,4 × 44,8 × 40 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/spalnya/tumby_i_komody/tumby/tumba_prikrovatnaya_astoriya_id10890032/?articul=80771145',
        },
        'Barselona': {
            'short': 'Тумба для ТВ с открытой нишей и боковыми секциями. Матовые фрезерованные фасады.',
            'full':  'Тумба Барселона позволит обустроить стильную ТВ-зону и найти место для хранения устройств, необходимых для функционирования домашнего кинотеатра. В центре расположена открытая ниша с одной полкой — здесь удобно расположить DVD-плеер, игровую консоль, элементы звуковой системы. В боковые секции с откидными дверцами можно сложить коллекцию винтажных виниловых дисков, наушники, пульты управления. На матовом покрытии фрезерованных фасадов не остается следов от пальцев. Модель предполагает два варианта установки: на опоры либо монтаж на стену. Максимальная допустимая нагрузка на крышку тумбы — 30 кг.',
            'material': 'ЛДСП; матовые фрезерованные фасады',
            'dim':   '160 × 37 × 42 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/mebel_dlya_gostinykh/mebel_dlya_tv/tumba_dlya_tv_barselona_id9223243/?articul=80560829',
        },
        'Kvadro': {
            'short': 'Тумба для ТВ в декоре «золотистая древесина» с чёрными элементами и металлическими ножками.',
            'full':  'Тумба для ТВ Квадро станет ярким элементом интерьера, а в комплекте с другой мебелью коллекции поможет оформить стильную гостиную. В отделке изделия использовано покрытие под золотистую древесину, нежный оттенок которой подчёркивают чёрные элементы каркаса и ручки. Изящные металлические ножки приподнимают тумбу над полом, придавая ей визуальную лёгкость и облегчая уборку. Тумба устойчива, выдерживает значительные нагрузки. В выдвижных ящиках и на закрытых полках можно расположить всё, что пригодится в досуговой зоне или любые домашние вещи.',
            'material': 'ЛДСП «золотистая древесина»; металл (каркас, ножки, ручки)',
            'dim':   '204 × 54 × 43 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/mebel_dlya_gostinykh/mebel_dlya_tv/tumba_tv_kvadro_id10389375/?articul=80641204',
        },

        # ============ TABLES ============
        'Slide': {
            'short': 'Стол «Слайд». Описание уточняется.',
            'full':  'Описание товара уточняется.',
            'material': '—',
            'dim':   '110 × 75 × 68 см (Ш × Г × В)',
            'url':   '',
        },

        # ============ SHELVES ============
        'Hilton': {
            'short': 'Настенная полка в оттенке «дуб крафт золотой», ЛДСП.',
            'full':  'Полка настенная из коллекции «Хилтон» выполнена в цвете «дуб крафт золотой». Каркас изготовлен из ЛДСП с естественной текстурой древесины. Дизайн изделия хорошо сочетается с мебелью в тёплых тонах и помогает организовать пространство для хранения книг, декоративных элементов или аксессуаров. Открытая конструкция обеспечивает быстрый доступ к предметам, а также визуально облегчает обстановку.\n\nПолка из коллекции «Хилтон» поможет поддерживать порядок, предоставив дополнительное пространство для любимых вещей.',
            'material': 'ЛДСП «дуб крафт золотой»',
            'dim':   '133,5 × 19,2 × 24 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/gostinaya/mebel_dlya_gostinykh/polki/polka_nastennaya_khilton_id9632131/?articul=80599008',
        },

        # ============ LIGHTING ============
        'Moderli Scandi': {
            'short': 'Потолочный LED-светильник с пультом. Металлический каркас, плафоны из ПВХ.',
            'full':  'Потолочный светильник MODERLI SCANDI станет ярким акцентом в интерьере. Его стильный и современный дизайн прекрасно впишется в любое пространство, будь то спальня, кухня или гостиная. Металлический каркас выполнен в элегантном сером цвете с хромированными акцентами, что придаёт ему элегантный вид. Плафоны из ПВХ обладают прочностью и долговечностью, а их круглая форма создаёт мягкое и равномерное освещение, создавая уютную атмосферу.\n\nСветильник оснащён LED-лампами, которые обеспечивают мощное освещение, идеально подходя для комнат средней площади. Удобный пульт дистанционного управления позволяет легко регулировать уровень света в зависимости от потребностей пользователя. Светильник подходит для натяжных потолков, что расширяет его область применения.',
            'material': 'Металл (серый с хромом); плафоны — ПВХ; LED',
            'dim':   'Ø 74 × 16 см',
            'url':   'https://hoff.ru/catalog/tovary_dlya_doma/osveschenie/svetodiodnye_svetilniki/potolochnye_svetodiodnye_svetilniki/svetilnik_potolochnyy_scandi_id10591979/?articul=80648010',
        },
        'Hygge': {
            'short': 'Напольный торшер в скандинавском стиле. Деревянное основание, тканевый абажур, цоколь E27.',
            'full':  'Торшер Wood из коллекции Hygge от Hoff подходит для создания мягкого освещения в гостиной или спальне. Белый тканевый абажур на основе ПВХ обеспечивает рассеянный свет и формирует атмосферу уюта в помещении. Деревянное основание придаёт светильнику современный внешний вид.\n\nМодель оснащена одним патроном для лампы с цоколем E27, что упрощает выбор источника света. Встроенный выключатель делает использование торшера удобным.\n\nСкандинавский стиль исполнения подчёркивает простоту и функциональность, а нейтральная цветовая гамма позволяет использовать светильник в различных интерьерах.',
            'material': 'Дерево (основание); ткань на ПВХ (абажур)',
            'dim':   '—',
            'url':   'https://hoff.ru/catalog/tovary_dlya_doma/osveschenie/torshery/torsher_hygge_id9550347/?articul=80593891',
        },
        'FREYA': {
            'short': 'Современное бра. Хромированное основание, серый текстильный абажур, цоколь E14.',
            'full':  'Бра из коллекции FR5019 от бренда FREYA — современное решение для создания уютной атмосферы дома. Лаконичный дизайн с хромированным основанием и серым текстильным абажуром гармонирует с различными стилями оформления комнаты. Металлические элементы придают светильнику выразительность, а тканевый плафон обеспечивает мягкое рассеивание света, что особенно приятно для отдыха вечером.\n\nЦоколь E14 подходит для стандартной лампы, облегчая замену источника света и позволяя выбрать нужную яркость. Бра удобно разместить у кровати, в зоне отдыха или у зеркала, чтобы подчеркнуть детали интерьера и добавить дополнительное освещение.',
            'material': 'Металл (хром); текстиль (абажур)',
            'dim':   '—',
            'url':   'https://hoff.ru/catalog/tovary_dlya_doma/osveschenie/bra/bra_fr5019_id6729853/?articul=80361494',
        },

        # ============ KITCHEN ============
        'Azaliya': {
            'short': 'Модульный кухонный гарнитур со столешницей. Графит матовый + декор под золотистое дерево.',
            'full':  'Модульный гарнитур «Азалия» поможет оформить элегантную и удобную кухню в современном стиле. В комплект входят навесные шкафы с полками за распашными дверцами, два напольных шкафа: с закрытым отделением и выдвижными ящиками, а также шкаф под накладную мойку шириной 80 см. В составе гарнитура есть и столешница с декором под золотистую древесину — общая на два нижних шкафа.\n\nВ комплектацию входит:\n• шкаф навесной 40 см\n• шкаф навесной 80 см — 2 шт.\n• шкаф нижний 40 см\n• шкаф нижний 80 см\n• шкаф нижний под мойку 80 см\n• столешница 120 × 60 см\n• цоколь\n\nВысота верхних шкафов — 69,2 см. Глубина верхних шкафов — 29,8 см. Высота нижних шкафов — 82 см (с учётом цоколя). Глубина нижних шкафов — 44,6 см.\n\nДверцы могут открываться в разные стороны: фасады перенавешиваются. Цена указана за кухню на фото. В стоимость не включено: стеновая панель, бытовая техника, мойка, смеситель, аксессуары.',
            'material': 'ЛДСП «графит матовый» + декор под золотистую древесину',
            'dim':   '200 × 60 × 216 см (Ш × Г × В)',
            'url':   'https://hoff.ru/catalog/kuhnya/kuhonnye_garnitury/gotovie_reshenia/komplekti/kukhonnyy_garnitur_azaliya_id10241853/?articul=80633796',
        },

        # ============ BATH ============
        'Relisan Xenia': {
            'short': 'Акриловая прямоугольная ванна 150×75 см, белый цвет.',
            'full':  'Акриловая ванна Relisan Xenia 150×75. Стильное и функциональное решение для вашей ванной комнаты. Ванна выполнена в современном дизайне и сочетает в себе практичность, прочность и надёжность. Отличное решение для любой ванной комнаты.',
            'material': 'Акрил',
            'dim':   '150 × 75 × 42 см (Д × Ш × В)',
            'url':   'https://lemanapro.ru/product/vanna-relisan-xenia-150x75-akrilovaya-pryamougolnaya-cvet-belyy-92608979',
        },

        # ============ WINDOWS (Р — кириллица в ключе!) ============
        'Рexay Experience Constanta x3': {
            'short': 'Трёхстворчатое окно РЕХАУ EXPERIENCE CONSTANTA, двухкамерный стеклопакет, 1200×1800 мм.',
            'full':  'Пластиковое окно РЕХАУ EXPERIENCE CONSTANTA 1200×1800 мм (В×Ш), трёхстворчатое: глухое / поворотно-откидное левое / глухое. Двухкамерный стеклопакет, белое: надёжность, тепло и комфорт в каждом окне.',
            'material': 'Профиль ПВХ РЕХАУ; двухкамерный стеклопакет',
            'dim':   '180 × 10 × 120 см (Ш × Г × В)',
            'url':   'https://rhsolutions.ru/store/product/okno-pvkh-constanta-1200kh1800-mm-vkhsh-trekhstvorchatoe-glukhoe--povorotno-otkidnoe-levoe--glukhoe-dvukhkamernii-steklopaket-beloe-articul-13942271001/',
        },
        'Рexay Experience Constanta x2': {
            'short': 'Двухстворчатое окно РЕХАУ EXPERIENCE CONSTANTA, 1100×1000 мм.',
            'full':  'Пластиковое окно РЕХАУ EXPERIENCE CONSTANTA 1100×1000 мм (В×Ш), двухстворчатое: глухое левое / поворотно-откидное правое. Надёжность, тепло и комфорт в каждом окне.',
            'material': 'Профиль ПВХ РЕХАУ; стеклопакет',
            'dim':   '100 × 10 × 110 см (Ш × Г × В)',
            'url':   'https://rhsolutions.ru/store/product/okno-pvkh-constanta-1100kh1000-mm-vkhsh-dvukhstvorchatoe-glukhoe-levoe--povorotno-otkidnoe-pravoe-articul-13941021001/',
        },

        # ============ HEATING ============
        'Primoclima Premium': {
            'short': 'Стальной панельный радиатор типа C 11, боковое подключение, крепления Hook/Standart.',
            'full':  'Стальные панельные радиаторы типа C 11 — это отопительные приборы с боковым подключением. Выпускаются с приваренными элементами крепления Hook/Standart. Конструкция предполагает одну панель с теплоносителем, один конвектор — дополнительную рифлёную поверхность, отдающую тепло, верхнюю решётку для выпуска воздуха, четыре отверстия для бокового подключения к теплосетям.\n\nТеплоноситель поступает через верхнее отверстие радиатора, а через нижнее осуществляется его выход. Отверстия с другой стороны радиатора закрываются воздуховыпускным краном Маевского и заглушкой. Возможен также диагональный вариант подключения.',
            'material': 'Сталь',
            'dim':   '110 × 7 × 50 см (Д × Г × В)',
            'url':   'https://dom-termo.ru/stalnoy-panelnyy-radiator-primoclima-c-11-500-mm-bokovoe/?sku=1737048',
        },
        'Royal Thermo VC22': {
            'short': 'Стальной панельный радиатор Ventil Compact VC22, нижнее подключение, термоклапан M30×1.5.',
            'full':  'Стальные панельные радиаторы типа Ventil Compact VC22 — это отопительные приборы с нижним подключением. Конструкция предполагает две панели с теплоносителем, два конвектора (дополнительные рифлёные поверхности), отдающие тепло, верхнюю решётку для выпуска воздуха, четыре отверстия для бокового подключения к теплосетям.\n\nТеплоноситель поступает и выходит через нижние отверстия радиатора, отверстия с других сторон радиатора закрываются воздуховыпускным краном Маевского и заглушкой.\n\nВ радиаторах серии Ventil Compact VC с нижним подключением в базовой комплектации установлен термостатический клапан с резьбой M30×1.5 для использования термостатических головок, при этом регулировка подачи количества теплоносителя в радиатор происходит автоматически.',
            'material': 'Сталь',
            'dim':   '60 × 10 × 20 см (Д × Г × В)',
            'url':   'https://dom-termo.ru/radiator-stalnoy-panelnyy-royal-thermo-ventil-compact-vc22-black-noir-sable-200-mm-nizhnee-podklyuchenie/?sku=1735327',
        },
    }

    def _mount_for(top_category, rel_subpath):
        """
        Возвращает 'wall' | 'ceiling' | 'floor' по верхней категории и
        пути внутри неё. Lighting делится на /Wall, /Overhead, /Outdoor.
        """
        if top_category in WALL_MOUNT_CATEGORIES:
            return 'wall'
        if top_category == 'Lighting':
            parts = [p for p in rel_subpath.replace('\\', '/').split('/') if p]
            if 'Wall' in parts:
                return 'wall'      # бра
            if 'Overhead' in parts:
                return 'ceiling'   # люстры/подвесы
            return 'floor'         # outdoor / прочее
        return 'floor'

    def _pick_glb(files):
        lows = [f for f in files if f.lower().endswith('.glb')]
        if not lows:
            return None
        # Кастомные GLB (всё, что не base_basic_*) перевешивают базовые
        # варианты. Это позволяет дропнуть рядом test.glb / final.glb
        # и не переименовывать — наш каталог сразу подхватит свежий файл.
        custom = [f for f in lows if not f.lower().startswith('base_basic_')]
        if custom:
            return sorted(custom)[0]
        for name in GLB_PRIORITY:
            if name in lows:
                return name
        return sorted(lows)[0]

    def _pick_thumb(files):
        for f in files:
            if f.lower().endswith(IMG_EXT):
                return f
        return None

    def _rel_static(abs_path):
        return os.path.relpath(abs_path, static_root).replace(os.sep, '/')

    catalog = []
    if os.path.isdir(catalog_root):
        for top in sorted(os.listdir(catalog_root)):
            if top in SKIP_TOP_CATEGORIES:
                continue
            top_path = os.path.join(catalog_root, top)
            if not os.path.isdir(top_path):
                continue

            items = []
            # Любая папка глубже верхней категории, содержащая .glb, — это
            # отдельный товар. Wardrobe держит glb прямо в корне категории —
            # тоже подхватываем (имя предмета = имя категории в этом случае).
            for root_dir, dirs, files in os.walk(top_path):
                glb = _pick_glb(files)
                if not glb:
                    continue
                thumb = _pick_thumb(files)
                item_name = os.path.basename(root_dir) or top
                rel_subpath = os.path.relpath(root_dir, top_path)
                mount = _mount_for(top, rel_subpath)
                price_rub = PRICES_RUB.get(item_name)
                meta = ITEM_META.get(item_name, {})
                slug = f"{top}-{item_name}".lower().replace(' ', '-')
                items.append({
                    'slug': slug,
                    'label': item_name,
                    'glb_url': _rel_static(os.path.join(root_dir, glb)),
                    'thumb_url': _rel_static(os.path.join(root_dir, thumb)) if thumb else None,
                    'mount': mount,
                    'price_rub': price_rub,
                    'price_label': _format_price_rub(price_rub) if price_rub else None,
                    'short_desc': meta.get('short', ''),
                    'full_desc':  meta.get('full', ''),
                    'material':   meta.get('material', ''),
                    'dim_label':  meta.get('dim', ''),
                    'product_url': meta.get('url', ''),
                })

            if not items:
                continue
            # У категории mount-метка чисто косметическая (для бейджа в UI).
            # Берём режим первого item'а как «представительный» — для Lighting
            # подсказка «на стену» появится только если в категории реально
            # есть бра-предметы.
            cat_mounts = {it['mount'] for it in items}
            cat_label_mount = ('wall' if 'wall' in cat_mounts
                               else 'ceiling' if 'ceiling' in cat_mounts
                               else 'floor')
            catalog.append({
                'slug': top.lower(),
                'label': CATEGORY_RU.get(top, top),
                'mount': cat_label_mount,
                'items': items,
            })

    # JSON-карта slug → полная карточка. Используется JS модалкой
    # «Подробнее» (рендерится через {% json_script %} в шаблоне).
    catalog_meta = {}
    for cat in catalog:
        for it in cat['items']:
            catalog_meta[it['slug']] = {
                'label':       it['label'],
                'category':    cat['label'],
                'thumb_url':   it['thumb_url'],
                'price_rub':   it['price_rub'],
                'price_label': it['price_label'],
                'short_desc':  it['short_desc'],
                'full_desc':   it['full_desc'],
                'material':    it['material'],
                'dim_label':   it['dim_label'],
                'product_url': it['product_url'],
                'mount':       it['mount'],
            }

    return render(request, 'builder.html', {
        'wallpapers': wallpapers,
        'floors': floors,
        'catalog': catalog,
        'catalog_meta': catalog_meta,
    })

def get_companys(request):
    category_name = request.GET.get('category')
    companies_data = []

    if category_name:
        try:
            category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
            companies = category.furniture_companies.all()
            for company in companies:
                related_companies = company.company_companies.all()  # Получаем связанные компании
                related_companies_data = []  # Список для хранения данных связанных компаний

                for related_company in related_companies:
                    related_companies_data.append({
                        'related_company_name': related_company.model_name,
                    })

                companies_data.append({
                    'company_name': company.company_name,
                    'logo_url': company.company_logo.url,
                    'related_companies': related_companies_data,  # Добавляем данные о связанных компаниях
                })
        except Furniture_Categorie.DoesNotExist:
            return JsonResponse({'error': 'Категория не найдена'}, status=404)

    return JsonResponse(companies_data, safe=False)  # Возвращаем данные в формате JSON

def get_classes(request):

    category_name = request.GET.get('category')
    company_name = request.GET.get('company')
    classes_name = request.GET.get('classes')
    #print(category_name)

    ## Parsing the classes_name JSON
    jsonClasses = json.loads(classes_name)

    #AllCompany = Company_Furniture.objects.all()
    #for model_company in AllCompany:
    #    print(model_company.company_companies)

    AllModels = Model_Class.objects.filter(
        class_category__furniture_name=category_name,  # Adjust the field name if needed
    )
    filtered_models = [model for model in AllModels if model.model_name in jsonClasses]

    # Convert the queryset to a list of dictionaries or some other format if needed
    models_data = [{
        'model_name': model.model_name,
        'model_logo': model.model_logo.url if model.model_logo else None,
        'category_name': category_name,
        'company_name': company_name,
    } for model in filtered_models]

    return JsonResponse(models_data, safe=False)  # возвращаем данные в формате JSON

def get_products(request):

    category_name = request.GET.get('category')
    company_name = request.GET.get('company')
    classes_name = request.GET.get('classes')

    print(Model_Class.objects.all())
    print(classes_name)

    category = Furniture_Categorie.objects.get(furniture_name__iexact=category_name)
    company = Company_Furniture.objects.get(company_name__iexact=company_name)
    #classes = Model_Class.objects.get(model_name__iexact=classes_name)
    #print(classes)

    products = Product_Item.objects.filter(
    product_categories=category,
    product_company=company,
    ).values(
        'unique_id', 'product_name', 'product_icon', 'product_url', 
        'product_price', 'product_material', 'product_height', 
        'product_width', 'product_depth', 'product_short_description', 
        'product_description', 'created_date', 'product_type', 'product_subtype', 'product_material_url',
        'product_3Durl', 'product_3Dname',
    )

    post_products = []
    for product in products:
        product_item = Product_Item.objects.get(unique_id=product['unique_id'])
        images = [img.image.url for img in product_item.images.all()]  # Получаем URL изображений
        product['product_images'] = images
        post_products.append(product)

    return JsonResponse(post_products, safe=False)

def add_to_cart(request):
    if request.method == 'POST':
        item_id = request.POST.get('item_id')
        # Здесь вы можете использовать сессию или другую логику для хранения корзины
        cart = request.session.get('cart', {})
        # Увеличиваем количество товара в корзине или добавляем новый
        if item_id in cart:
            cart[item_id]['quantity'] += 1
        else:
            item = Product_Item.objects.get(unique_id=item_id)
            if item.product_type == "material":
                cart[item_id] = {
                    'title': item.product_name,
                    'icon': item.product_icon.url,
                    'price': 0,  # Устанавливаем цену как "-"
                    'quantity': 0,  # Устанавливаем количество как "-"
                    'total': 0  # Общая сумма будет 0
                }
            else:
                cart[item_id] = {
                    'title': item.product_name,
                    'icon': item.product_icon.url,
                    'price': str(item.product_price),
                    'quantity': 1
                }
                
        request.session['cart'] = cart

        total_amount = 0  # Переменная для хранения общей суммы
        # Проходим по каждому элементу в корзине и вычисляем сумму
        for item_id, item_data in cart.items():
            item_price = float(item_data['price'])  # Преобразуем цену в float
            item_quantity = item_data['quantity']
            item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
            item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
            total_amount += item_total  # Добавляем к общей сумме

        product_item = Product_Item.objects.get(unique_id=item_id)

        product_item_data = {
            'item_id': product_item.unique_id,
            'item_type': product_item.product_type,
            'mesh_subtype': product_item.product_subtype,
            'model_url': str(product_item.product_3Durl),
            'model_name': str(product_item.product_3Dname),
            'width': product_item.product_width,
            'height': product_item.product_height,
            'depth': product_item.product_depth,
            'material_url': product_item.product_material_url.url if product_item.product_material_url else None,
        }

        context = {
            'cart': cart,
            'product': product_item_data,  # Добавляем общую сумму в контекст
        }

        return JsonResponse(context)

def remove_from_cart(request):
    if request.method == 'POST':
        item_id = request.POST.get('item_id')
        cart = request.session.get('cart', {})

        if item_id in cart:
            # Уменьшаем количество товара на 1
            cart[item_id]['quantity'] -= 1

            # Если quantity достиг 0, удаляем товар из корзины
            if cart[item_id]['quantity'] == 0:
                del cart[item_id]

            # Обновляем сессию
            request.session['cart'] = cart

        # Возвращаем актуализированное состояние корзины
        total_amount = 0
        for item_data in cart.values():
            item_price = float(item_data['price'])
            item_quantity = item_data['quantity']
            item_total = item_price * item_quantity
            item_data['total'] = item_total
            total_amount += item_total

        return JsonResponse({'cart': cart, 'total_amount': total_amount})

    return JsonResponse({'error': 'Invalid request'}, status=400)
    
def cart_view(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме

    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return render(request, 'cart.html', context)

def get_item_info(request):
    item_id = request.GET.get('item_id')
    item = Product_Item.objects.get(unique_id=item_id)
    product_images = [img.image.url for img in item.images.all()]  # Получаем URL изображений

    context = {
        'title': item.product_name,
        'images': product_images,
        'info': item.product_description,
        'price': str(item.product_price),
        'material': str(item.product_material),
        'height': str(item.product_height),
        'width': str(item.product_width),
        'depth': str(item.product_depth),
        'url': str(item.product_url),
        'company': str(item.product_company),
    }
    return JsonResponse(context)  # или любой другой атрибут

def get_cart_info(request):
    cart = request.session.get('cart', {})
    total_amount = 0  # Переменная для хранения общей суммы

    # Проходим по каждому элементу в корзине и вычисляем сумму
    for item_id, item_data in cart.items():
        item_price = float(item_data['price'])  # Преобразуем цену в float
        item_quantity = item_data['quantity']
        item_total = item_price * item_quantity  # Считаем итоговую сумму для данного товара
        item_data['total'] = item_total  # Добавляем итоговую сумму в данные элемента
        total_amount += item_total  # Добавляем к общей сумме


    context = {
        'cart': cart,
        'total_amount': total_amount,  # Добавляем общую сумму в контекст
    }
    return JsonResponse(context)  # или любой другой атрибут

def search_product(request):
    if 'term' in request.GET:
        query = request.GET.get('term')
        products = Product_Item.objects.filter(Q(product_searchTag__icontains=query))
        results = []
        for product in products:
            results.append({
                'id': product.unique_id,
                'name': product.product_name,
                'description': product.product_short_description,
                'price': product.product_price,
                'icon_url': product.product_icon.url if product.product_icon else None,
            })
        return JsonResponse(results, safe=False)
    return JsonResponse([], safe=False)

@csrf_exempt
def save_scene(request):
    if request.method == 'POST':
        # Получаем данные сцены в формате JSON из запроса
        scene_data = json.loads(request.body)
        
        if scene_data:
            # Сохраняем сериализованную сцену в сессию
            request.session['scene_data'] = scene_data
            return JsonResponse({'status': 'success'})
        
        return JsonResponse({'status': 'error', 'message': 'No scene data provided.'})

def my_json_view(request):
    return JsonResponse(request.session['scene_data'], safe=False)


# ============================================================================
# AUTH: login / register / logout / profile
# ============================================================================
# Свои view'ы вместо django.contrib.auth.views, чтобы:
#   - отдавать наши шаблоны с тем же дизайн-кодом, что у билдера;
#   - не подключать django.contrib.auth.urls и не таскать стандартные формы
#     password-reset/change, пока они не нужны;
#   - на регистрации сразу логинить нового юзера и редиректить в профиль.

# Безопасный редирект после login/register. Если next-параметр пуст или
# указывает на внешний домен — отправляем в /builder/.
def _safe_next(request, default='/builder/'):
    nxt = request.GET.get('next') or request.POST.get('next') or ''
    if nxt.startswith('/') and not nxt.startswith('//'):
        return nxt
    return default


def login_view(request):
    if request.user.is_authenticated:
        return redirect(_safe_next(request, '/accounts/profile/'))

    error = None
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        password = request.POST.get('password') or ''
        if not username or not password:
            error = 'Введите логин и пароль.'
        else:
            user = authenticate(request, username=username, password=password)
            if user is None:
                error = 'Неверный логин или пароль.'
            else:
                login(request, user)
                return redirect(_safe_next(request, '/accounts/profile/'))

    return render(request, 'accounts/login.html', {
        'error': error,
        'next': request.GET.get('next', ''),
    })


def register_view(request):
    if request.user.is_authenticated:
        return redirect('/accounts/profile/')

    error = None
    form_data = {'username': '', 'email': ''}
    if request.method == 'POST':
        username = (request.POST.get('username') or '').strip()
        email    = (request.POST.get('email') or '').strip()
        pwd1     = request.POST.get('password1') or ''
        pwd2     = request.POST.get('password2') or ''
        form_data['username'] = username
        form_data['email']    = email

        if not username:
            error = 'Введите логин.'
        elif len(username) < 3:
            error = 'Логин должен быть не короче 3 символов.'
        elif User.objects.filter(username__iexact=username).exists():
            error = 'Пользователь с таким логином уже существует.'
        elif pwd1 != pwd2:
            error = 'Пароли не совпадают.'
        elif len(pwd1) < 6:
            error = 'Пароль должен быть не короче 6 символов.'
        else:
            user = User.objects.create_user(username=username, email=email, password=pwd1)
            login(request, user)
            return redirect('/accounts/profile/')

    return render(request, 'accounts/register.html', {
        'error': error,
        'form': form_data,
    })


@require_POST
def logout_view(request):
    logout(request)
    # Возвращаем туда, откуда пришли (если это локальный путь), иначе на главную.
    return redirect(_safe_next(request, '/'))


@login_required(login_url='/accounts/login/')
def profile_view(request):
    scenes = list(request.user.saved_scenes.all())
    return render(request, 'accounts/profile.html', {
        'profile_user': request.user,
        'saved_scenes': scenes,
    })


# ============================================================================
# SAVED SCENES API
# ============================================================================
# Все эндпоинты требуют login: если аноним кликнул Save — отвечаем 401
# через JsonResponse, чтобы JS показал inline-предложение зайти в аккаунт.
# Для CSRF полагаемся на стандартный токен в meta-теге страницы билдера.

def _scene_to_dict(scene):
    return {
        'id':         scene.id,
        'name':       scene.name,
        'item_count': scene.item_count,
        'created_at': scene.created_at.isoformat(),
        'updated_at': scene.updated_at.isoformat(),
    }


@require_POST
def scenes_save(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'auth_required'}, status=401)
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        return JsonResponse({'error': 'bad_json'}, status=400)
    name = (payload.get('name') or '').strip() or 'Без названия'
    data = payload.get('data')
    if not isinstance(data, dict):
        return JsonResponse({'error': 'bad_data'}, status=400)
    # Грубый лимит — защита от заливки 50 MB JSON-чудовища через DevTools.
    raw = json.dumps(data)
    if len(raw) > 2 * 1024 * 1024:
        return JsonResponse({'error': 'too_large'}, status=413)

    scene_id = payload.get('id')
    if scene_id:
        # Перезапись существующей сцены текущего юзера.
        try:
            scene = request.user.saved_scenes.get(id=int(scene_id))
        except Exception:
            return JsonResponse({'error': 'not_found'}, status=404)
        scene.name = name[:120]
        scene.data = data
        scene.save()
    else:
        scene = request.user.saved_scenes.create(name=name[:120], data=data)
    return JsonResponse({'status': 'ok', 'scene': _scene_to_dict(scene)})


def scenes_list(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'auth_required'}, status=401)
    return JsonResponse({
        'scenes': [_scene_to_dict(s) for s in request.user.saved_scenes.all()]
    })


def scenes_get(request, scene_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'auth_required'}, status=401)
    try:
        scene = request.user.saved_scenes.get(id=int(scene_id))
    except Exception:
        return JsonResponse({'error': 'not_found'}, status=404)
    return JsonResponse({
        'scene': {
            **_scene_to_dict(scene),
            'data': scene.data,
        }
    })


@require_POST
def scenes_delete(request, scene_id):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'auth_required'}, status=401)
    try:
        scene = request.user.saved_scenes.get(id=int(scene_id))
    except Exception:
        return JsonResponse({'error': 'not_found'}, status=404)
    scene.delete()
    return JsonResponse({'status': 'ok'})


@login_required(login_url='/accounts/login/')
@require_POST
def scenes_delete_form(request, scene_id):
    """
    HTML-form-friendly удаление из профиля (редиректит назад в профиль,
    в отличие от scenes_delete, которая отдаёт JSON и нужна JS-клиенту
    в билдере).
    """
    try:
        scene = request.user.saved_scenes.get(id=int(scene_id))
        scene.delete()
    except SavedScene.DoesNotExist:
        pass
    return redirect('profile')


@require_POST
def scenes_share(request, scene_id):
    """
    Выдаёт публичную ссылку на просмотр сцены. share_token ленивый:
    создаётся при первом вызове, идемпотентно при последующих.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'auth_required'}, status=401)
    try:
        scene = request.user.saved_scenes.get(id=int(scene_id))
    except Exception:
        return JsonResponse({'error': 'not_found'}, status=404)
    if not scene.share_token:
        scene.share_token = uuid.uuid4()
        scene.save(update_fields=['share_token'])
    share_url = request.build_absolute_uri(f'/builder/?shared={scene.share_token}')
    return JsonResponse({
        'token': str(scene.share_token),
        'url':   share_url,
        'name':  scene.name,
    })


def scenes_public(request, token):
    """
    Публичный endpoint: любой с токеном получает JSON-сцену без auth.
    Используется при открытии /builder/?shared=<uuid> в анонимной
    сессии (поделиться с тем, у кого нет аккаунта).
    """
    try:
        scene = SavedScene.objects.get(share_token=token)
    except SavedScene.DoesNotExist:
        return JsonResponse({'error': 'not_found'}, status=404)
    return JsonResponse({
        'scene': {
            'id':         scene.id,
            'name':       scene.name,
            'data':       scene.data,
            'created_at': scene.created_at.isoformat(),
            'updated_at': scene.updated_at.isoformat(),
            'owner':      scene.user.username,
        }
    })

