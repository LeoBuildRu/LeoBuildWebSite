// Детектор мебели, сантехники и проёмов на чертеже планировки.
// Модель — YOLO, обученная на dataset/ (ml/train.py) и выгруженная в ONNX
// скриптом ml/export_web.py в /static/models/plan-detector/. Инференс идёт
// в браузере через onnxruntime-web: сервер модель не трогает, как и с OpenCV.js.
// Рантайм и модель грузятся лениво — при первом вызове detectPlanObjects.

const ORT_VERSION = '1.20.1';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_DIR = '/static/models/plan-detector/';

// Проёмы и инженерка — не мебель: их ищут кнопки «Найти окна/двери».
export const OPENING_CLASSES = new Set(['window', 'window-block', 'door box', 'door arch']);
export const SERVICE_CLASSES = new Set(['shaft']);

export const PLAN_CLASS_RU = {
    'window': 'окно', 'window-block': 'балконный блок', 'door box': 'дверной проём', 'door arch': 'дверь',
    sofa: 'диван', armchair: 'кресло', bed: 'кровать', nightstand: 'тумбочка', chair: 'стул',
    table: 'стол', coffee_table: 'журнальный столик', desk: 'письменный стол', wardrobe: 'гардероб',
    cabinet: 'шкаф', tv_stand: 'ТВ-тумба', tv: 'телевизор', bench: 'банкетка', rug: 'ковёр',
    curtain: 'штора', plant: 'растение', kitchen_unit: 'кухня', stove: 'плита', oven: 'духовка',
    dishwasher: 'посудомойка', kitchen_sink: 'мойка', fridge: 'холодильник', bathtub: 'ванна',
    shower: 'душ', toilet: 'унитаз', sink: 'раковина', washing_machine: 'стиральная машина',
    shaft: 'вентшахта'
};

let sessionPromise = null;
let modelMeta = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
        document.head.appendChild(s);
    });
}

function getSession() {
    if (!sessionPromise) {
        sessionPromise = (async () => {
            if (!window.ort) await loadScript(ORT_BASE + 'ort.webgpu.min.js');
            const ort = window.ort;
            ort.env.wasm.wasmPaths = ORT_BASE;
            const metaResp = await fetch(MODEL_DIR + 'model.json');
            if (!metaResp.ok) throw new Error(`Модель детектора не найдена (${MODEL_DIR}model.json)`);
            modelMeta = await metaResp.json();
            // WebGPU в разы быстрее; без него (или при ошибке инициализации) — WASM.
            if (navigator.gpu) {
                try {
                    return await ort.InferenceSession.create(MODEL_DIR + modelMeta.file, { executionProviders: ['webgpu'] });
                } catch (e) {
                    console.warn('PlanDetector: WebGPU недоступен, переключаюсь на WASM', e);
                }
            }
            return ort.InferenceSession.create(MODEL_DIR + modelMeta.file, { executionProviders: ['wasm'] });
        })().catch(e => { sessionPromise = null; throw e; });
    }
    return sessionPromise;
}

// Letterbox как в Ultralytics: вписываем с сохранением пропорций, поля серые (114).
function letterbox(bitmap, size) {
    const r = Math.min(size / bitmap.width, size / bitmap.height);
    const nw = Math.round(bitmap.width * r), nh = Math.round(bitmap.height * r);
    const padX = Math.floor((size - nw) / 2), padY = Math.floor((size - nh) / 2);
    const cnv = document.createElement('canvas');
    cnv.width = size; cnv.height = size;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'rgb(114,114,114)';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, padX, padY, nw, nh);
    const px = ctx.getImageData(0, 0, size, size).data;
    const area = size * size;
    const chw = new Float32Array(3 * area);
    for (let i = 0; i < area; i++) {
        chw[i]            = px[i * 4]     / 255;
        chw[area + i]     = px[i * 4 + 1] / 255;
        chw[2 * area + i] = px[i * 4 + 2] / 255;
    }
    return { chw, r, padX, padY };
}

function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter || 1);
}

function nmsPerClass(boxes, iouThr) {
    boxes.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const b of boxes) {
        if (kept.every(k => k.cls !== b.cls || iou(k, b) < iouThr)) kept.push(b);
    }
    return kept;
}

// Возвращает [{ cls, x, y, w, h, score }] в пикселях исходной картинки
// (тот же формат рамок, что detectedWindows/detectedDoors в builder.js).
export async function detectPlanObjects(source, opts = {}) {
    const session = await getSession();
    const conf = opts.conf ?? modelMeta.conf ?? 0.35;
    const iouThr = opts.iou ?? 0.5;
    const ort = window.ort;
    const names = modelMeta.names;
    const size = modelMeta.imgsz;

    const bitmap = (source instanceof ImageBitmap) ? source : await createImageBitmap(source);
    const W = bitmap.width, H = bitmap.height;
    const { chw, r, padX, padY } = letterbox(bitmap, size);

    const input = new ort.Tensor('float32', chw, [1, 3, size, size]);
    const out = await session.run({ [session.inputNames[0]]: input });
    const t = out[session.outputNames[0]];
    const data = t.data;

    const toImage = (x1, y1, x2, y2) => {
        const ax = Math.max(0, Math.min(W, (x1 - padX) / r));
        const ay = Math.max(0, Math.min(H, (y1 - padY) / r));
        const bx = Math.max(0, Math.min(W, (x2 - padX) / r));
        const by = Math.max(0, Math.min(H, (y2 - padY) / r));
        return { x: ax, y: ay, w: bx - ax, h: by - ay };
    };

    const boxes = [];
    if (t.dims.length === 3 && t.dims[2] === 6) {
        // End-to-end экспорт (NMS внутри графа): [1, N, x1 y1 x2 y2 score cls].
        const n = t.dims[1];
        for (let i = 0; i < n; i++) {
            const o = i * 6, score = data[o + 4];
            if (score < conf) continue;
            boxes.push({ cls: names[data[o + 5]], score, ...toImage(data[o], data[o + 1], data[o + 2], data[o + 3]) });
        }
    } else {
        // Классический выход YOLOv8/11: [1, 4 + nc, N], без NMS.
        const C = t.dims[1], N = t.dims[2], nc = C - 4;
        for (let j = 0; j < N; j++) {
            let best = -1, bestScore = conf;
            for (let c = 0; c < nc; c++) {
                const s = data[(4 + c) * N + j];
                if (s > bestScore) { bestScore = s; best = c; }
            }
            if (best < 0) continue;
            const cx = data[j], cy = data[N + j], w = data[2 * N + j], h = data[3 * N + j];
            boxes.push({ cls: names[best], score: bestScore, ...toImage(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2) });
        }
    }
    if (bitmap !== source) bitmap.close();
    return nmsPerClass(boxes.filter(b => b.w >= 1 && b.h >= 1), iouThr);
}
