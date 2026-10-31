// --------------------- РРќРР¦РРђР›РР—РђР¦РРЇ ---------------------
import { detectPlanObjects, OPENING_CLASSES, SERVICE_CLASSES, PLAN_CLASS_RU } from './modules/PlanDetector.js';

BABYLON.SceneLoader.ShowLoadingScreen = false;

// Draco-decoder for compressed .opt.glb models (gltf-transform draco).
// Without this configuration Babylon throws "Draco decoder not available"
// when loading any .opt.glb. URLs are official Babylon CDN builds (~280KB
// wasm, lazy-loaded on the first draco mesh encountered).
//   - decoder.wasmUrl     -> JS wrapper over the wasm decoder
//   - wasmBinaryUrl       -> actual wasm binary (fast path)
//   - fallbackUrl         -> pure-JS decoder for contexts without wasm
if (BABYLON.DracoCompression) {
    BABYLON.DracoCompression.Configuration = {
        decoder: {
            wasmUrl:       "https://preview.babylonjs.com/draco_wasm_wrapper_gltf.js",
            wasmBinaryUrl: "https://preview.babylonjs.com/draco_decoder_gltf.wasm",
            fallbackUrl:   "https://preview.babylonjs.com/draco_decoder_gltf.js"
        }
    };
}

const canvas = document.getElementById("renderCanvas");

// Mobile render flag: тач-устройство ИЛИ ширина экрана как у мобильного.
// Включает облегчённый рендер-конвейер: DPR-нормализованное hardware scaling,
// без MSAA, без bloom, меньший shadow map. На Adreno 618 (Redmi Note 9 Pro)
// это разница между 15 и ~45-50 FPS на средне-наполненной сцене.
//   * Hardware scaling рассчитывается так, чтобы backbuffer был ровно
//     1.4x от CSS-пикселей — это "Retina-like" чёткость. На любом DPR:
//       DPR 3.0  -> scaleLevel 2.14, backbuffer = CSS * 1.4
//       DPR 2.75 -> scaleLevel 1.96, backbuffer = CSS * 1.4 (Redmi Note 9 Pro)
//       DPR 2.0  -> scaleLevel 1.43, backbuffer = CSS * 1.4
//       DPR 1.0  -> scaleLevel 1.0  (clamp), backbuffer = CSS * 1.0
//     Чёткость не теряется, потому что upscale идёт через bilinear+LCD-subpixel
//     драйвера, а нагрузка на fragment-шейдер падает в (DPR/1.4)^2 раз.
//   * MSAA off в WebGL-контексте — мобильные GPU тратят пропускную способность
//     на multisample resolve каждого кадра. Вместо MSAA — FXAA (один pass).
//   * FXAA on — дёшев (~1-2 ms даже на Adreno 6xx), хорошо сглаживает рёбра
//     при downscale. Без него на низком разрешении лесенки заметны.
//   * Pipeline samples 1 — без MSAA в post-process FBO.
//   * Bloom off — самый дорогой постпроцесс (multi-pass blur, fillrate-killer).
//   * Shadow 1024 + Poisson — вместо 2048 + blur-exponential (2 blur-прохода
//     на каждый кадр + крупный FBO).
const IS_MOBILE_RENDER = window.matchMedia('(max-width: 899px)').matches
    || window.matchMedia('(pointer: coarse)').matches;

const engine = new BABYLON.Engine(canvas, !IS_MOBILE_RENDER, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialiasing: !IS_MOBILE_RENDER,
    powerPreference: IS_MOBILE_RENDER ? 'low-power' : 'high-performance'
});
if (IS_MOBILE_RENDER) {
    const dpr = window.devicePixelRatio || 1;
    // 1.7x от CSS-пикселей — практически Retina-плотность. На Redmi
    // Note 9 Pro (DPR 2.75) это даёт scaleLevel ≈ 1.62 и backbuffer ≈
    // CSS * 1.7 — мыла нет, но всё ещё в ~2.6 раза меньше пикселей,
    // чем при нативном рендере.
    const TARGET_BACKBUFFER_RATIO = 1.7;
    const scaleLevel = Math.max(1.0, dpr / TARGET_BACKBUFFER_RATIO);
    engine.setHardwareScalingLevel(scaleLevel);
}

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.03, 0.05, 0.10, 1.0);

// РўСѓРјР°РЅ РґР»СЏ РіР»СѓР±РёРЅС‹ СЃС†РµРЅС‹
scene.fogMode    = BABYLON.Scene.FOGMODE_EXP2;
scene.fogColor   = new BABYLON.Color3(0.03, 0.05, 0.10);
scene.fogDensity = 0.016;

// --------------------- РљРђРњР•Р Рђ ---------------------
const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 3, 20, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit  = 2;
camera.upperRadiusLimit  = 150;
camera.wheelPrecision    = 50;
camera.panningSensibility = 100.0;

const framingBehavior = new BABYLON.FramingBehavior();
framingBehavior.radiusScale = 1.5;
framingBehavior.framingTime = 0.8;
camera.addBehavior(framingBehavior);

// --------------------- РџРћРЎРўРћР‘Р РђР‘РћРўРљРђ ---------------------
const pipeline = new BABYLON.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
// Мобильный fast-path: без MSAA-сэмплов и bloom, но FXAA оставляем —
// он сильно дешевле MSAA (один пост-pass вместо удвоения backbuffer'а)
// и нужен для чёткости рёбер при downscaled-рендере.
pipeline.fxaaEnabled      = true;
pipeline.samples          = IS_MOBILE_RENDER ? 1 : 4;
pipeline.bloomEnabled     = !IS_MOBILE_RENDER;
// Bloom оставляем «акцентным», а не «нюк-молочным»: повышаем порог входа
// и снижаем вес, иначе яркие emission-поверхности люстр расплываются в
// гигантские белые шары вокруг корпуса.
pipeline.bloomThreshold   = 0.95;
pipeline.bloomWeight      = 0.10;
pipeline.bloomKernel      = 64;
pipeline.bloomScale       = 0.5;

// --------------------- РћРЎР’Р•Р©Р•РќРР• ---------------------
const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2.5, -1), scene);
dirLight.position  = new BABYLON.Vector3(25, 50, 25);
dirLight.intensity = 1.4;
dirLight.diffuse   = new BABYLON.Color3(1.0, 0.97, 0.92);

// Тени: на мобильном — 1024 + exponential без blur, на десктопе —
// 2048 + blur exponential. Exponential shadow map (ESM) хорош тем, что
// не требует bias-тюнинга и не даёт shadow acne / light leak — по
// верхним граням, где dirLight скользит почти параллельно поверхности,
// PoissonSampling и обычный depth-test без bias промахивались и давали
// «белую полосу». ESM решает это через depth-в-экспоненту, аналитически.
// Без blur ESM всё ещё мягче чем hard shadow и в 2 раза дешевле, чем
// blurExponential (нет двух post-process blur-проходов).
// Размер shadow map нельзя поменять после создания — ветвимся здесь.
const shadowGenerator = new BABYLON.ShadowGenerator(
    IS_MOBILE_RENDER ? 1024 : 2048,
    dirLight
);
if (IS_MOBILE_RENDER) {
    shadowGenerator.useExponentialShadowMap = true;
} else {
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;
}

// РҐРѕР»РѕРґРЅС‹Р№ Р·Р°РїРѕР»РЅСЏСЋС‰РёР№ СЃРІРµС‚ СЃРІРµСЂС…Сѓ
const fillLight = new BABYLON.HemisphericLight("fillLight", new BABYLON.Vector3(0, 1, 0), scene);
fillLight.intensity   = 0.5;
fillLight.diffuse     = new BABYLON.Color3(0.72, 0.82, 1.0);
fillLight.groundColor = new BABYLON.Color3(0.08, 0.10, 0.16);

// Контровой свет — выключается на мобильном (один дополнительный
// PointLight в loop'е PBR-шейдера = ~25% per-fragment cost; визуально
// он чисто декоративный и при низкой intensity 0.28 почти не виден).
const rimLight = new BABYLON.PointLight("rimLight", new BABYLON.Vector3(0, 8, -20), scene);
rimLight.intensity = IS_MOBILE_RENDER ? 0 : 0.28;
rimLight.diffuse   = new BABYLON.Color3(0.55, 0.70, 1.0);
if (IS_MOBILE_RENDER) rimLight.setEnabled(false);

// ─── Mobile material auto-tuning ────────────────────────────────
// На каждый материал (включая те, что прилетают из GLB-loader'а),
// зажимаем maxSimultaneousLights = 2. PBR-шейдер раскрывает loop
// по этому числу СТАТИЧЕСКИ — даже при наличии всего 2 реальных
// источников шейдер делает 4 iterations с unused-веткой. Снижение
// с 4 до 2 буквально половинит количество ALU-операций в самой
// горячей секции fragment-шейдера. На Adreno 618 это +10–15 FPS.
if (IS_MOBILE_RENDER) {
    scene.onNewMaterialAddedObservable.add((material) => {
        try { material.maxSimultaneousLights = 2; } catch (_) {}
    });
    // Уже созданные материалы (на момент инициализации сцены
    // их обычно ещё нет, но на всякий пожарный — обходим список).
    scene.materials.forEach((m) => {
        try { m.maxSimultaneousLights = 2; } catch (_) {}
    });
}

// --------------------- IES-ПРОФИЛЬ ДЛЯ ОСВЕТИТЕЛЬНЫХ ТЕЛ ---------------------
// Парсер IESNA LM-63 + генератор projection texture'ы для SpotLight'а.
// Когда профиль загружен, потолочные лампы цепляют SpotLight с этой
// текстурой как «cookie» вместо omni-PointLight'а: распределение света
// перестаёт быть равномерным шаром — peak уезжает на угол, где
// производитель его измерил (для BEGA 84586K4 это ~42° от оси, спад к 90°).
const DEFAULT_IES_URL = '/static/ies/226338c3890df406567345579df01e63.ies';
let iesDefaultProfile = null;
// iesDefaultTexture убран намеренно: BABYLON.SpotLight.dispose() в v7
// автоматически диспозит свою projectionTexture, поэтому ОБЩАЯ
// pre-built текстура умирает вместе с ПЕРВОЙ удалённой лампой и у всех
// последующих SpotLight'ов «projection» молча перестаёт работать. На
// каждую лампу строим СВЕЖУЮ texture'у из iesDefaultProfile (см. ниже).

// SpotLight'а с 2D shadow map'ой деградирует к границе при fov→π. 160°
// (cone half = 80°) — практический максимум перед артефактами,
// и при этом захватывает 95%+ интеграла candela у архитектурных downlight'ов:
// у BEGA 84586K4 candela на θ=80° падает до ~21% от peak.
const IES_CONE_FULL_RAD = (160 * Math.PI) / 180;
const IES_CONE_HALF_RAD = IES_CONE_FULL_RAD / 2;

function parseIES(text) {
    const lines = text.split(/\r?\n/);
    // Заголовок (keyword'ы в []) — пропускаем до строки TILT=...
    let i = 0;
    while (i < lines.length && !lines[i].trim().toUpperCase().startsWith('TILT')) i++;
    if (i >= lines.length) throw new Error('IES: TILT не найден');
    const tilt = lines[i].trim().toUpperCase();
    i++;
    if (tilt !== 'TILT=NONE') {
        // TILT=INCLUDE требует пропустить 4 строки tilt-данных — у BEGA
        // профилей всегда NONE, INCLUDE пока не реализуем.
        throw new Error('IES: TILT=' + tilt.slice(5) + ' не поддержан');
    }
    // Дальше всё тело — поток чисел через любые пробелы/переводы строк.
    const tokens = [];
    for (; i < lines.length; i++) {
        lines[i].trim().split(/\s+/).forEach(p => {
            if (p.length > 0 && !isNaN(parseFloat(p))) tokens.push(parseFloat(p));
        });
    }
    let idx = 0;
    /* numLamps      */ tokens[idx++];
    /* lumensPerLamp */ tokens[idx++];
    const multiplier = tokens[idx++];
    const numV       = Math.round(tokens[idx++]);
    const numH       = Math.round(tokens[idx++]);
    /* photoType (1=C) */ tokens[idx++];
    /* unitsType    */ tokens[idx++];
    /* lumW lumL lumH */ idx += 3;
    const ballast    = tokens[idx++];
    /* future       */ tokens[idx++];
    /* inputWatts   */ tokens[idx++];
    const vAngles = [];
    for (let k = 0; k < numV; k++) vAngles.push(tokens[idx++]);
    const hAngles = [];
    for (let k = 0; k < numH; k++) hAngles.push(tokens[idx++]);
    // candela[h][v] — производитель часто капчурит только половину
    // окружности (например, 90°-270°), оставляя остальное по симметрии.
    // Для нашего использования (axially-symmetric апроксимация) мы и так
    // усредняем по всем h, поэтому неважно, на каком азимуте они даны.
    const candela = [];
    for (let h = 0; h < numH; h++) {
        const row = [];
        for (let v = 0; v < numV; v++) row.push(tokens[idx++] * multiplier * ballast);
        candela.push(row);
    }
    // Усреднение по горизонтальным углам → одномерный radial(θ).
    const radial = new Array(numV).fill(0);
    for (let v = 0; v < numV; v++) {
        let sum = 0;
        for (let h = 0; h < numH; h++) sum += candela[h][v];
        radial[v] = sum / numH;
    }
    return {
        vAngles,
        hAngles,
        radial,
        maxCd: Math.max(...radial),
        minVA: vAngles[0],
        maxVA: vAngles[vAngles.length - 1]
    };
}

function sampleIESRadial(profile, angDeg) {
    const va = profile.vAngles;
    if (angDeg <= va[0])           return profile.radial[0];
    if (angDeg >= va[va.length-1]) return profile.radial[va.length - 1];
    for (let i = 0; i < va.length - 1; i++) {
        if (angDeg >= va[i] && angDeg <= va[i+1]) {
            const t = (angDeg - va[i]) / (va[i+1] - va[i]);
            return profile.radial[i] * (1 - t) + profile.radial[i+1] * t;
        }
    }
    return 0;
}

// Проекционная текстура для SpotLight.projectionTexture. SpotLight
// семплит её через perspective-projection с FOV = light.angle. Поэтому
// маппинг texel→угол не линейный, а через atan:
//   θ(NDC_R) = atan(NDC_R × tan(angle/2))
// где NDC_R — расстояние от центра текстуры в [0..√2].
function buildIESProjectionTexture(profile, size, halfConeRad, scene) {
    const dt = new BABYLON.DynamicTexture('iesProj', { width: size, height: size }, scene, false);
    dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    const ctx = dt.getContext();
    const img = ctx.createImageData(size, size);
    const half = size / 2;
    const halfFovTan = Math.tan(halfConeRad);
    const maxCd = profile.maxCd || 1;
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const dx = (px + 0.5 - half) / half;
            const dy = (py + 0.5 - half) / half;
            const ndcR = Math.sqrt(dx*dx + dy*dy);
            // Углы за пределами IES-диапазона дают 0 → углы текстуры
            // (NDC_R = √2) попадают в зону вне cone'а лайта и
            // автоматически не освещаются.
            const angRad = Math.atan(ndcR * halfFovTan);
            const angDeg = angRad * 180 / Math.PI;
            const v = Math.min(1, Math.max(0, sampleIESRadial(profile, angDeg) / maxCd));
            const px8 = Math.round(v * 255);
            const off = (py * size + px) * 4;
            img.data[off  ] = px8;
            img.data[off+1] = px8;
            img.data[off+2] = px8;
            img.data[off+3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    dt.update();
    return dt;
}

// Фоновая загрузка — не блокирует сцену. Если пользователь успеет
// поставить люстру до завершения, она просто получит обычные PointLight'ы.
//
// Промис resolves'ится при ЛЮБОМ исходе (успех или фейл) — это даёт
// restoreSceneFromState возможность дождаться готовности IES перед
// загрузкой потолочных ламп, не рискуя получить fallback-PointLight'ы
// в восстановленной сцене. window.iesReadyPromise публичен, чтобы UI
// мог опционально показать индикатор «грузим освещение».
const iesReadyPromise = fetch(DEFAULT_IES_URL)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(text => {
        iesDefaultProfile = parseIES(text);
        // Texture здесь НЕ строим — иначе она потом «утечёт» в первую же
        // лампу и умрёт вместе с ней при clearScene. Каждой лампе делаем
        // свою свежую texture'у в месте создания SpotLight.
        console.log(`💡 IES загружен: ${iesDefaultProfile.vAngles.length}V × ${iesDefaultProfile.hAngles.length}H, peak=${iesDefaultProfile.maxCd.toFixed(0)} cd, θ ∈ [${iesDefaultProfile.minVA}°, ${iesDefaultProfile.maxVA}°]`);
        return true;
    })
    .catch(e => {
        console.warn('💡 IES профиль не загружен, будут обычные PointLight:', e.message);
        return false; // не throw — потребители должны продолжить и без IES
    });
window.iesReadyPromise = iesReadyPromise;

// --------------------- РџРћР› ---------------------
function createGridTexture(size = 1024, cellSize = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#0b1120";
    ctx.fillRect(0, 0, size, size);

    // РњР°Р»С‹Рµ СЏС‡РµР№РєРё
    ctx.strokeStyle = "rgba(79, 130, 220, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += cellSize) {
        ctx.beginPath(); ctx.moveTo(i, 0);    ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i);    ctx.lineTo(size, i); ctx.stroke();
    }

    // РљСЂСѓРїРЅС‹Рµ СЏС‡РµР№РєРё
    ctx.strokeStyle = "rgba(79, 130, 220, 0.24)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= size; i += cellSize * 4) {
        ctx.beginPath(); ctx.moveTo(i, 0);    ctx.lineTo(i, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i);    ctx.lineTo(size, i); ctx.stroke();
    }

    const tex = new BABYLON.Texture(c.toDataURL(), scene);
    tex.uScale = 14;
    tex.vScale = 14;
    return tex;
}

const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 120, height: 120 }, scene);
const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
groundMat.diffuseTexture  = createGridTexture(1024, 64);
groundMat.specularColor   = new BABYLON.Color3(0.04, 0.06, 0.12);
groundMat.emissiveColor   = new BABYLON.Color3(0.01, 0.02, 0.04);
groundMat.backFaceCulling = false;
ground.material      = groundMat;
ground.position.y    = -0.01;
ground.receiveShadows = true;

// --------------------- РџР•Р Р•РњР•РќРќР«Р• ---------------------
let createdWalls     = [];
// Снэпшот последних wallRegions, переданных в buildWallsFromRegions —
// нужен для функции сохранения сцены: чтобы при загрузке заново
// собрать стены без повторного запуска CV-сегментации.
let lastBuiltWallRegions = null;
let windowMarkers    = [];
let doorMarkers      = [];
// Window opening slots — пустые проёмы окон после CSG-вырезов в стенах.
// На каждый создаётся невидимый pickable box; клик по нему открывает
// мини-меню каталога Windows, и выбранный GLB подгоняется под габариты
// проёма и встаёт в плоскость стены.
let windowOpeningSlots = [];
let activeWindowMenuSlot = null;
let floorMeshes      = [];
let ceilingMeshes    = [];
let dimensionLabels  = [];
let currentPlanImage = null;
let currentImageFile = null;
let WALL_HEIGHT      = 3.0;

const WINDOW_SILL_HEIGHT = 0.9;
const WINDOW_HEIGHT      = 1.5;
const WINDOW_CUT_MARGIN  = 0.2;
const WINDOW_CUT_THROUGH_FACTOR = 1.85;
const WINDOW_MIN_LINTEL_HEIGHT = 0.15;
const WINDOW_MIN_OPENING_HEIGHT = 0.3;
const DOOR_HEIGHT        = 2.1;
const DOOR_CUT_MARGIN    = 0.2;
const DOOR_MIN_LINTEL_HEIGHT = 0.18;
const DOOR_MIN_OPENING_HEIGHT = 0.6;
const DOOR_LINTEL_THICKNESS_FACTOR = 1.0;
const DOOR_LINTEL_SPAN_FACTOR = 1.02;
let MANUAL_SCALE         = 0.01; // px → метры. Калибруется по реальной ширине двери на этапе сращивания.

let detectedWindows = [];
let detectedDoors   = [];
let detectedDoorArches = [];
let detectedDoorProfiles = [];
let detectedWindowProfiles = [];
// Мебель/сантехника с чертежа (локальная модель, modules/PlanDetector.js).
// После «Построить 3D» предметы с аналогом в каталоге расставляются один раз.
let detectedFurniture = [];
let furnitureNeedsPlacement = false;

// DOM
const selectImageBtn  = document.getElementById('select-image-btn');
const fileInput       = document.getElementById('image-file-input');
const fileNameSpan    = document.getElementById('selected-file-name');
const buildBtn        = document.getElementById('build-3d-main-btn');
const heightSlider    = document.getElementById('wall-height-slider');
const heightSpan      = document.getElementById('height-value');
const previewOverlay  = document.getElementById('preview-overlay');
const previewImage    = document.getElementById('preview-image');
const previewOverlayLabel = document.getElementById('preview-overlay-label');
const previewCancel   = document.getElementById('preview-cancel');
const previewConfirm  = document.getElementById('preview-confirm');
const detectWindowsBtn = document.getElementById('detect-windows-btn');
const detectDoorsBtn  = document.getElementById('detect-doors-btn');
const detectFurnitureBtn = document.getElementById('detect-furniture-btn');
const detectStatus    = document.getElementById('detect-status');
const loadingIndicator = document.getElementById('loading-indicator');
const overlayCanvas   = document.getElementById('windows-overlay-canvas');
const toggle2DBtn     = document.getElementById('toggle-2d-btn');

let currentPlanObjectUrl = null;
let previewMode = 'detections'; // 'detections' | 'stitch'
let pendingWallRegions = null;
let pendingMaskPreviewDataUrl = null;
let isTopDown2D = false;
let top2DHalfSize = 10;
let camera3DState = null;

let walkCamera = null;
let isWalkMode = false;

const TOP2D_EPS = 0.01;
const TOP2D_PADDING = 1.15;
const TOP2D_MIN_HALF_SIZE = 6;

if (typeof BABYLON.CSG === 'undefined') {
    console.error('❌ BABYLON.CSG не найден. Проверьте подключение библиотеки.');
} else {
    console.log('✅ CSG загружен');
}

function invalidatePendingBuildPreview() {
    pendingWallRegions = null;
    pendingMaskPreviewDataUrl = null;
}

function getWallsBounds() {
    if (!createdWalls.length) return null;

    let min = new BABYLON.Vector3( Infinity,  Infinity,  Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

    createdWalls.forEach((wall) => {
        wall.computeWorldMatrix(true);
        const bb = wall.getBoundingInfo().boundingBox;
        min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
        max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
    });

    const center = BABYLON.Vector3.Center(min, max);
    const size = max.subtract(min);
    const maxDim = Math.max(size.x, size.y, size.z);
    return { min, max, center, size, maxDim };
}

function update2DToggleButtonState() {
    if (!toggle2DBtn) return;
    toggle2DBtn.classList.toggle('active', isTopDown2D);
    toggle2DBtn.setAttribute('aria-pressed', isTopDown2D ? 'true' : 'false');
}

function applyOrthographicFrustum(halfSize) {
    const renderWidth = Math.max(1, engine.getRenderWidth());
    const renderHeight = Math.max(1, engine.getRenderHeight());
    const aspect = renderWidth / renderHeight;
    const halfWidth = halfSize * aspect;

    camera.orthoLeft = -halfWidth;
    camera.orthoRight = halfWidth;
    camera.orthoTop = halfSize;
    camera.orthoBottom = -halfSize;
}

function computeTopDownCameraParams() {
    const bounds = getWallsBounds();
    if (bounds) {
        return {
            target: bounds.center.clone(),
            halfSize: Math.max(TOP2D_MIN_HALF_SIZE, bounds.maxDim * 0.5 * TOP2D_PADDING),
            height: Math.max(WALL_HEIGHT + 4, bounds.size.y + 4)
        };
    }

    return {
        target: camera.target.clone(),
        halfSize: Math.max(TOP2D_MIN_HALF_SIZE, camera.radius * 0.75),
        height: Math.max(12, camera.radius)
    };
}

function enterTopDown2DView() {
    if (isTopDown2D) return;

    camera3DState = {
        mode: camera.mode,
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: camera.target.clone(),
        lowerBetaLimit: camera.lowerBetaLimit,
        upperBetaLimit: camera.upperBetaLimit,
        lowerRadiusLimit: camera.lowerRadiusLimit,
        upperRadiusLimit: camera.upperRadiusLimit
    };

    const topDown = computeTopDownCameraParams();
    top2DHalfSize = topDown.halfSize;

    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    camera.setTarget(topDown.target);
    camera.alpha = -Math.PI / 2;
    camera.beta = TOP2D_EPS;
    camera.radius = topDown.height;
    camera.lowerBetaLimit = TOP2D_EPS;
    camera.upperBetaLimit = TOP2D_EPS;
    camera.lowerRadiusLimit = topDown.height;
    camera.upperRadiusLimit = topDown.height;
    applyOrthographicFrustum(top2DHalfSize);

    isTopDown2D = true;
    setDimensionLabelsVisible(true);
    update2DToggleButtonState();
}

function exitTopDown2DView() {
    if (!isTopDown2D) return;

    const prev = camera3DState;
    camera.mode = (prev && typeof prev.mode === 'number') ? prev.mode : BABYLON.Camera.PERSPECTIVE_CAMERA;
    if (prev?.target) camera.setTarget(prev.target.clone());
    if (prev && Number.isFinite(prev.alpha)) camera.alpha = prev.alpha;
    if (prev && Number.isFinite(prev.beta)) camera.beta = prev.beta;
    if (prev && Number.isFinite(prev.radius)) camera.radius = prev.radius;
    camera.lowerBetaLimit = prev ? prev.lowerBetaLimit : null;
    camera.upperBetaLimit = prev ? prev.upperBetaLimit : null;
    camera.lowerRadiusLimit = prev ? prev.lowerRadiusLimit : null;
    camera.upperRadiusLimit = prev ? prev.upperRadiusLimit : null;

    camera.orthoLeft = null;
    camera.orthoRight = null;
    camera.orthoTop = null;
    camera.orthoBottom = null;

    isTopDown2D = false;
    setDimensionLabelsVisible(false);
    camera3DState = null;
    update2DToggleButtonState();
}

function toggle2DView() {
    if (isWalkMode) exitWalkMode();   // режимы взаимно исключающие
    if (isTopDown2D) exitTopDown2DView();
    else enterTopDown2DView();
}

// ============================================================================
// WALK MODE — «прогулка» от первого лица: UniversalCamera + collision-ellipsoid
// + гравитация. Стены и пол получают checkCollisions, потолок — нет (иначе
// маленький подскок «застрянет» под перекрытием).
// ============================================================================

const WALK_EYE_HEIGHT = 1.75;       // м, рост глаз стандартного человека
const WALK_BODY_HALF_WIDTH = 0.32;  // ~0.64 м поперёк, плечевой габарит
// Гравитацию мы не используем (см. enterWalkMode/onBeforeRender — Y лочится
// вручную), поэтому эллипсоид по Y берём узкой полоской на уровне глаз:
// его задача — только бить стены по XZ, не цепляя пол и потолок.
const WALK_BODY_HALF_HEIGHT = 0.25;

function findWalkSpawnPoint() {
    // Лучшая точка — центр первой комнаты (= первая дыра в pendingWallRegions).
    if (Array.isArray(pendingWallRegions)) {
        for (const region of pendingWallRegions) {
            for (const hole of (region.holes || [])) {
                if (hole && hole.length >= 3) {
                    const c = polygonCentroidXY(hole);
                    return new BABYLON.Vector3(
                        c.x * MANUAL_SCALE,
                        WALK_EYE_HEIGHT,
                        c.y * MANUAL_SCALE
                    );
                }
            }
        }
    }
    const bounds = getWallsBounds();
    if (bounds) return new BABYLON.Vector3(bounds.center.x, WALK_EYE_HEIGHT, bounds.center.z);
    return new BABYLON.Vector3(0, WALK_EYE_HEIGHT, 0);
}

function ensureWalkCamera(spawn) {
    if (walkCamera) {
        walkCamera.position = spawn.clone();
        walkCamera.rotation = new BABYLON.Vector3(0, 0, 0);
        return walkCamera;
    }
    walkCamera = new BABYLON.UniversalCamera('walkCamera', spawn.clone(), scene);
    walkCamera.minZ = 0.05;
    walkCamera.maxZ = 500;
    walkCamera.fov  = 1.1;
    // camera.speed внутри Babylon домножается на sqrt(deltaTime / (fps*100)),
    // т.е. при 60 fps эффективный шаг ≈ speed * 0.053. Чтобы получить
    // комфортный «быстрый шаг» (~3 м/с), берём speed = 1.5.
    walkCamera.speed = 1.5;
    walkCamera.inertia = 0.4;
    walkCamera.angularSensibility = 1500;
    // Гравитацию НЕ включаем. Без неё проще: ходим по одноуровневому полу,
    // Y-координату жёстко фиксируем в onBeforeRender (см. enterWalkMode).
    // С applyGravity=true + default-keyboard инпутом любой взгляд вверх
    // во время WASD добавлял в cameraDirection положительный Y, и игрок
    // улетал в потолок быстрее, чем гравитация успевала его опустить.
    walkCamera.applyGravity = false;
    walkCamera.checkCollisions = true;
    walkCamera.ellipsoid = new BABYLON.Vector3(WALK_BODY_HALF_WIDTH, WALK_BODY_HALF_HEIGHT, WALK_BODY_HALF_WIDTH);
    walkCamera.ellipsoidOffset = new BABYLON.Vector3(0, 0, 0);
    // WASD в дополнение к стрелкам.
    walkCamera.keysUp.push(87);    // W
    walkCamera.keysDown.push(83);  // S
    walkCamera.keysLeft.push(65);  // A
    walkCamera.keysRight.push(68); // D
    // Постпроцесс-пайплайн привязан к arc-camera; добавляем walk, чтобы
    // bloom/FXAA работали и в режиме прогулки.
    if (pipeline && typeof pipeline.addCamera === 'function') {
        try { pipeline.addCamera(walkCamera); } catch (_) { /* уже добавлен */ }
    }
    return walkCamera;
}

function updateWalkButtonState() {
    const btn = document.getElementById('toggle-walk-btn');
    if (btn) {
        btn.classList.toggle('active', isWalkMode);
        btn.setAttribute('aria-pressed', isWalkMode ? 'true' : 'false');
    }
    const hint = document.getElementById('walk-hint');
    if (hint) hint.style.display = isWalkMode ? 'block' : 'none';
}

function enterWalkMode() {
    if (isWalkMode) return;
    if (!createdWalls.length) {
        alert('Сначала постройте 3D-модель — гулять пока негде.');
        return;
    }
    if (isTopDown2D) exitTopDown2DView();

    const spawn = findWalkSpawnPoint();
    ensureWalkCamera(spawn);

    scene.collisionsEnabled = true;

    // Коллизии нужны только на стенах: пол/потолок не блокируем — Y лочится
    // вручную, а лишние коллизии по Y только мешают «протискиваться» в
    // случаях, когда эллипсоид слегка задевает плоскость пола/потолка.
    createdWalls.forEach(w => { w.checkCollisions = true; });
    floorMeshes.forEach(f => { f.checkCollisions = false; });
    ceilingMeshes.forEach(c => { c.checkCollisions = false; });

    camera.detachControl();
    scene.activeCamera = walkCamera;
    walkCamera.attachControl(canvas, true);

    // Жёсткий Y-lock. Запускаем ОДИН раз на сцену; внутри проверяем isWalkMode.
    if (!scene._walkYLockHookInstalled) {
        scene.onBeforeRenderObservable.add(() => {
            if (!isWalkMode || !walkCamera) return;
            // 1) Сносим Y-составляющую желаемого перемещения, накопленную
            //    keyboard-инпутом (он считает «вперёд» из 3D-направления
            //    взгляда; при взгляде вверх W приобретает положительный Y).
            walkCamera.cameraDirection.y = 0;
            // 2) Возвращаем камеру на уровень глаз, если за прошлый кадр
            //    она всё-таки уехала по Y (например, из-за интерсекции
            //    эллипсоида со стенами/проёмами).
            if (walkCamera.position.y !== WALK_EYE_HEIGHT) {
                walkCamera.position.y = WALK_EYE_HEIGHT;
            }
        });
        scene._walkYLockHookInstalled = true;
    }

    // Лейблы лежат прямо на полу и в FPS-виде только мешают.
    setDimensionLabelsVisible(false);

    // В режиме прогулки нельзя случайно схватить и сдвинуть мебель курсором
    // мыши/пальцем — выключаем PointerDragBehavior у всех предметов. На
    // exitWalkMode их обратно включаем, но окнам в проёмах оставляем off.
    setPlacedItemsDragEnabled(false);

    isWalkMode = true;
    updateWalkButtonState();
}

function exitWalkMode() {
    if (!isWalkMode) return;
    if (walkCamera) walkCamera.detachControl();
    scene.activeCamera = camera;
    camera.attachControl(canvas, true);

    scene.collisionsEnabled = false;
    createdWalls.forEach(w => { w.checkCollisions = false; });
    // floorMeshes/ceilingMeshes коллизий и так не несут (отключены при входе).

    if (isTopDown2D) setDimensionLabelsVisible(true);

    // Возвращаем драг — но окнам в проёмах он всё равно не нужен (см.
    // лочку в helper'е: handle.metadata.openingSlot != null → пропускаем).
    setPlacedItemsDragEnabled(true);

    isWalkMode = false;
    updateWalkButtonState();
}

// Включает/выключает PointerDragBehavior у всех placedItems. Используется
// в enterWalkMode/exitWalkMode (общий лок), а косвенно — при установке
// окна в проём (там drag выключаем точечно через тот же helper-API).
// Окнам в проёмах включить драг НЕЛЬЗЯ: они геометрически подогнаны под
// fitToOpening, любой сдвиг разрушает совпадение со стенным вырезом.
function setPlacedItemsDragEnabled(enabled) {
    placedItems.forEach(handle => {
        if (!handle || !handle.behaviors) return;
        const isSlotWindow = !!(handle.metadata && handle.metadata.openingSlot);
        handle.behaviors.forEach(b => {
            if (b instanceof BABYLON.PointerDragBehavior) {
                b.enabled = enabled && !isSlotWindow;
            }
        });
    });
}

function toggleWalkMode() {
    if (isWalkMode) exitWalkMode();
    else enterWalkMode();
}

function enterDetectionsPreviewMode() {
    previewMode = 'detections';
    if (previewOverlayLabel) previewOverlayLabel.textContent = 'Предпросмотр плана';
    previewCancel.textContent = 'Отмена';
    previewConfirm.textContent = 'Показать сращивание';
    detectWindowsBtn.style.display = '';
    if (detectDoorsBtn) detectDoorsBtn.style.display = '';
    if (detectFurnitureBtn) detectFurnitureBtn.style.display = '';
    overlayCanvas.style.display = '';
    if (currentPlanObjectUrl && previewImage.src !== currentPlanObjectUrl) {
        previewImage.src = currentPlanObjectUrl;
    } else if (previewOverlay.style.display === 'flex') {
        drawWindowsOverlay();
    }
    updateDetectionStatus();
    const calBlock = document.getElementById('scale-calibration');
    if (calBlock) calBlock.style.display = 'none';
}

function enterStitchPreviewMode(maskPreviewDataUrl, wallRegions) {
    previewMode = 'stitch';
    if (previewOverlayLabel) previewOverlayLabel.textContent = 'Проверка сращивания и размеров (м)';
    previewCancel.textContent = 'Назад';
    previewConfirm.textContent = 'Построить 3D';
    detectWindowsBtn.style.display = 'none';
    if (detectDoorsBtn) detectDoorsBtn.style.display = 'none';
    if (detectFurnitureBtn) detectFurnitureBtn.style.display = 'none';

    overlayCanvas.style.display = '';
    clearOverlayCanvas();

    // Возвращаем оригинальный план — на нём поверх рисуем размерный overlay.
    if (currentPlanObjectUrl && previewImage.src !== currentPlanObjectUrl) {
        previewImage.src = currentPlanObjectUrl;
        previewImage.onload = () => drawStitchPreviewOverlay();
    } else {
        drawStitchPreviewOverlay();
    }

    updateStitchStatusLine();

    const calBlock = document.getElementById('scale-calibration');
    if (calBlock) calBlock.style.display = detectedDoors.length ? '' : 'none';
    updateCalibrationHint();
}

function updateStitchStatusLine() {
    const bounds = computeWallRegionsBoundsMeters(pendingWallRegions);
    const wallCount = Array.isArray(pendingWallRegions) ? pendingWallRegions.length : 0;
    detectStatus.textContent = bounds
        ? `Тел стен: ${wallCount} · Габарит плана: ${bounds.w.toFixed(2)} × ${bounds.h.toFixed(2)} м · h стен: ${WALL_HEIGHT.toFixed(2)} м`
        : `Тел стен: ${wallCount}. Размеры показаны на чертеже в метрах.`;
}

function averageDetectedDoorWidthPx() {
    if (!detectedDoors.length) return 0;
    let sum = 0, n = 0;
    for (const d of detectedDoors) {
        const px = Math.max(d.w, d.h);
        if (px > 0) { sum += px; n++; }
    }
    return n ? sum / n : 0;
}

function updateCalibrationHint() {
    const hint = document.getElementById('scale-cal-hint');
    if (!hint) return;
    const avgPx = averageDetectedDoorWidthPx();
    if (!avgPx) {
        hint.textContent = 'Нет детектированных дверей — сначала найдите двери.';
        return;
    }
    const currentMeters = avgPx * MANUAL_SCALE;
    hint.textContent =
        `Сейчас средняя детектированная дверь = ${currentMeters.toFixed(2)} м · MANUAL_SCALE = ${MANUAL_SCALE.toFixed(5)}`;
}

const DEFAULT_MANUAL_SCALE = 0.01;

function applyDoorCalibration() {
    const input = document.getElementById('door-width-input');
    if (!input) return;
    const target = parseFloat(input.value);
    if (!isFinite(target) || target <= 0) return;

    const avgPx = averageDetectedDoorWidthPx();
    if (!avgPx) {
        alert('Сначала найдите двери — без них калибровать нечего.');
        return;
    }

    const newScale = target / avgPx;
    if (!isFinite(newScale) || newScale <= 0) return;

    MANUAL_SCALE = newScale;
    console.log(`📏 Калибровка: средняя ширина двери ${avgPx.toFixed(1)}px = ${target} м → MANUAL_SCALE = ${newScale.toFixed(6)}`);

    if (previewMode === 'stitch') {
        drawStitchPreviewOverlay();
        updateStitchStatusLine();
    } else if (previewMode === 'detections') {
        drawWindowsOverlay();
    }
    updateCalibrationHint();
}

function resetCalibration() {
    MANUAL_SCALE = DEFAULT_MANUAL_SCALE;
    const input = document.getElementById('door-width-input');
    if (input) input.value = '0.80';
    console.log(`📏 Калибровка сброшена: MANUAL_SCALE = ${MANUAL_SCALE}`);
    if (previewMode === 'stitch') {
        drawStitchPreviewOverlay();
        updateStitchStatusLine();
    } else if (previewMode === 'detections') {
        drawWindowsOverlay();
    }
    updateCalibrationHint();
}

function computeWallRegionsBoundsMeters(regions) {
    if (!Array.isArray(regions) || !regions.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    regions.forEach(region => {
        (region.outer || []).forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
            any = true;
        });
    });
    if (!any) return null;
    return { w: (maxX - minX) * MANUAL_SCALE, h: (maxY - minY) * MANUAL_SCALE };
}

// --------------------- РћР‘Р РђР‘РћРўР§РРљР ---------------------
selectImageBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        currentImageFile = file;
        fileNameSpan.textContent = file.name;
        loadImageForPreview(file);
        buildBtn.disabled = false;
        detectedWindows = [];
        detectedDoors = [];
        detectedDoorArches = [];
        detectedDoorProfiles = [];
        detectedWindowProfiles = [];
        detectedFurniture = [];
        furnitureNeedsPlacement = false;
        clearWindowMarkers();
        clearDoorMarkers();
        clearFloorsAndCeilings();
        clearDimensionLabels();
        clearOverlayCanvas();
        invalidatePendingBuildPreview();
        detectStatus.textContent = '';
    } else {
        currentImageFile = null;
        fileNameSpan.textContent = 'Выбрать файл...';
        buildBtn.disabled = true;
        invalidatePendingBuildPreview();
    }
});

heightSlider.addEventListener('input', () => {
    WALL_HEIGHT = parseFloat(heightSlider.value);
    heightSpan.textContent = WALL_HEIGHT.toFixed(1) + ' м';
    // Подписи окон/дверей и легенда зависят от WALL_HEIGHT (через клампинг
    // высоты проёмов), поэтому перерисовываем активный оверлей.
    if (previewMode === 'stitch') drawStitchPreviewOverlay();
    else if (previewMode === 'detections') drawWindowsOverlay();
});

// Color-picker UI для покраски выделенной грани стены.
const wallColorInput = document.getElementById('wall-color-input');
const wallColorReset = document.getElementById('wall-color-reset');
const wallColorClose = document.getElementById('wall-color-close');
const wallpaperStrip = document.getElementById('wallpaper-strip');
if (wallColorInput) {
    wallColorInput.addEventListener('input', (e) => applyColorToSelectedFace(e.target.value));
}
if (wallColorReset) {
    wallColorReset.addEventListener('click', resetSelectedFaceColor);
}
if (wallColorClose) {
    wallColorClose.addEventListener('click', deselectWallFace);
}
if (wallpaperStrip) {
    wallpaperStrip.addEventListener('click', (e) => {
        const swatch = e.target.closest('.wallpaper-swatch');
        if (!swatch) return;
        const slug = swatch.dataset.wallpaper || '';
        const url  = swatch.dataset.url || '';
        applyWallpaperToSelectedFace(slug, url);
        syncWallpaperStripUI(slug);
    });
}

function syncWallpaperStripUI(activeSlug) {
    if (!wallpaperStrip) return;
    wallpaperStrip.querySelectorAll('.wallpaper-swatch').forEach(el => {
        el.classList.toggle('active', (el.dataset.wallpaper || '') === (activeSlug || ''));
    });
}

// --- UI: панель пола ------------------------------------------------------
const floorColorInput = document.getElementById('floor-color-input');
const floorColorReset = document.getElementById('floor-color-reset');
const floorColorClose = document.getElementById('floor-color-close');
const floorStrip      = document.getElementById('floor-strip');
if (floorColorInput) {
    floorColorInput.addEventListener('input', (e) => applyColorToSelectedFloor(e.target.value));
}
if (floorColorReset) {
    floorColorReset.addEventListener('click', resetSelectedFloorColor);
}
if (floorColorClose) {
    floorColorClose.addEventListener('click', deselectFloor);
}
if (floorStrip) {
    floorStrip.addEventListener('click', (e) => {
        const swatch = e.target.closest('.wallpaper-swatch');
        if (!swatch) return;
        const slug = swatch.dataset.floor || '';
        const url  = swatch.dataset.url || '';
        applyFloorTextureToSelectedFloor(slug, url);
        syncFloorStripUI(slug);
    });
}

function syncFloorStripUI(activeSlug) {
    if (!floorStrip) return;
    floorStrip.querySelectorAll('.wallpaper-swatch').forEach(el => {
        el.classList.toggle('active', (el.dataset.floor || '') === (activeSlug || ''));
    });
}

buildBtn.addEventListener('click', () => {
    if (!currentPlanImage) return;
    enterDetectionsPreviewMode();
    previewOverlay.style.display = 'flex';
});

if (toggle2DBtn) {
    toggle2DBtn.addEventListener('click', toggle2DView);
}
update2DToggleButtonState();

const toggleWalkBtn = document.getElementById('toggle-walk-btn');
if (toggleWalkBtn) toggleWalkBtn.addEventListener('click', toggleWalkMode);
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isWalkMode) exitWalkMode();
});

const applyCalibrationBtn = document.getElementById('apply-calibration');
const resetCalibrationBtn = document.getElementById('reset-calibration');
const doorWidthInput = document.getElementById('door-width-input');
if (applyCalibrationBtn) applyCalibrationBtn.addEventListener('click', applyDoorCalibration);
if (resetCalibrationBtn) resetCalibrationBtn.addEventListener('click', resetCalibration);
if (doorWidthInput) {
    doorWidthInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyDoorCalibration();
    });
}

previewCancel.addEventListener('click', () => {
    if (previewMode === 'stitch') {
        enterDetectionsPreviewMode();
        return;
    }
    previewOverlay.style.display = 'none';
    clearOverlayCanvas();
});

previewConfirm.addEventListener('click', async () => {
    if (!currentPlanImage) return;

    if (previewMode === 'detections') {
        loadingIndicator.style.display = 'block';
        try {
            const prep = await prepareWallsForApproval(currentPlanImage);
            pendingWallRegions = prep.wallRegions;
            pendingMaskPreviewDataUrl = prep.maskPreviewDataUrl;

            if (!pendingWallRegions.length) {
                alert('Не удалось обнаружить стены на изображении.');
                return;
            }
            enterStitchPreviewMode(pendingMaskPreviewDataUrl, pendingWallRegions);
        } catch (error) {
            console.error(error);
            alert('Ошибка при подготовке 2D маски: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
        return;
    }

    previewOverlay.style.display = 'none';
    loadingIndicator.style.display = 'block';
    try {
        if (!pendingWallRegions || !pendingWallRegions.length) {
            const prep = await prepareWallsForApproval(currentPlanImage);
            pendingWallRegions = prep.wallRegions;
            pendingMaskPreviewDataUrl = prep.maskPreviewDataUrl;
        }
        if (!pendingWallRegions.length) {
            alert('Не удалось обнаружить стены на изображении.');
            return;
        }
        buildWallsFromRegions(pendingWallRegions);
    } catch (error) {
        console.error(error);
        alert('Ошибка при построении 3D модели: ' + error.message);
    } finally {
        loadingIndicator.style.display = 'none';
    }
});

// ---------- Р”РµС‚РµРєС†РёСЏ РѕРєРѕРЅ ----------
async function requestDetections() {
    const base64Data = await fileToBase64(currentImageFile);
    const base64Content = base64Data.split(',')[1];

    const response = await fetch('/api/proxy-roboflow/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ image_base64: base64Content })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    let predictions = data.predictions;
    if (predictions && !Array.isArray(predictions)) predictions = predictions.predictions || [];
    return predictions || [];
}

function updateDetectionStatus() {
    let text = `Найдено окон: ${detectedWindows.length}, door box: ${detectedDoors.length}, door arch: ${detectedDoorArches.length}`;
    if (detectedFurniture.length) {
        const placeable = detectedFurniture.filter(f => pickCatalogItemForFurniture(f)).length;
        text += `, мебель: ${detectedFurniture.length} (в 3D из каталога: ${placeable})`;
    }
    detectStatus.textContent = text;
}

detectWindowsBtn.addEventListener('click', async () => {
    if (!currentImageFile) { detectStatus.textContent = 'Нет файла изображения'; return; }
    detectStatus.textContent = 'Поиск окон...';
    detectWindowsBtn.disabled = true;
    if (detectDoorsBtn) detectDoorsBtn.disabled = true;

    try {
        const predictions = await requestDetections();
        detectedWindows = predictions
            .filter(p => { const c = (p.class || '').toLowerCase(); return c === 'window' || c === 'window-block'; })
            .map(p => ({ x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height }));

        clearWindowMarkers();
        drawWindowsOverlay();
        detectedDoorProfiles = [];
        detectedWindowProfiles = [];
        invalidatePendingBuildPreview();
        updateDetectionStatus();
    } catch (error) {
        console.error('Ошибка детекции окон:', error);
        detectStatus.textContent = `Ошибка: ${error.message}`;
    } finally {
        detectWindowsBtn.disabled = false;
        if (detectDoorsBtn) detectDoorsBtn.disabled = false;
    }
});

if (detectDoorsBtn) {
    detectDoorsBtn.addEventListener('click', async () => {
        if (!currentImageFile) { detectStatus.textContent = 'Нет файла изображения'; return; }
        detectStatus.textContent = 'Поиск дверей...';
        detectDoorsBtn.disabled = true;
        detectWindowsBtn.disabled = true;

        try {
            const predictions = await requestDetections();
            detectedDoors = predictions
                .filter(p => {
                    const c = (p.class || '').toLowerCase();
                    return c === 'door box';
                })
                .map(p => ({ x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height }));

            detectedDoorArches = predictions
                .filter(p => {
                    const c = (p.class || '').toLowerCase();
                    return c === 'door arch' || c === 'door arch box';
                })
                .map(p => ({ x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height }));

            clearDoorMarkers();
            drawWindowsOverlay();
            detectedDoorProfiles = [];
            detectedWindowProfiles = [];
            invalidatePendingBuildPreview();
            updateDetectionStatus();
        } catch (error) {
            console.error('Ошибка детекции дверей:', error);
            detectStatus.textContent = `Ошибка: ${error.message}`;
        } finally {
            detectDoorsBtn.disabled = false;
            detectWindowsBtn.disabled = false;
        }
    });
}

// Мебель ищет локальная модель прямо в браузере (без Roboflow). Окна/двери
// она тоже видит, но их по-прежнему дают кнопки выше — здесь берём только мебель.
if (detectFurnitureBtn) {
    detectFurnitureBtn.addEventListener('click', async () => {
        if (!currentPlanImage) { detectStatus.textContent = 'Нет файла изображения'; return; }
        detectStatus.textContent = 'Поиск мебели... (первый запуск загружает модель)';
        [detectFurnitureBtn, detectWindowsBtn, detectDoorsBtn].forEach(b => { if (b) b.disabled = true; });

        try {
            const t0 = performance.now();
            const predictions = await detectPlanObjects(currentPlanImage);
            detectedFurniture = predictions.filter(p => !OPENING_CLASSES.has(p.cls) && !SERVICE_CLASSES.has(p.cls));
            furnitureNeedsPlacement = detectedFurniture.length > 0;
            console.log(`🛋 Мебель на чертеже: ${detectedFurniture.length} за ${Math.round(performance.now() - t0)} мс`, detectedFurniture);
            drawWindowsOverlay();
            updateDetectionStatus();
        } catch (error) {
            console.error('Ошибка детекции мебели:', error);
            detectStatus.textContent = `Ошибка: ${error.message}`;
        } finally {
            [detectFurnitureBtn, detectWindowsBtn, detectDoorsBtn].forEach(b => { if (b) b.disabled = false; });
        }
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getCookie(name) {
    if (!document.cookie) return null;
    for (const raw of document.cookie.split(';')) {
        const cookie = raw.trim();
        if (cookie.startsWith(name + '='))
            return decodeURIComponent(cookie.slice(name.length + 1));
    }
    return null;
}

// ─── Размерные подписи на оверлее ────────────────────────────────────────────
function drawDimPill(ctx, x, y, text, opts) {
    opts = opts || {};
    const fontSize = opts.fontSize || 11;
    ctx.save();
    ctx.font = `bold ${fontSize}px "Inter", system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const padX = 5, padY = 3;
    const w = tw + padX * 2;
    const h = fontSize + padY * 2;
    const bx = x - w / 2;
    const by = y - h / 2;

    ctx.fillStyle = opts.bg || 'rgba(8, 12, 28, 0.88)';
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bx, by, w, h, 4);
        ctx.fill();
    } else {
        ctx.fillRect(bx, by, w, h);
    }
    if (opts.border) {
        ctx.strokeStyle = opts.border;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.fillStyle = opts.fg || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
}

function formatOpeningLabel(boxPx, heightM) {
    const spanM = Math.max(boxPx.w, boxPx.h) * MANUAL_SCALE;
    return `${spanM.toFixed(2)} × ${heightM.toFixed(2)} м`;
}

// Мебель — под проёмами: тонкая фиолетовая рамка и подпись класса,
// если рамка на экране достаточно крупная, чтобы подпись не мешала.
function drawFurnitureOnOverlay(ctx, sx, sy) {
    if (!detectedFurniture.length) return;
    ctx.save();
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = '#b48cff';
    ctx.fillStyle   = 'rgba(180,140,255,0.10)';
    detectedFurniture.forEach(f => {
        ctx.fillRect  (f.x * sx, f.y * sy, f.w * sx, f.h * sy);
        ctx.strokeRect(f.x * sx, f.y * sy, f.w * sx, f.h * sy);
    });
    ctx.font = 'bold 10px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    detectedFurniture.forEach(f => {
        if (f.w * sx < 26 || f.h * sy < 14) return;
        const text = PLAN_CLASS_RU[f.cls] || f.cls;
        const tw = ctx.measureText(text).width + 6;
        ctx.fillStyle = 'rgba(30, 16, 56, 0.85)';
        ctx.fillRect(f.x * sx, f.y * sy, tw, 13);
        ctx.fillStyle = '#e6d9ff';
        ctx.fillText(text, f.x * sx + 3, f.y * sy + 1.5);
    });
    ctx.restore();
}

function drawDetectionsOnOverlay(ctx, sx, sy) {
    const windowOpeningHeight = getWindowCutGeometry().openingHeight;
    const doorOpeningHeight = getDoorCutGeometry().openingHeight;

    drawFurnitureOnOverlay(ctx, sx, sy);

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 2;
    ctx.fillStyle   = 'rgba(0,255,136,0.10)';
    detectedWindows.forEach(win => {
        ctx.fillRect  (win.x * sx, win.y * sy, win.w * sx, win.h * sy);
        ctx.strokeRect(win.x * sx, win.y * sy, win.w * sx, win.h * sy);
    });
    detectedWindows.forEach(win => {
        drawDimPill(
            ctx,
            (win.x + win.w / 2) * sx,
            (win.y + win.h / 2) * sy,
            formatOpeningLabel(win, windowOpeningHeight),
            { bg: 'rgba(8, 40, 24, 0.88)', border: 'rgba(0,255,136,0.6)', fg: '#bdffd9' }
        );
    });

    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth   = 2;
    ctx.fillStyle   = 'rgba(255,77,77,0.12)';
    detectedDoors.forEach(door => {
        ctx.fillRect  (door.x * sx, door.y * sy, door.w * sx, door.h * sy);
        ctx.strokeRect(door.x * sx, door.y * sy, door.w * sx, door.h * sy);
    });
    detectedDoors.forEach(door => {
        drawDimPill(
            ctx,
            (door.x + door.w / 2) * sx,
            (door.y + door.h / 2) * sy,
            formatOpeningLabel(door, doorOpeningHeight),
            { bg: 'rgba(48, 10, 14, 0.88)', border: 'rgba(255,77,77,0.6)', fg: '#ffd2d2' }
        );
    });

    ctx.strokeStyle = '#ffc14d';
    ctx.lineWidth   = 2;
    ctx.fillStyle   = 'rgba(255,193,77,0.10)';
    detectedDoorArches.forEach(arch => {
        ctx.fillRect  (arch.x * sx, arch.y * sy, arch.w * sx, arch.h * sy);
        ctx.strokeRect(arch.x * sx, arch.y * sy, arch.w * sx, arch.h * sy);
    });
    detectedDoorArches.forEach(arch => {
        drawDimPill(
            ctx,
            (arch.x + arch.w / 2) * sx,
            (arch.y + arch.h / 2) * sy,
            formatOpeningLabel(arch, doorOpeningHeight),
            { bg: 'rgba(52, 32, 10, 0.88)', border: 'rgba(255,193,77,0.6)', fg: '#ffe7b0' }
        );
    });
}

function drawWindowsOverlay() {
    if (!overlayCanvas || !previewImage.complete) return;
    const w = previewImage.clientWidth, h = previewImage.clientHeight;
    overlayCanvas.width  = w; overlayCanvas.style.width  = w + 'px';
    overlayCanvas.height = h; overlayCanvas.style.height = h + 'px';

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!detectedWindows.length && !detectedDoors.length && !detectedFurniture.length) return;

    const sx = w / previewImage.naturalWidth;
    const sy = h / previewImage.naturalHeight;

    drawDetectionsOnOverlay(ctx, sx, sy);
}

function drawRingPath(ctx, pts, sx, sy) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
        const x = p.x * sx, y = p.y * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.closePath();
}

function labelRingEdges(ctx, pts, sx, sy, opts) {
    if (!pts || pts.length < 2) return;
    opts = opts || {};
    const minLenM = opts.minLenM != null ? opts.minLenM : 0.25;
    const offset = opts.offsetPx != null ? opts.offsetPx : 12;
    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const dxPx = p2.x - p1.x;
        const dyPx = p2.y - p1.y;
        const lenPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
        if (lenPx < 1) continue;
        const lenM = lenPx * MANUAL_SCALE;
        if (lenM < minLenM) continue;

        const mxPx = (p1.x + p2.x) / 2;
        const myPx = (p1.y + p2.y) / 2;
        // Перпендикуляр к ребру в экранных координатах.
        const ex = dxPx * sx, ey = dyPx * sy;
        const el = Math.sqrt(ex * ex + ey * ey) || 1;
        const nx = -ey / el;
        const ny = ex / el;
        const lx = mxPx * sx + nx * offset;
        const ly = myPx * sy + ny * offset;

        drawDimPill(ctx, lx, ly, `${lenM.toFixed(2)} м`, {
            bg: opts.bg || 'rgba(16, 26, 56, 0.9)',
            border: opts.border || 'rgba(120, 170, 255, 0.7)',
            fg: opts.fg || '#dde9ff',
            fontSize: 10
        });
    }
}

function drawLegendBadge(ctx, lines, w) {
    ctx.save();
    ctx.font = 'bold 12px "Inter", system-ui, sans-serif';
    let maxTW = 0;
    for (const l of lines) {
        const tw = ctx.measureText(l).width;
        if (tw > maxTW) maxTW = tw;
    }
    const padX = 10, padY = 8, lineH = 16;
    const bw = maxTW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    const x = 12, y = 12;

    ctx.fillStyle = 'rgba(8, 12, 28, 0.9)';
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(x, y, bw, bh, 6);
        ctx.fill();
    } else {
        ctx.fillRect(x, y, bw, bh);
    }
    ctx.strokeStyle = 'rgba(120, 170, 255, 0.5)';
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.stroke();

    ctx.fillStyle = '#dde9ff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + i * lineH));
    ctx.restore();
}

function drawStitchPreviewOverlay() {
    if (!overlayCanvas || !previewImage.complete) return;
    const w = previewImage.clientWidth, h = previewImage.clientHeight;
    overlayCanvas.width  = w; overlayCanvas.style.width  = w + 'px';
    overlayCanvas.height = h; overlayCanvas.style.height = h + 'px';

    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const sx = w / previewImage.naturalWidth;
    const sy = h / previewImage.naturalHeight;

    // 1. Контуры тел стен из векторизации + длины рёбер.
    if (pendingWallRegions && pendingWallRegions.length) {
        ctx.lineWidth = 2;
        ctx.fillStyle   = 'rgba(79, 142, 255, 0.10)';
        ctx.strokeStyle = 'rgba(79, 142, 255, 0.95)';

        pendingWallRegions.forEach(region => {
            if (region.outer && region.outer.length >= 2) {
                drawRingPath(ctx, region.outer, sx, sy);
                ctx.fill();
                ctx.stroke();
            }
            // Внутренние контуры (дыры) — без заливки, более тонкой обводкой.
            (region.holes || []).forEach(hole => {
                if (hole.length < 2) return;
                drawRingPath(ctx, hole, sx, sy);
                ctx.save();
                ctx.strokeStyle = 'rgba(180, 210, 255, 0.7)';
                ctx.setLineDash([6, 4]);
                ctx.stroke();
                ctx.restore();
            });
        });

        // Подписываем длины рёбер только после рисования всех контуров.
        pendingWallRegions.forEach(region => {
            labelRingEdges(ctx, region.outer, sx, sy);
            (region.holes || []).forEach(hole => labelRingEdges(ctx, hole, sx, sy, {
                bg: 'rgba(40, 26, 8, 0.88)',
                border: 'rgba(255, 200, 120, 0.7)',
                fg: '#ffe2b8'
            }));
        });

        // Центральная подпись на каждой комнате (= hole): W×H bbox и площадь.
        pendingWallRegions.forEach(region => {
            (region.holes || []).forEach(hole => {
                if (!hole || hole.length < 3) return;
                const c = polygonCentroidXY(hole);
                const b = polygonBoundsXY(hole);
                const wM = b.w * MANUAL_SCALE;
                const hM = b.h * MANUAL_SCALE;
                const areaM2 = c.area * MANUAL_SCALE * MANUAL_SCALE;
                drawDimPill(
                    ctx,
                    c.x * sx,
                    c.y * sy,
                    `${wM.toFixed(2)} × ${hM.toFixed(2)} м · ${areaM2.toFixed(1)} м²`,
                    {
                        bg: 'rgba(16, 26, 56, 0.92)',
                        border: 'rgba(120, 170, 255, 0.85)',
                        fg: '#dde9ff'
                    }
                );
            });
        });
    }

    // 2. Окна / двери / арки поверх стен — с лейблами «span × height» в метрах.
    drawDetectionsOnOverlay(ctx, sx, sy);

    // 3. Бейдж с общими параметрами.
    const bounds = computeWallRegionsBoundsMeters(pendingWallRegions);
    const lines = [`Высота стен: ${WALL_HEIGHT.toFixed(2)} м`];
    if (bounds) {
        lines.push(`Габарит плана: ${bounds.w.toFixed(2)} × ${bounds.h.toFixed(2)} м`);
    }
    const winGeom = getWindowCutGeometry();
    const doorGeom = getDoorCutGeometry();
    const winSuffix = winGeom.openingHeight < WINDOW_HEIGHT - 1e-3 ? ` (ужато под стену с ${WINDOW_HEIGHT.toFixed(2)})` : '';
    const doorSuffix = doorGeom.openingHeight < DOOR_HEIGHT - 1e-3 ? ` (ужато под стену с ${DOOR_HEIGHT.toFixed(2)})` : '';
    lines.push(`Окна h = ${winGeom.openingHeight.toFixed(2)} м${winSuffix} (от пола ${winGeom.sill.toFixed(2)})`);
    lines.push(`Двери h = ${doorGeom.openingHeight.toFixed(2)} м${doorSuffix}`);
    drawLegendBadge(ctx, lines, w);
}

function clearOverlayCanvas() {
    if (overlayCanvas) {
        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
}

window.addEventListener('resize', () => {
    if (previewOverlay.style.display !== 'flex') return;
    if (previewMode === 'detections') drawWindowsOverlay();
    else if (previewMode === 'stitch') drawStitchPreviewOverlay();
});

async function loadImageForPreview(file) {
    currentPlanImage = await createImageBitmap(file);
    if (currentPlanObjectUrl) URL.revokeObjectURL(currentPlanObjectUrl);
    currentPlanObjectUrl = URL.createObjectURL(file);
    previewImage.src = currentPlanObjectUrl;
    previewImage.onload = () => {
        if (previewMode === 'detections') drawWindowsOverlay();
    };
    enterDetectionsPreviewMode();
}

// --------------------- РџРћРЎРўР РћР•РќРР• ---------------------
async function ensureOpenCvReady() {
    if (!window.openCvReady) {
        await new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                if (window.openCvReady)   resolve();
                else if (attempts++ > 100) reject(new Error('OpenCV.js не загрузился'));
                else setTimeout(check, 100);
            };
            check();
        });
    }
}

async function prepareWallsForApproval(img) {
    await ensureOpenCvReady();
    const mask = segmentWallsSimple(img);
    const result = vectorizeMaskOpenCV(mask, img.width, img.height);
    const wallRegions = Array.isArray(result) ? result : (result.wallRegions || []);
    const maskPreviewDataUrl = Array.isArray(result) ? null : result.maskPreviewDataUrl;
    console.log(`📐 Найдено полигонов (тел стен): ${wallRegions.length}`);
    return { wallRegions, maskPreviewDataUrl };
}

function buildWallsFromRegions(wallRegions) {
    if (wallRegions.length === 0) {
        alert('Не удалось обнаружить стены на изображении.');
        return;
    }
    // Snapshot для последующего save: без него восстановление сцены
    // потребовало бы переразбора фото плана через OpenCV.
    lastBuiltWallRegions = wallRegions;

    clearWalls();           // также чистит пол/потолок/лейблы
    clearWindowMarkers();
    clearDoorMarkers();

    wallRegions.forEach(region => {
        const shape = region.outer.map(p => new BABYLON.Vector3(p.x * MANUAL_SCALE, 0, p.y * MANUAL_SCALE));
        const holes = (region.holes || []).map(hole => hole.map(p => new BABYLON.Vector3(p.x * MANUAL_SCALE, 0, p.y * MANUAL_SCALE)));
        createWallFromPolygon(shape, holes);
    });

    const openingBlueprints = buildOpeningBlueprints();
    const cutMeshes = createOpeningCuttersAndMarkers(openingBlueprints);
    applyCuttersToWalls(cutMeshes);
    cutMeshes.forEach(m => m.dispose());

    // Невидимые pick-proxies в каждом окне — кликом по проёму открывается
    // мини-меню каталога окон. Делаем ПОСЛЕ CSG: позиции совпадают с
    // фактическими дырами в стенах.
    buildWindowOpeningSlots(openingBlueprints);

    // После всех CSG-операций — разбиваем каждую стену на покрасочные грани
    // (submeshes по плоскостным группам), чтобы клик по любой грани выделял
    // именно её и менял её цвет независимо от соседних граней.
    createdWalls.forEach(splitWallIntoPaintableFaces);

    // Кэшируем плоскости вертикальных граней — для snap'а напольной мебели.
    wallFacePlanes = collectWallFacePlanes();

    // Пол/потолок для каждой комнаты (= каждый hole в wallRegion). Сделаны
    // односторонними: снаружи здания — «прозрачные» (back-face culling срезает
    // обратную сторону), внутри комнаты — непрозрачные и закрывают вид наружу.
    buildFloorsAndCeilings(wallRegions);

    // Дверные проёмы: заполняем щель между полами соседних комнат, чтобы
    // переход выглядел как сплошной пол, а не как «дыра» в полу до земли.
    buildDoorFloorPatches(openingBlueprints);

    // Размерные лейблы (только площадь комнаты, лежат на полу, видны в 2D).
    buildDimensionLabelsFor(wallRegions, openingBlueprints);

    // Мебель с чертежа — после стен: ориентация берётся по wallFacePlanes.
    if (furnitureNeedsPlacement) placeDetectedFurniture();

    console.log(`✅ Создано стен: ${createdWalls.length}, окон: ${detectedWindows.length}, дверей: ${detectedDoors.length}`);
    if (createdWalls.length > 0) adjustCameraToWalls();
}

async function buildWallsFromImage(img) {
    const prep = await prepareWallsForApproval(img);
    buildWallsFromRegions(prep.wallRegions);
}

function clearWalls() {
    createdWalls.forEach(w => w.dispose());
    createdWalls = [];
    // Стены и привязанные к ним пол/потолок/лейблы — единая «сцена квартиры»:
    // при очистке стен убираем и их, иначе при повторном построении остаются
    // висящие в воздухе слэбы предыдущей геометрии.
    clearFloorsAndCeilings();
    clearDimensionLabels();
    clearWindowOpeningSlots();
    wallFacePlanes = [];
}

function clearWindowMarkers() {
    windowMarkers.forEach(m => m.dispose());
    windowMarkers = [];
}

// ─── WINDOW OPENING SLOTS ────────────────────────────────────────────────
// После CSG-вырезов в стенах остаются «дыры»: ничего pickable там нет.
// Мы прикрепляем к каждой дыре невидимый бокс-«слот», по клику на который
// открывается мини-меню каталога Windows — выбранный GLB подгоняется под
// габариты проёма и встаёт в плоскость стены.

// Выбираем направление wallNormal так, чтобы оно смотрело В комнату, а не
// наружу. Берём ось-кандидат (для горизонтальной стены — Z, для вертикальной
// — X) и определяем знак по ближайшему центру floor-меша: если центр пола
// лежит по +ось от проёма — нормаль остаётся положительной, иначе
// инвертируется. Без этого на стене, у которой комната «снизу» (отрицательное
// Z), окно вешалось бы лицом наружу, и пользователь видел бы изнутри его
// заднюю сторону.
function pickRoomFacingNormal(worldX, worldZ, axisCandidate) {
    let bestDist = Infinity;
    let bestProj = 0;
    floorMeshes.forEach(floor => {
        if (!floor || (floor.isDisposed && floor.isDisposed())) return;
        if (!floor.metadata || floor.metadata.kind !== 'room_floor') return;
        floor.computeWorldMatrix(true);
        const bb = floor.getBoundingInfo().boundingBox;
        const cx = bb.centerWorld.x;
        const cz = bb.centerWorld.z;
        const dx = cx - worldX;
        const dz = cz - worldZ;
        const dist2 = dx * dx + dz * dz;
        if (dist2 < bestDist) {
            bestDist = dist2;
            bestProj = dx * axisCandidate.x + dz * axisCandidate.z;
        }
    });
    if (bestDist === Infinity || bestProj === 0) return axisCandidate;
    const sign = bestProj > 0 ? 1 : -1;
    return { x: axisCandidate.x * sign, z: axisCandidate.z * sign };
}

function clearWindowOpeningSlots() {
    windowOpeningSlots.forEach(slot => {
        if (slot.pickProxy) {
            try { slot.pickProxy.dispose(); } catch (_) {}
        }
        // Установленные GLB-окна НЕ удаляем — они остаются на сцене как
        // обычные placedItems. Просто рвём ссылку на слот.
        if (slot.installedWindow?.metadata) {
            slot.installedWindow.metadata.openingSlot = null;
        }
    });
    windowOpeningSlots = [];
    activeWindowMenuSlot = null;
    hideWindowMenu();
}

function buildWindowOpeningSlots(openingBlueprints) {
    clearWindowOpeningSlots();
    if (!Array.isArray(openingBlueprints)) return;

    openingBlueprints
        .filter(bp => bp.openingType === 'window')
        .forEach((bp, i) => {
            const profile = getWindowProfile(bp.idx, detectedWindows[bp.idx] || { w: 1, h: 1 });
            const horizontal = !!profile.horizontal;
            // Стена горизонтальна на плане → её нормаль идёт по миро­вой Z.
            // Стена вертикальна → нормаль по X. Знак подбираем так, чтобы
            // нормаль смотрела В комнату — иначе окно встанет лицом наружу.
            const candidateNormal = horizontal ? { x: 0, z: 1 } : { x: 1, z: 0 };
            const wallNormal = pickRoomFacingNormal(bp.worldX, bp.worldZ, candidateNormal);
            // Реальный проём после CSG = размеры самого cutter'а (margin
            // уже включён). GLB-окно скейлим, чтобы заполнить дыру ровно.
            const fitWidth  = horizontal ? bp.cutter.width  : bp.cutter.depth;
            const fitDepth  = horizontal ? bp.cutter.depth  : bp.cutter.width;
            const fitHeight = bp.cutter.height;

            const slot = {
                idx: i,
                worldX: bp.worldX,
                worldZ: bp.worldZ,
                centerY: bp.cutter.centerY,
                fitWidth,
                fitHeight,
                fitDepth,
                wallNormal,
                horizontal,
                installedWindow: null,
                pickProxy: null
            };

            // Невидимый pickable-бокс ровно в форме проёма (axis-aligned,
            // т.к. стены сейчас всегда орто­гональны после детекции).
            const proxy = BABYLON.MeshBuilder.CreateBox(`windowOpeningSlot_${i}`, {
                width:  horizontal ? fitWidth  : fitDepth,
                height: fitHeight,
                depth:  horizontal ? fitDepth  : fitWidth
            }, scene);
            proxy.position = new BABYLON.Vector3(slot.worldX, slot.centerY, slot.worldZ);
            proxy.visibility = 0;
            proxy.isPickable = true;
            proxy.metadata = { isWindowOpeningSlot: true, slotIdx: i };
            slot.pickProxy = proxy;

            windowOpeningSlots.push(slot);
        });
}

function getWindowCatalogItems() {
    const items = [];
    document.querySelectorAll('.add-catalog-item').forEach(btn => {
        const slug = btn.dataset.slug || '';
        if (!slug.startsWith('windows-')) return;
        const thumb = btn.querySelector('.model-thumb');
        const thumbBg = thumb ? thumb.style.backgroundImage : '';
        items.push({
            glb: btn.dataset.glb || '',
            label: btn.dataset.label || '',
            slug,
            thumbBg
        });
    });
    return items;
}

function populateWindowMenu() {
    const list = document.querySelector('#window-menu .window-menu-list');
    if (!list) return;
    list.innerHTML = '';
    const items = getWindowCatalogItems();
    if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'window-menu-empty';
        empty.textContent = 'В каталоге нет моделей окон';
        list.appendChild(empty);
        return;
    }
    items.forEach(it => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'window-menu-item';
        btn.dataset.glb = it.glb;
        btn.dataset.label = it.label;
        btn.dataset.slug = it.slug;

        const thumb = document.createElement('span');
        thumb.className = 'window-menu-thumb';
        if (it.thumbBg) thumb.style.backgroundImage = it.thumbBg;
        else thumb.textContent = (it.label || '?').slice(0, 1).toUpperCase();
        btn.appendChild(thumb);

        const name = document.createElement('span');
        name.className = 'window-menu-name';
        name.textContent = it.label;
        btn.appendChild(name);

        list.appendChild(btn);
    });
}

function showWindowMenuAt(slot) {
    const menu = document.getElementById('window-menu');
    if (!menu) return;
    populateWindowMenu();
    activeWindowMenuSlot = slot;

    // Позиционируем меню по экранным координатам центра проёма.
    const eng = scene.getEngine();
    const viewport = camera.viewport.toGlobal(eng.getRenderWidth(), eng.getRenderHeight());
    const worldPos = new BABYLON.Vector3(slot.worldX, slot.centerY, slot.worldZ);
    const projected = BABYLON.Vector3.Project(
        worldPos,
        BABYLON.Matrix.Identity(),
        scene.getTransformMatrix(),
        viewport
    );
    // Сдвигаем чуть вправо-вверх, чтобы не накрывать сам проём.
    const margin = 16;
    let x = projected.x + margin;
    let y = projected.y - margin;
    // Чтобы меню не уезжало за пределы окна — после рендера измерим и зажмём.
    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top  = `${Math.max(margin, y)}px`;
    menu.classList.add('visible');

    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        const maxX = window.innerWidth  - rect.width  - margin;
        const maxY = window.innerHeight - rect.height - margin;
        if (rect.left > maxX) menu.style.left = `${Math.max(margin, maxX)}px`;
        if (rect.top  > maxY) menu.style.top  = `${Math.max(margin, maxY)}px`;
    });
}

function hideWindowMenu() {
    const menu = document.getElementById('window-menu');
    if (menu) menu.classList.remove('visible');
    activeWindowMenuSlot = null;
}

function installWindowInSlot(slot, glbUrl, label, slug) {
    if (!slot) return;
    // Если в этом слоте уже стоит окно — снимаем его (заменяем).
    if (slot.installedWindow) {
        const prev = slot.installedWindow;
        slot.installedWindow = null;
        if (prev.metadata) prev.metadata.openingSlot = null;
        const pi = placedItems.indexOf(prev);
        if (pi >= 0) placedItems.splice(pi, 1);
        // Cart hook — парный к cart:add, который придёт сразу следом
        // от нового окна. Без этого dispatch'а старое окно осталось бы
        // в корзине «фантомом».
        try {
            document.dispatchEvent(new CustomEvent('cart:remove', { detail: { handle: prev } }));
        } catch (_) {}
        try { prev.dispose(false, true); } catch (_) {}
    }

    const initialY = slot.centerY - slot.fitHeight / 2;
    loadGlbAndAddToScene({
        url: glbUrl,
        label,
        slug,
        mount: 'wall',
        wallNormal: slot.wallNormal,
        initialPosition: new BABYLON.Vector3(slot.worldX, 0, slot.worldZ),
        initialY,
        fitToOpening: {
            width:  slot.fitWidth,
            height: slot.fitHeight,
            depth:  slot.fitDepth
        },
        // 'center' — центр модели лежит на осевой плоскости стены.
        // Это и есть «находится в одной плоскости со стеной» в честном
        // смысле: рама симметрична относительно центра стены, не утоплена
        // и не выпирает в комнату. 'flush' для толстых стен (25 см и
        // больше) визуально воспринимается как «окно уехало вглубь
        // ниши» — потому что лицо рамы оказывается на осевой линии, а
        // не на поверхности стены, обращённой к комнате.
        forcedWallEmbed: 'center',
        onPlaced: (handle) => {
            slot.installedWindow = handle;
            handle.metadata.openingSlot = slot;
            // Пока окно установлено — клик в зону проёма должен выбирать
            // именно окно (через item-panel: удалить/повернуть), а не
            // открывать меню. Поэтому делаем pickProxy непикабельным до
            // удаления окна.
            if (slot.pickProxy) slot.pickProxy.isPickable = false;
            // Окно вставлено в проём — драг запрещаем. Геометрия рамы
            // подогнана под fitToOpening (ширина проёма, высота, глубина);
            // любой сдвиг разрушает совпадение и оставляет щели в стене.
            // Выбор / удаление / поворот через item-panel остаются.
            if (handle.behaviors) {
                handle.behaviors.forEach(b => {
                    if (b instanceof BABYLON.PointerDragBehavior) b.enabled = false;
                });
            }
        }
    });
    hideWindowMenu();
}

function clearDoorMarkers() {
    doorMarkers.forEach(m => m.dispose());
    doorMarkers = [];
}

function clearFloorsAndCeilings() {
    // Если перед ребилдом был выбран пол — сбрасываем выделение, чтобы
    // selectedFloorMesh не указывал на disposed-mesh и панель пола скрылась.
    if (selectedFloorMesh) deselectFloor();
    floorMeshes.forEach(m => {
        if (m.material) m.material.dispose();
        m.dispose();
    });
    ceilingMeshes.forEach(m => {
        // Shadow-only прокси сначала снимаем из списка кастеров —
        // иначе ShadowGenerator может удерживать ссылку на disposed-mesh.
        if (m._isShadowCasterProxy && typeof shadowGenerator !== 'undefined' && shadowGenerator) {
            try { shadowGenerator.removeShadowCaster(m); } catch (_) {}
        }
        if (m.material) m.material.dispose();
        m.dispose();
    });
    floorMeshes = [];
    ceilingMeshes = [];
}

function clearDimensionLabels() {
    dimensionLabels.forEach(label => {
        if (label.material) {
            if (label.material.diffuseTexture) label.material.diffuseTexture.dispose();
            label.material.dispose();
        }
        label.dispose();
    });
    dimensionLabels = [];
}

// ---- Один полигон пола/потолка ------------------------------------------
// Делаем плоскость односторонней (backFaceCulling=true) и ориентируем нормаль
// внутрь комнаты, чтобы снаружи смотрелось «сквозь» пол/потолок, а изнутри —
// поверхность была непрозрачной и закрывала вид наружу.
function buildRoomSlabsForHole(holePtsPx) {
    if (!Array.isArray(holePtsPx) || holePtsPx.length < 3) return;
    const earcutFn = (typeof earcut !== 'undefined') ? earcut : null;

    const shape = holePtsPx.map(p => new BABYLON.Vector3(
        p.x * MANUAL_SCALE, 0, p.y * MANUAL_SCALE
    ));

    // roomIndex — сквозной счётчик комнат в рамках одной сборки сцены.
    // Берём по количеству уже созданных полов комнат (door-patch-полы
    // помечаются metadata.kind='door_patch' и не считаются).
    const roomIndex = floorMeshes.filter(
        m => m.metadata && m.metadata.kind === 'room_floor'
    ).length;

    // Floor: нормаль вверх (видна сверху/изнутри). Снизу — culled.
    const floor = BABYLON.MeshBuilder.CreatePolygon(`room_floor_${roomIndex}`, {
        shape,
        sideOrientation: BABYLON.Mesh.FRONTSIDE
    }, scene, earcutFn);
    floor.position.y = 0.002;
    const floorMat = new BABYLON.StandardMaterial(`floorMat_${roomIndex}`, scene);
    floorMat.diffuseColor = FLOOR_BASE_COLOR.clone();
    floorMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    floorMat.backFaceCulling = true;
    floorMat.maxSimultaneousLights = 12;
    floor.material = floorMat;
    // Пол кликабелен — каждая комната выделяется и красится независимо.
    floor.isPickable = true;
    floor.receiveShadows = true;
    floor.metadata = { kind: 'room_floor', roomIndex, floorSlug: '' };
    floorMeshes.push(floor);

    // Ceiling: тот же контур, но BACKSIDE → нормаль вниз. Видим только снизу.
    const ceiling = BABYLON.MeshBuilder.CreatePolygon(`room_ceiling_${ceilingMeshes.length}`, {
        shape,
        sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene, earcutFn);
    ceiling.position.y = WALL_HEIGHT - 0.002;
    const ceilingMat = new BABYLON.StandardMaterial(`ceilingMat_${ceilingMeshes.length}`, scene);
    ceilingMat.diffuseColor = new BABYLON.Color3(0.93, 0.94, 0.97);
    ceilingMat.specularColor = new BABYLON.Color3(0.02, 0.02, 0.02);
    ceilingMat.backFaceCulling = true;
    ceilingMat.maxSimultaneousLights = 12;
    ceiling.material = ceilingMat;
    ceiling.isPickable = false;
    ceilingMeshes.push(ceiling);

    // Shadow-only прокси для потолка. Видимый потолок — BACKSIDE (нормаль
    // вниз), и shadow generator при рендере глубины с позиции солнца
    // отрезает «back face» → потолок прозрачен для света, и солнце светит
    // прямо на пол комнаты. Делаем парную плоскость FRONTSIDE (нормаль
    // ВВЕРХ — лицом к dirLight), которую ни одна камера не видит
    // (layerMask = 0), и добавляем её в каскад теней. Свет упирается в неё,
    // пол комнаты получает естественную «комнатную» затенённость.
    if (typeof shadowGenerator !== 'undefined' && shadowGenerator) {
        const shadowCeiling = BABYLON.MeshBuilder.CreatePolygon(
            `room_ceiling_shadow_${ceilingMeshes.length}`,
            { shape, sideOrientation: BABYLON.Mesh.FRONTSIDE },
            scene,
            earcutFn
        );
        shadowCeiling.position.y = WALL_HEIGHT - 0.001;
        shadowCeiling.isPickable = false;
        shadowCeiling.layerMask = 0; // не виден ни одной камере
        shadowCeiling._isShadowCasterProxy = true;
        const shadowMat = new BABYLON.StandardMaterial(
            `ceilingShadowMat_${ceilingMeshes.length}`,
            scene
        );
        shadowMat.disableLighting = true;
        shadowMat.backFaceCulling = true; // лицо смотрит вверх, к солнцу — оно и попадает в shadow map
        shadowCeiling.material = shadowMat;
        shadowGenerator.addShadowCaster(shadowCeiling);
        // Кладём в общий список — очистится в clearFloorsAndCeilings.
        ceilingMeshes.push(shadowCeiling);
    }
}

function buildFloorsAndCeilings(wallRegions) {
    clearFloorsAndCeilings();
    wallRegions.forEach(region => {
        (region.holes || []).forEach(hole => buildRoomSlabsForHole(hole));
    });
}

// Дверной проём CSG-вырезает стену от пола до перемычки, и между
// «полом комнаты A» и «полом комнаты B» остаётся щель шириной в толщину
// стены — там просвечивает земля/сетка. Перекрываем эту щель плоской
// заплаткой по футпринту cutter'а двери: ширина проёма × толщина стены.
//
// КЛЮЧЕВОЕ: cutter специально шире фактической стены на DOOR_CUT_MARGIN
// (по 10 см с каждой стороны нормальной оси) — это нужно CSG'шке, чтобы
// гарантированно прорезать всю толщу. Но если делать заплатку по полному
// cutter'у, эти лишние 20 см лезут уже за плоскость стены, на пол сосед-
// них комнат, и дают z-fighting + блики. Поэтому здесь по «толщинной» оси
// УСЕКАЕМ заплатку обратно к реальной толщине стены (= cutter dim −
// DOOR_CUT_MARGIN). По span-оси оставляем cutter.width как есть: 10-см
// «уши» там попадают уже под массив стены и прикрыты wall-mesh'ем сверху.
function buildDoorFloorPatch(blueprint) {
    if (!blueprint || blueprint.openingType !== 'door') return;
    const cw = blueprint.cutter.width;
    const cd = blueprint.cutter.depth;
    if (!(cw > 0) || !(cd > 0)) return;

    // Длинная ось cutter'а — направление вдоль стены (door span),
    // короткая — нормаль к стене (= толщина + DOOR_CUT_MARGIN).
    const isXLong = cw >= cd;
    const patchW = isXLong ? cw : Math.max(0.04, cw - DOOR_CUT_MARGIN);
    const patchD = isXLong ? Math.max(0.04, cd - DOOR_CUT_MARGIN) : cd;

    const patch = BABYLON.MeshBuilder.CreateGround(`door_floor_${floorMeshes.length}`, {
        width: patchW,
        height: patchD,
        subdivisions: 1
    }, scene);
    // Y на 1 мм НИЖЕ комнатного пола (0.002 м). Если из-за float-погреш-
    // ности заплатка и room_floor где-то перекрылись на доли мм — z-test
    // отдаёт победу комнатному полу (он пользователем перекрашен/затекст-
    // урирован, заплатка же всегда базовая FLOOR_BASE_COLOR). Заплатка
    // светится только там, где room_floor отсутствует — то есть строго в
    // проёме двери.
    patch.position = new BABYLON.Vector3(blueprint.worldX, 0.001, blueprint.worldZ);

    const mat = new BABYLON.StandardMaterial(`doorFloorMat_${floorMeshes.length}`, scene);
    mat.diffuseColor = FLOOR_BASE_COLOR.clone();
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    mat.backFaceCulling = true;
    mat.maxSimultaneousLights = 12;
    patch.material = mat;
    patch.isPickable = false;
    patch.receiveShadows = true;
    patch.metadata = { kind: 'door_patch' };

    floorMeshes.push(patch);
}

function buildDoorFloorPatches(openingBlueprints) {
    (openingBlueprints || []).forEach(bp => {
        if (bp.openingType === 'door') buildDoorFloorPatch(bp);
    });
}

function setDimensionLabelsVisible(visible) {
    dimensionLabels.forEach(l => l.setEnabled(!!visible));
}

// ---- 3D-лейбл (DynamicTexture на плоскости, лежит горизонтально) --------
// Стиль Planner5D: плоский текст поверх пола, читаемый только при взгляде
// сверху. В 3D-виде лейблы выключаются полностью (setEnabled(false)).
function createLabel3D(text, position, opts = {}) {
    const padX = 24, padY = 16;
    const fontSize = opts.fontSize || 56;
    const fontFamily = 'bold ' + fontSize + 'px "Inter", system-ui, sans-serif';
    // Сначала меряем текст вспомогательным холстом, чтобы выставить правильный
    // размер DynamicTexture без растяжения/обрезки.
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = fontFamily;
    const measured = Math.ceil(probe.measureText(text).width);
    const texWidth = Math.max(192, measured + padX * 2);
    const texHeight = Math.max(96, fontSize + padY * 2);

    const dt = new BABYLON.DynamicTexture(
        `labelDT_${dimensionLabels.length}`,
        { width: texWidth, height: texHeight },
        scene,
        false
    );
    dt.hasAlpha = true;
    const ctx = dt.getContext();
    ctx.clearRect(0, 0, texWidth, texHeight);

    // Pill background
    const r = Math.min(texHeight / 2 - 4, 22);
    const x = 4, y = 4, w = texWidth - 8, h = texHeight - 8;
    ctx.fillStyle = opts.bg || 'rgba(10, 14, 26, 0.9)';
    ctx.strokeStyle = opts.border || 'rgba(120, 170, 255, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    ctx.font = fontFamily;
    ctx.fillStyle = opts.fg || '#eef2ff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, texWidth / 2, texHeight / 2);
    dt.update();

    // Плоскость в мировых метрах. Подбираем размер по соотношению текстуры,
    // чтобы текст не «плыл». Базовая высота лейбла = opts.heightM.
    const heightM = opts.heightM || 0.6;
    const widthM = heightM * (texWidth / texHeight);
    const plane = BABYLON.MeshBuilder.CreatePlane(
        `label_${dimensionLabels.length}`,
        { width: widthM, height: heightM, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
        scene
    );
    plane.position = position.clone();
    // Кладём горизонтально на пол (как в Planner5D), без биллборда — лейбл
    // имеет смысл только в режиме «вид сверху».
    plane.rotation.x = Math.PI / 2;
    plane.isPickable = false;
    plane.renderingGroupId = 1; // поверх пола, чтобы pol-z-fighting'а не было
    plane.setEnabled(isTopDown2D);

    const mat = new BABYLON.StandardMaterial(`labelMat_${dimensionLabels.length}`, scene);
    mat.diffuseTexture = dt;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    plane.material = mat;

    plane._isDimensionLabel = true; // флаг для фильтрации при GLB-экспорте
    dimensionLabels.push(plane);
    return plane;
}

// Утилиты для геометрии в XZ-плоскости (точки уже в пикселях исходника).
function polygonCentroidXY(pts) {
    let cx = 0, cy = 0, area = 0;
    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const cross = p1.x * p2.y - p2.x * p1.y;
        area += cross;
        cx += (p1.x + p2.x) * cross;
        cy += (p1.y + p2.y) * cross;
    }
    area *= 0.5;
    if (Math.abs(area) < 1e-9) {
        // Дегенеративный полигон — возвращаем простое среднее.
        let sx = 0, sy = 0;
        pts.forEach(p => { sx += p.x; sy += p.y; });
        return { x: sx / pts.length, y: sy / pts.length, area: 0 };
    }
    return { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area) };
}

function polygonBoundsXY(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function buildDimensionLabelsFor(wallRegions, _openingBlueprints) {
    clearDimensionLabels();

    // Один лейбл на комнату — только площадь, без размеров стен и проёмов.
    // Лежит горизонтально поверх пола и показывается лишь в 2D-режиме.
    wallRegions.forEach(region => {
        (region.holes || []).forEach(hole => {
            if (!hole || hole.length < 3) return;
            const c = polygonCentroidXY(hole);
            const areaM2 = c.area * MANUAL_SCALE * MANUAL_SCALE;
            if (areaM2 < 0.05) return;

            // Размер лейбла масштабируем под комнату, чтобы маленькие
            // санузлы не были перекрыты большим текстом.
            const b = polygonBoundsXY(hole);
            const minSideM = Math.min(b.w, b.h) * MANUAL_SCALE;
            const heightM = Math.max(0.35, Math.min(1.1, minSideM * 0.22));

            createLabel3D(`${areaM2.toFixed(2)} м²`, new BABYLON.Vector3(
                c.x * MANUAL_SCALE,
                0.012,  // чуть выше пола, чтобы не было z-fighting
                c.y * MANUAL_SCALE
            ), {
                bg: 'rgba(16, 26, 56, 0.85)',
                border: 'rgba(120, 170, 255, 0.85)',
                fg: '#eef2ff',
                heightM
            });
        });
    });
}

function createWallFromPolygon(vertices, holes = []) {
    if (vertices.length < 3) return;

    const signedAreaXZ = (loop) => {
        let s = 0;
        for (let i = 0; i < loop.length; i++) {
            const p1 = loop[i];
            const p2 = loop[(i + 1) % loop.length];
            s += (p1.x * p2.z) - (p2.x * p1.z);
        }
        return 0.5 * s;
    };
    const normalizeWindingXZ = (loop, wantCCW) => {
        const copy = loop.slice();
        if (copy.length < 3) return copy;
        const isCCW = signedAreaXZ(copy) > 0;
        if (isCCW !== wantCCW) copy.reverse();
        return copy;
    };
    const sanitizeLoopXZ = (loop) => {
        const cleaned = [];
        const eps = 1e-8;
        for (let i = 0; i < loop.length; i++) {
            const p = loop[i];
            const prev = cleaned[cleaned.length - 1];
            if (!prev) {
                cleaned.push(p);
                continue;
            }
            const dx = p.x - prev.x;
            const dz = p.z - prev.z;
            if ((dx * dx + dz * dz) > eps) cleaned.push(p);
        }
        if (cleaned.length > 2) {
            const first = cleaned[0];
            const last = cleaned[cleaned.length - 1];
            const dx = first.x - last.x;
            const dz = first.z - last.z;
            if ((dx * dx + dz * dz) <= eps) cleaned.pop();
        }
        return cleaned;
    };

    const cleanedOuter = sanitizeLoopXZ(vertices);
    if (cleanedOuter.length < 3) return;

    // Стену собираем НЕ через ExtrudePolygon(shape, holes): такой mesh у Babylon
    // выходит CSG-несовместимым — у боковых стенок внешнего контура и hole-контуров
    // расходится геометрический винтинг треугольников относительно ожиданий
    // BABYLON.CSG.FromMesh (он строит плоскости через Plane.fromPoints по позициям,
    // explicit-нормали не используются). В результате при ЛЮБОМ выборе винтинга
    // (CW outer + CCW holes / CCW outer + CW holes) одна из семей граней оказывается
    // «вывернутой», и subtract оставляет coplanar-плёнку, запаивающую соответствующую
    // сторону стены (outer-грань периметра в одном случае, hole-грани во втором).
    //
    // Поэтому собираем стену через CSG из ЧИСТЫХ ПРИЗМ без дыр:
    //   envelope = ExtrudePolygon(outer)          — сплошная призма по периметру
    //   roomᵢ    = ExtrudePolygon(holeᵢ)          — сплошная призма по контуру комнаты
    //   wall     = envelope − ⋃ roomᵢ              — CSG-разность
    //
    // Каждая призма — обычный закрытый solid из ОДНОГО CCW-контура без holes,
    // у которого винтинг согласован. У Babylon CSG нет шанса увидеть «инвертированный»
    // mesh, и subtract'ы (как комнат, так и проёмов) работают одинаково корректно
    // по обе стороны любой стены — и периметра, и межкомнатной.
    const outerShape = normalizeWindingXZ(cleanedOuter, true); // CCW для нормальной призмы
    const holeShapes = holes
        .map(h => sanitizeLoopXZ(h))
        .filter(h => h.length >= 3)
        .map(h => normalizeWindingXZ(h, true)); // CCW тоже — собираем из них solid'ы

    const buildPrism = (name, shape, extraHeight = 0, yCenterOffset = 0) => {
        const mesh = BABYLON.MeshBuilder.ExtrudePolygon(name, {
            shape,
            depth: WALL_HEIGHT + extraHeight,
            updatable: false
        }, scene);
        // ExtrudePolygon extrude'ит вниз; поднимаем так, чтобы низ был в y=0,
        // верх — в y=WALL_HEIGHT (для room'ов добавляем небольшой запас по Y,
        // чтобы CSG не упирался в копланарные cap'ы envelope при subtract).
        mesh.position.y = WALL_HEIGHT + extraHeight / 2 + yCenterOffset;
        mesh.computeWorldMatrix(true);
        return mesh;
    };

    const envelopeMesh = buildPrism("wall_envelope_tmp", outerShape, 0, 0);

    const roomMeshes = holeShapes.map((shape, i) =>
        // Чуть выше envelope (на 1м с каждой стороны), чтобы CSG-subtract не
        // создавал артефактов из копланарных top/bottom cap'ов.
        buildPrism(`wall_room_tmp_${i}`, shape, 2.0, 0)
    );

    let resultCsg = BABYLON.CSG.FromMesh(envelopeMesh);
    for (const roomMesh of roomMeshes) {
        resultCsg = resultCsg.subtract(BABYLON.CSG.FromMesh(roomMesh));
    }

    const mat = new BABYLON.StandardMaterial("wallMat", scene);
    mat.diffuseColor     = new BABYLON.Color3(0.92, 0.92, 0.95);
    mat.specularColor    = new BABYLON.Color3(0.12, 0.12, 0.15);
    mat.backFaceCulling  = false;
    mat.twoSidedLighting = true;
    // 3 глобальных лайта + до 6 лампочек на люстру (и 6+6 при двух) — дефолтных 4 не хватает.
    mat.maxSimultaneousLights = 12;

    const wall = resultCsg.toMesh("wall", mat, scene, false);

    // CSG.toMesh нормали от boolean-а оставляет «как получилось»; пересчитаем
    // их из позиций, чтобы освещение было адекватным после буля.
    const vd = BABYLON.VertexData.ExtractFromMesh(wall);
    if (vd?.positions && vd?.indices) {
        const normals = [];
        BABYLON.VertexData.ComputeNormals(vd.positions, vd.indices, normals);
        vd.normals = normals;
        vd.applyToMesh(wall);
    }
    wall.refreshBoundingInfo();

    envelopeMesh.dispose();
    roomMeshes.forEach(r => r.dispose());

    shadowGenerator.addShadowCaster(wall);
    wall.receiveShadows = true;

    createdWalls.push(wall);
    return wall;
}

// Геометрия выреза окна: sill (расстояние от пола) держим неизменным,
// высоту самого проёма ужимаем так, чтобы между верхом окна и потолком
// оставалась перемычка ≥ WINDOW_MIN_LINTEL_HEIGHT, а cutter не вылезал
// за пределы стены ни сверху, ни снизу. Возвращаем и эффективную высоту
// проёма (для подписей), и параметры самого режущего бруска.
function getWindowCutGeometry() {
    const sill = Math.max(0, Math.min(WINDOW_SILL_HEIGHT, Math.max(0, WALL_HEIGHT - WINDOW_MIN_OPENING_HEIGHT - WINDOW_MIN_LINTEL_HEIGHT)));
    const maxOpeningByWall = Math.max(WINDOW_MIN_OPENING_HEIGHT, WALL_HEIGHT - sill - WINDOW_MIN_LINTEL_HEIGHT);
    const openingHeight = Math.min(WINDOW_HEIGHT, maxOpeningByWall);

    // Запас CSG-margin раздаём симметрично, но не даём проколоть пол/потолок.
    const halfMargin = WINDOW_CUT_MARGIN / 2;
    const bottomRoom = sill;
    const topRoom = Math.max(0, WALL_HEIGHT - (sill + openingHeight));
    const marginBottom = Math.min(halfMargin, bottomRoom);
    const marginTop = Math.min(halfMargin, topRoom);
    const cutHeight = openingHeight + marginBottom + marginTop;
    const cutCenterY = (sill - marginBottom) + cutHeight / 2;
    return { sill, openingHeight, cutHeight, cutCenterY };
}

// Геометрия выреза двери: низ — пол (y=0), верх — не выше
// WALL_HEIGHT − DOOR_MIN_LINTEL_HEIGHT. CSG-margin сверху ужимается
// под доступную перемычку; снизу margin не нужен — стена начинается с y=0.
function getDoorCutGeometry() {
    const maxOpeningByWall = Math.max(DOOR_MIN_OPENING_HEIGHT, WALL_HEIGHT - DOOR_MIN_LINTEL_HEIGHT);
    const openingHeight = Math.min(DOOR_HEIGHT, maxOpeningByWall);

    const topRoom = Math.max(0, WALL_HEIGHT - openingHeight);
    const marginTop = Math.min(DOOR_CUT_MARGIN, topRoom);
    const cutHeight = openingHeight + marginTop;
    const cutCenterY = cutHeight / 2;
    return { openingHeight, cutHeight, cutCenterY };
}

function getRepresentativeWallThicknessPx(fallbackPx = 8) {
    const fromDoors = detectedDoorProfiles
        .map(p => p?.thicknessPx)
        .filter(v => Number.isFinite(v) && v > 0);
    if (fromDoors.length) return median(fromDoors);

    const fromWindows = detectedWindowProfiles
        .map(p => p?.thicknessPx)
        .filter(v => Number.isFinite(v) && v > 0);
    if (fromWindows.length) return median(fromWindows);

    return Math.max(2, fallbackPx);
}

function buildOpeningBlueprints() {
    const blueprints = [];

    const windowGeom = getWindowCutGeometry();
    detectedWindows.forEach((win, idx) => {
        const profile = getWindowProfile(idx, win);
        const worldX = (win.x + win.w / 2) * MANUAL_SCALE;
        const worldZ = (win.y + win.h / 2) * MANUAL_SCALE;
        const span = Math.max(0.05, profile.spanPx * MANUAL_SCALE);
        const shortPx = Math.max(2, Math.min(win.w, win.h));
        const refWallPx = getRepresentativeWallThicknessPx(shortPx);
        const measuredPx = Math.max(2, profile.thicknessPx || shortPx);
        const effectiveThicknessPx = Math.max(
            shortPx * 0.35,
            Math.min(measuredPx, refWallPx * 1.08)
        );
        const thickness = Math.max(0.05, effectiveThicknessPx * MANUAL_SCALE * WINDOW_CUT_THROUGH_FACTOR);
        const width = profile.horizontal ? (span + WINDOW_CUT_MARGIN) : (thickness + WINDOW_CUT_MARGIN);
        const depth = profile.horizontal ? (thickness + WINDOW_CUT_MARGIN) : (span + WINDOW_CUT_MARGIN);

        const markerCenterY = windowGeom.sill + windowGeom.openingHeight / 2;
        blueprints.push({
            openingType: 'window',
            idx,
            worldX,
            worldZ,
            openingHeight: windowGeom.openingHeight,
            cutter: {
                width,
                height: windowGeom.cutHeight,
                depth,
                centerY: windowGeom.cutCenterY
            },
            marker: {
                width: Math.max(win.w * MANUAL_SCALE, 0.06),
                height: windowGeom.openingHeight,
                depth: Math.max(win.h * MANUAL_SCALE, 0.06),
                centerY: markerCenterY
            }
        });
    });

    const doorGeom = getDoorCutGeometry();
    const markerThickness = 0.08;
    detectedDoors.forEach((door, idx) => {
        const profile = getDoorProfile(idx, door);
        const worldX = (door.x + door.w / 2) * MANUAL_SCALE;
        const worldZ = (door.y + door.h / 2) * MANUAL_SCALE;
        const span = Math.max(0.05, profile.spanPx * MANUAL_SCALE);
        const shortPx = Math.max(2, Math.min(door.w, door.h));
        const refWallPx = getRepresentativeWallThicknessPx(shortPx);
        const measuredPx = Math.max(2, profile.thicknessPx || shortPx);
        const effectiveThicknessPx = Math.max(
            shortPx * 0.45,
            Math.min(measuredPx, refWallPx * 1.15)
        );
        const thickness = Math.max(0.03, effectiveThicknessPx * MANUAL_SCALE);
        const width = profile.horizontal ? (span + DOOR_CUT_MARGIN) : (thickness + DOOR_CUT_MARGIN);
        const depth = profile.horizontal ? (thickness + DOOR_CUT_MARGIN) : (span + DOOR_CUT_MARGIN);

        blueprints.push({
            openingType: 'door',
            idx,
            worldX,
            worldZ,
            openingHeight: doorGeom.openingHeight,
            cutter: {
                width,
                height: doorGeom.cutHeight,
                depth,
                centerY: doorGeom.cutCenterY
            },
            marker: {
                width: Math.max(door.w * MANUAL_SCALE, markerThickness),
                height: doorGeom.openingHeight,
                depth: Math.max(door.h * MANUAL_SCALE, markerThickness),
                centerY: doorGeom.openingHeight / 2
            }
        });
    });

    return blueprints;
}

function createOpeningCutterMesh(blueprint) {
    // ВАЖНО: cutter — solid для BABYLON.CSG, и обязан быть ЗАМКНУТЫМ
    // одностенным кубом с нормалями строго наружу (FRONTSIDE).
    // Любой DOUBLESIDE/BACKSIDE дублирует грани с противоположными нормалями,
    // BSP CSG.js перестаёт однозначно классифицировать "внутри/снаружи" на этих
    // плоскостях и оставляет коплоскостные "плёнки" в зонах, где cutter выходит
    // за объём стены — то есть на внешнем периметре квартиры. Внутри стены
    // (межкомнатные проёмы) эти плёнки гасятся, потому что cutter полностью
    // погружён в массив. Поэтому именно снаружи появляются "выпирания",
    // запаивающие выходы. Используем стандартный FRONTSIDE.
    const box = BABYLON.MeshBuilder.CreateBox(`openingCut_${blueprint.openingType}_${blueprint.idx}`, {
        width: blueprint.cutter.width,
        height: blueprint.cutter.height,
        depth: blueprint.cutter.depth,
        sideOrientation: BABYLON.Mesh.FRONTSIDE
    }, scene);

    box.position = new BABYLON.Vector3(
        blueprint.worldX,
        blueprint.cutter.centerY,
        blueprint.worldZ
    );
    box.isVisible = false;
    box.isPickable = false;
    box.metadata = { openingType: blueprint.openingType, csgOp: 'subtract' };
    return box;
}

function createOpeningMarkerMesh(blueprint) {
    if (!blueprint.marker) return null;

    const marker = BABYLON.MeshBuilder.CreateBox(`openingMarker_${blueprint.openingType}_${blueprint.idx}`, {
        width: blueprint.marker.width,
        height: blueprint.marker.height,
        depth: blueprint.marker.depth,
        sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);

    marker.position = new BABYLON.Vector3(
        blueprint.worldX,
        blueprint.marker.centerY,
        blueprint.worldZ
    );

    const mat = new BABYLON.StandardMaterial(`openingMarkerMat_${blueprint.openingType}_${blueprint.idx}`, scene);
    if (blueprint.openingType === 'door') {
        mat.diffuseColor = new BABYLON.Color3(1.0, 0.25, 0.25);
        mat.emissiveColor = new BABYLON.Color3(0.25, 0.03, 0.03);
        mat.alpha = 0.35;
    } else {
        mat.diffuseColor = new BABYLON.Color3(0.25, 0.55, 1.0);
        mat.emissiveColor = new BABYLON.Color3(0.03, 0.08, 0.25);
        mat.alpha = 0.22;
    }
    marker.material = mat;
    marker.isPickable = false;
    return marker;
}

function createOpeningCuttersAndMarkers(openingBlueprints) {
    const cutters = [];

    openingBlueprints.forEach((blueprint) => {
        const cutter = createOpeningCutterMesh(blueprint);
        cutters.push(cutter);
        // Маркеры окон/дверей убраны: проёмы видны напрямую через CSG-вырез.
    });

    return cutters;
}

function applyCuttersToWalls(cutterMeshes) {
    if (!cutterMeshes.length || typeof BABYLON.CSG === 'undefined') return;

    const newWalls = [];
    const centerMargin = 0.08;

    createdWalls.forEach((wall) => {
        wall.computeWorldMatrix(true);
        const wallBB = wall.getBoundingInfo().boundingBox;
        const relevantCutters = cutterMeshes.filter((cutter) => {
            cutter.computeWorldMatrix(true);
            const cutBB = cutter.getBoundingInfo().boundingBox;
            if (!BABYLON.BoundingBox.Intersects(wallBB, cutBB)) return false;
            const c = cutBB.centerWorld;
            return (
                c.x >= (wallBB.minimumWorld.x - centerMargin) &&
                c.x <= (wallBB.maximumWorld.x + centerMargin) &&
                c.z >= (wallBB.minimumWorld.z - centerMargin) &&
                c.z <= (wallBB.maximumWorld.z + centerMargin)
            );
        });

        if (!relevantCutters.length) {
            newWalls.push(wall);
            return;
        }

        const wallBaseCsg = BABYLON.CSG.FromMesh(wall);
        let cuttersUnionCsg = null;
        relevantCutters.forEach((cutter) => {
            const cutterCsg = BABYLON.CSG.FromMesh(cutter);
            cuttersUnionCsg = cuttersUnionCsg ? cuttersUnionCsg.union(cutterCsg) : cutterCsg;
        });

        // Subtract all openings as one solid.
        const cutCsg = cuttersUnionCsg ? wallBaseCsg.subtract(cuttersUnionCsg) : wallBaseCsg;
        let newMesh = cutCsg.toMesh(`${wall.name}_cut`, wall.material, scene, false);
        newMesh.refreshBoundingInfo();

        // If boolean produced geometry outside of the original wall envelope,
        // clamp it back to the wall volume to suppress perimeter "wrapping" artifacts.
        const cutBB = newMesh.getBoundingInfo().boundingBox;
        const clampEps = 0.03;
        const exceedsEnvelope =
            cutBB.minimumWorld.x < (wallBB.minimumWorld.x - clampEps) ||
            cutBB.minimumWorld.y < (wallBB.minimumWorld.y - clampEps) ||
            cutBB.minimumWorld.z < (wallBB.minimumWorld.z - clampEps) ||
            cutBB.maximumWorld.x > (wallBB.maximumWorld.x + clampEps) ||
            cutBB.maximumWorld.y > (wallBB.maximumWorld.y + clampEps) ||
            cutBB.maximumWorld.z > (wallBB.maximumWorld.z + clampEps);

        if (exceedsEnvelope) {
            newMesh.dispose();
            const clampedCsg = cutCsg.intersect(wallBaseCsg);
            newMesh = clampedCsg.toMesh(`${wall.name}_cut`, wall.material, scene, false);
        }
        newMesh.receiveShadows = true;

        if (newMesh.material) {
            newMesh.material.backFaceCulling = false;
            newMesh.material.twoSidedLighting = true;
        }

        const vd = BABYLON.VertexData.ExtractFromMesh(newMesh);
        if (vd?.positions && vd?.indices) {
            const normals = [];
            BABYLON.VertexData.ComputeNormals(vd.positions, vd.indices, normals);
            vd.normals = normals;
            vd.applyToMesh(newMesh);
        }

        newMesh.refreshBoundingInfo();
        shadowGenerator.addShadowCaster(newMesh);
        wall.dispose();
        newWalls.push(newMesh);
    });

    createdWalls = newWalls;
}

// --------------------- ИНТЕРАКТИВНАЯ ПОКРАСКА СТЕН ---------------------
//
// После всех CSG-операций wall-mesh — это один цельный солид с десятками
// треугольников разной ориентации. Чтобы пользователь мог красить КАЖДУЮ
// грань стены отдельно, разбиваем mesh на submeshes по «плоскостным
// группам»: треугольники с одинаковой геометрической плоскостью (нормаль
// + смещение) — это одна грань. На каждый submesh вешаем свой
// StandardMaterial внутри MultiMaterial. Клик по любой грани → находим
// faceId → находим submesh, в индексный диапазон которого этот faceId
// попадает → меняем цвет именно этого sub-материала.

const WALL_BASE_COLOR = new BABYLON.Color3(0.92, 0.92, 0.95);
const WALL_HIGHLIGHT_EMISSIVE = new BABYLON.Color3(0.06, 0.10, 0.18);
// Базовый цвет пола (использовался ранее как литерал в buildRoomSlabsForHole /
// buildDoorFloorPatch). Вынесли в константу, чтобы единым источником
// определять «исходный» цвет для сброса и сравнений.
const FLOOR_BASE_COLOR = new BABYLON.Color3(0.72, 0.62, 0.48);
// Одна «плитка» текстуры пола = N м × N м. Берём чуть больше, чем у стены,
// чтобы рисунок паркета/плитки не выглядел слишком мелким.
const FLOOR_TILE_METERS = 1.5;

let selectedWallMesh = null;
let selectedSubMeshIndex = -1;
let selectedOriginalEmissive = null;

let selectedFloorMesh = null;
let selectedFloorOriginalEmissive = null;

function splitWallIntoPaintableFaces(wall) {
    const vd = BABYLON.VertexData.ExtractFromMesh(wall);
    if (!vd?.positions || !vd?.indices) return 0;

    const positions = vd.positions;
    const oldIndices = vd.indices;
    const triCount = (oldIndices.length / 3) | 0;
    if (triCount === 0) return 0;

    // Plane signature на треугольник: квантованная нормаль + квантованный
    // offset. Квантование грубое (нормаль до 0.02, offset до 0.1) — этого
    // достаточно, чтобы все триангулированные кусочки одной грани
    // (например, северная внешняя стена) попали в одну группу, и при этом
    // разные грани (та же стена с другой стороны, верх/низ, верхушка
    // оконного выреза и т.п.) — в разные.
    const sigs = new Array(triCount);
    for (let t = 0; t < triCount; t++) {
        const i1 = oldIndices[t * 3];
        const i2 = oldIndices[t * 3 + 1];
        const i3 = oldIndices[t * 3 + 2];
        const v1x = positions[i1 * 3], v1y = positions[i1 * 3 + 1], v1z = positions[i1 * 3 + 2];
        const v2x = positions[i2 * 3], v2y = positions[i2 * 3 + 1], v2z = positions[i2 * 3 + 2];
        const v3x = positions[i3 * 3], v3y = positions[i3 * 3 + 1], v3z = positions[i3 * 3 + 2];
        const e1x = v2x - v1x, e1y = v2y - v1y, e1z = v2z - v1z;
        const e2x = v3x - v1x, e2y = v3y - v1y, e2z = v3z - v1z;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const nlen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nlen; ny /= nlen; nz /= nlen;
        const d = nx * v1x + ny * v1y + nz * v1z;
        const qN = (v) => Math.round(v * 50) / 50;     // 0.02
        const qD = (v) => Math.round(v * 10) / 10;     // 0.1
        sigs[t] = `${qN(nx)},${qN(ny)},${qN(nz)}|${qD(d)}`;
    }

    // Группируем треугольники по signature
    const groups = new Map();
    for (let t = 0; t < triCount; t++) {
        const s = sigs[t];
        let arr = groups.get(s);
        if (!arr) { arr = []; groups.set(s, arr); }
        arr.push(t);
    }

    // Внутри каждой плоскостной группы дополнительно разделяем по
    // КОМПОНЕНТАМ СВЯЗНОСТИ. Критерий смежности — общая ВЕРШИНА по
    // позиции (а не общее ребро), потому что после CSG.subtract вокруг
    // оконного/дверного проёма Babylon триангулирует «рамку» вокруг
    // выреза так, что четыре полосы (низ–лево–верх–право) делят
    // между собой только УГЛОВЫЕ ТОЧКИ выреза, а не рёбра. Если
    // считать только по рёбрам, такая стена дробится на 4 отдельные
    // грани, что не нужно. По общей вершине — все четыре полосы
    // рамки сливаются в одну логическую грань (= вся стена с проёмом).
    //
    // Две коплоскостные стены в разных комнатах, разделённые
    // межкомнатной перегородкой, общих вершин по-прежнему НЕ имеют
    // (углы каждой стены лежат по разные стороны перегородки), поэтому
    // остаются в разных компонентах. То же — для коплоскостных стен,
    // разнесённых пробелами; пока их концы не лежат в одной точке,
    // они не сольются.
    const POS_EPS = 0.005;
    const posKey = (idx) => {
        const x = positions[idx * 3];
        const y = positions[idx * 3 + 1];
        const z = positions[idx * 3 + 2];
        return `${Math.round(x / POS_EPS)}_${Math.round(y / POS_EPS)}_${Math.round(z / POS_EPS)}`;
    };

    const finalTriGroups = [];
    for (const [, triList] of groups) {
        if (triList.length <= 1) {
            finalTriGroups.push(triList);
            continue;
        }

        // vertexToTris: позиционный ключ вершины → список индексов
        // треугольников этой плоскостной группы (внутри triList),
        // в которых есть вершина с этой позицией.
        const vertexToTris = new Map();
        for (let k = 0; k < triList.length; k++) {
            const t = triList[k];
            const k1 = posKey(oldIndices[t * 3]);
            const k2 = posKey(oldIndices[t * 3 + 1]);
            const k3 = posKey(oldIndices[t * 3 + 2]);
            for (const vk of [k1, k2, k3]) {
                let arr = vertexToTris.get(vk);
                if (!arr) { arr = []; vertexToTris.set(vk, arr); }
                arr.push(k);
            }
        }

        // Граф смежности треугольников: соединены, если делят хотя бы
        // одну вершину по позициям. Дубли в adj не страшны — BFS
        // фильтрует через visited[].
        const adj = new Array(triList.length);
        for (let k = 0; k < triList.length; k++) adj[k] = [];
        for (const arr of vertexToTris.values()) {
            if (arr.length < 2) continue;
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    adj[arr[i]].push(arr[j]);
                    adj[arr[j]].push(arr[i]);
                }
            }
        }

        // BFS по компонентам связности — каждый компонент уходит
        // отдельной гранью.
        const visited = new Array(triList.length).fill(false);
        for (let k = 0; k < triList.length; k++) {
            if (visited[k]) continue;
            const component = [];
            const stack = [k];
            visited[k] = true;
            while (stack.length) {
                const v = stack.pop();
                component.push(triList[v]);
                const neighbors = adj[v];
                for (let n = 0; n < neighbors.length; n++) {
                    const next = neighbors[n];
                    if (!visited[next]) {
                        visited[next] = true;
                        stack.push(next);
                    }
                }
            }
            finalTriGroups.push(component);
        }
    }

    // Перестраиваем index-buffer так, чтобы триугольники одной грани
    // (= одного компонента связности в одной плоскости) лежали подряд —
    // это требование для submesh.
    const newIndices = new Array(oldIndices.length);
    const ranges = [];
    let writePos = 0;
    let materialIdx = 0;
    for (const triList of finalTriGroups) {
        const start = writePos;
        for (const t of triList) {
            newIndices[writePos++] = oldIndices[t * 3];
            newIndices[writePos++] = oldIndices[t * 3 + 1];
            newIndices[writePos++] = oldIndices[t * 3 + 2];
        }
        ranges.push({ indexStart: start, indexCount: triList.length * 3, materialIdx });
        materialIdx++;
    }
    wall.setIndices(newIndices);

    // Старый material выкидываем (это могла быть либо одиночная
    // StandardMaterial из createWallFromPolygon, либо ранее повешенный
    // MultiMaterial — на случай повторного вызова).
    const oldMat = wall.material;
    if (oldMat instanceof BABYLON.MultiMaterial) {
        oldMat.subMaterials.forEach(sm => sm && sm.dispose());
        oldMat.dispose();
    } else if (oldMat) {
        oldMat.dispose();
    }

    const multiMat = new BABYLON.MultiMaterial(`${wall.name}_multi`, scene);
    multiMat.subMaterials = [];
    for (let i = 0; i < ranges.length; i++) {
        const m = new BABYLON.StandardMaterial(`${wall.name}_face_${i}`, scene);
        m.diffuseColor      = WALL_BASE_COLOR.clone();
        m.specularColor     = new BABYLON.Color3(0.12, 0.12, 0.15);
        m.backFaceCulling   = false;
        m.twoSidedLighting  = true;
        // Дефолт StandardMaterial — 4 одновременных источника. На каждую люстру
        // создаётся 6 PointLight'ов (один на emission-плоскость) + 3 глобальных
        // лайта; одной люстры мало — две уже превысят 12.
        m.maxSimultaneousLights = 12;
        multiMat.subMaterials.push(m);
    }
    wall.material = multiMat;

    // Submesh per group
    wall.subMeshes = [];
    const totalV = wall.getTotalVertices();
    for (const r of ranges) {
        new BABYLON.SubMesh(r.materialIdx, 0, totalV, r.indexStart, r.indexCount, wall);
    }

    return ranges.length;
}

function findSubMeshIndexByFaceId(mesh, faceId) {
    if (!mesh || !Array.isArray(mesh.subMeshes) || faceId < 0) return -1;
    const triStart = faceId * 3;
    for (let s = 0; s < mesh.subMeshes.length; s++) {
        const sub = mesh.subMeshes[s];
        if (triStart >= sub.indexStart && triStart < (sub.indexStart + sub.indexCount)) {
            return s;
        }
    }
    return -1;
}

function getSubMeshMaterial(mesh, subMeshIndex) {
    if (!mesh || subMeshIndex < 0) return null;
    if (!(mesh.material instanceof BABYLON.MultiMaterial)) return null;
    const sub = mesh.subMeshes[subMeshIndex];
    if (!sub) return null;
    const m = mesh.material.subMaterials[sub.materialIndex];
    return (m instanceof BABYLON.StandardMaterial) ? m : null;
}

function color3ToHex(c) {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
    return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
}

function hexToColor3(hex) {
    if (typeof hex !== 'string') return WALL_BASE_COLOR.clone();
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    if (h.length !== 6) return WALL_BASE_COLOR.clone();
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return new BABYLON.Color3(r, g, b);
}

function highlightSelectedFace(mesh, subMeshIndex) {
    const m = getSubMeshMaterial(mesh, subMeshIndex);
    if (!m) return;
    selectedOriginalEmissive = m.emissiveColor ? m.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
    // Подсветка = base emissive (например, окраска под белый цвет) + наш blue tint.
    // Иначе при выборе закрашенной грани её цветовая «база» терялась бы.
    m.emissiveColor = selectedOriginalEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
}

function clearSelectedFaceHighlight() {
    if (selectedWallMesh && selectedSubMeshIndex >= 0) {
        const m = getSubMeshMaterial(selectedWallMesh, selectedSubMeshIndex);
        if (m) m.emissiveColor = selectedOriginalEmissive ? selectedOriginalEmissive.clone() : new BABYLON.Color3(0, 0, 0);
    }
    selectedOriginalEmissive = null;
}

// ─── Popover positioning ────────────────────────────────────────────────
// Popover'ы привязаны к ТОЧКЕ В 3D (мировая координата места клика).
// Каждый кадр через scene.onBeforeRenderObservable проецируем эту точку
// в экранное пространство и перепозиционируем DOM-панель. Так popover
// «следует» за вращением/зумом/панорамированием камеры. Если точка ушла
// за камеру (z вне [0..1]) — временно прячем panel'ы через visibility,
// чтобы они не мигали у краёв экрана с зеркальной проекцией.
const POPOVER_OFFSET_X = 14;
const POPOVER_OFFSET_Y = 14;
const POPOVER_VIEWPORT_PADDING = 12;

// Карта активных popover'ов. Ключ — DOM-элемент панели, значение —
// { worldPoint: BABYLON.Vector3 } (snapshot мировой точки клика).
const activePopovers = new Map();

// Чистое позиционирование (клемп в viewport). НЕ трогает visibility и
// НЕ читает offsetWidth/Height с включённым visibility:hidden — потому
// что вызывается КАЖДЫЙ кадр; visibility-флик был бы заметен.
function applyClampedPosition(panel, anchorX, anchorY) {
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    if (w === 0 || h === 0) return; // ещё не зарелейаутилось — пропускаем кадр
    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const pad = POPOVER_VIEWPORT_PADDING;
    let x = anchorX + POPOVER_OFFSET_X;
    let y = anchorY + POPOVER_OFFSET_Y;
    if (x + w + pad > VW) x = anchorX - w - POPOVER_OFFSET_X;
    if (y + h + pad > VH) y = anchorY - h - POPOVER_OFFSET_Y;
    x = Math.max(pad, Math.min(x, VW - w - pad));
    y = Math.max(pad, Math.min(y, VH - h - pad));
    panel.style.left = x + 'px';
    panel.style.top  = y + 'px';
    panel.style.right = 'auto';
}

// Регистрирует panel как 3D-привязанный popover. worldPoint клонируется
// (Vector3 мутабелен — без snapshot'а у нас была бы дрожащая ссылка).
//
// opts.followHandle — если передан, popover будет КАЖДЫЙ кадр пересчитывать
// «живую» мировую точку как handle.absolutePosition + offset. Это нужно
// для drag&drop размещённых предметов: без этого popover висит «мёртвым
// грузом» в исходной точке клика. Оффсет берётся в world-space, поэтому
// при вращении объекта popover не вращается вокруг него (правильное
// поведение: панель остаётся над «верхушкой» предмета).
function attachPopoverToWorldPoint(panel, worldPoint, opts) {
    if (!panel || !worldPoint) return;
    opts = opts || {};
    const entry = {
        worldPoint: worldPoint.clone(),
        followHandle: opts.followHandle || null,
        followOffset: null,
    };
    if (entry.followHandle && entry.followHandle.getAbsolutePosition) {
        entry.followOffset = worldPoint.subtract(entry.followHandle.getAbsolutePosition());
    }
    activePopovers.set(panel, entry);
    // Принудительно дёргаем layout, чтобы offsetWidth/Height были валидны
    // на ТЕКУЩЕМ кадре (panel только что переключилась с display:none).
    void panel.offsetWidth;
    updatePopoverPosition(panel);
}

// Снимает привязку. Зовётся из deselect*.
function detachPopover(panel) {
    if (!panel) return;
    activePopovers.delete(panel);
}

// Сброс inline-стилей — возврат к CSS-default'ам (top:72 right:28) для
// программных показов без 3D-анкора.
function resetFloatingPanelPosition(panel) {
    if (!panel) return;
    panel.style.left = '';
    panel.style.top  = '';
    panel.style.right = '';
    panel.style.visibility = '';
}

// Обновление одной панели. Дёргается из updateAllPopovers (каждый кадр)
// и из attachPopoverToWorldPoint (сразу после регистрации, чтобы первый
// кадр уже был в нужной точке).
function updatePopoverPosition(panel) {
    const data = activePopovers.get(panel);
    if (!data) return;
    // Если popover привязан к handle (размещённый предмет), пересчитываем
    // мировую точку каждый кадр как handle.absolutePosition + offset.
    // Так popover «едет» вместе с drag'ом. Если handle уже dispose'нут
    // (race condition между удалением и кадром) — гасим popover.
    let wp;
    if (data.followHandle) {
        if (data.followHandle.isDisposed && data.followHandle.isDisposed()) {
            detachPopover(panel);
            panel.style.visibility = 'hidden';
            return;
        }
        const basePos = data.followHandle.getAbsolutePosition();
        wp = data.followOffset ? basePos.add(data.followOffset) : basePos;
    } else {
        wp = data.worldPoint;
    }
    // Размер canvas в CSS-пикселях — для совпадения с viewport-coord'ами
    // DOM. getRenderWidth/Height отдаёт backing buffer (умножен на DPR),
    // а нам нужны CSS px для left/top.
    const rect = canvas.getBoundingClientRect();
    const viewport = camera.viewport.toGlobal(rect.width, rect.height);
    const transform = scene.getTransformMatrix();
    const p = BABYLON.Vector3.Project(
        wp,
        BABYLON.Matrix.Identity(),
        transform,
        viewport
    );
    // z в [0..1] — точка перед камерой и в пределах frustum'а. Иначе
    // (за камерой, за far-plane) — Project возвращает «зеркальные»
    // координаты у краёв экрана; прячем popover до возврата в кадр.
    if (p.z < 0 || p.z > 1) {
        panel.style.visibility = 'hidden';
        return;
    }
    if (panel.style.visibility === 'hidden') panel.style.visibility = '';
    // Project отдал координаты относительно canvas — сдвигаем на rect.left/top
    // (в случаях, когда canvas не во весь viewport, например с фиксированной
    // плашкой сверху). Сейчас canvas full-screen, но запас не помешает.
    applyClampedPosition(panel, p.x + rect.left, p.y + rect.top);
}

function updateAllPopovers() {
    if (!activePopovers.size) return;
    activePopovers.forEach((_data, panel) => updatePopoverPosition(panel));
}

// Один observable на всю сцену — дёшево (Map обычно пуст или содержит
// 1-2 элемента). По событию onViewMatrixChanged Babylon не диспатчит
// continuous-orbit'ы, поэтому привязываемся к pre-render.
scene.onBeforeRenderObservable.add(updateAllPopovers);

function selectWallFace(mesh, subMeshIndex, anchorPoint) {
    if (selectedWallMesh === mesh && selectedSubMeshIndex === subMeshIndex) {
        // Та же грань — пропускаем тяжёлый init (re-highlight, re-sync UI),
        // но перезаякориваем popover к новой 3D-точке клика. Симметрия с
        // selectPlacedItem, у которого повторный клик по тому же предмету
        // тоже двигает panel в новую точку.
        if (anchorPoint && typeof anchorPoint.x === 'number') {
            const panel = document.getElementById('wall-color-panel');
            if (panel) attachPopoverToWorldPoint(panel, anchorPoint);
        }
        return;
    }
    clearSelectedFaceHighlight();
    selectedWallMesh = mesh;
    selectedSubMeshIndex = subMeshIndex;
    highlightSelectedFace(mesh, subMeshIndex);

    const panel = document.getElementById('wall-color-panel');
    const colorInput = document.getElementById('wall-color-input');
    const m = getSubMeshMaterial(mesh, subMeshIndex);
    if (panel && colorInput && m) {
        colorInput.value = color3ToHex(m.diffuseColor);
        panel.style.display = 'flex';
        const currentSlug = (m.metadata && m.metadata.wallpaperSlug) || '';
        syncWallpaperStripUI(currentSlug);
        // anchorPoint — мировая точка клика (pickInfo.pickedPoint). Если
        // она есть — popover «прицеплен» к стене и едет с камерой при орбите.
        // Без неё (программный показ) откатываемся к CSS top:72/right:28.
        if (anchorPoint && typeof anchorPoint.x === 'number') {
            attachPopoverToWorldPoint(panel, anchorPoint);
        } else {
            detachPopover(panel);
            resetFloatingPanelPosition(panel);
        }
    }
}

function deselectWallFace() {
    clearSelectedFaceHighlight();
    selectedWallMesh = null;
    selectedSubMeshIndex = -1;
    const panel = document.getElementById('wall-color-panel');
    if (panel) {
        panel.style.display = 'none';
        detachPopover(panel);
        resetFloatingPanelPosition(panel);
    }
}

function applyColorToSelectedFace(hexColor) {
    if (!selectedWallMesh || selectedSubMeshIndex < 0) return;
    const m = getSubMeshMaterial(selectedWallMesh, selectedSubMeshIndex);
    if (!m) return;
    // Цвет и обои — взаимоисключающие; выбирая цвет, сбрасываем текстуру.
    if (m.diffuseTexture) {
        m.diffuseTexture.dispose();
        m.diffuseTexture = null;
    }
    if (m.metadata) m.metadata.wallpaperSlug = '';

    m.diffuseColor = hexToColor3(hexColor);

    // emissive не подмешиваем: раньше в него лили ~30% выбранного цвета,
    // чтобы белый «читался» под тёплым светом, — но это ломало физику
    // освещения. Чёрный с emissive=0 выглядел как непросвет, белый с
    // emissive≈(0.3,0.3,0.3) — как «пересветка», и казалось, что сила
    // света зависит от цвета поверхности. Текстуры работают корректно
    // именно потому, что у них emissive всегда 0; теперь так же и у цвета.
    const baseEmissive = new BABYLON.Color3(0, 0, 0);
    if (selectedWallMesh && selectedSubMeshIndex >= 0) {
        selectedOriginalEmissive = baseEmissive;
        m.emissiveColor = baseEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
    } else {
        m.emissiveColor = baseEmissive;
    }

    syncWallpaperStripUI('');
}

function resetSelectedFaceColor() {
    applyColorToSelectedFace(color3ToHex(WALL_BASE_COLOR));
    const colorInput = document.getElementById('wall-color-input');
    if (colorInput) colorInput.value = color3ToHex(WALL_BASE_COLOR);
}

// --- WALLPAPER: бесшовное наложение текстуры на грань стены ----------------
// Ключевая идея: чтобы стыки между маленьким и большим участком стены не
// «съезжали», UV-координаты вычисляются из МИРОВЫХ координат вершин,
// спроецированных на плоскость, перпендикулярную нормали грани. Один и тот же
// тексель тогда живёт в одной и той же мировой точке для любой стены.
const WALLPAPER_TILE_METERS = 1.0; // одна «плитка» обоев = 1 м × 1 м

function applyWorldProjectedUVsToSubmesh(mesh, subMeshIndex, tileMeters = WALLPAPER_TILE_METERS) {
    if (!mesh) return;
    const sub = mesh.subMeshes && mesh.subMeshes[subMeshIndex];
    if (!sub) return;

    mesh.computeWorldMatrix(true);
    const worldMat = mesh.getWorldMatrix();
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const normals   = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    const indices   = mesh.getIndices();
    if (!positions || !indices) return;

    const totalV = mesh.getTotalVertices();
    let uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    uvs = (uvs && uvs.length === totalV * 2) ? new Float32Array(uvs) : new Float32Array(totalV * 2);

    // Доминирующую ось нормали берём из первого треугольника сабмеша.
    // Все треугольники сабмеша лежат в одной плоскости (см. splitWallIntoPaintableFaces),
    // поэтому ось общая для всей грани.
    let nx = 0, ny = 1, nz = 0;
    const triStart = sub.indexStart;
    const i0 = indices[triStart], i1 = indices[triStart + 1], i2 = indices[triStart + 2];
    if (normals && normals.length >= (i0 + 1) * 3) {
        nx = normals[i0 * 3]; ny = normals[i0 * 3 + 1]; nz = normals[i0 * 3 + 2];
    } else {
        const ax = positions[i1*3]   - positions[i0*3];
        const ay = positions[i1*3+1] - positions[i0*3+1];
        const az = positions[i1*3+2] - positions[i0*3+2];
        const bx = positions[i2*3]   - positions[i0*3];
        const by = positions[i2*3+1] - positions[i0*3+1];
        const bz = positions[i2*3+2] - positions[i0*3+2];
        nx = ay*bz - az*by; ny = az*bx - ax*bz; nz = ax*by - ay*bx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
    }

    const absX = Math.abs(nx), absY = Math.abs(ny), absZ = Math.abs(nz);
    // Для стены (нормаль в плоскости XZ) U — горизонталь по миру, V — высота Y.
    // Для горизонтальных «шапок» (потолок/пол стены) — UV из XZ.
    let axisU, axisV;
    if (absY >= absX && absY >= absZ) { axisU = 'x'; axisV = 'z'; }
    else if (absX >= absZ)            { axisU = 'z'; axisV = 'y'; }
    else                              { axisU = 'x'; axisV = 'y'; }
    const pick = (v, axis) => axis === 'x' ? v.x : axis === 'y' ? v.y : v.z;

    // Знак U инвертируем, чтобы текст обоев не отражался зеркально на
    // противоположных гранях (стена на +X и стена на −X получают
    // одинаковую «лицевую» сторону текстуры).
    const uSign = (axisU === 'x' && nx < 0) || (axisU === 'z' && nz > 0) ? -1 : 1;

    const written = new Uint8Array(totalV);
    const tmpLocal = new BABYLON.Vector3();
    const tmpWorld = new BABYLON.Vector3();
    const last = sub.indexStart + sub.indexCount;
    for (let k = sub.indexStart; k < last; k++) {
        const vi = indices[k];
        if (written[vi]) continue;
        written[vi] = 1;
        tmpLocal.set(positions[vi*3], positions[vi*3+1], positions[vi*3+2]);
        BABYLON.Vector3.TransformCoordinatesToRef(tmpLocal, worldMat, tmpWorld);
        uvs[vi * 2]     = uSign * pick(tmpWorld, axisU) / tileMeters;
        uvs[vi * 2 + 1] =          pick(tmpWorld, axisV) / tileMeters;
    }

    mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, true);
}

function applyWallpaperToSelectedFace(slug, url) {
    if (!selectedWallMesh || selectedSubMeshIndex < 0) return;
    const m = getSubMeshMaterial(selectedWallMesh, selectedSubMeshIndex);
    if (!m) return;

    // Пустой slug = «без обоев»: убираем текстуру и возвращаем базовый цвет.
    if (!slug || !url) {
        if (m.diffuseTexture) {
            m.diffuseTexture.dispose();
            m.diffuseTexture = null;
        }
        if (m.metadata) m.metadata.wallpaperSlug = '';
        m.diffuseColor = WALL_BASE_COLOR.clone();
        const baseEmissive = new BABYLON.Color3(0, 0, 0);
        selectedOriginalEmissive = baseEmissive;
        m.emissiveColor = baseEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
        const colorInput = document.getElementById('wall-color-input');
        if (colorInput) colorInput.value = color3ToHex(WALL_BASE_COLOR);
        return;
    }

    const tex = new BABYLON.Texture(
        url, scene,
        false, // noMipmap=false → мипмапы для дальних граней
        true   // invertY=true (стандарт для jpg-обоев)
    );
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = 1;
    tex.anisotropicFilteringLevel = 8;

    if (m.diffuseTexture) m.diffuseTexture.dispose();
    m.diffuseTexture = tex;
    // Цвет под текстурой ставим белым, чтобы обои не «темнили» multiply'ем.
    m.diffuseColor = new BABYLON.Color3(1, 1, 1);
    // Текстура сама задаёт визуал — emissive базу обнуляем, чтобы обои
    // не светились собственным цветом.
    selectedOriginalEmissive = new BABYLON.Color3(0, 0, 0);
    m.emissiveColor = WALL_HIGHLIGHT_EMISSIVE.clone();
    m.metadata = m.metadata || {};
    m.metadata.wallpaperSlug = slug;

    applyWorldProjectedUVsToSubmesh(selectedWallMesh, selectedSubMeshIndex);
}

// --- FLOOR: выделение пола конкретной комнаты + применение текстуры ------
// У пола одна StandardMaterial и один subMesh, поэтому работаем со всем
// мешем, а не с разбиением по submesh'ам как у стен. Подсветка делается
// тем же приёмом — emissive tint поверх «исходного» emissive.

function highlightSelectedFloor(mesh) {
    if (!mesh || !mesh.material || !(mesh.material instanceof BABYLON.StandardMaterial)) return;
    const m = mesh.material;
    selectedFloorOriginalEmissive = m.emissiveColor ? m.emissiveColor.clone() : new BABYLON.Color3(0, 0, 0);
    m.emissiveColor = selectedFloorOriginalEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
}

function clearSelectedFloorHighlight() {
    if (selectedFloorMesh && selectedFloorMesh.material instanceof BABYLON.StandardMaterial) {
        const m = selectedFloorMesh.material;
        m.emissiveColor = selectedFloorOriginalEmissive
            ? selectedFloorOriginalEmissive.clone()
            : new BABYLON.Color3(0, 0, 0);
    }
    selectedFloorOriginalEmissive = null;
}

function selectFloor(mesh, anchorPoint) {
    if (!mesh || !(mesh.material instanceof BABYLON.StandardMaterial)) return;
    if (selectedFloorMesh === mesh) {
        // Тот же пол — только перезаякориваем popover (см. комментарий
        // в selectWallFace).
        if (anchorPoint && typeof anchorPoint.x === 'number') {
            const panel = document.getElementById('floor-color-panel');
            if (panel) attachPopoverToWorldPoint(panel, anchorPoint);
        }
        return;
    }
    clearSelectedFloorHighlight();
    selectedFloorMesh = mesh;
    highlightSelectedFloor(mesh);

    const panel = document.getElementById('floor-color-panel');
    if (panel && floorColorInput) {
        floorColorInput.value = color3ToHex(mesh.material.diffuseColor);
        panel.style.display = 'flex';
        const currentSlug = (mesh.metadata && mesh.metadata.floorSlug) || '';
        syncFloorStripUI(currentSlug);
        if (anchorPoint && typeof anchorPoint.x === 'number') {
            attachPopoverToWorldPoint(panel, anchorPoint);
        } else {
            detachPopover(panel);
            resetFloatingPanelPosition(panel);
        }
    }
}

function deselectFloor() {
    clearSelectedFloorHighlight();
    selectedFloorMesh = null;
    const panel = document.getElementById('floor-color-panel');
    if (panel) {
        panel.style.display = 'none';
        detachPopover(panel);
        resetFloatingPanelPosition(panel);
    }
}

function applyColorToSelectedFloor(hexColor) {
    if (!selectedFloorMesh) return;
    const m = selectedFloorMesh.material;
    if (!m) return;
    // Цвет и текстура — взаимоисключающие; ставя цвет, сбрасываем текстуру.
    if (m.diffuseTexture) {
        m.diffuseTexture.dispose();
        m.diffuseTexture = null;
    }
    if (selectedFloorMesh.metadata) selectedFloorMesh.metadata.floorSlug = '';

    m.diffuseColor = hexToColor3(hexColor);

    // emissive держим в нуле — та же причина, что у стен в applyColorToSelectedFace:
    // подмешивание цвета в emissive искажает освещение (чёрный казался «без света»,
    // белый — пересвеченным), хотя на текстурах всё корректно. Цвет и текстура
    // теперь ведут себя одинаково по отношению к источникам света.
    const baseEmissive = new BABYLON.Color3(0, 0, 0);
    if (selectedFloorMesh) {
        selectedFloorOriginalEmissive = baseEmissive;
        m.emissiveColor = baseEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
    } else {
        m.emissiveColor = baseEmissive;
    }

    syncFloorStripUI('');
}

function resetSelectedFloorColor() {
    applyColorToSelectedFloor(color3ToHex(FLOOR_BASE_COLOR));
    if (floorColorInput) floorColorInput.value = color3ToHex(FLOOR_BASE_COLOR);
}

// UV-проекция «всего меша» для горизонтального пола. У пола единственный
// subMesh, поэтому подходит существующая submesh-функция с индексом 0.
function applyFloorTextureToSelectedFloor(slug, url) {
    if (!selectedFloorMesh) return;
    const m = selectedFloorMesh.material;
    if (!m) return;

    if (!slug || !url) {
        if (m.diffuseTexture) {
            m.diffuseTexture.dispose();
            m.diffuseTexture = null;
        }
        if (selectedFloorMesh.metadata) selectedFloorMesh.metadata.floorSlug = '';
        m.diffuseColor = FLOOR_BASE_COLOR.clone();
        const baseEmissive = new BABYLON.Color3(0, 0, 0);
        selectedFloorOriginalEmissive = baseEmissive;
        m.emissiveColor = baseEmissive.add(WALL_HIGHLIGHT_EMISSIVE);
        if (floorColorInput) floorColorInput.value = color3ToHex(FLOOR_BASE_COLOR);
        return;
    }

    const tex = new BABYLON.Texture(url, scene, false, true);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = 1;
    tex.anisotropicFilteringLevel = 8;

    if (m.diffuseTexture) m.diffuseTexture.dispose();
    m.diffuseTexture = tex;
    m.diffuseColor = new BABYLON.Color3(1, 1, 1);
    selectedFloorOriginalEmissive = new BABYLON.Color3(0, 0, 0);
    m.emissiveColor = WALL_HIGHLIGHT_EMISSIVE.clone();
    selectedFloorMesh.metadata = selectedFloorMesh.metadata || {};
    selectedFloorMesh.metadata.floorSlug = slug;

    applyWorldProjectedUVsToSubmesh(selectedFloorMesh, 0, FLOOR_TILE_METERS);
}

// POINTERTAP — короткий клик без перетаскивания, не срабатывает при
// вращении/панорамировании камеры.
scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== BABYLON.PointerEventTypes.POINTERTAP) return;
    // В режиме прогулки клик мыши используется для управления mouselook;
    // выбирать грани в это время — лишнее (и панель цвета бы вылезала
    // прямо посреди FPS-обзора).
    if (isWalkMode) return;
    const pickInfo = pointerInfo.pickInfo;
    // 3D-точка клика (мировые координаты). Передаём в select*-функции,
    // они зарегистрируют popover как world-anchored и attachPopover будет
    // проецировать его каждый кадр в экранные координаты. Так popover
    // едет за камерой при orbit'е, в отличие от старой схемы с фикс.
    // pixel-координатами клика.
    const anchor3D = (pickInfo && pickInfo.pickedPoint) ? pickInfo.pickedPoint : null;

    // 1) Wall-pick: ждём клика по стене, чтобы повесить полку.
    if (pendingWallPlacement) {
        if (pickInfo && pickInfo.hit && pickInfo.pickedMesh && createdWalls.includes(pickInfo.pickedMesh)) {
            const n = pickInfo.getNormal(true) || new BABYLON.Vector3(0, 0, 1);
            const p = pickInfo.pickedPoint;
            const cfg = pendingWallPlacement;
            cancelWallPickPlacement();
            loadGlbAndAddToScene({
                url:   cfg.url,
                label: cfg.label,
                slug:  cfg.slug,
                mount: 'wall',
                initialPosition: new BABYLON.Vector3(p.x, 0, p.z),
                initialY: DEFAULT_WALL_MOUNT_Y,
                wallNormal: { x: n.x, z: n.z }
            });
        }
        // В любом случае при активном wall-pick не запускаем wall-face / item-select.
        return;
    }

    // 2) Клик по слоту окна (пустой проём) → открываем мини-меню каталога.
    if (pickInfo && pickInfo.hit && pickInfo.pickedMesh?.metadata?.isWindowOpeningSlot) {
        const slotIdx = pickInfo.pickedMesh.metadata.slotIdx;
        const slot = windowOpeningSlots[slotIdx];
        if (slot) {
            deselectWallFace();
            deselectFloor();
            deselectPlacedItem();
            showWindowMenuAt(slot);
        }
        return;
    }

    // 3) Клик по уже размещённому предмету → выбираем его (для slider/delete).
    if (pickInfo && pickInfo.hit && pickInfo.pickedMesh && pickInfo.pickedMesh.isGlbHandle) {
        hideWindowMenu();
        selectPlacedItem(pickInfo.pickedMesh, anchor3D);
        return;
    }

    // 4) Иначе — старая логика выбора грани стены / пола.
    hideWindowMenu();
    if (!pickInfo || !pickInfo.hit) {
        deselectWallFace();
        deselectFloor();
        deselectPlacedItem();
        return;
    }
    const hitMesh = pickInfo.pickedMesh;
    // Пол комнаты: кликабельная плоскость с metadata.kind='room_floor'.
    // Каждый пол — отдельный mesh с собственным материалом, поэтому
    // выделение/раскраска одной комнаты не затрагивает другую.
    if (hitMesh && hitMesh.metadata && hitMesh.metadata.kind === 'room_floor') {
        deselectWallFace();
        deselectPlacedItem();
        selectFloor(hitMesh, anchor3D);
        return;
    }
    if (!hitMesh || !createdWalls.includes(hitMesh)) {
        deselectWallFace();
        deselectFloor();
        deselectPlacedItem();
        return;
    }
    deselectPlacedItem();
    deselectFloor();
    const subIdx = findSubMeshIndexByFaceId(hitMesh, pickInfo.faceId);
    if (subIdx < 0) return;
    selectWallFace(hitMesh, subIdx, anchor3D);
});

// --------------------- РЎР•Р“РњР•РќРўРђР¦РРЇ ---------------------
function segmentWallsSimple(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;

    // Conservative threshold: matches previous working behavior.
    for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const v = gray < 128 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
    }
    return imageData;
}

function binaryMatToDataUrl(maskMat) {
    const width = maskMat.cols;
    const height = maskMat.rows;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(width, height);
    const src = maskMat.data;
    for (let i = 0, j = 0; i < src.length; i++, j += 4) {
        const v = src[i];
        img.data[j] = v;
        img.data[j + 1] = v;
        img.data[j + 2] = v;
        img.data[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
}

function buildRectMask(rects, width, height) {
    const mask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    if (!rects.length) return mask;

    for (const r of rects) {
        const x1 = Math.max(0, Math.floor(r.x));
        const y1 = Math.max(0, Math.floor(r.y));
        const x2 = Math.min(width - 1, Math.ceil(r.x + r.w));
        const y2 = Math.min(height - 1, Math.ceil(r.y + r.h));
        if (x2 <= x1 || y2 <= y1) continue;
        cv.rectangle(mask, new cv.Point(x1, y1), new cv.Point(x2, y2), new cv.Scalar(255), cv.FILLED);
    }
    return mask;
}

function reinforceWallsByMask(src, regionMask, width, height, referenceMask = null) {
    if (!regionMask || cv.countNonZero(regionMask) === 0) return 0;

    const influence = Math.max(2, Math.min(10, Math.round(Math.min(width, height) * 0.004)));
    const kernelSize = influence * 2 + 1;
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize));

    const reference = referenceMask || src;
    const wallNeighborhood = new cv.Mat();
    cv.dilate(reference, wallNeighborhood, kernel);

    const candidateFill = new cv.Mat();
    cv.bitwise_and(regionMask, wallNeighborhood, candidateFill);

    const before = cv.countNonZero(src);
    cv.bitwise_or(src, candidateFill, src);
    const after = cv.countNonZero(src);

    kernel.delete();
    wallNeighborhood.delete();
    candidateFill.delete();
    return Math.max(0, after - before);
}

function stitchDoorBoxesByLocalClosing(src, doors, referenceMask, width, height) {
    if (!doors.length || !referenceMask || cv.countNonZero(referenceMask) === 0) {
        return { addedPx: 0, preserveMask: null };
    }

    let totalAdded = 0;
    const preserveUnion = cv.Mat.zeros(height, width, cv.CV_8UC1);
    const env = new cv.Mat();
    const envKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(15, 15));
    cv.dilate(referenceMask, env, envKernel);
    envKernel.delete();

    for (let idx = 0; idx < doors.length; idx++) {
        const door = doors[idx];
        const profile = getDoorProfile(idx, door);
        const horizontal = profile.horizontal;
        const span = Math.max(6, profile.spanPx);
        const thickness = Math.max(2, profile.thicknessPx);

        const padLong = clampInt(span * 0.7, 8, 96);
        const padShort = clampInt(thickness * 1.4, 4, 36);
        const rx1 = clampInt(Math.floor(door.x) - (horizontal ? padLong : padShort), 0, width - 1);
        const ry1 = clampInt(Math.floor(door.y) - (horizontal ? padShort : padLong), 0, height - 1);
        const rx2 = clampInt(Math.ceil(door.x + door.w) + (horizontal ? padLong : padShort), 0, width - 1);
        const ry2 = clampInt(Math.ceil(door.y + door.h) + (horizontal ? padShort : padLong), 0, height - 1);
        const rw = rx2 - rx1 + 1;
        const rh = ry2 - ry1 + 1;
        if (rw < 4 || rh < 4) continue;

        const rect = new cv.Rect(rx1, ry1, rw, rh);
        const refRoi = referenceMask.roi(rect);
        const srcRoi = src.roi(rect);
        const envRoi = env.roi(rect);

        const work = new cv.Mat();
        refRoi.copyTo(work);

        const kLong = makeOdd(clampInt(span * 1.05, 7, 121));
        const kShort = makeOdd(clampInt(thickness * 1.45, 3, 31));
        const kx = horizontal ? kLong : kShort;
        const ky = horizontal ? kShort : kLong;
        const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kx, ky));
        cv.morphologyEx(work, work, cv.MORPH_CLOSE, closeKernel);
        closeKernel.delete();

        const cleanKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        cv.morphologyEx(work, work, cv.MORPH_OPEN, cleanKernel);
        cleanKernel.delete();

        const doorLocal = cv.Mat.zeros(rh, rw, cv.CV_8UC1);
        const localPad = Math.max(1, Math.round(thickness * 0.35));
        const lx1 = clampInt(Math.floor(door.x) - localPad - rx1, 0, rw - 1);
        const ly1 = clampInt(Math.floor(door.y) - localPad - ry1, 0, rh - 1);
        const lx2 = clampInt(Math.ceil(door.x + door.w) + localPad - rx1, 0, rw - 1);
        const ly2 = clampInt(Math.ceil(door.y + door.h) + localPad - ry1, 0, rh - 1);
        if (lx2 > lx1 && ly2 > ly1) {
            cv.rectangle(doorLocal, new cv.Point(lx1, ly1), new cv.Point(lx2, ly2), new cv.Scalar(255), cv.FILLED);
        }

        const candidate = new cv.Mat();
        cv.bitwise_and(work, doorLocal, candidate);
        cv.bitwise_and(candidate, envRoi, candidate);
        if (cv.countNonZero(candidate) === 0) {
            // Hard fallback: fill door box only inside wall envelope.
            cv.bitwise_and(doorLocal, envRoi, candidate);
        }

        const preserveRoi = preserveUnion.roi(rect);
        cv.bitwise_or(preserveRoi, candidate, preserveRoi);
        preserveRoi.delete();

        const before = cv.countNonZero(srcRoi);
        cv.bitwise_or(srcRoi, candidate, srcRoi);
        const after = cv.countNonZero(srcRoi);
        totalAdded += Math.max(0, after - before);

        candidate.delete();
        doorLocal.delete();
        work.delete();
        refRoi.delete();
        srcRoi.delete();
        envRoi.delete();
    }

    env.delete();
    const keep = cv.countNonZero(preserveUnion);
    if (keep <= 0) {
        preserveUnion.delete();
        return { addedPx: totalAdded, preserveMask: null };
    }
    return { addedPx: totalAdded, preserveMask: preserveUnion };
}

function eraseMaskFromWalls(src, mask) {
    if (!mask || cv.countNonZero(mask) === 0) return 0;
    const before = cv.countNonZero(src);
    const inv = new cv.Mat();
    cv.bitwise_not(mask, inv);
    cv.bitwise_and(src, inv, src);
    inv.delete();
    const after = cv.countNonZero(src);
    return Math.max(0, before - after);
}

function fillWallsByMask(src, mask) {
    if (!mask || cv.countNonZero(mask) === 0) return 0;
    const before = cv.countNonZero(src);
    cv.bitwise_or(src, mask, src);
    const after = cv.countNonZero(src);
    return Math.max(0, after - before);
}

function constrainWallsToEnvelope(src, referenceMask, width, height, preserveMask = null) {
    if (!referenceMask || cv.countNonZero(referenceMask) === 0) return 0;

    const envelopeRadius = Math.max(2, Math.min(12, Math.round(Math.min(width, height) * 0.0045)));
    const kSize = envelopeRadius * 2 + 1;
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kSize, kSize));

    const envelope = new cv.Mat();
    cv.dilate(referenceMask, envelope, kernel);
    if (preserveMask && cv.countNonZero(preserveMask) > 0) {
        cv.bitwise_or(envelope, preserveMask, envelope);
    }

    const before = cv.countNonZero(src);
    cv.bitwise_and(src, envelope, src);
    const after = cv.countNonZero(src);

    envelope.delete();
    kernel.delete();
    return Math.max(0, before - after);
}

function makeOdd(v) {
    return (v % 2 === 0) ? (v + 1) : v;
}

function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.round(v)));
}

function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return (sorted.length % 2) ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
}

function getMaskPixel(mask, x, y) {
    if (x < 0 || y < 0 || x >= mask.cols || y >= mask.rows) return 0;
    return mask.ucharPtr(y, x)[0];
}

function findNearestWallPixel(mask, cx, cy, maxRadius) {
    const x0 = Math.round(cx);
    const y0 = Math.round(cy);
    if (getMaskPixel(mask, x0, y0) > 0) return { x: x0, y: y0 };

    for (let r = 1; r <= maxRadius; r++) {
        const minX = x0 - r;
        const maxX = x0 + r;
        const minY = y0 - r;
        const maxY = y0 + r;
        for (let x = minX; x <= maxX; x++) {
            if (getMaskPixel(mask, x, minY) > 0) return { x, y: minY };
            if (getMaskPixel(mask, x, maxY) > 0) return { x, y: maxY };
        }
        for (let y = minY + 1; y <= maxY - 1; y++) {
            if (getMaskPixel(mask, minX, y) > 0) return { x: minX, y };
            if (getMaskPixel(mask, maxX, y) > 0) return { x: maxX, y };
        }
    }
    return null;
}

function measureRunLength(mask, x, y, stepX, stepY, maxSteps) {
    let forward = 0;
    let cx = x, cy = y;
    for (let i = 0; i < maxSteps; i++) {
        cx += stepX; cy += stepY;
        if (getMaskPixel(mask, cx, cy) <= 0) break;
        forward++;
    }

    let backward = 0;
    cx = x; cy = y;
    for (let i = 0; i < maxSteps; i++) {
        cx -= stepX; cy -= stepY;
        if (getMaskPixel(mask, cx, cy) <= 0) break;
        backward++;
    }

    return 1 + forward + backward;
}

function estimateDoorProfiles(referenceMask, doors, width, height) {
    if (!doors.length) return [];

    const profiles = [];
    const dilated = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.dilate(referenceMask, dilated, kernel);
    kernel.delete();

    for (const door of doors) {
        const cx = door.x + door.w / 2;
        const cy = door.y + door.h / 2;
        const horizontal = door.w >= door.h;
        const long = Math.max(door.w, door.h);
        const short = Math.max(2, Math.min(door.w, door.h));
        const samples = [];
        const maxSteps = Math.max(16, Math.round(Math.max(short * 4.0, long * 0.45)));
        const searchRadius = Math.max(2, Math.round(short * 0.8));
        const offsetFactors = [-0.45, -0.30, -0.15, 0.0, 0.15, 0.30, 0.45];

        for (const f of offsetFactors) {
            const sx = Math.round(cx + (horizontal ? f * long : 0));
            const sy = Math.round(cy + (horizontal ? 0 : f * long));
            const anchor = findNearestWallPixel(dilated, sx, sy, searchRadius);
            if (!anchor) continue;

            const stepX = horizontal ? 0 : 1;
            const stepY = horizontal ? 1 : 0;
            const run = measureRunLength(dilated, anchor.x, anchor.y, stepX, stepY, maxSteps);
            if (run >= 2) samples.push(run);
        }

        const estimatedThicknessPx = samples.length ? median(samples) : short;
        // Keep thickness tied to local wall measurements; do not clamp to door-box
        // short side, otherwise lintels become artificially narrow.
        const clampedThicknessPx = Math.max(
            2,
            Math.min(long * 0.7, Math.max(estimatedThicknessPx, short))
        );

        profiles.push({
            horizontal,
            spanPx: long,
            thicknessPx: clampedThicknessPx
        });
    }

    dilated.delete();
    return profiles;
}

function getDoorProfile(idx, door) {
    const fallback = {
        horizontal: door.w >= door.h,
        spanPx: Math.max(door.w, door.h),
        thicknessPx: Math.max(2, Math.min(door.w, door.h))
    };
    return detectedDoorProfiles[idx] || fallback;
}

function estimateOpeningProfiles(referenceMask, openings, width, height) {
    if (!openings.length) return [];

    const profiles = [];
    const dilated = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.dilate(referenceMask, dilated, kernel);
    kernel.delete();

    for (const op of openings) {
        const cx = op.x + op.w / 2;
        const cy = op.y + op.h / 2;
        const horizontal = op.w >= op.h;
        const long = Math.max(op.w, op.h);
        const short = Math.max(2, Math.min(op.w, op.h));
        const samples = [];
        const maxSteps = Math.max(16, Math.round(Math.max(short * 4.0, long * 0.45)));
        const searchRadius = Math.max(2, Math.round(short * 0.8));
        const offsetFactors = [-0.45, -0.30, -0.15, 0.0, 0.15, 0.30, 0.45];

        for (const f of offsetFactors) {
            const sx = Math.round(cx + (horizontal ? f * long : 0));
            const sy = Math.round(cy + (horizontal ? 0 : f * long));
            const anchor = findNearestWallPixel(dilated, sx, sy, searchRadius);
            if (!anchor) continue;

            const stepX = horizontal ? 0 : 1;
            const stepY = horizontal ? 1 : 0;
            const run = measureRunLength(dilated, anchor.x, anchor.y, stepX, stepY, maxSteps);
            if (run >= 2) samples.push(run);
        }

        const estimatedThicknessPx = samples.length ? median(samples) : short;
        const clampedThicknessPx = Math.max(
            2,
            Math.min(long * 0.7, Math.max(estimatedThicknessPx, short))
        );

        profiles.push({
            horizontal,
            spanPx: long,
            thicknessPx: clampedThicknessPx
        });
    }

    dilated.delete();
    return profiles;
}

function getWindowProfile(idx, win) {
    const fallback = {
        horizontal: win.w >= win.h,
        spanPx: Math.max(win.w, win.h),
        thicknessPx: Math.max(2, Math.min(win.w, win.h))
    };
    return detectedWindowProfiles[idx] || fallback;
}

function signedArea2D(points) {
    let s = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        s += (p1.x * p2.y) - (p2.x * p1.y);
    }
    return 0.5 * s;
}

function ensureWinding2D(points, wantCCW) {
    const copy = points.slice();
    if (copy.length < 3) return copy;
    const isCCW = signedArea2D(copy) > 0;
    if (isCCW !== wantCCW) copy.reverse();
    return copy;
}

function smoothWallsAroundDoorBoxes(src, doorBoxMask, width, height) {
    if (!doorBoxMask || cv.countNonZero(doorBoxMask) === 0) return 0;

    const seamMask = new cv.Mat();
    const seamKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(13, 13));
    cv.dilate(doorBoxMask, seamMask, seamKernel);
    seamKernel.delete();

    const tmp = new cv.Mat();
    src.copyTo(tmp);

    const smoothKernelSize = Math.max(3, (Math.round(Math.min(width, height) * 0.003) | 1));
    const smoothKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(smoothKernelSize, smoothKernelSize));
    cv.morphologyEx(tmp, tmp, cv.MORPH_CLOSE, smoothKernel);
    cv.morphologyEx(tmp, tmp, cv.MORPH_OPEN, smoothKernel);
    smoothKernel.delete();

    const before = cv.countNonZero(src);

    const invSeam = new cv.Mat();
    cv.bitwise_not(seamMask, invSeam);
    const basePart = new cv.Mat();
    cv.bitwise_and(src, invSeam, basePart);
    const seamPart = new cv.Mat();
    cv.bitwise_and(tmp, seamMask, seamPart);
    cv.bitwise_or(basePart, seamPart, src);

    const after = cv.countNonZero(src);

    invSeam.delete();
    basePart.delete();
    seamPart.delete();
    seamMask.delete();
    tmp.delete();
    return Math.abs(after - before);
}

function smoothDoorBoxSeamsByProfiles(src, doors, referenceMask, width, height) {
    if (!doors.length || !referenceMask || cv.countNonZero(referenceMask) === 0) return 0;

    let totalChanged = 0;
    const env = new cv.Mat();
    const envKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
    cv.dilate(referenceMask, env, envKernel);
    envKernel.delete();

    for (let idx = 0; idx < doors.length; idx++) {
        const door = doors[idx];
        const profile = getDoorProfile(idx, door);
        const horizontal = profile.horizontal;
        const span = Math.max(6, profile.spanPx);
        const thickness = Math.max(2, profile.thicknessPx);

        const padLong = clampInt(span * 0.7, 8, 96);
        const padShort = clampInt(thickness * 1.2, 4, 28);
        const rx1 = clampInt(Math.floor(door.x) - (horizontal ? padLong : padShort), 0, width - 1);
        const ry1 = clampInt(Math.floor(door.y) - (horizontal ? padShort : padLong), 0, height - 1);
        const rx2 = clampInt(Math.ceil(door.x + door.w) + (horizontal ? padLong : padShort), 0, width - 1);
        const ry2 = clampInt(Math.ceil(door.y + door.h) + (horizontal ? padShort : padLong), 0, height - 1);
        const rw = rx2 - rx1 + 1;
        const rh = ry2 - ry1 + 1;
        if (rw < 4 || rh < 4) continue;

        const rect = new cv.Rect(rx1, ry1, rw, rh);
        const srcRoi = src.roi(rect);
        const envRoi = env.roi(rect);

        const work = new cv.Mat();
        srcRoi.copyTo(work);

        const kLong = makeOdd(clampInt(span * 0.42, 5, 49));
        const kShort = makeOdd(clampInt(thickness * 1.15, 3, 21));
        const kx = horizontal ? kLong : kShort;
        const ky = horizontal ? kShort : kLong;
        const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kx, ky));
        cv.morphologyEx(work, work, cv.MORPH_CLOSE, closeKernel);
        closeKernel.delete();

        const noiseSize = makeOdd(clampInt(thickness * 0.55, 3, 7));
        const noiseKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(noiseSize, noiseSize));
        cv.morphologyEx(work, work, cv.MORPH_OPEN, noiseKernel);
        noiseKernel.delete();

        const seamMask = cv.Mat.zeros(rh, rw, cv.CV_8UC1);
        const seamPadLong = clampInt(span * 0.10, 2, 16);
        const seamPadShort = clampInt(thickness * 0.95, 2, 16);
        const sx1 = clampInt(Math.floor(door.x) - rx1 - (horizontal ? seamPadLong : seamPadShort), 0, rw - 1);
        const sy1 = clampInt(Math.floor(door.y) - ry1 - (horizontal ? seamPadShort : seamPadLong), 0, rh - 1);
        const sx2 = clampInt(Math.ceil(door.x + door.w) - rx1 + (horizontal ? seamPadLong : seamPadShort), 0, rw - 1);
        const sy2 = clampInt(Math.ceil(door.y + door.h) - ry1 + (horizontal ? seamPadShort : seamPadLong), 0, rh - 1);
        if (sx2 > sx1 && sy2 > sy1) {
            cv.rectangle(seamMask, new cv.Point(sx1, sy1), new cv.Point(sx2, sy2), new cv.Scalar(255), cv.FILLED);
        }

        const constrained = new cv.Mat();
        cv.bitwise_and(work, envRoi, constrained);
        const seamPart = new cv.Mat();
        cv.bitwise_and(constrained, seamMask, seamPart);

        const before = cv.countNonZero(srcRoi);
        const invSeam = new cv.Mat();
        cv.bitwise_not(seamMask, invSeam);
        const basePart = new cv.Mat();
        cv.bitwise_and(srcRoi, invSeam, basePart);
        cv.bitwise_or(basePart, seamPart, srcRoi);
        const after = cv.countNonZero(srcRoi);
        totalChanged += Math.abs(after - before);

        basePart.delete();
        invSeam.delete();
        seamPart.delete();
        constrained.delete();
        seamMask.delete();
        work.delete();
        srcRoi.delete();
        envRoi.delete();
    }

    env.delete();
    return totalChanged;
}

function cleanupDoorArchArtifacts(src, archEraseMask, doorBoxMask, width, height) {
    if (!archEraseMask || cv.countNonZero(archEraseMask) === 0) return 0;

    const zone = new cv.Mat();
    const zoneKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.dilate(archEraseMask, zone, zoneKernel);
    zoneKernel.delete();

    if (doorBoxMask && cv.countNonZero(doorBoxMask) > 0) {
        const protect = new cv.Mat();
        const protectKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
        cv.dilate(doorBoxMask, protect, protectKernel);
        protectKernel.delete();
        const invProtect = new cv.Mat();
        cv.bitwise_not(protect, invProtect);
        cv.bitwise_and(zone, invProtect, zone);
        invProtect.delete();
        protect.delete();
    }

    const work = new cv.Mat();
    src.copyTo(work);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(work, work, cv.MORPH_OPEN, k);
    k.delete();

    const before = cv.countNonZero(src);
    const invZone = new cv.Mat();
    cv.bitwise_not(zone, invZone);
    const basePart = new cv.Mat();
    cv.bitwise_and(src, invZone, basePart);
    const zonePart = new cv.Mat();
    cv.bitwise_and(work, zone, zonePart);
    cv.bitwise_or(basePart, zonePart, src);
    const after = cv.countNonZero(src);

    zonePart.delete();
    basePart.delete();
    invZone.delete();
    work.delete();
    zone.delete();
    return Math.abs(after - before);
}

function strengthenLintelsOverDoors(src, doorRects, referenceMask, width, height) {
    if (!doorRects.length || !referenceMask || cv.countNonZero(referenceMask) === 0) return 0;

    let totalAdded = 0;
    const basePad = Math.max(2, Math.round(Math.min(width, height) * 0.004));
    const envKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));

    for (const d of doorRects) {
        const dx1 = Math.max(0, Math.floor(d.x));
        const dy1 = Math.max(0, Math.floor(d.y));
        const dx2 = Math.min(width - 1, Math.ceil(d.x + d.w));
        const dy2 = Math.min(height - 1, Math.ceil(d.y + d.h));
        if (dx2 <= dx1 || dy2 <= dy1) continue;

        const isHorizontal = d.w >= d.h;
        const longPad = isHorizontal ? basePad * 2 : basePad;
        const shortPad = isHorizontal ? basePad : basePad * 2;

        const rx1 = Math.max(0, dx1 - longPad);
        const ry1 = Math.max(0, dy1 - shortPad);
        const rx2 = Math.min(width - 1, dx2 + longPad);
        const ry2 = Math.min(height - 1, dy2 + shortPad);

        const rw = rx2 - rx1 + 1;
        const rh = ry2 - ry1 + 1;
        if (rw < 3 || rh < 3) continue;

        const rect = new cv.Rect(rx1, ry1, rw, rh);
        const roi = src.roi(rect);
        const refRoi = referenceMask.roi(rect);

        const work = new cv.Mat();
        roi.copyTo(work);

        const kLong = makeOdd(clampInt((isHorizontal ? d.w : d.h) * 0.55, 5, 41));
        const kShort = makeOdd(clampInt((isHorizontal ? d.h : d.w) * 0.45, 3, 15));
        const kx = isHorizontal ? kLong : kShort;
        const ky = isHorizontal ? kShort : kLong;
        const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kx, ky));
        cv.morphologyEx(work, work, cv.MORPH_CLOSE, closeKernel);
        closeKernel.delete();

        const localEnv = new cv.Mat();
        cv.dilate(refRoi, localEnv, envKernel);

        const constrained = new cv.Mat();
        cv.bitwise_and(work, localEnv, constrained);

        const before = cv.countNonZero(roi);
        cv.bitwise_or(roi, constrained, roi);
        const after = cv.countNonZero(roi);
        totalAdded += Math.max(0, after - before);

        constrained.delete();
        localEnv.delete();
        work.delete();
        roi.delete();
        refRoi.delete();
    }

    envKernel.delete();
    return totalAdded;
}

function stitchDoorGapsByMorphology(src, doors, referenceMask, width, height) {
    if (!doors.length || !referenceMask || cv.countNonZero(referenceMask) === 0) {
        return { addedPx: 0, preserveMask: null, keepPixels: 0 };
    }

    const bridgeMask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    const searchMask = new cv.Mat();
    const searchKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.dilate(referenceMask, searchMask, searchKernel);
    searchKernel.delete();

    const collectDoorBridgeMask = (door, profile, horizontal) => {
        const local = cv.Mat.zeros(height, width, cv.CV_8UC1);
        const thickness = Math.max(2, profile.thicknessPx);
        const span = Math.max(6, profile.spanPx);
        const cx = door.x + door.w / 2;
        const cy = door.y + door.h / 2;
        const halfBand = Math.max(2, Math.round(thickness * 0.58));
        const edgePad = Math.max(2, Math.round(thickness * 0.25));
        const searchPad = Math.max(10, Math.round(Math.max(span * 1.2, thickness * 2.2)));
        const minGap = Math.max(2, Math.round(thickness * 0.45));
        const maxGap = Math.max(
            Math.round(span * 3.2),
            Math.round(Math.max(door.w, door.h) * 3.2)
        );

        let lines = 0;
        if (horizontal) {
            const y1 = clampInt(cy - halfBand, 0, height - 1);
            const y2 = clampInt(cy + halfBand, 0, height - 1);
            const xEdgeL = clampInt(Math.floor(door.x) - edgePad, 0, width - 1);
            const xEdgeR = clampInt(Math.ceil(door.x + door.w) + edgePad, 0, width - 1);
            const xSearchL = clampInt(xEdgeL - searchPad, 0, width - 1);
            const xSearchR = clampInt(xEdgeR + searchPad, 0, width - 1);

            for (let y = y1; y <= y2; y++) {
                let left = -1;
                for (let x = xEdgeL; x >= xSearchL; x--) {
                    if (getMaskPixel(searchMask, x, y) > 0) { left = x; break; }
                }
                if (left < 0) continue;

                let right = -1;
                for (let x = xEdgeR; x <= xSearchR; x++) {
                    if (getMaskPixel(searchMask, x, y) > 0) { right = x; break; }
                }
                if (right < 0 || right <= left + 1) continue;

                const gap = right - left;
                if (gap < minGap || gap > maxGap) continue;

                cv.line(local, new cv.Point(left, y), new cv.Point(right, y), new cv.Scalar(255), 1, cv.LINE_8);
                lines++;
            }
        } else {
            const x1 = clampInt(cx - halfBand, 0, width - 1);
            const x2 = clampInt(cx + halfBand, 0, width - 1);
            const yEdgeT = clampInt(Math.floor(door.y) - edgePad, 0, height - 1);
            const yEdgeB = clampInt(Math.ceil(door.y + door.h) + edgePad, 0, height - 1);
            const ySearchT = clampInt(yEdgeT - searchPad, 0, height - 1);
            const ySearchB = clampInt(yEdgeB + searchPad, 0, height - 1);

            for (let x = x1; x <= x2; x++) {
                let top = -1;
                for (let y = yEdgeT; y >= ySearchT; y--) {
                    if (getMaskPixel(searchMask, x, y) > 0) { top = y; break; }
                }
                if (top < 0) continue;

                let bottom = -1;
                for (let y = yEdgeB; y <= ySearchB; y++) {
                    if (getMaskPixel(searchMask, x, y) > 0) { bottom = y; break; }
                }
                if (bottom < 0 || bottom <= top + 1) continue;

                const gap = bottom - top;
                if (gap < minGap || gap > maxGap) continue;

                cv.line(local, new cv.Point(x, top), new cv.Point(x, bottom), new cv.Scalar(255), 1, cv.LINE_8);
                lines++;
            }
        }

        return { mask: local, lines };
    };

    doors.forEach((door, idx) => {
        const profile = getDoorProfile(idx, door);
        const primary = collectDoorBridgeMask(door, profile, profile.horizontal);
        const secondary = collectDoorBridgeMask(door, profile, !profile.horizontal);

        const chosen = (secondary.lines > primary.lines) ? secondary : primary;
        const rejected = (chosen === primary) ? secondary : primary;
        cv.bitwise_or(bridgeMask, chosen.mask, bridgeMask);
        chosen.mask.delete();
        rejected.mask.delete();
    });
    searchMask.delete();

    if (cv.countNonZero(bridgeMask) > 0) {
        const bridgeCloseKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
        cv.morphologyEx(bridgeMask, bridgeMask, cv.MORPH_CLOSE, bridgeCloseKernel);
        cv.morphologyEx(bridgeMask, bridgeMask, cv.MORPH_OPEN, bridgeCloseKernel);
        bridgeCloseKernel.delete();
    }

    const env = new cv.Mat();
    const envKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(11, 11));
    cv.dilate(referenceMask, env, envKernel);
    envKernel.delete();

    const constrainedBridge = new cv.Mat();
    cv.bitwise_and(bridgeMask, env, constrainedBridge);

    const before = cv.countNonZero(src);
    cv.bitwise_or(src, constrainedBridge, src);
    const after = cv.countNonZero(src);
    const addedPx = Math.max(0, after - before);
    const keepPixels = cv.countNonZero(constrainedBridge);

    env.delete();
    bridgeMask.delete();

    return {
        addedPx,
        preserveMask: constrainedBridge,
        keepPixels
    };
}

function plasterDoorBridgeSeams(src, preserveMask, referenceMask, width, height) {
    if (!preserveMask || cv.countNonZero(preserveMask) === 0) return 0;
    if (!referenceMask || cv.countNonZero(referenceMask) === 0) return 0;

    const seamMask = new cv.Mat();
    const seamKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.dilate(preserveMask, seamMask, seamKernel);
    seamKernel.delete();

    const work = new cv.Mat();
    src.copyTo(work);

    const smoothSize = makeOdd(clampInt(Math.min(width, height) * 0.0032, 3, 7));
    const smoothKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(smoothSize, smoothSize));
    cv.morphologyEx(work, work, cv.MORPH_CLOSE, smoothKernel);
    cv.morphologyEx(work, work, cv.MORPH_OPEN, smoothKernel);
    smoothKernel.delete();

    const env = new cv.Mat();
    const envKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(9, 9));
    cv.dilate(referenceMask, env, envKernel);
    envKernel.delete();

    const smoothedSeam = new cv.Mat();
    cv.bitwise_and(work, seamMask, smoothedSeam);
    cv.bitwise_and(smoothedSeam, env, smoothedSeam);

    const before = cv.countNonZero(src);
    const invSeam = new cv.Mat();
    cv.bitwise_not(seamMask, invSeam);
    const basePart = new cv.Mat();
    cv.bitwise_and(src, invSeam, basePart);
    cv.bitwise_or(basePart, smoothedSeam, src);
    const after = cv.countNonZero(src);

    smoothedSeam.delete();
    env.delete();
    work.delete();
    invSeam.delete();
    basePart.delete();
    seamMask.delete();

    return Math.abs(after - before);
}

function countExternalContours(binaryMat) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const count = contours.size();
    contours.delete();
    hierarchy.delete();
    return count;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-6) {
        const dx = px - x1;
        const dy = py - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }
    let t = (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * vx;
    const projY = y1 + t * vy;
    const dx = px - projX;
    const dy = py - projY;
    return Math.sqrt(dx * dx + dy * dy);
}

function forceMergeWallComponentsNearDoors(src, doors, width, height) {
    if (!doors.length) return { addedPx: 0, preserveMask: null };

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(src, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    const n = contours.size();
    if (n < 2) {
        contours.delete();
        hierarchy.delete();
        return { addedPx: 0, preserveMask: null };
    }

    const areas = [];
    for (let i = 0; i < n; i++) {
        const cnt = contours.get(i);
        areas.push({ idx: i, area: Math.abs(cv.contourArea(cnt)) });
        cnt.delete();
    }
    areas.sort((a, b) => b.area - a.area);
    const aIdx = areas[0].idx;
    const bIdx = areas[1].idx;
    const cntA = contours.get(aIdx);
    const cntB = contours.get(bIdx);

    let best = null;

    for (let dIdx = 0; dIdx < doors.length; dIdx++) {
        const door = doors[dIdx];
        const profile = getDoorProfile(dIdx, door);
        const cx = door.x + door.w / 2;
        const cy = door.y + door.h / 2;
        const span = Math.max(6, profile.spanPx);
        const rx1 = clampInt(cx - span * 1.2, 0, width - 1);
        const ry1 = clampInt(cy - span * 1.2, 0, height - 1);
        const rx2 = clampInt(cx + span * 1.2, 0, width - 1);
        const ry2 = clampInt(cy + span * 1.2, 0, height - 1);

        const ptsA = [];
        const ptsB = [];
        const stepA = Math.max(1, Math.floor(cntA.rows / 260));
        const stepB = Math.max(1, Math.floor(cntB.rows / 260));

        for (let r = 0; r < cntA.rows; r += stepA) {
            const x = cntA.data32S[r * 2];
            const y = cntA.data32S[r * 2 + 1];
            if (x >= rx1 && x <= rx2 && y >= ry1 && y <= ry2) ptsA.push({ x, y });
        }
        for (let r = 0; r < cntB.rows; r += stepB) {
            const x = cntB.data32S[r * 2];
            const y = cntB.data32S[r * 2 + 1];
            if (x >= rx1 && x <= rx2 && y >= ry1 && y <= ry2) ptsB.push({ x, y });
        }
        if (!ptsA.length || !ptsB.length) continue;

        let localBest = null;
        for (const pa of ptsA) {
            for (const pb of ptsB) {
                const dx = pb.x - pa.x;
                const dy = pb.y - pa.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const axisDrift = profile.horizontal ? Math.abs(dy) : Math.abs(dx);
                const alongSpan = profile.horizontal ? Math.abs(dx) : Math.abs(dy);
                if (axisDrift > Math.max(3, profile.thicknessPx * 1.25)) continue;
                if (alongSpan < Math.max(2, profile.thicknessPx * 0.7)) continue;
                const centerDist = pointToSegmentDistance(cx, cy, pa.x, pa.y, pb.x, pb.y);
                const score = dist + centerDist * 1.2 + axisDrift * 1.5;
                if (!localBest || score < localBest.score) {
                    localBest = { pa, pb, dist, centerDist, score, dIdx };
                }
            }
        }
        if (!localBest) continue;

        const maxBridge = Math.max(span * 2.4, Math.max(door.w, door.h) * 2.0);
        if (localBest.dist > maxBridge) continue;
        if (localBest.centerDist > Math.max(8, profile.thicknessPx * 1.8)) continue;
        if (!best || localBest.score < best.score) best = localBest;
    }

    let mergedPx = 0;
    let preserveMask = null;
    if (best) {
        const door = doors[best.dIdx];
        const profile = getDoorProfile(best.dIdx, door);
        const thick = makeOdd(clampInt(profile.thicknessPx * 0.92, 3, 23));

        preserveMask = cv.Mat.zeros(height, width, cv.CV_8UC1);
        cv.line(
            preserveMask,
            new cv.Point(best.pa.x, best.pa.y),
            new cv.Point(best.pb.x, best.pb.y),
            new cv.Scalar(255),
            thick,
            cv.LINE_8
        );

        const before = cv.countNonZero(src);
        cv.bitwise_or(src, preserveMask, src);
        const after = cv.countNonZero(src);
        mergedPx = Math.max(0, after - before);
        if (mergedPx <= 0) {
            preserveMask.delete();
            preserveMask = null;
        }
    }

    cntA.delete();
    cntB.delete();
    contours.delete();
    hierarchy.delete();
    return { addedPx: mergedPx, preserveMask };
}

function vectorizeMaskOpenCV(maskImageData, width, height) {
    const src = new cv.Mat(height, width, cv.CV_8UC1);
    const data = maskImageData.data;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) src.data[j] = data[i];
    const windowMask = buildRectMask(detectedWindows, width, height);
    const doorBoxMask = buildRectMask(detectedDoors, width, height);
    const doorArchMask = buildRectMask(detectedDoorArches, width, height);
    const doorBoxPixels = cv.countNonZero(doorBoxMask);
    const doorArchPixels = cv.countNonZero(doorArchMask);

    // Arch erase mask: remove arch influence, but keep door-box zones untouched.
    const archEraseMask = new cv.Mat();
    const invDoorBox = new cv.Mat();
    cv.bitwise_not(doorBoxMask, invDoorBox);
    cv.bitwise_and(doorArchMask, invDoorBox, archEraseMask);
    invDoorBox.delete();

    // Expand arch mask moderately, then protect door-box neighborhood
    // to avoid cutting the bridge corridor near openings.
    const archKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7));
    cv.dilate(archEraseMask, archEraseMask, archKernel);
    archKernel.delete();

    const doorProtect = new cv.Mat();
    const doorProtectKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(19, 19));
    cv.dilate(doorBoxMask, doorProtect, doorProtectKernel);
    doorProtectKernel.delete();
    const invDoorProtect = new cv.Mat();
    cv.bitwise_not(doorProtect, invDoorProtect);
    cv.bitwise_and(archEraseMask, invDoorProtect, archEraseMask);
    invDoorProtect.delete();
    doorProtect.delete();

    const archErasePixels = cv.countNonZero(archEraseMask);

    const imgArea = width * height;
    const minOuterArea = imgArea * 0.004;
    const minHoleArea = imgArea * 0.0015;
    let skippedDoorHoleCount = 0;
    let skippedDoorHoleArea = 0;

    const holeLooksLikeDoor = (holeContour, holeArea) => {
        if (!detectedDoors.length) return false;
        const rect = cv.boundingRect(holeContour);
        const rx1 = rect.x;
        const ry1 = rect.y;
        const rx2 = rect.x + rect.width;
        const ry2 = rect.y + rect.height;
        const rcx = rx1 + rect.width * 0.5;
        const rcy = ry1 + rect.height * 0.5;

        for (let dIdx = 0; dIdx < detectedDoors.length; dIdx++) {
            const door = detectedDoors[dIdx];
            const profile = getDoorProfile(dIdx, door);
            const pad = Math.max(2, Math.round(profile.thicknessPx * 0.35));
            const dx1 = door.x - pad;
            const dy1 = door.y - pad;
            const dx2 = door.x + door.w + pad;
            const dy2 = door.y + door.h + pad;

            const ix1 = Math.max(rx1, dx1);
            const iy1 = Math.max(ry1, dy1);
            const ix2 = Math.min(rx2, dx2);
            const iy2 = Math.min(ry2, dy2);
            const iw = ix2 - ix1;
            const ih = iy2 - iy1;
            if (iw <= 0 || ih <= 0) continue;

            const inter = iw * ih;
            const rectArea = Math.max(1, rect.width * rect.height);
            const doorArea = Math.max(1, door.w * door.h);
            const overlapRectFrac = inter / rectArea;
            const overlapDoorFrac = inter / doorArea;
            const centerInside = (rcx >= dx1 && rcx <= dx2 && rcy >= dy1 && rcy <= dy2);
            const similarScale = holeArea <= doorArea * 2.6;

            if ((overlapRectFrac >= 0.18 || overlapDoorFrac >= 0.22 || centerInside) && similarScale) {
                return true;
            }
        }
        return false;
    };

    // Door arches are symbolic curves and must not participate in wall stitching.
    const erasedArchPxBefore = eraseMaskFromWalls(src, archEraseMask);
    const wallEnvelopeBase = src.clone();
    detectedDoorProfiles = estimateOpeningProfiles(wallEnvelopeBase, detectedDoors, width, height);
    detectedWindowProfiles = estimateOpeningProfiles(wallEnvelopeBase, detectedWindows, width, height);

    // Fill symbolic regions as wall only near existing wall pixels
    // so fill stays inside local wall thickness.
    const reinforcedWindowsPx = reinforceWallsByMask(src, windowMask, width, height, wallEnvelopeBase);
    // Direct door policy (debug mode by user request):
    // simply paint detected Door box rectangles into wall mask.
    const reinforcedDoorBoxesPx = fillWallsByMask(src, doorBoxMask);
    const doorKeepUnion = doorBoxMask.clone();
    const doorLocalClosePx = 0;
    const stitchedDoorBoxesPx = 0;
    const plasteredDoorSeamsPx = 0;

    // 1) Slightly close small cracks in walls.
    const closeSize = Math.max(3, (Math.round(Math.min(width, height) * 0.006) | 1));
    let kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(closeSize, closeSize));
    cv.morphologyEx(src, src, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // Re-erase door arches after morphology too.
    const archEraseMaskAfter = new cv.Mat();
    const archAfterKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.erode(archEraseMask, archEraseMaskAfter, archAfterKernel);
    archAfterKernel.delete();
    const erasedArchPxAfter = eraseMaskFromWalls(src, archEraseMaskAfter);
    archEraseMaskAfter.delete();
    const archCleanupPx = cleanupDoorArchArtifacts(src, archEraseMask, doorBoxMask, width, height);

    let doorBridgePass2Px = 0;
    let doorForceMergePx = 0;

    const smoothedDoorSeamsPx = smoothDoorBoxSeamsByProfiles(src, detectedDoors, wallEnvelopeBase, width, height);
    // Guard rail: smoothing/cleanup must not erase door-box wall inserts.
    const repaintedDoorBoxesPx = fillWallsByMask(src, doorBoxMask);
    const lintelBoostPx = 0;
    const clippedOutsidePx = constrainWallsToEnvelope(src, wallEnvelopeBase, width, height, doorKeepUnion);
    const doorBridgeKeepPx = cv.countNonZero(doorKeepUnion);
    doorKeepUnion.delete();
    wallEnvelopeBase.delete();

    // ─── ШЛИФОВКА КОНТУРА СТЕН ────────────────────────────────────────
    // Срезаем "наконечники" — небольшие выпирающие за плоскость стены
    // протрузии, остающиеся на маске после сегментации/сращивания.
    // Симметричный эллиптический OPEN их плохо вытягивает: или не
    // достаёт, или начинает стачивать саму стену.
    //
    // Стратегия:
    //   1. Сохраняем srcBeforePolish (копия маски до шлифовки).
    //   2. medianBlur(5) — мелкий шум границы и точечные бугорки.
    //   3. Осевой OPEN линейными ядрами (H- и V-линия длиной ~9 px):
    //      режет признаки, ТОНКИЕ в одном направлении. Стены толстые
    //      в обоих измерениях, поэтому от них не отрывается ничего;
    //      наконечники, тонкие по X (или по Y), снимаются полностью.
    //   4. Маленький эллиптический CLOSE — округляет уголки от OPEN'ов.
    //   5. БЕРЕЖНО восстанавливаем защищённые зоны: всё, что внутри
    //      объединения doorBoxMask и windowMask (плюс лёгкая дилатация
    //      под склейку), берём ИЗ srcBeforePolish — там сидят door-box
    //      и window-склейки, специально дорисованные пайплайном, и
    //      шлифовка их не должна трогать. Снаружи protect-зоны — берём
    //      шлифованную версию.
    //
    // Итого: наконечники, не связанные с дверями/окнами, исчезают, а
    // склейки проёмов остаются ровно в том виде, в каком их подготовил
    // пайплайн.

    const srcBeforePolish = src.clone();

    // 1) medianBlur — снимает однопиксельный/двухпиксельный шум границы
    //    и точечные бугорки.
    cv.medianBlur(src, src, 5);

    // 2) Осевой OPEN линейными ядрами (горизонтальная и вертикальная
    //    линии длиной ~9 px на 1024-px чертеже). Линейное ядро режет
    //    признаки, тонкие В ОДНОМ направлении: вертикальный наконечник
    //    (узкий по X) падает от горизонтальной линии, горизонтальный
    //    усик (узкий по Y) — от вертикальной. Сами стены толстые в
    //    обоих измерениях, поэтому от них не отрывается ни пикселя.
    //    Симметричный эллипс этого не делает: либо не достаёт до больших
    //    наконечников, либо начинает стачивать саму стену.
    const polishLineLen = Math.max(7, (Math.round(Math.min(width, height) * 0.009) | 1));
    const polishHLine = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(polishLineLen, 1));
    cv.morphologyEx(src, src, cv.MORPH_OPEN, polishHLine);
    polishHLine.delete();
    const polishVLine = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, polishLineLen));
    cv.morphologyEx(src, src, cv.MORPH_OPEN, polishVLine);
    polishVLine.delete();

    // 3) Маленький эллиптический CLOSE — округляет уголки, появившиеся
    //    после линейных OPEN'ов.
    const polishCloseKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    cv.morphologyEx(src, src, cv.MORPH_CLOSE, polishCloseKernel);
    polishCloseKernel.delete();

    // Защитная зона: где сращивание дверей/окон прошло по маске —
    // шлифовку не применяем, возвращаем "до".
    const protectMask = new cv.Mat();
    cv.bitwise_or(doorBoxMask, windowMask, protectMask);
    const protectDilateKern = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    cv.dilate(protectMask, protectMask, protectDilateKern);
    protectDilateKern.delete();

    const invProtect = new cv.Mat();
    cv.bitwise_not(protectMask, invProtect);

    // (шлифованные пиксели вне защиты) OR (исходные пиксели в защите)
    const outsideProtect = new cv.Mat();
    cv.bitwise_and(src, invProtect, outsideProtect);
    const insideProtect = new cv.Mat();
    cv.bitwise_and(srcBeforePolish, protectMask, insideProtect);
    cv.bitwise_or(outsideProtect, insideProtect, src);

    invProtect.delete();
    outsideProtect.delete();
    insideProtect.delete();
    protectMask.delete();
    srcBeforePolish.delete();

    // Подчищаем мелкие изолированные островки (одиночные блобы шума
    // вне основного массива стен), которые не связаны ни с одной
    // стеной и не сидят в защитной зоне.
    {
        const labels = new cv.Mat();
        const stats = new cv.Mat();
        const centroids = new cv.Mat();
        const numLabels = cv.connectedComponentsWithStats(src, labels, stats, centroids, 8, cv.CV_32S);
        const minIslandArea = Math.max(40, Math.round(width * height * 0.00015));
        for (let lbl = 1; lbl < numLabels; lbl++) {
            const area = stats.intPtr(lbl, cv.CC_STAT_AREA)[0];
            if (area < minIslandArea) {
                const x = stats.intPtr(lbl, cv.CC_STAT_LEFT)[0];
                const y = stats.intPtr(lbl, cv.CC_STAT_TOP)[0];
                const w = stats.intPtr(lbl, cv.CC_STAT_WIDTH)[0];
                const h = stats.intPtr(lbl, cv.CC_STAT_HEIGHT)[0];
                for (let yy = y; yy < y + h; yy++) {
                    for (let xx = x; xx < x + w; xx++) {
                        if (labels.intPtr(yy, xx)[0] === lbl) {
                            src.ucharPtr(yy, xx)[0] = 0;
                        }
                    }
                }
            }
        }
        labels.delete();
        stats.delete();
        centroids.delete();
        // Если фильтр вдруг съел что-то из door-box, сразу восстанавливаем.
        fillWallsByMask(src, doorBoxMask);
    }
    // ──────────────────────────────────────────────────────────────────

    const wallRegions = [];
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

    const contourToPoints = (contour, epsilon = 4.0) => {
        const poly = new cv.Mat();
        cv.approxPolyDP(contour, poly, epsilon, true);
        const points = [];
        for (let j = 0; j < poly.rows; ++j) {
            points.push({ x: poly.data32S[j * 2], y: poly.data32S[j * 2 + 1] });
        }
        poly.delete();
        return points;
    };

    const touchesBorder = (contour) => {
        const rect = cv.boundingRect(contour);
        return rect.x <= 1 || rect.y <= 1 || (rect.x + rect.width) >= (width - 1) || (rect.y + rect.height) >= (height - 1);
    };

    let stageA = 0; // outer wall contours with room holes
    for (let i = 0; i < contours.size(); ++i) {
        const parent = hierarchy.data32S[i * 4 + 3];
        if (parent !== -1) continue;

        const outer = contours.get(i);
        const outerArea = cv.contourArea(outer);
        if (outerArea < minOuterArea || outerArea > imgArea * 0.995) continue;

        const outerPoints = ensureWinding2D(contourToPoints(outer, 4.0), true);
        if (outerPoints.length < 3) continue;

        const holes = [];
        let child = hierarchy.data32S[i * 4 + 2];
        while (child !== -1) {
            const holeContour = contours.get(child);
            const holeArea = cv.contourArea(holeContour);
            if (holeArea >= minHoleArea) {
                if (holeLooksLikeDoor(holeContour, holeArea)) {
                    skippedDoorHoleCount++;
                    skippedDoorHoleArea += holeArea;
                } else {
                    const holePoints = ensureWinding2D(contourToPoints(holeContour, 4.0), false);
                    if (holePoints.length >= 3) holes.push(holePoints);
                }
            }
            child = hierarchy.data32S[child * 4 + 0];
        }

        // If this large contour has no inner holes, it's often a bad "filled building" case.
        // Keep it only when the area is clearly not the whole footprint.
        if (holes.length === 0 && outerArea > imgArea * 0.65) continue;

        wallRegions.push({ outer: outerPoints, holes });
        stageA++;
    }

    contours.delete();
    hierarchy.delete();

    // Stage B fallback: recover from room holes by converting parent contour + all its children into wall regions.
    let stageB = 0;
    if (wallRegions.length === 0) {
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); ++i) {
            const parent = hierarchy.data32S[i * 4 + 3];
            if (parent !== -1) continue;

            const outer = contours.get(i);
            const outerArea = cv.contourArea(outer);
            if (outerArea < minOuterArea || outerArea > imgArea * 0.998) continue;

            const outerPoints = ensureWinding2D(contourToPoints(outer, 4.0), true);
            if (outerPoints.length < 3) continue;

            const holes = [];
            let child = hierarchy.data32S[i * 4 + 2];
            while (child !== -1) {
                const holeContour = contours.get(child);
                const holeArea = cv.contourArea(holeContour);
                if (holeArea >= minHoleArea) {
                    if (holeLooksLikeDoor(holeContour, holeArea)) {
                        skippedDoorHoleCount++;
                        skippedDoorHoleArea += holeArea;
                    } else {
                        const holePoints = ensureWinding2D(contourToPoints(holeContour, 4.0), false);
                        if (holePoints.length >= 3) holes.push(holePoints);
                    }
                }
                child = hierarchy.data32S[child * 4 + 0];
            }

            if (holes.length === 0 && outerArea > imgArea * 0.7) continue;
            wallRegions.push({ outer: outerPoints, holes });
            stageB++;
        }

        contours.delete();
        hierarchy.delete();
    }

    // Stage C (last fallback): old behavior, contours of wall blobs.
    // Kept only to avoid total failure when rooms are not closed.
    let stageC = 0;
    if (wallRegions.length === 0) {
        contours = new cv.MatVector();
        hierarchy = new cv.Mat();
        cv.findContours(src, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); ++i) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            if (area < minOuterArea || area > imgArea * 0.92) continue;
            if (touchesBorder(cnt)) continue;

            const points = ensureWinding2D(contourToPoints(cnt, 3.0), true);
            if (points.length >= 3) {
                wallRegions.push({ outer: points, holes: [] });
                stageC++;
            }
        }

        contours.delete();
        hierarchy.delete();
    }

    const maskPreviewDataUrl = binaryMatToDataUrl(src);
    src.delete();
    windowMask.delete();
    doorBoxMask.delete();
    doorArchMask.delete();
    archEraseMask.delete();

    const profileAvgThickness = detectedDoorProfiles.length
        ? (detectedDoorProfiles.reduce((s, p) => s + p.thicknessPx, 0) / detectedDoorProfiles.length)
        : 0;
    console.log(`[vectorize] windows-filled=${reinforcedWindowsPx}px, door-boxes-filled=${reinforcedDoorBoxesPx}px, door-boxes-local-close=${doorLocalClosePx}px, door-boxes-stitched=${stitchedDoorBoxesPx}px, door-boxes-repaint=${repaintedDoorBoxesPx}px, door-bridge-keep=${doorBridgeKeepPx}px, door-bridge-pass2=${doorBridgePass2Px}px, door-force-merge=${doorForceMergePx}px, door-box-mask=${doorBoxPixels}px, door-seam-smooth=${smoothedDoorSeamsPx}px, door-seam-plaster=${plasteredDoorSeamsPx}px, lintel-boost=${lintelBoostPx}px, clipped-outside=${clippedOutsidePx}px, door-profile-avg-thickness=${profileAvgThickness.toFixed(2)}px, door-arch-mask=${doorArchPixels}px, door-arch-erased=${archErasePixels}px, arch-cut-before=${erasedArchPxBefore}px, arch-cut-after=${erasedArchPxAfter}px, arch-cleanup=${archCleanupPx}px, door-holes-skipped=${skippedDoorHoleCount}, door-holes-area=${Math.round(skippedDoorHoleArea)}px, A(wall-regions)=${stageA}, B(parent+holes)=${stageB}, C(blob-fallback)=${stageC}, total=${wallRegions.length}`);
    return { wallRegions, maskPreviewDataUrl };
}
function adjustCameraToWalls() {
    const bounds = getWallsBounds();
    if (!bounds) return;

    if (isTopDown2D) {
        const halfSize = Math.max(TOP2D_MIN_HALF_SIZE, bounds.maxDim * 0.5 * TOP2D_PADDING);
        const height = Math.max(WALL_HEIGHT + 4, bounds.size.y + 4);
        top2DHalfSize = halfSize;
        camera.setTarget(bounds.center);
        camera.alpha = -Math.PI / 2;
        camera.beta = TOP2D_EPS;
        camera.radius = height;
        camera.lowerBetaLimit = TOP2D_EPS;
        camera.upperBetaLimit = TOP2D_EPS;
        camera.lowerRadiusLimit = height;
        camera.upperRadiusLimit = height;
        applyOrthographicFrustum(top2DHalfSize);
        return;
    }

    camera.setTarget(bounds.center);
    camera.radius = bounds.maxDim * 2.2;
    camera.alpha  = Math.PI / 2.5;
    camera.beta   = Math.PI / 3.5;
}

// --------------------- Р Р•РќР”Р•Р РРќР“ ---------------------
// --------------------- КАТАЛОГ МЕБЕЛИ / GLB ---------------------
// Каждый предмет из каталога грузится по URL, оборачивается в невидимый
// меш-«ручку», и в зависимости от mount-типа:
//   - 'floor' → ставится низом на y=0, drag по плоскости XZ;
//   - 'wall'  → сначала ждём клика по стене, потом крепим спинкой к
//              picked-точке (отступ по normal на половину глубины модели),
//              высота настраивается слайдером.
const placedItems = [];          // handles всех placed-предметов
let selectedPlacedItem = null;   // выбранный handle (для item-panel)
let pendingWallPlacement = null; // { url, label, slug } — ждём wall-click

// Кэш «плоских вертикальных граней стен» — собирается после buildWallsFromRegions.
// Используется механикой snap'а: при перетаскивании напольных предметов
// (диваны/кровати/тумбы/…) считаем расстояние до этих плоскостей и, если
// меньше WALL_SNAP_DISTANCE, прилипаем спинкой к стене.
let wallFacePlanes = [];
const WALL_SNAP_DISTANCE = 0.30; // м, между «спиной» предмета и стеной

// Известные реальные размеры некоторых моделей (м, W × D × H). Если найдено —
// модель масштабируется к этим габаритам; иначе берётся «как есть»
// с эвристикой против явно гигантских/микроскопических GLB-ок.
// Скейл применяется ЕДИНЫМ коэффициентом по самой длинной оси, поэтому
// для кровати «длину» 2.03 м кладём в depth — она и так доминантная,
// важно лишь правильно указать максимум.
// Известные реальные размеры моделей. По умолчанию loader делает ОДНОРОДНЫЙ
// скейл по самой длинной оси — это сохраняет пропорции Blender-модели.
// Флаг nonUniform: true → каждая ось скейлится независимо под свой target.
// Это нужно для предметов, чья Blender-модель имеет неверные пропорции
// относительно «магазинных» размеров (например, у саусер-люстр).
const GLB_REAL_DIMS = {
    'Parma':          { width: 1.935, depth: 0.83,  height: 0.75 }, // диван 193.5 × 83 × 75 см
    'Wardrobe':       { width: 1.20,  depth: 0.52,  height: 2.20 }, // шкаф 120 × 52 × 220 см
    'Astoria':        { width: 0.464, depth: 0.448, height: 0.40 }, // тумба 46.4 × 44.8 × 40 см
    'Hilton':         { width: 1.335, depth: 0.192, height: 0.24 }, // полка 133.5 × 19.2 × 24 см
    'Slide':          { width: 1.10,  depth: 0.75,  height: 0.68 }, // стол 110 × 75 × 68 см
    'Harmony':        { width: 1.452, depth: 2.032, height: 0.78 }, // кровать 145.2 × 78 × 203.2 (длина в depth)
    'Moderli Scandi': { width: 0.74,  depth: 0.74,  height: 0.16, nonUniform: true }, // потолочная люстра-саусер
    'Relisan Xenia':  { width: 1.50,  depth: 0.75,  height: 0.42 }, // ванна 150 × 75 × 42 см (длина × ширина × высота)

    // --- Beds (длина в depth) ---
    'Kapri':          { width: 1.452, depth: 2.032, height: 0.70 }, // кровать 145.2 × 70 × 203.2 см
    'Khelen':         { width: 0.97,  depth: 2.114, height: 0.928 }, // кровать 97 × 92.8 × 211.4 см

    // --- Wardrobe (ширина × высота × глубина по входным данным) ---
    'Khilton':        { width: 1.35,  depth: 0.528, height: 2.26 }, // шкаф 135 × 226 × 52.8 см
    'Evans':          { width: 0.90,  depth: 0.37,  height: 1.98 }, // шкаф 90 × 198 × 37 см
    'Shk':            { width: 0.601, depth: 0.52,  height: 2.05 }, // шкаф 60.1 × 205 × 52 см

    // --- Curbstones (ширина × глубина × высота) ---
    'Barselona':      { width: 1.601, depth: 0.368, height: 0.418 }, // тумба 160.1 × 36.8 × 41.8 см
    'Kvadro':         { width: 2.04,  depth: 0.54,  height: 0.43 }, // тумба 204 × 54 × 43 см

    // --- Sofas (ширина × глубина × высота) ---
    'Slim':           { width: 2.06,  depth: 0.91,  height: 1.53 }, // диван 206 × 91 × 153 см
    'Uno':            { width: 2.04,  depth: 0.89,  height: 0.87 }, // диван 204 × 89 × 87 см
    'Ishim':          { width: 1.83,  depth: 0.88,  height: 0.98 }, // диван 183 × 88 × 98 см

    // --- Heating (настенные панельные радиаторы; depth = вылет от стены) ---
    // wallFaceAxis: лицо модели в локальных координатах ('+z' дефолт; для
    // нестандартно ориентированных GLB ставим ту ось, по которой авторен
    // фасад радиатора). Если 90° не туда — переставить '+x' ↔ '-x',
    // если на 180° — поменять '+z' ↔ '-z'.
    'Royal Thermo VC22':  { width: 0.60, depth: 0.10, height: 0.20, wallFaceAxis: '+x' }, // 60 × 10 × 20 см (Д × Г × В)
    'Primoclima Premium': { width: 1.10, depth: 0.07, height: 0.50, wallFaceAxis: '-z' }, // 110 × 7 × 50 см (Д × Г × В)

    // --- Windows (декоративные настенные оконные панели) ---
    // ВАЖНО: первая буква "Р" — кириллическая, как в имени папки на диске.
    // Для окон wallFaceAxis НЕ задаём: deriveWallFaceAxis сам подберёт ось
    // по фактической форме GLB (длинная горизонталь = ширина вдоль стены).
    // Иначе при non-uniform fitToOpening разъезжаются ширина и глубина:
    // глубина растягивается вместо ширины, и видимая модель «уплощается»
    // не по той оси.
    'Рexay Experience Constanta x3': { width: 1.80, depth: 0.10, height: 1.20, wallEmbed: 'flush' }, // 180 × 10 × 120 см
    'Рexay Experience Constanta x2': { width: 1.00, depth: 0.10, height: 1.10, wallEmbed: 'flush' }, // 100 × 10 × 110 см

    // --- Kitchen (напольный гарнитур) ---
    'Azaliya':        { width: 2.00, depth: 0.60, height: 2.16 } // кухня 200 × 60 × 216 см (Ш × Г × В)
};
const DEFAULT_WALL_MOUNT_Y = 1.50; // высота низа полки по умолчанию, м

// Какая локальная ось wall-mount модели «выходит наружу» от стены.
// Если realDims.wallFaceAxis задан явно — уважаем его (там может быть '-z'/'-x'
// для GLB, авторенных «спиной вперёд», что bbox по форме не отличить).
// Иначе авто-выбираем по форме модели: из горизонтальных осей X и Z длинная —
// это «ширина по стене», короткая — «глубина поперёк». Robust для радиаторов,
// окон, полок — у них явно есть «длинная» сторона и «тонкая» глубина.
function deriveWallFaceAxis(bboxSize, realDims) {
    if (realDims && typeof realDims.wallFaceAxis === 'string') return realDims.wallFaceAxis;
    return (bboxSize.x >= bboxSize.z) ? '+z' : '+x';
}

// Собирает мировой bbox через канонический Babylon-метод getHierarchyBoundingVectors —
// он корректно учитывает все вложенные трансформы (включая __root__ из GLTF-конверсии).
function computeHierarchyBBox(rootNode, meshes) {
    // Принудительно пересчитываем мировые матрицы перед запросом bbox, иначе сразу после
    // ImportMesh / после изменения scaling Babylon может вернуть устаревшие minimumWorld.
    // ВАЖНО: сначала родитель, потом дети. computeWorldMatrix(true) детей читает
    // ТЕКУЩУЮ world matrix родителя — если она протухла после root.rotate/scale,
    // дети посчитают свою world matrix против устаревшего parent, и bbox/center
    // получатся со сдвигом. Особенно заметно у GLB с не-тривиальной локальной
    // иерархией под __root__ (window-рамы с отдельными мешами стёкол/штапиков).
    rootNode.computeWorldMatrix && rootNode.computeWorldMatrix(true);
    if (meshes) meshes.forEach(m => m.computeWorldMatrix && m.computeWorldMatrix(true));

    const r = rootNode.getHierarchyBoundingVectors(true);
    if (!r || !isFinite(r.min.x) || !isFinite(r.max.x)) return null;
    return {
        min: r.min,
        max: r.max,
        size: r.max.subtract(r.min),
        center: r.min.add(r.max).scale(0.5)
    };
}

// Унифицированный загрузчик. Принимает либо строку (legacy: имя папки в
// /static/models/glb/<name>/), либо config-объект:
//   { url, label, slug, mount: 'floor'|'wall', initialPosition?, wallNormal? }
function loadGlbAndAddToScene(arg) {
    const cfg = (typeof arg === 'string')
        ? { url: `/static/models/glb/${arg}/base_basic_pbr.glb`, label: arg, slug: arg, mount: 'floor' }
        : arg;

    const url = cfg.url;
    if (!url) return;
    const label = cfg.label || cfg.slug || 'item';
    const mount = (cfg.mount === 'wall' || cfg.mount === 'ceiling') ? cfg.mount : 'floor';
    const lastSlash = url.lastIndexOf('/');
    const rootUrl = url.substring(0, lastSlash + 1);
    const fileName = url.substring(lastSlash + 1);

    // Toast / lock-трекинг. cfg._silent === true (используется в
    // restoreSceneFromState) подавляет уведомления — там свой preloader,
    // и 20 toast'ов на восстановление сцены превратились бы в шум.
    const silent = cfg._silent === true;
    let loadToastId = null;
    if (!silent) {
        if (typeof window.uiBeginLoad === 'function') window.uiBeginLoad(label);
        if (typeof window.uiToast === 'function') {
            loadToastId = window.uiToast(`Загружаю «${label}»…`, {
                type: 'loading',
                duration: 0,
            });
        }
    }
    // Финализатор — закрывает loading-toast, снимает lock, опционально
    // показывает success/error. Вызывается из ОБЕИХ веток ImportMesh.
    function finishLoad(kind, message) {
        if (silent) return;
        if (typeof window.uiEndLoad === 'function') window.uiEndLoad(label);
        if (loadToastId && typeof window.uiDismissToast === 'function') {
            window.uiDismissToast(loadToastId);
            loadToastId = null;
        }
        if (typeof window.uiToast === 'function') {
            if (kind === 'success') {
                window.uiToast(`«${label}» добавлен на сцену`, { type: 'success', duration: 2200 });
            } else if (kind === 'error') {
                window.uiToast(message || `Не удалось загрузить «${label}»`, { type: 'error', duration: 4000 });
            }
        }
    }

    BABYLON.SceneLoader.ImportMesh('', rootUrl, fileName, scene, function (meshes) {
        if (!meshes || meshes.length === 0) {
            console.warn('GLB загружен без мешей:', label);
            finishLoad('error', `«${label}»: GLB без мешей`);
            return;
        }

        const root = meshes[0];

        // 1) bbox «как есть» после загрузки (с учётом GLTF→Babylon-конверсии в __root__).
        let bbox = computeHierarchyBBox(root, meshes);
        if (!bbox) {
            console.warn('GLB без геометрии:', label);
            finishLoad('error', `«${label}»: GLB без геометрии`);
            return;
        }
        const beforeSize = { x: +bbox.size.x.toFixed(3), y: +bbox.size.y.toFixed(3), z: +bbox.size.z.toFixed(3) };

        // 2) Масштаб. Если есть точные размеры в GLB_REAL_DIMS — масштабируем
        //    к ним; иначе для совсем уж невменяемых габаритов (> 8 м или < 0.1 м)
        //    нормализуем самую длинную ось к 1.5 м, чтобы модель просто была видна.
        const realDims = GLB_REAL_DIMS[label];

        // 2a) Подгонка под проём окна. Если cfg.fitToOpening = {width, height, depth}
        //     задано, скейлим под ширину и высоту проёма. Ось глубины
        //     ОСТАВЛЯЕМ как у GLB: рама окна имеет конкретную физическую
        //     толщину (≈10 см), и подгонка её под толщину стены искажает
        //     профиль рамы — стёкла «расплываются», штапики становятся
        //     длиннее и т.п. fit.depth используется только как метрика
        //     для wallEmbed (через halfDepth), но не как target.
        //     Какая локальная ось — «глубина», какая — «ширина», определяет
        //     deriveWallFaceAxis (по форме модели, если не задано явно).
        //     Высота всегда = локальная Y. Сохраняем выбранный axis в
        //     cfg._derivedWallFaceAxis, чтобы wall-mount блок ниже не
        //     пересчитал его после уже изменённого bbox.
        if (cfg.fitToOpening) {
            const fit = cfg.fitToOpening;
            const wfa = deriveWallFaceAxis(bbox.size, realDims);
            const xIsDepth = (wfa === '+x' || wfa === '-x');
            const sX = xIsDepth ? 1 : (fit.width / Math.max(1e-9, bbox.size.x));
            const sY = fit.height                / Math.max(1e-9, bbox.size.y);
            const sZ = xIsDepth ? (fit.width / Math.max(1e-9, bbox.size.z)) : 1;
            root.scaling.x *= sX; root.scaling.y *= sY; root.scaling.z *= sZ;
            bbox = computeHierarchyBBox(root, meshes);
            cfg._derivedWallFaceAxis = wfa;
            console.log(`📦 fitToOpening «${label}»`, {
                wallFaceAxis: wfa,
                fit,
                bboxAfter: { x: +bbox.size.x.toFixed(3), y: +bbox.size.y.toFixed(3), z: +bbox.size.z.toFixed(3) }
            });
        } else if (realDims) {
            if (realDims.nonUniform) {
                // Каждая ось скейлится индивидуально. Подходит, когда
                // пропорции Blender-модели не совпадают с реальными.
                const sX = realDims.width  / Math.max(1e-9, bbox.size.x);
                const sY = realDims.height / Math.max(1e-9, bbox.size.y);
                const sZ = realDims.depth  / Math.max(1e-9, bbox.size.z);
                root.scaling.x *= sX; root.scaling.y *= sY; root.scaling.z *= sZ;
                bbox = computeHierarchyBBox(root, meshes);
            } else {
                const targetMax = Math.max(realDims.width, realDims.depth, realDims.height);
                const currentMax = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
                if (currentMax > 1e-9) {
                    const s = targetMax / currentMax;
                    root.scaling.x *= s; root.scaling.y *= s; root.scaling.z *= s;
                    bbox = computeHierarchyBBox(root, meshes);
                }
            }
        } else {
            const currentMax = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
            if (currentMax > 8 || currentMax < 0.1) {
                const s = 1.5 / currentMax;
                root.scaling.x *= s; root.scaling.y *= s; root.scaling.z *= s;
                bbox = computeHierarchyBBox(root, meshes);
            }
        }

        const size = bbox.size;
        const center = bbox.center;

        // 3) Куда ставим. Floor — низ на пол, центр X/Z над cfg.initialPosition
        // (или над центром первой комнаты). Wall — ориентация по wallNormal,
        // отступ от стены на половину глубины, чтобы спинка лежала на поверхности.
        const init = cfg.initialPosition || findScenePlacementPoint();
        let yaw = 0;
        let targetCenter;
        let halfDepth = 0;

        if (mount === 'wall' && cfg.wallNormal) {
            const nx = cfg.wallNormal.x, nz = cfg.wallNormal.z;
            const nlen = Math.hypot(nx, nz) || 1;
            const nxN = nx / nlen, nzN = nz / nlen;
            // Babylon после GLTF-конверсии обычно даёт «лицо» модели по +Z в
            // local space. Поворачиваем так, чтобы local +Z смотрел вдоль
            // wallNormal (наружу от стены). yaw = atan2(nx, nz).
            //
            // Не у всех GLB «лицо» именно по +Z: панельные радиаторы и
            // Рexay-окна авторены с длинной осью по локальной Z (а толщина
            // по X), Primoclima — с лицом по -Z. Для таких моделей в
            // GLB_REAL_DIMS можно прописать wallFaceAxis: '+z'|'-z'|'+x'|'-x',
            // и loader сам добавит компенсирующий поворот и возьмёт
            // правильную ось как «глубину» (вылет от стены). Если в realDims
            // не указано — deriveWallFaceAxis выбирает по форме bbox.
            // Для fitToOpening axis уже был зафиксирован выше (по bbox ДО
            // non-uniform скейла) — переиспользуем, иначе после скейла
            // соотношение X/Z могло поменяться, и автоопределение перепутает.
            const wallFaceAxis = cfg._derivedWallFaceAxis
                || deriveWallFaceAxis(bbox.size, realDims);
            let extraYaw = 0;
            let halfDepthLocal;
            switch (wallFaceAxis) {
                case '-z': extraYaw =  Math.PI;     halfDepthLocal = size.z / 2; break;
                case '+x': extraYaw = -Math.PI / 2; halfDepthLocal = size.x / 2; break;
                case '-x': extraYaw =  Math.PI / 2; halfDepthLocal = size.x / 2; break;
                case '+z':
                default:   extraYaw =  0;           halfDepthLocal = size.z / 2; break;
            }
            yaw = Math.atan2(nxN, nzN) + extraYaw;

            halfDepth = halfDepthLocal;
            // «Где модель сидит относительно плоскости стены», управляется
            // полем wallEmbed в GLB_REAL_DIMS:
            //   • 'back'   (дефолт) — спина на стене, фасад в комнату на depth;
            //   • 'center' — центр модели в плоскости стены (пополам);
            //   • 'flush'  — лицо модели в плоскости стены, корпус уезжает
            //                «в стену» (= за плоскость, наружу от комнаты).
            // Радиаторы вешаются на 'back' (батарея торчит). Окна — на 'flush':
            // рама в плоскости стены, depth 10 см уходит «в стену», и пользователь
            // не видит торчащего перпендикулярно стене 10-см ребра.
            // cfg.forcedWallEmbed имеет приоритет над GLB_REAL_DIMS.wallEmbed,
            // чтобы установка в проём окна могла принудительно «утопить»
            // даже модель, у которой в каталоге задан 'back'.
            const wallEmbed = (typeof cfg.forcedWallEmbed === 'string')
                ? cfg.forcedWallEmbed
                : (realDims && typeof realDims.wallEmbed === 'string')
                    ? realDims.wallEmbed : 'back';
            let centerOffset;
            switch (wallEmbed) {
                case 'center': centerOffset = 0; break;
                case 'flush':  centerOffset = -halfDepthLocal; break;
                case 'back':
                default:       centerOffset =  halfDepthLocal; break;
            }
            const baseY = (typeof cfg.initialY === 'number') ? cfg.initialY : DEFAULT_WALL_MOUNT_Y;
            targetCenter = new BABYLON.Vector3(
                init.x + nxN * centerOffset,
                baseY + size.y / 2,
                init.z + nzN * centerOffset
            );
        } else if (mount === 'ceiling') {
            // Подвес: верх bbox прижимаем к потолку (за вычетом мелкого зазора),
            // X/Z — где скажет init. Игнорируем wall snap полностью.
            const topGap = 0.02;
            targetCenter = new BABYLON.Vector3(
                init.x,
                Math.max(size.y / 2, WALL_HEIGHT - size.y / 2 - topGap),
                init.z
            );
        } else {
            targetCenter = new BABYLON.Vector3(init.x, size.y / 2, init.z);
        }

        // ЦЕНТРОВКА И ПОВОРОТ. Двухходовка: 1) сдвигаем root так, чтобы
        // bbox.center лёг на targetCenter; 2) rotateAround(targetCenter, ...)
        // крутит модель вокруг этого pivot'а — bbox.center остаётся на месте,
        // т.к. pivot и центр совпадают.
        const bboxCenterBefore = bbox.center.clone();
        const preDelta = targetCenter.subtract(bbox.center);
        root.position.addInPlace(preDelta);
        root.computeWorldMatrix(true);
        if (yaw !== 0) {
            root.rotateAround(targetCenter, BABYLON.Axis.Y, yaw);
            root.computeWorldMatrix(true);
        }

        // Контрольная сверка: где реально лёг bbox-центр vs куда метили.
        // Если diff > 1 см — где-то в loader'е баг центровки.
        const verifyBBox = computeHierarchyBBox(root, meshes);
        const verifyCenter = verifyBBox ? verifyBBox.center : new BABYLON.Vector3(NaN, NaN, NaN);
        const diff = verifyCenter.subtract(targetCenter);
        console.log(`📦 «${label}» (${mount})`, {
            before: beforeSize,
            after: { x: +size.x.toFixed(3), y: +size.y.toFixed(3), z: +size.z.toFixed(3) },
            bboxBefore: { x: +bboxCenterBefore.x.toFixed(3), y: +bboxCenterBefore.y.toFixed(3), z: +bboxCenterBefore.z.toFixed(3) },
            target: { x: +targetCenter.x.toFixed(3), y: +targetCenter.y.toFixed(3), z: +targetCenter.z.toFixed(3) },
            actual: { x: +verifyCenter.x.toFixed(3), y: +verifyCenter.y.toFixed(3), z: +verifyCenter.z.toFixed(3) },
            diff:   { x: +diff.x.toFixed(3),         y: +diff.y.toFixed(3),         z: +diff.z.toFixed(3) },
            yaw:    +yaw.toFixed(3)
        });

        // 4) Невидимая «ручка» — общий пикабл-объект и контейнер для drag/select.
        // Размеры берём по локальным осям модели; вращение копируем с root'а,
        // чтобы oriented bounding box хэндла совпадал с видимой моделью.
        // Без этого тонкие/длинные предметы (радиаторы, окна) сложно
        // подцепить: видимый меш лежит вдоль стены, а axis-aligned хэндл
        // торчит поперёк, и клик «промахивается» мимо его узкой полоски.
        // Минимум 0.12 м по каждой оси — гарантия, что 7-сантиметровый
        // радиатор не получит «лезвие» вместо кликабельной зоны.
        const handleId = `glbHandle_${cfg.slug || label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const HANDLE_MIN = 0.12;
        const handle = BABYLON.MeshBuilder.CreateBox(handleId, {
            width:  Math.max(size.x, HANDLE_MIN),
            height: Math.max(size.y, HANDLE_MIN),
            depth:  Math.max(size.z, HANDLE_MIN)
        }, scene);
        handle.position.copyFrom(targetCenter);
        if (yaw !== 0) handle.rotation.y = yaw;
        handle.visibility = 0;
        handle.isPickable = true;
        handle.isGlbHandle = true;
        handle.metadata = {
            label,
            slug: cfg.slug || label,
            mount,
            wallNormal: cfg.wallNormal ? { x: cfg.wallNormal.x, z: cfg.wallNormal.z } : null,
            size: { x: size.x, y: size.y, z: size.z },
            halfDepth,
            // Зафиксированный Y центра хэндла для drag'а: пол — низ на полу,
            // потолок — верх под потолком, стена — задаётся слайдером высоты.
            anchorY: targetCenter.y,
            floorY: size.y / 2 // legacy alias
        };
        root.setParent(handle);

        meshes.forEach(m => {
            if (m === root) return;
            m.isPickable = false;
            if (typeof shadowGenerator !== 'undefined' && shadowGenerator) {
                shadowGenerator.addShadowCaster(m);
            }
            // Также регистрируем меш у каждой уже размещённой лампы со
            // своим shadow generator'ом. Если этот mount===ceiling (то
            // есть мы грузим саму лампу), у её ещё не созданного sg
            // регистрация пройдёт ниже, при инициализации generator'а —
            // здесь только «соседи».
            placedItems.forEach(item => {
                const lampSgs = item.metadata && item.metadata.lampShadowGenerators;
                if (!lampSgs || !lampSgs.length) return;
                lampSgs.forEach(sg => {
                    try { sg.addShadowCaster(m); } catch (_) {}
                });
            });
            m.receiveShadows = true;
            // Лимит одновременных лайтов выбираем по mount:
            //   • Лампы (ceiling/wall) — 12: тело люстры должно реагировать
            //     на свои 6 собственных бульб + 3 глобальных = 9.
            //   • Мебель (floor) — 6: с PBR-текстурами sofa'ы у нас уже
            //     ~6-7 base-семплеров, + dirLight shadow = ещё 1. Каждая
            //     SpotLight с cookie+shadow добавляет ещё 2 sampler'а;
            //     при limit'е 12 двe люстры × 6 SpotLight'ов × 2 sampler'а
            //     переполняют WebGL'овский MAX_TEXTURE_IMAGE_UNITS=16.
            //     6 = 3 глобальных + 3 ближайших лампочки — достаточно
            //     для адекватной подсветки мебели рядом с люстрой.
            const lightLimit = (mount === 'ceiling' || mount === 'wall') ? 12 : 6;
            if (m.material) {
                if (m.material.subMaterials) {
                    m.material.subMaterials.forEach(sm => { if (sm) sm.maxSimultaneousLights = lightLimit; });
                } else {
                    m.material.maxSimultaneousLights = lightLimit;
                }
            }
        });

        // 5) Drag-поведение под mount-тип.
        if (mount === 'wall') {
            // Перемещение вдоль плоскости стены (нормаль = wallNormal).
            const planeNormal = new BABYLON.Vector3(cfg.wallNormal.x, 0, cfg.wallNormal.z).normalize();
            const drag = new BABYLON.PointerDragBehavior({ dragPlaneNormal: planeNormal });
            drag.useObjectOrientationForDragging = false;
            drag.moveAttached = true;
            drag.onDragStartObservable.add(() => camera.detachControl(canvas));
            drag.onDragEndObservable.add(() => {
                camera.attachControl(canvas, true);
                // Синхронизируем слайдер высоты, если этот предмет сейчас выбран.
                if (selectedPlacedItem === handle) refreshItemPanelFor(handle);
            });
            handle.addBehavior(drag);
        } else if (mount === 'ceiling') {
            // Подвес: XZ-drag, Y жёстко зафиксирован под потолком.
            // К стенам не липнем (люстры висят посередине комнаты).
            const drag = new BABYLON.PointerDragBehavior({ dragPlaneNormal: new BABYLON.Vector3(0, 1, 0) });
            drag.useObjectOrientationForDragging = false;
            drag.moveAttached = true;
            drag.onDragStartObservable.add(() => camera.detachControl(canvas));
            drag.onDragObservable.add(() => { handle.position.y = handle.metadata.anchorY; });
            drag.onDragEndObservable.add(() => {
                handle.position.y = handle.metadata.anchorY;
                camera.attachControl(canvas, true);
            });
            handle.addBehavior(drag);
        } else {
            // Floor: XZ-drag, Y центра жёстко фиксирован.
            // На каждом тике проверяем близость до стен — если ближе
            // WALL_SNAP_DISTANCE, прилипаем спинкой к ближайшей грани.
            const drag = new BABYLON.PointerDragBehavior({ dragPlaneNormal: new BABYLON.Vector3(0, 1, 0) });
            drag.useObjectOrientationForDragging = false;
            drag.moveAttached = true;
            drag.onDragStartObservable.add(() => camera.detachControl(canvas));
            drag.onDragObservable.add(() => {
                handle.position.y = handle.metadata.floorY;
                trySnapFloorItemToWall(handle);
            });
            drag.onDragEndObservable.add(() => {
                handle.position.y = handle.metadata.floorY;
                trySnapFloorItemToWall(handle);
                camera.attachControl(canvas, true);
                // Если предмет выбран и snap поменял yaw — синхронизируем слайдер.
                if (selectedPlacedItem === handle) refreshItemPanelFor(handle);
            });
            handle.addBehavior(drag);
        }

        // Подбираем источники света, которые @babylonjs/loaders создал
        // из KHR_lights_punctual внутри загружаемой модели. Они уже
        // запарентены к нодам иерархии — но при setParent(handle) выше
        // ребёнка нам надо подтянуть. Однако лайты, чьи родители — это
        // ноды модели, поедут вместе с __root__ (а __root__ теперь под handle).
        // Лайты, у которых parent === null (редко, но бывает), вручную
        // привяжем к __root__, чтобы они тоже двигались с моделью.
        const importedLights = [];
        const isDescendantOf = (node, ancestor) => {
            while (node) {
                if (node === ancestor) return true;
                node = node.parent;
            }
            return false;
        };
        scene.lights.forEach(L => {
            if (L === dirLight || L === fillLight || L === rimLight) return;
            // Babylon помечает лайты, созданные GLTF-загрузчиком: они
            // относятся к иерархии загруженного root'а (или были parent=null
            // если их забыли запарентить — тогда пристёгиваем сами).
            if (L.parent && isDescendantOf(L.parent, handle)) {
                importedLights.push(L);
                return;
            }
            if (!L.parent) {
                // Случай свободного лайта: считаем «нашим», если он
                // визуально близок к ручке (мог быть только что создан).
                const dx = L.position.x - handle.position.x;
                const dy = L.position.y - handle.position.y;
                const dz = L.position.z - handle.position.z;
                if (dx*dx + dy*dy + dz*dz < 25) {
                    L.parent = handle;
                    importedLights.push(L);
                }
            }
        });
        // Импортированные из GLB лайты на мобильном НЕ выключаем — иначе
        // сцена темнеет (если пользователь поставил лампы для основного
        // освещения, без них становится «свет пропал»). Per-fragment
        // нагрузку всё равно режет maxSimultaneousLights = 2 на материалах:
        // шейдер считает только 2 ближайших лайта, остальные просто живут
        // в scene.lights как кандидаты для пикселей рядом с ними.
        // ВТОРОЙ источник лайтов: emission-меши. Это удобный воркфлоу в
        // Blender — Plane с Emission Strength 20 внутри плафона. Сканируем
        // импортированную геометрию, СОБИРАЕМ все эмиссии (без создания
        // лайтов прямо сейчас), затем сливаем их в ОДИН PointLight в их
        // взвешенном центре. Так у каждой лампы один shadow-map (6 кубических
        // граней вместо N×6), стены реально блокируют свет, и сцена не
        // «накладывается» 6 раз вокруг люстры.
        const emissionData = [];
        const EMISSION_THRESHOLD = 1.0;     // luminance × intensity > 1.0 → лайт
        // Откалибровано: вклад 1.0 × 20 × 1.5 = 30 за одну Plane'у.
        // Финальная intensity = sum × 0.4, не меньше 30, не больше 60.
        // С такими числами свет естественно затухает на 3-3.5 м, не
        // протекая в соседние комнаты — даже если shadow-map где-то
        // прозевает тонкую стену.
        const INTENSITY_GAIN = 1.5;

        const considerMaterialEmission = (mat, worldCenter, namePrefix) => {
            if (!mat || !mat.emissiveColor) return false;
            const ec = mat.emissiveColor;
            const lum = (ec.r + ec.g + ec.b) / 3;
            // emissiveIntensity есть только у PBR (KHR_materials_emissive_strength);
            // у Standard — нет, считаем за 1.0.
            const strength = (typeof mat.emissiveIntensity === 'number') ? mat.emissiveIntensity : 1.0;
            if (lum * strength < EMISSION_THRESHOLD) return false;

            emissionData.push({
                worldCenter: worldCenter.clone(),
                color: ec.clone(),
                contribution: lum * strength * INTENSITY_GAIN,
                sourceName: namePrefix
            });
            return true;
        };

        meshes.forEach(mesh => {
            if (mesh === root) return;
            if (!mesh.material) return;
            mesh.computeWorldMatrix(true);

            // Если материал MultiMaterial (например, после Ctrl+J в Blender —
            // несколько material slot'ов на одном меше) — обходим по сабмешам,
            // каждый со своим bbox и материалом.
            if (mesh.material instanceof BABYLON.MultiMaterial && mesh.subMeshes && mesh.subMeshes.length > 1) {
                const subs = mesh.subMeshes;
                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    const subMat = mesh.material.subMaterials[sub.materialIndex];
                    const localBB = sub.getBoundingInfo().boundingBox;
                    // centerWorld у submesh — мировые координаты с учётом mesh.worldMatrix.
                    const wc = localBB.centerWorld.clone();
                    considerMaterialEmission(subMat, wc, `${mesh.name}_sub${i}`);
                }
            } else {
                const wc = mesh.getBoundingInfo().boundingBox.centerWorld.clone();
                considerMaterialEmission(mesh.material, wc, mesh.name);
            }
        });

        // ОДИН лайт на всю люстру во взвешенном центре всех emission-плоскостей.
        // Раньше пробовали по лайту на каждую плоскость (6 для саусер-люстры),
        // но это упиралось в WebGL'овский MAX_TEXTURE_IMAGE_UNITS=16:
        // 6 SpotLight'ов × (cookie + shadow) = 12 sampler'ов + dirLight shadow
        // + PBR-семплеры мебели → шейдер не компилируется.
        // Один лайт даёт расход 2 sampler'а (cookie + shadow) + 1 dirLight = 3
        // light-семплера, остаётся 13 для базовых PBR-текстур — с запасом.
        //
        // Цвет и позиция — взвешенные по contribution (intensity × luminance
        // emission-плоскости), так что более яркие плоскости тянут центр и
        // оттенок на себя. Для симметричной саусер-люстры с одинаковыми
        // бульбами это совпадает с геометрическим центром плафона.
        const emissionLights = [];
        const emissionShadowGens = [];
        if (emissionData.length) {
            const isCeilingMount = (mount === 'ceiling');
            handle.computeWorldMatrix(true);
            const invHandle = BABYLON.Matrix.Invert(handle.getWorldMatrix());
            // SpotLight с IES cookie — только для потолочных и если профиль
            // уже загружен; иначе omni-PointLight (бра/торшер или ранний рендер).
            // ВНИМАНИЕ: проверяем profile, а не texture — texture создаётся
            // СВЕЖАЯ для каждой лампы (см. комментарий у объявления
            // iesDefaultTexture). Если профиль не догрузился — fallback на
            // PointLight, без проекции.
            const useIES = isCeilingMount && iesDefaultProfile;

            let cx = 0, cy = 0, cz = 0, r = 0, g = 0, b = 0, totalContribution = 0;
            emissionData.forEach(d => {
                cx += d.worldCenter.x * d.contribution;
                cy += d.worldCenter.y * d.contribution;
                cz += d.worldCenter.z * d.contribution;
                r  += d.color.r * d.contribution;
                g  += d.color.g * d.contribution;
                b  += d.color.b * d.contribution;
                totalContribution += d.contribution;
            });
            cx /= totalContribution; cy /= totalContribution; cz /= totalContribution;
            r  /= totalContribution; g  /= totalContribution; b  /= totalContribution;
            const localPos = BABYLON.Vector3.TransformCoordinates(
                new BABYLON.Vector3(cx, cy, cz),
                invHandle
            );

            let bulb;
            if (useIES) {
                // direction (0, -1, 0) в локальной системе handle'а: yaw люстры
                // (вокруг Y) не меняет «вниз», pitch'а у потолочных нет.
                bulb = new BABYLON.SpotLight(
                    `${cfg.slug || label}_lamp`,
                    localPos,
                    new BABYLON.Vector3(0, -1, 0),
                    IES_CONE_FULL_RAD,
                    2,
                    scene
                );
                // СВЕЖАЯ projection-texture'а на каждую лампу. Babylon 7
                // диспозит её внутри SpotLight.dispose(), поэтому шарить
                // одну через несколько ламп нельзя — первая удалённая
                // утащит texture'у с собой, и у всех последующих
                // .projectionTexture окажется dead reference.
                bulb.projectionTexture = buildIESProjectionTexture(
                    iesDefaultProfile, 256, IES_CONE_HALF_RAD, scene
                );
            } else {
                bulb = new BABYLON.PointLight(
                    `${cfg.slug || label}_lamp`, localPos, scene
                );
            }
            bulb.parent = handle;
            bulb.diffuse  = new BABYLON.Color3(r, g, b);
            bulb.specular = new BABYLON.Color3(r * 0.4, g * 0.4, b * 0.4);
            bulb.falloffType = BABYLON.Light.FALLOFF_GLTF;

            if (isCeilingMount) {
                // range 4 м с FALLOFF_GLTF: достаёт до пола (≈2.85 м под
                // люстрой) с мягкой подсветкой и до боковых стен на ≈3 м.
                bulb.range = 4.0;
                if (useIES) {
                    // Один лайт «впитывает» вклад всех 6 emission-плоскостей,
                    // поэтому коэффициент применяется к суммарному contribution.
                    // IES cookie нормирована (peak=1, ось≈0.16): для интегральной
                    // яркости комнаты, близкой к 6×0.84×cookie, нужно intensity ≈ 5.
                    bulb.intensity = Math.min(5.5, Math.max(2.0, totalContribution * 0.028));
                } else {
                    bulb.intensity = Math.min(4.0, Math.max(1.5, totalContribution * 0.022));
                }
            } else {
                // Бра/торшер: одна или две emission-плоскости, отдельный
                // calibration: range и intensity рассчитаны на близкое
                // освещение угла комнаты.
                bulb.range = 3.0;
                bulb.intensity = Math.min(8.0, Math.max(3.0, totalContribution * 0.08));
            }
            // shadowMinZ/MaxZ концентрируют 32-битную precision depth map'а
            // на полезном диапазоне [shadowMinZ, range×1.1]. Без этого Babylon
            // берёт огромный [0.1, ~1000], precision падает до миллиметров на
            // расстоянии 2-4 м и даёт утечки на рёбрах T-перекрёстков.
            bulb.shadowMinZ = 0.05;
            bulb.shadowMaxZ = bulb.range * 1.1;
            emissionLights.push(bulb);

            // Shadow generator. У SpotLight — 2D shadow map (одна перспективная
            // проекция), у PointLight — cube map (6 граней). 512² хватает: на
            // 1.5 м от лампы один тексель ≈ 4.5 мм, корректно читается ребро
            // стены толщиной 5-10 см.
            // ВАЖНО — forceBackFacesOnly=FALSE: стенный материал двусторонний
            // (backFaceCulling=false, twoSidedLighting=true), и шейдер при
            // выборке тени для ВНЕШНЕЙ грани стены сравнивает её собственную
            // глубину со stored. Если в depth-pass попадает только outer-грань,
            // её stored depth ≈ её же позиция → не в тени. С false запоминается
            // ближайшая к лампе INNER-грань; внешняя позиция глубже stored и
            // корректно затеняется.
            if (createdWalls.length && typeof BABYLON.ShadowGenerator !== 'undefined') {
                // Мобильный fast-path для теней ламп: 512² (вместо 1024²),
                // hard shadow (1 texel lookup вместо 16 при PCF), refresh
                // каждый 4-й кадр (вместо каждого). Итого ~16× дешевле
                // depth-pass и ~16× дешевле sample в шейдере. Визуально:
                // тени чуть резче и могут моргать при быстром движении
                // мебели — но за платой playable FPS с лампами это
                // приемлемо. Если поверхности замечают «лесенки» — можно
                // подтянуть до 768² и QUALITY_LOW (4 sample).
                const shadowMapSize = IS_MOBILE_RENDER ? 512 : 1024;
                const sg = new BABYLON.ShadowGenerator(shadowMapSize, bulb);
                // Везде включаем PCF — даёт сглаженные края тени. Разница
                // между мобильным и десктопом — только в качестве (количество
                // sample'ов) и частоте обновления depth-pass'а.
                sg.usePercentageCloserFiltering = true;
                if (IS_MOBILE_RENDER) {
                    // QUALITY_LOW = 4 sample'а на pixel вместо 16 у HIGH.
                    // На 512²-карте этого хватает, чтобы края тени не были
                    // «квадратными», и одновременно убивает shadow-acne
                    // (ребристые полосы), которая возникала при hard shadow:
                    // 4 sample'а с разными offset'ами усредняют bias-ошибки.
                    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
                    // Refresh depth-pass раз в 4 кадра (≈15 fps вместо 60).
                    // Лампа не двигается, мебель чуть-чуть подёргается при
                    // драге — глаз не заметит лаг тени на 60–70 мс.
                    const smap = sg.getShadowMap();
                    if (smap) smap.refreshRate = 4;
                } else {
                    // QUALITY_HIGH = 16 sample'ов — чистая ровная пенумбра.
                    // Когда в сцене несколько ламп со своими SG, их пенумбры
                    // растекаются и визуально сливаются в общее размытое
                    // затенение, а не выглядят как стопка отдельных силуэтов.
                    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
                }
                // Тень не полностью чёрная: 0.35 → 65% света всё ещё блокируется,
                // но в зоне тени остаётся 35% «фоновой» подсветки от других
                // источников и переотражений. Несколько перекрывающихся
                // мягких теней визуально воспринимаются как одна общая,
                // а не как «6 разных».
                sg.setDarkness(0.35);
                sg.forceBackFacesOnly = false;
                // bias — против shadow-acne на принимающей грани; normalBias
                // сдвигает точку выборки вдоль нормали — при 0.05 м прыгает
                // за ребро поперечной стены на T-перекрёстке → утечка.
                // 0.015 м хватает убить acne и физически меньше wall-thickness.
                // На мобильном карта 512² (тексель в 2× крупнее), глубина
                // квантуется грубее — даём BIAS в 2.5× больше, иначе на
                // освещённых стенах остаются «ребристые» полосы Moiré.
                sg.bias = IS_MOBILE_RENDER ? 0.005 : 0.002;
                sg.normalBias = IS_MOBILE_RENDER ? 0.025 : 0.015;
                createdWalls.forEach(w => sg.addShadowCaster(w));
                // Полы/потолки комнаты как окклюдеры: свет вверх упирается
                // в ceiling и не «вылезает над зданием», свет настенной не
                // просачивается под пол.
                floorMeshes.forEach(f => { try { sg.addShadowCaster(f); } catch (_) {} });
                ceilingMeshes.forEach(c => { try { sg.addShadowCaster(c); } catch (_) {} });
                // Уже размещённая мебель отбрасывает тень от лампы — под
                // люстрой появляются «лежащие» тени диванов/шкафов, а не
                // только от глобального dirLight'а.
                placedItems.forEach(item => {
                    if (item === handle) return;
                    if (!item.metadata) return;
                    item.getChildMeshes(false).forEach(m => {
                        if (m === item) return;
                        try { sg.addShadowCaster(m); } catch (_) {}
                    });
                });
                emissionShadowGens.push(sg);
            }

            handle.metadata.lampShadowGenerators = emissionShadowGens;
        }

        // Что НЕ должно лампой освещаться:
        // (а) собственные меши предмета — иначе 6+ ламп взаимно «выжигают»
        //     корпус и плафоны с расстояния <0.7 м (инверсный квадрат);
        // (б) background-сетка ground (120×120) на y=-0.01 — она лежит
        //     далеко за пределами здания и через щель между нижом стены
        //     (y=0) и землёй давала фантомную подсветку всей плоскости.
        const handleMeshes = handle.getChildMeshes(false);
        const exclusionSet = handleMeshes.slice();
        if (typeof ground !== 'undefined' && ground) exclusionSet.push(ground);

        const allHandleLights = importedLights.concat(emissionLights);
        if (allHandleLights.length && exclusionSet.length) {
            allHandleLights.forEach(L => {
                L.excludedMeshes = exclusionSet.slice();
            });
        }

        const totalLights = importedLights.length + emissionLights.length;
        if (totalLights) {
            const sgs = handle.metadata?.lampShadowGenerators;
            const isSpot = emissionLights[0] && emissionLights[0].getClassName() === 'SpotLight';
            const hasCookie = !!(emissionLights[0] && emissionLights[0].projectionTexture);
            const shadowKind = sgs && sgs.length
                ? `PCF-high @ 1024² (${isSpot ? `2D${hasCookie ? ' + IES cookie' : ''}` : 'cube'}), darkness=0.35`
                : null;
            console.log(`💡 «${label}»: лайтов — ${totalLights}` +
                ` (Punctual: ${importedLights.length}, emission-плоскостей: ${emissionData.length} → ${emissionLights.length} объединённая лампа)` +
                `, тени: ${shadowKind ? `да (${shadowKind})` : 'нет (нет стен в сцене)'}, ` +
                `исключено мешей самой лампы: ${handleMeshes.length}`);
            importedLights.forEach((L, i) => {
                const c = L.diffuse;
                console.log(`  [P${i}] ${L.getClassName()}  pos=(${L.position.x.toFixed(2)}, ${L.position.y.toFixed(2)}, ${L.position.z.toFixed(2)})` +
                    `  color=(${c.r.toFixed(2)}, ${c.g.toFixed(2)}, ${c.b.toFixed(2)})  intensity=${L.intensity.toFixed(2)}`);
            });
            emissionLights.forEach((L, i) => {
                const c = L.diffuse;
                console.log(`  [E${i}] ${L.getClassName()}(bulb)  pos(local)=(${L.position.x.toFixed(2)}, ${L.position.y.toFixed(2)}, ${L.position.z.toFixed(2)})` +
                    `  color=(${c.r.toFixed(2)}, ${c.g.toFixed(2)}, ${c.b.toFixed(2)})  intensity=${L.intensity.toFixed(2)}  range=${L.range}`);
            });
        } else if (mount === 'wall' || mount === 'ceiling') {
            console.log(`⚠️  «${label}»: в GLB не нашлось источников света. ` +
                `Варианты: (1) в Blender добавь Light-объект и включи Punctual Lights, ` +
                `(2) сделай Plane с Emission Strength ≥ 5 внутри плафона.`);
        }

        placedItems.push(handle);
        // Колбэк для интеграций (например, привязки handle к window-opening
        // slot'у). Вызывается ровно один раз после регистрации в placedItems.
        if (typeof cfg.onPlaced === 'function') {
            try { cfg.onPlaced(handle); } catch (e) { console.warn('onPlaced threw:', e); }
        }
        // Cart hook: пускаем событие НА document — отдельный модуль в builder.html
        // (или любой подписчик) держит свою копию корзины и пересобирает UI.
        // Передаём сам handle как «инстанс-ключ»: deleteSelectedItem отправит
        // тот же handle в cart:remove, и подписчик уберёт нужную позицию.
        try {
            document.dispatchEvent(new CustomEvent('cart:add', {
                detail: { handle, slug: cfg.slug, label: label, mount: mount }
            }));
        } catch (_) { /* CustomEvent недоступен — браузер слишком стар, игнор */ }
        selectPlacedItem(handle);
        finishLoad('success');
    }, null, function (_scene, message, exception) {
        console.error('Ошибка загрузки GLB:', label, message, exception);
        finishLoad('error', `Не удалось загрузить «${label}»: ${message || 'неизвестная ошибка'}`);
    });
}

// --------------------------------------------------------------------------
// Каталог: точка входа из UI. Floor — грузим сразу; Wall — запускаем
// wall-pick режим и грузим только после клика по стене.
// --------------------------------------------------------------------------
function addCatalogItem(itemCfg) {
    if (!itemCfg || !itemCfg.url) return;
    // Lock: если хоть один GLB уже грузится — НЕ начинаем новый и
    // даём пользователю warning-toast (с throttle, чтобы шквал
    // повторных тапов не плодил уведомлений). Это и для floor/ceiling,
    // и для wall — wall-pick тоже отменяем, потому что после клика по
    // стене начнётся новый ImportMesh, который вступит в конфликт с
    // текущим (camera-фокус прыгает на последний loaded).
    if (typeof window.uiIsLoading === 'function' && window.uiIsLoading()) {
        if (typeof window.uiWarnBusy === 'function') window.uiWarnBusy();
        return;
    }
    if (itemCfg.mount === 'wall') {
        beginWallPickPlacement(itemCfg);
        return;
    }
    // 'ceiling' и 'floor' — грузим сразу. mount передаём как есть,
    // loadGlbAndAddToScene разведёт по drag-режимам.
    loadGlbAndAddToScene({
        url: itemCfg.url,
        label: itemCfg.label,
        slug: itemCfg.slug,
        mount: (itemCfg.mount === 'ceiling') ? 'ceiling' : 'floor'
    });
}

// --- Snap напольной мебели к стенам -------------------------------------
// Сборка плоскостей всех ВЕРТИКАЛЬНЫХ граней стен. После CSG.toMesh
// вершины wall'а лежат в мировых координатах (wall.position = 0), поэтому
// positions[] = world. Каждая submesh — одна плоскостная грань, поэтому
// её нормаль и точку берём из первого треугольника.
function collectWallFacePlanes() {
    const planes = [];
    createdWalls.forEach(wall => {
        if (!wall.subMeshes || !wall.subMeshes.length) return;
        const positions = wall.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const normals   = wall.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        const indices   = wall.getIndices();
        if (!positions || !indices) return;

        wall.subMeshes.forEach(sub => {
            const i0 = indices[sub.indexStart];
            let nx = 0, ny = 1, nz = 0;
            if (normals && normals.length >= (i0 + 1) * 3) {
                nx = normals[i0 * 3]; ny = normals[i0 * 3 + 1]; nz = normals[i0 * 3 + 2];
            }
            // Не snap'аемся к горизонтальным граням (верх/низ стены).
            if (Math.abs(ny) > 0.3) return;

            const lenXZ = Math.hypot(nx, nz) || 1;
            const nxN = nx / lenXZ, nzN = nz / lenXZ;
            const px = positions[i0 * 3], pz = positions[i0 * 3 + 2];
            // Тангенциальный вектор в XZ — перпендикуляр к нормали стены.
            const tx = -nzN, tz = nxN;

            // Границы грани вдоль тангенциального направления — нужны, чтобы
            // не snap'аться к стене, мимо которой предмет проезжает.
            let minT = Infinity, maxT = -Infinity;
            const last = sub.indexStart + sub.indexCount;
            for (let k = sub.indexStart; k < last; k++) {
                const vi = indices[k];
                const dx = positions[vi * 3]     - px;
                const dz = positions[vi * 3 + 2] - pz;
                const t = dx * tx + dz * tz;
                if (t < minT) minT = t;
                if (t > maxT) maxT = t;
            }

            planes.push({
                normal:  { x: nxN, z: nzN },
                point:   { x: px,  z: pz  },
                tangent: { x: tx,  z: tz  },
                minT, maxT
            });
        });
    });
    return planes;
}

// Ищем ближайшую снап-плоскость для centra хэндла. Возвращаем clamped-точку
// касания на стене и саму плоскость; null если ни одна не подходит.
function findNearestSnappableWallForItem(handle) {
    if (!wallFacePlanes.length) return null;
    const pos = handle.position;
    const halfDepth = handle.metadata.size.z / 2;
    const halfWidth = handle.metadata.size.x / 2;

    let best = null;
    let bestScore = Infinity;
    const snapDist = WALL_SNAP_DISTANCE;

    for (const plane of wallFacePlanes) {
        const dx = pos.x - plane.point.x;
        const dz = pos.z - plane.point.z;
        // Знаковое расстояние от центра предмета до плоскости (положительное = на «лицевой» стороне стены).
        const signedDist = dx * plane.normal.x + dz * plane.normal.z;
        if (signedDist < -0.15) continue;                 // мы за стеной — это «не та» сторона
        const backGap = signedDist - halfDepth;           // расстояние от спины предмета до стены
        if (Math.abs(backGap) > snapDist) continue;

        // Проекция вдоль стены.
        const tangT = dx * plane.tangent.x + dz * plane.tangent.z;
        const tol = halfWidth + 0.05;
        if (tangT < plane.minT - tol || tangT > plane.maxT + tol) continue;

        // Клампим тангенс так, чтобы вся ширина предмета помещалась в грань;
        // если грань короче ширины предмета — центрируем.
        const innerMinT = plane.minT + halfWidth;
        const innerMaxT = plane.maxT - halfWidth;
        const clampedT = (innerMinT <= innerMaxT)
            ? Math.max(innerMinT, Math.min(innerMaxT, tangT))
            : (plane.minT + plane.maxT) / 2;

        // Score = расстояние спины до стены + штраф за смещение тангенциального центра.
        const score = Math.abs(backGap) + 0.05 * Math.abs(clampedT - tangT);
        if (score < bestScore) {
            best = { plane, clampedT };
            bestScore = score;
        }
    }
    return best;
}

function trySnapFloorItemToWall(handle) {
    if (!handle || handle.metadata?.mount !== 'floor') return false;
    const hit = findNearestSnappableWallForItem(handle);
    if (!hit) {
        if (handle.metadata) handle.metadata.snapped = false;
        return false;
    }
    const { plane, clampedT } = hit;
    const halfDepth = handle.metadata.size.z / 2;

    const surfaceX = plane.point.x + plane.tangent.x * clampedT;
    const surfaceZ = plane.point.z + plane.tangent.z * clampedT;

    handle.position.x = surfaceX + plane.normal.x * halfDepth;
    handle.position.z = surfaceZ + plane.normal.z * halfDepth;
    handle.rotation.y = Math.atan2(plane.normal.x, plane.normal.z);

    if (handle.metadata) {
        handle.metadata.snapped = true;
        handle.metadata.snappedNormal = { x: plane.normal.x, z: plane.normal.z };
    }
    return true;
}

// --- Расстановка мебели, найденной на чертеже ----------------------------
// Класс детектора → категория каталога (slug товара = `<категория>-<имя>`,
// см. builder_page во views.py). Остальные классы (стулья, сантехника, …)
// пока без 3D-аналога в каталоге — только подсвечиваются на превью.
const FURNITURE_CATALOG = {
    sofa:         'sofas',
    bed:          'beds',
    wardrobe:     'wardrobe',
    nightstand:   'curbstones',
    tv_stand:     'curbstones',
    table:        'tables',
    desk:         'tables',
    bathtub:      'bath',
    kitchen_unit: 'kitchen'
};
const FURNITURE_WALL_GAP = 0.35; // м, рамка дальше от стены — ставим «как на чертеже», без прилипания

// Модель из категории с самым близким к рамке габаритом в плане (по GLB_REAL_DIMS).
function pickCatalogItemForFurniture(det) {
    const category = FURNITURE_CATALOG[det.cls];
    if (!category) return null;
    const long = Math.max(det.w, det.h) * MANUAL_SCALE;
    const short = Math.min(det.w, det.h) * MANUAL_SCALE;
    let best = null, bestScore = Infinity;
    document.querySelectorAll(`.add-catalog-item[data-slug^="${category}-"]`).forEach(btn => {
        if ((btn.dataset.mount || 'floor') !== 'floor' || !btn.dataset.glb) return;
        const dims = GLB_REAL_DIMS[btn.dataset.label];
        const score = dims
            ? Math.abs(Math.max(dims.width, dims.depth) - long) + Math.abs(Math.min(dims.width, dims.depth) - short)
            : 1e6;
        if (score < bestScore) {
            bestScore = score;
            best = { url: btn.dataset.glb, label: btn.dataset.label, slug: btn.dataset.slug };
        }
    });
    return best;
}

// Длинная сторона модели ложится вдоль длинной стороны рамки, «лицо» (локальная +Z,
// как в trySnapFloorItemToWall) — от ближайшей стены за спиной. Если такая стена
// рядом, прижимаем спинку к ней; иначе ставим в центр рамки.
function orientFurnitureByDetection(handle, det) {
    const size = handle.metadata.size;
    const detW = det.w * MANUAL_SCALE, detH = det.h * MANUAL_SCALE;
    const cx = (det.x + det.w / 2) * MANUAL_SCALE, cz = (det.y + det.h / 2) * MANUAL_SCALE;
    const squareish = Math.max(detW, detH) / Math.max(1e-6, Math.min(detW, detH)) < 1.25;
    const facingAlongX = (size.z > size.x) === (detW >= detH);
    const dirs = squareish ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
        : facingAlongX ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];

    let best = null;
    for (const [nx, nz] of dirs) {
        const ext = (nx !== 0 ? detW : detH) / 2;
        const backX = cx - nx * ext, backZ = cz - nz * ext;
        for (const plane of wallFacePlanes) {
            if (plane.normal.x * nx + plane.normal.z * nz < 0.95) continue;
            const gap = (backX - plane.point.x) * plane.normal.x + (backZ - plane.point.z) * plane.normal.z;
            if (gap < -0.15 || gap > FURNITURE_WALL_GAP) continue;
            const t = (cx - plane.point.x) * plane.tangent.x + (cz - plane.point.z) * plane.tangent.z;
            if (t < plane.minT - 0.05 || t > plane.maxT + 0.05) continue;
            if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { nx, nz, plane, gap, t };
        }
    }

    const [nx, nz] = best ? [best.nx, best.nz] : dirs[0];
    handle.rotation.y = Math.atan2(nx, nz);
    if (best) {
        const p = best.plane;
        handle.position.x = p.point.x + p.tangent.x * best.t + p.normal.x * size.z / 2;
        handle.position.z = p.point.z + p.tangent.z * best.t + p.normal.z * size.z / 2;
        handle.metadata.snapped = true;
        handle.metadata.snappedNormal = { x: p.normal.x, z: p.normal.z };
    } else {
        handle.position.x = cx;
        handle.position.z = cz;
    }
}

function placeDetectedFurniture() {
    furnitureNeedsPlacement = false;
    const jobs = detectedFurniture
        .map(det => ({ det, item: pickCatalogItemForFurniture(det) }))
        .filter(j => j.item);
    const skipped = detectedFurniture.length - jobs.length;
    jobs.forEach(({ det, item }) => {
        loadGlbAndAddToScene({
            url: item.url,
            label: item.label,
            slug: item.slug,
            mount: 'floor',
            initialPosition: new BABYLON.Vector3((det.x + det.w / 2) * MANUAL_SCALE, 0, (det.y + det.h / 2) * MANUAL_SCALE),
            _silent: true,
            onPlaced: handle => orientFurnitureByDetection(handle, det)
        });
    });
    console.log(`🛋 Расставляю мебель с чертежа: ${jobs.length}, без аналога в каталоге: ${skipped}`);
    if (typeof window.uiToast === 'function') {
        window.uiToast(jobs.length
            ? `Расставляю мебель с чертежа: ${jobs.length} шт.` + (skipped ? ` (${skipped} без аналога в каталоге)` : '')
            : 'Для найденной мебели нет моделей в каталоге', { type: 'success', duration: 3500 });
    }
}

function findScenePlacementPoint() {
    // Центр первой комнаты — самое разумное место «по умолчанию».
    if (Array.isArray(pendingWallRegions)) {
        for (const region of pendingWallRegions) {
            for (const hole of (region.holes || [])) {
                if (hole && hole.length >= 3) {
                    const c = polygonCentroidXY(hole);
                    return new BABYLON.Vector3(c.x * MANUAL_SCALE, 0, c.y * MANUAL_SCALE);
                }
            }
        }
    }
    if (camera && camera.target) return new BABYLON.Vector3(camera.target.x, 0, camera.target.z);
    return BABYLON.Vector3.Zero();
}

// --- Wall-pick режим (для полок) ----------------------------------------
function beginWallPickPlacement(itemCfg) {
    pendingWallPlacement = itemCfg;
    const hint = document.getElementById('placement-hint');
    const text = document.getElementById('placement-hint-text');
    if (text) text.textContent = `Кликните по стене, чтобы повесить «${itemCfg.label}»`;
    if (hint) hint.classList.add('visible');
    document.body.style.cursor = 'crosshair';
}
function cancelWallPickPlacement() {
    pendingWallPlacement = null;
    const hint = document.getElementById('placement-hint');
    if (hint) hint.classList.remove('visible');
    document.body.style.cursor = '';
}

// --- Выбор/удаление/настройка высоты -----------------------------------
function refreshItemPanelFor(handle) {
    const name = document.getElementById('item-panel-name');
    const heightRow = document.getElementById('item-panel-height-row');
    const heightSlider = document.getElementById('item-height-slider');
    const heightVal = document.getElementById('item-height-val');
    const rotRow = document.getElementById('item-panel-rotation-row');
    const rotSlider = document.getElementById('item-rotation-slider');
    const rotVal = document.getElementById('item-rotation-val');
    const flipRow = document.getElementById('item-panel-flip-row');
    if (!name) return;
    name.textContent = handle?.metadata?.label || 'Предмет';

    // FLIP 180° (только wall-mount: окна/радиаторы, у которых GLB может
    // быть авторен лицом в «не ту» сторону, а развернуть это можно только
    // поворотом вокруг вертикали — yaw для них автоматический по нормали
    // стены, поэтому слайдер вращения мы прячем; «развернуть» — отдельная
    // дискретная кнопка).
    if (flipRow) {
        flipRow.style.display = (handle?.metadata?.mount === 'wall') ? '' : 'none';
    }

    // ВЫСОТА (только полки / wall-mount)
    if (heightRow && heightSlider && heightVal) {
        if (handle?.metadata?.mount === 'wall') {
            heightRow.style.display = '';
            const sizeY = handle.metadata.size.y;
            const baseY = handle.position.y - sizeY / 2;
            const minAllowed = 0.05;
            const maxAllowed = Math.max(minAllowed + 0.05, WALL_HEIGHT - sizeY - 0.05);
            heightSlider.min = minAllowed.toFixed(2);
            heightSlider.max = maxAllowed.toFixed(2);
            heightSlider.step = '0.05';
            heightSlider.value = Math.min(maxAllowed, Math.max(minAllowed, baseY)).toFixed(2);
            heightVal.textContent = parseFloat(heightSlider.value).toFixed(2) + ' м';
        } else {
            heightRow.style.display = 'none';
        }
    }

    // ПОВОРОТ (напольные и подвесные — у настенных yaw задаётся стеной)
    if (rotRow && rotSlider && rotVal) {
        const mount = handle?.metadata?.mount;
        if (mount === 'floor' || mount === 'ceiling') {
            rotRow.style.display = '';
            // Приводим текущий yaw в диапазон [-180..180]°.
            let deg = (handle.rotation.y || 0) * 180 / Math.PI;
            deg = ((deg + 180) % 360 + 360) % 360 - 180;
            rotSlider.value = deg.toFixed(0);
            rotVal.textContent = `${Math.round(deg)}°`;
        } else {
            rotRow.style.display = 'none';
        }
    }
}

function setSelectedItemRotationDeg(deg) {
    const m = selectedPlacedItem?.metadata?.mount;
    if (!selectedPlacedItem || (m !== 'floor' && m !== 'ceiling')) return;
    selectedPlacedItem.rotation.y = deg * Math.PI / 180;
    // Ручной поворот пользователем считаем разрывом snap'а — иначе
    // следующий drag сразу же его «вернёт» и поворот пропадёт.
    if (selectedPlacedItem.metadata) selectedPlacedItem.metadata.snapped = false;
}

// Развернуть wall-mount предмет на 180° вокруг вертикали (мира Y).
// Не путать с slider-вращением: тот — для пола/потолка, а тут yaw уже
// зафиксирован стеной, и нам нужно лишь поменять «лицо ↔ спина» GLB,
// у которого автор положил front-face на «не ту» сторону. Для симметричных
// окон/радиаторов — это просто свап лево/право, что визуально незаметно;
// для асимметричных (например, окно с створкой слева) — это и есть отзеркаливание.
function flipSelectedWallItem() {
    const handle = selectedPlacedItem;
    if (!handle || handle.metadata?.mount !== 'wall') return;
    handle.rotation.y += Math.PI;
}

function selectPlacedItem(handle, anchorPoint) {
    // Любой select сцены — это переключение «фокуса» с одной 3D-сущности
    // на другую. Поэтому гасим popover'ы стены и пола перед показом
    // item-panel. Раньше тут был только deselectWallFace — пол оставался
    // выделенным и его панель «жила» поверх item-panel.
    if (selectedWallMesh)  deselectWallFace();
    if (selectedFloorMesh) deselectFloor();
    selectedPlacedItem = handle;
    const panel = document.getElementById('item-panel');
    if (!panel) return;
    refreshItemPanelFor(handle);
    // Показ панели ТОЛЬКО при наличии 3D-анкера (= пользовательский клик
    // по объекту). Программные вызовы (auto-select после GLB-импорта,
    // window.deletePlacedItemByHandle из корзины) обновят
    // selectedPlacedItem для последующих операций — но без визуального
    // popover'а, который раньше «выскакивал» в правом верхнем углу.
    if (anchorPoint && typeof anchorPoint.x === 'number') {
        panel.classList.add('visible');
        // followHandle: handle — попover пересчитывает позицию КАЖДЫЙ
        // кадр от handle.absolutePosition, поэтому едет вместе с drag'ом.
        // Без этого panel «висел» в воздухе у изначальной точки клика.
        attachPopoverToWorldPoint(panel, anchorPoint, { followHandle: handle });
    } else {
        panel.classList.remove('visible');
        detachPopover(panel);
        resetFloatingPanelPosition(panel);
    }
}

function deselectPlacedItem() {
    selectedPlacedItem = null;
    const panel = document.getElementById('item-panel');
    if (panel) {
        panel.classList.remove('visible');
        detachPopover(panel);
        resetFloatingPanelPosition(panel);
    }
}

function deleteSelectedItem() {
    if (!selectedPlacedItem) return;
    const handle = selectedPlacedItem;
    // У ламп есть собственные shadow generator'ы (cube map на каждую bulb-лампочку).
    // Снимаем их явно — иначе останутся висеть на сцене без лайтов.
    const lampSgs = handle.metadata?.lampShadowGenerators;
    if (lampSgs && lampSgs.length) {
        lampSgs.forEach(sg => { try { sg.dispose(); } catch (_) {} });
    }
    // Если это окно, привязанное к slot'у проёма — освобождаем слот, чтобы
    // pickProxy снова реагировал на клик и можно было выбрать другое окно.
    const slot = handle.metadata?.openingSlot;
    if (slot) {
        slot.installedWindow = null;
        if (slot.pickProxy) slot.pickProxy.isPickable = true;
    }
    const idx = placedItems.indexOf(handle);
    if (idx >= 0) placedItems.splice(idx, 1);
    // Cart hook: парный к cart:add event. handle здесь — тот же объект-ссылка,
    // что мы pushнули в placedItems, поэтому подписчик находит позицию по
    // строгому равенству ссылок.
    try {
        document.dispatchEvent(new CustomEvent('cart:remove', {
            detail: { handle }
        }));
    } catch (_) { /* см. cart:add */ }
    // dispose(false, true) — не пропускаем children, но удаляем материалы.
    handle.dispose(false, true);
    deselectPlacedItem();
}

function setSelectedItemHeight(baseY) {
    if (!selectedPlacedItem || selectedPlacedItem.metadata?.mount !== 'wall') return;
    const h = selectedPlacedItem;
    h.position.y = baseY + h.metadata.size.y / 2;
}

// --- UI bindings --------------------------------------------------------
// Prefetch GLB on hover / touchstart. Browser puts the response into the
// HTTP cache; when the user actually clicks, the model is already local
// and ImportMesh resolves in tens of ms instead of seconds. We deduplicate
// per-URL so hovering 10 times triggers exactly one network request.
const __glbPrefetched = new Set();
function __prefetchGlb(url) {
    if (!url || __glbPrefetched.has(url)) return;
    __glbPrefetched.add(url);
    // fetch() with default 'cors' and no-store-busting params — same URL
    // as the eventual ImportMesh request, so the browser HTTP cache reuses it.
    try {
        fetch(url, { credentials: 'same-origin' }).catch(() => {
            // Network errors are non-fatal for prefetch — the real load
            // will surface them. We just want to remove the marker so a
            // future hover can retry.
            __glbPrefetched.delete(url);
        });
    } catch (_) { /* ignore */ }
}
// Delegated: any catalog tile (including window-menu items) prefetches its glb.
['mouseenter', 'touchstart', 'focusin'].forEach(evt => {
    document.addEventListener(evt, function (e) {
        const btn = e.target.closest('.add-catalog-item, .window-menu-item');
        if (!btn) return;
        __prefetchGlb(btn.dataset.glb);
    }, { capture: true, passive: true });
});

document.addEventListener('click', function (e) {
    const btn = e.target.closest('.add-catalog-item');
    if (!btn) return;
    addCatalogItem({
        url:   btn.dataset.glb,
        label: btn.dataset.label,
        slug:  btn.dataset.slug,
        mount: btn.dataset.mount
    });
});

document.getElementById('placement-hint-cancel')?.addEventListener('click', cancelWallPickPlacement);
document.getElementById('item-panel-delete')?.addEventListener('click', deleteSelectedItem);
document.getElementById('item-panel-close')?.addEventListener('click', deselectPlacedItem);
document.getElementById('item-panel-flip')?.addEventListener('click', flipSelectedWallItem);

// --- Мини-меню выбора окна для проёма ------------------------------------
// Делегированный обработчик: клик по пункту .window-menu-item → ставим
// выбранный GLB в активный слот. Закрытие крестиком и outside-click — здесь же.
document.addEventListener('click', function (e) {
    const item = e.target.closest('.window-menu-item');
    if (item) {
        // Lock-проверка та же, что и в addCatalogItem: если идёт другая
        // загрузка — не начинаем установку нового окна, показываем warning.
        if (typeof window.uiIsLoading === 'function' && window.uiIsLoading()) {
            if (typeof window.uiWarnBusy === 'function') window.uiWarnBusy();
            return;
        }
        if (activeWindowMenuSlot) {
            installWindowInSlot(
                activeWindowMenuSlot,
                item.dataset.glb,
                item.dataset.label,
                item.dataset.slug
            );
        } else {
            hideWindowMenu();
        }
        return;
    }
    if (e.target.closest('#window-menu-close')) {
        hideWindowMenu();
        return;
    }
    // Outside-click: если клик не в меню и не по canvas — закрываем.
    // (Canvas-клики обрабатывает scene.onPointerObservable; там же мы
    //  вызываем hideWindowMenu() в фоллбэк-ветке.)
    const menu = document.getElementById('window-menu');
    if (menu && menu.classList.contains('visible')
        && !menu.contains(e.target)
        && e.target.id !== 'renderCanvas') {
        hideWindowMenu();
    }
});
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideWindowMenu();
});

const itemHeightSlider = document.getElementById('item-height-slider');
if (itemHeightSlider) {
    itemHeightSlider.addEventListener('input', (e) => {
        const y = parseFloat(e.target.value);
        const val = document.getElementById('item-height-val');
        if (val) val.textContent = y.toFixed(2) + ' м';
        setSelectedItemHeight(y);
    });
}

const itemRotationSlider = document.getElementById('item-rotation-slider');
if (itemRotationSlider) {
    itemRotationSlider.addEventListener('input', (e) => {
        const deg = parseFloat(e.target.value);
        const val = document.getElementById('item-rotation-val');
        if (val) val.textContent = `${Math.round(deg)}°`;
        setSelectedItemRotationDeg(deg);
    });
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (pendingWallPlacement) { cancelWallPickPlacement(); return; }
        if (selectedPlacedItem)   { deselectPlacedItem();      return; }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPlacedItem) {
        // Не перехватываем Backspace в текстовых полях.
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        deleteSelectedItem();
    }
});

window.addGlbModel = loadGlbAndAddToScene;

// --------------------------------------------------------------------------
// Экспорт всей построенной сцены в .glb — чтобы пользователь мог открыть
// её в Blender, докрутить лайты внутрь моделей и переэкспортировать
// конкретный предмет обратно в каталог.
// --------------------------------------------------------------------------
async function exportSceneAsGlb() {
    if (typeof BABYLON.GLTF2Export === 'undefined') {
        alert('Сериализатор glTF не подгружен (babylonjs.serializers.min.js).');
        return;
    }
    if (!createdWalls.length && !placedItems.length) {
        alert('Сцена пустая — сначала постройте 3D-модель или добавьте предметы из каталога.');
        return;
    }

    const btn = document.getElementById('export-glb-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Экспорт…'; }

    // Что НЕ выгружаем:
    //  • ground (фоновая сетка 120×120 — не часть сцены пользователя);
    //  • невидимые handle-кубики placed-предметов (drag-обёртки);
    //  • shadow-only прокси потолка (служебная геометрия для теней);
    //  • плоские 2D-лейблы (комната → площадь);
    //  • placement-эфемеры и markerMesh из старой логики (если остались).
    const shouldExportNode = (node) => {
        if (!node) return false;
        if (node === ground) return false;
        if (node.isGlbHandle) return false;
        if (node._isShadowCasterProxy) return false;
        if (node._isDimensionLabel) return false;
        // layerMask=0 означает «никакая камера это не видит» — служебка.
        if (typeof node.layerMask === 'number' && node.layerMask === 0) return false;
        return true;
    };

    const filename = `scene-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}`;
    try {
        const glb = await BABYLON.GLTF2Export.GLBAsync(scene, filename, {
            shouldExportNode,
            // Лайты — самое важное в этом экспорте: пишем KHR_lights_punctual,
            // чтобы Blender при импорте сразу видел все источники света сцены.
            shouldExportAnimation: () => false
        });
        glb.downloadFiles();
        console.log(`💾 Экспортировано: ${filename}.glb`);
    } catch (e) {
        console.error('Ошибка экспорта GLB:', e);
        alert('Не удалось экспортировать сцену: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Экспорт сцены в GLB'; }
    }
}

document.getElementById('export-glb-btn')?.addEventListener('click', exportSceneAsGlb);

window.addEventListener("resize", () => {
    engine.resize();
    if (isTopDown2D) applyOrthographicFrustum(top2DHalfSize);
});
engine.runRenderLoop(() => scene.render());

// Cart integration: programmatic delete-by-handle для UI корзины.
// Кнопка «×» в корзине должна пройти ВЕСЬ deleteSelectedItem-flow:
// dispose shadow generator'ов ламп, освободить window-slot, диспатчить
// cart:remove. Голый handle.dispose() ничего из этого не делает.
window.deletePlacedItemByHandle = function (handle) {
    if (!handle) return;
    selectPlacedItem(handle);
    deleteSelectedItem();
};

// ============================================================================
// SCENE SAVE / LOAD / CLEAR API
// ============================================================================
// Save: снимаем wallRegions + detected{Windows,Doors,...} + placedItems
// (slug/position/rotation/scaling). Floor plan image НЕ сохраняем — он не
// нужен для восстановления, потому что wallRegions хранят полигоны стен в
// пикселях, а MANUAL_SCALE задаёт px→м перевод. Wall paints / wallpapers
// / floor textures в v1 НЕ сохраняются — это потребует state per submesh,
// будет добавлено в v2.

// Версия 2: добавлены wallMaterials, floorMaterials, item.slot (для окон
// в проёмах). v1-сцены восстанавливаются без материалов/слотов — без
// падений, просто новые поля undefined → дефолт.
const SCENE_FORMAT_VERSION = 2;

// Сбор материалов стен: для каждой стены — список submesh'ей с цветом и
// слугом обоев. Слугу обоев достаточно для restore — URL берётся из DOM
// (.wallpaper-swatch[data-wallpaper=...][data-url=...]).
function captureWallMaterials() {
    const out = [];
    createdWalls.forEach((wall, wallIdx) => {
        if (!wall.subMeshes || !wall.subMeshes.length) return;
        const faces = [];
        wall.subMeshes.forEach((sub, subIdx) => {
            const m = getSubMeshMaterial(wall, subIdx);
            if (!m) return;
            const wpSlug = (m.metadata && m.metadata.wallpaperSlug) || '';
            faces.push({
                subIdx,
                color: color3ToHex(m.diffuseColor || new BABYLON.Color3(1, 1, 1)),
                wallpaperSlug: wpSlug || null,
            });
        });
        if (faces.length) out.push({ wallIdx, faces });
    });
    return out;
}

function captureFloorMaterials() {
    return floorMeshes.map((mesh, floorIdx) => {
        const m = mesh.material;
        const fSlug = (mesh.metadata && mesh.metadata.floorSlug) || '';
        return {
            floorIdx,
            color: m && m.diffuseColor ? color3ToHex(m.diffuseColor) : '#b89e7a',
            floorSlug: fSlug || null,
        };
    });
}

function captureSceneState() {
    return {
        version: SCENE_FORMAT_VERSION,
        wallHeight:   WALL_HEIGHT,
        manualScale:  MANUAL_SCALE,
        wallRegions:  lastBuiltWallRegions || [],
        detectedWindows,
        detectedDoors,
        detectedDoorArches,
        detectedWindowProfiles,
        detectedDoorProfiles,
        wallMaterials:  captureWallMaterials(),
        floorMaterials: captureFloorMaterials(),
        items: placedItems.map(h => {
            const slot = h.metadata?.openingSlot;
            // Окна в проёмах: сохраняем slot.idx и fit-размеры (на случай,
            // если slot пересоберётся с другим idx из-за миграции CV-формата).
            const slotInfo = slot ? {
                slotIdx:   slot.idx,
                fitWidth:  slot.fitWidth,
                fitHeight: slot.fitHeight,
                fitDepth:  slot.fitDepth,
            } : null;
            return {
                slug:       h.metadata?.slug,
                label:      h.metadata?.label,
                mount:      h.metadata?.mount,
                wallNormal: h.metadata?.wallNormal || null,
                position:   { x: h.position.x, y: h.position.y, z: h.position.z },
                rotation:   h.rotation.y,
                scaling:    { x: h.scaling.x, y: h.scaling.y, z: h.scaling.z },
                slot:       slotInfo,
            };
        }),
    };
}

// Полная очистка сцены. Использует штатные функции — это гарантирует
// корректную чистку shadow generator'ов ламп, освобождение window-slots
// и dispatch cart:remove для каждого предмета.
function clearScene() {
    // 1. Снимаем все выделения / popover'ы.
    deselectPlacedItem();
    deselectWallFace();
    deselectFloor();
    hideWindowMenu();
    cancelWallPickPlacement();

    // 2. Удаляем все placed items штатным путём (с очисткой ламп и
    //    cart:remove). placedItems мутируется внутри deleteSelectedItem,
    //    поэтому забираем последний элемент каждый раз.
    while (placedItems.length) {
        selectedPlacedItem = placedItems[placedItems.length - 1];
        deleteSelectedItem();
    }

    // 3. Стены / полы / потолки / dim-labels / маркеры окон-дверей.
    clearWalls();
    clearWindowMarkers();
    clearDoorMarkers();
    clearWindowOpeningSlots();

    // 4. Сбрасываем CV-state.
    detectedWindows = [];
    detectedDoors = [];
    detectedDoorArches = [];
    detectedWindowProfiles = [];
    detectedDoorProfiles = [];
    detectedFurniture = [];
    furnitureNeedsPlacement = false;
    lastBuiltWallRegions = null;

    // 5. Сбрасываем UI билд-кнопки и превью.
    invalidatePendingBuildPreview && invalidatePendingBuildPreview();
}

// Поиск catalog-кнопки по slug — отдаёт data-glb URL для re-load'а.
function findCatalogGlbUrl(slug) {
    if (!slug) return null;
    const btn = document.querySelector(`.add-catalog-item[data-slug="${slug}"]`);
    return btn ? btn.dataset.glb : null;
}

// URL обоев/текстуры пола по slug. Слуги маппятся в URL'ы через DOM:
// шаблон рендерит <div class="wallpaper-swatch" data-wallpaper="X" data-url="Y">.
function findWallpaperUrlBySlug(slug) {
    if (!slug) return null;
    const sw = document.querySelector(`.wallpaper-swatch[data-wallpaper="${slug}"][data-url]`);
    return sw ? sw.dataset.url : null;
}
function findFloorTextureUrlBySlug(slug) {
    if (!slug) return null;
    const sw = document.querySelector(`.wallpaper-swatch[data-floor="${slug}"][data-url]`);
    return sw ? sw.dataset.url : null;
}

// Применяет сохранённые материалы к свежепостроенным стенам/полам.
// Использует штатные apply*-функции — те внутри корректно сбрасывают
// взаимоисключающие пары color↔wallpaper и обновляют metadata. Селекцию
// выставляем «вручную», потому что apply*-функции читают глобальные
// selectedWallMesh / selectedFloorMesh.
function restoreWallMaterials(wallMaterials) {
    if (!Array.isArray(wallMaterials)) return;
    const prevWall = selectedWallMesh;
    const prevSub  = selectedSubMeshIndex;
    try {
        for (const ws of wallMaterials) {
            const wall = createdWalls[ws.wallIdx];
            if (!wall) continue;
            for (const f of (ws.faces || [])) {
                selectedWallMesh = wall;
                selectedSubMeshIndex = f.subIdx;
                if (f.wallpaperSlug) {
                    const url = findWallpaperUrlBySlug(f.wallpaperSlug);
                    if (url) {
                        applyWallpaperToSelectedFace(f.wallpaperSlug, url);
                        // КРИТИЧНО: apply*-функции выставляют emissiveColor =
                        // WALL_HIGHLIGHT_EMISSIVE (синий «selection-glow»),
                        // потому что предполагают визуальное выделение в UI.
                        // Без сброса все стены остаются с синим self-glow,
                        // который маскирует IES-конус потолочных ламп —
                        // визуально кажется, что освещение «пропало».
                        clearSelectedFaceHighlight();
                        continue;
                    }
                }
                if (f.color) {
                    applyColorToSelectedFace(f.color);
                    clearSelectedFaceHighlight();
                }
            }
        }
    } finally {
        selectedWallMesh = prevWall;
        selectedSubMeshIndex = prevSub;
    }
}

function restoreFloorMaterials(floorMaterials) {
    if (!Array.isArray(floorMaterials)) return;
    const prev = selectedFloorMesh;
    try {
        for (const fs of floorMaterials) {
            const floor = floorMeshes[fs.floorIdx];
            if (!floor) continue;
            selectedFloorMesh = floor;
            if (fs.floorSlug) {
                const url = findFloorTextureUrlBySlug(fs.floorSlug);
                if (url) {
                    applyFloorTextureToSelectedFloor(fs.floorSlug, url);
                    // См. комментарий в restoreWallMaterials — apply-функции
                    // оставляют highlight emissive «как будто выделено».
                    clearSelectedFloorHighlight();
                    continue;
                }
            }
            if (fs.color) {
                applyColorToSelectedFloor(fs.color);
                clearSelectedFloorHighlight();
            }
        }
    } finally {
        selectedFloorMesh = prev;
    }
}

// Грузит один сохранённый item и возвращает promise (готов после
// onPlaced-callback'а, либо после таймаута, если GLB не загрузился).
// Окна, бывшие в проёмах (item.slot != null), восстанавливаются с
// прокидыванием fitToOpening — иначе они вернутся к дефолтным размерам
// GLB_REAL_DIMS и «не закроют» вырез в стене.
function restoreOneItem(item) {
    return new Promise(resolve => {
        const glbUrl = findCatalogGlbUrl(item.slug);
        if (!glbUrl) {
            console.warn('restoreOneItem: GLB не найден для slug =', item.slug);
            resolve();
            return;
        }
        const slotInfo = item.slot || null;
        const slot = slotInfo ? windowOpeningSlots[slotInfo.slotIdx] : null;

        const cfg = {
            url:   glbUrl,
            label: item.label || item.slug,
            slug:  item.slug,
            mount: item.mount || 'floor',
            wallNormal: item.wallNormal || null,
            initialPosition: new BABYLON.Vector3(
                item.position.x, 0, item.position.z
            ),
            initialY: item.position.y,
            // _silent: загрузка из сохранёнки идёт пачкой через
            // showSceneRestoreOverlay, который сам показывает прогресс.
            // Toast'ы здесь были бы шумом (N toast'ов на N предметов).
            _silent: true,
        };
        // Окно в слоте: проксируем те же опции, что installWindowInSlot
        // даёт loader'у. fitToOpening снимет правильный bbox-скейл.
        if (slot && slotInfo) {
            cfg.fitToOpening = {
                width:  slotInfo.fitWidth,
                height: slotInfo.fitHeight,
                depth:  slotInfo.fitDepth,
            };
            cfg.forcedWallEmbed = 'center';
            cfg.initialPosition = new BABYLON.Vector3(slot.worldX, 0, slot.worldZ);
            cfg.initialY = slot.centerY - slot.fitHeight / 2;
            cfg.wallNormal = slot.wallNormal;
        }

        cfg.onPlaced = (handle) => {
            try {
                if (slot) {
                    // Связываем handle ↔ slot, как делает installWindowInSlot.
                    slot.installedWindow = handle;
                    handle.metadata.openingSlot = slot;
                    if (slot.pickProxy) slot.pickProxy.isPickable = false;
                    // Position/scaling уже корректные после fitToOpening —
                    // НЕ перезаписываем из saved, иначе сломается fit.
                    // Драг запрещаем (как и в installWindowInSlot): окно
                    // подогнано под проём, любой сдвиг ломает герметичность.
                    if (handle.behaviors) {
                        handle.behaviors.forEach(b => {
                            if (b instanceof BABYLON.PointerDragBehavior) b.enabled = false;
                        });
                    }
                } else {
                    // Обычные предметы: точечно восстанавливаем сохранённые
                    // трансформы (loader мог поставить «по центру»).
                    handle.position.copyFromFloats(item.position.x, item.position.y, item.position.z);
                    handle.rotation.y = item.rotation || 0;
                    if (item.scaling) {
                        handle.scaling.copyFromFloats(item.scaling.x, item.scaling.y, item.scaling.z);
                    }
                }
            } catch (e) {
                console.warn('restoreOneItem: post-place adjust failed', e);
            }
            resolve();
        };

        loadGlbAndAddToScene(cfg);
        // Страховка от вечного промиса, если GLB упадёт молча.
        setTimeout(resolve, 8000);
    });
}

// Preloader-оверлей. Полноэкранный blocker, чтобы пользователь не видел
// «нанос» восстанавливаемых GLB-предметов по одному.
function showSceneRestoreOverlay(label) {
    const el = document.getElementById('scene-restore-overlay');
    if (!el) return;
    const labelEl = el.querySelector('.scene-restore-label');
    if (labelEl && label) labelEl.textContent = label;
    el.classList.add('visible');
}
function hideSceneRestoreOverlay() {
    const el = document.getElementById('scene-restore-overlay');
    if (el) el.classList.remove('visible');
}
function setSceneRestoreOverlayProgress(text) {
    const el = document.getElementById('scene-restore-overlay');
    if (!el) return;
    const subEl = el.querySelector('.scene-restore-subtitle');
    if (subEl) subEl.textContent = text || '';
}

async function restoreSceneFromState(state) {
    if (!state || typeof state !== 'object') throw new Error('Пустой state');
    if (state.version && state.version > SCENE_FORMAT_VERSION) {
        console.warn('Сцена сохранена в более новом формате (v' + state.version + ').');
    }

    showSceneRestoreOverlay('Загрузка сцены…');
    setSceneRestoreOverlayProgress('Очистка предыдущего состояния');

    try {
        // 1. Чистим текущее.
        clearScene();

        // 2. Восстанавливаем глобалы.
        if (typeof state.manualScale === 'number')  MANUAL_SCALE = state.manualScale;
        if (typeof state.wallHeight  === 'number')  WALL_HEIGHT  = state.wallHeight;

        // 3. Восстанавливаем CV-state (нужно ДО buildWallsFromRegions, потому
        //    что buildOpeningBlueprints читает detected* как module-level).
        detectedWindows         = Array.isArray(state.detectedWindows) ? state.detectedWindows : [];
        detectedDoors           = Array.isArray(state.detectedDoors) ? state.detectedDoors : [];
        detectedDoorArches      = Array.isArray(state.detectedDoorArches) ? state.detectedDoorArches : [];
        detectedWindowProfiles  = Array.isArray(state.detectedWindowProfiles) ? state.detectedWindowProfiles : [];
        detectedDoorProfiles    = Array.isArray(state.detectedDoorProfiles) ? state.detectedDoorProfiles : [];

        // 4. Стены / окна / двери / полы / лейблы / window-slot'ы.
        setSceneRestoreOverlayProgress('Сборка стен, окон и дверей');
        if (Array.isArray(state.wallRegions) && state.wallRegions.length) {
            buildWallsFromRegions(state.wallRegions);
        }
        // Кадр paint'а после buildWalls — чтобы overlay перерисовался с
        // обновлённым progress-текстом ДО долгого блока с item-loader'ами.
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        // 5. Материалы стен и полов — ДО предметов, иначе текстуры
        //    могут затереть emissive-подсветку лампочек на стенах.
        setSceneRestoreOverlayProgress('Применение цветов и обоев');
        restoreWallMaterials(state.wallMaterials);
        restoreFloorMaterials(state.floorMaterials);

        // 6. Дожидаемся готовности IES-профиля. Если рестор стартует на
        //    первой секунде после открытия страницы, fetch может ещё не
        //    долететь — без await потолочные лампы получат fallback
        //    PointLight вместо SpotLight+IES cookie, и распределение
        //    света будет «шарообразным» вместо реальной BEGA-фотометрии.
        //    Таймаут 4 сек — чтобы не залипнуть, если IES-эндпоинт мёртв.
        setSceneRestoreOverlayProgress('Подготовка профилей освещения');
        await Promise.race([
            iesReadyPromise,
            new Promise(r => setTimeout(r, 4000)),
        ]);

        // 7. Предметы — последовательно, чтобы GLB-loader не захлёбывался
        //    дюжиной параллельных fetch'ей.
        const items = Array.isArray(state.items) ? state.items : [];
        for (let i = 0; i < items.length; i++) {
            setSceneRestoreOverlayProgress(`Загрузка предметов: ${i + 1} из ${items.length}`);
            await restoreOneItem(items[i]);
        }
    } finally {
        // Минимальная задержка, чтобы overlay не «мигнул» и пользователь
        // успел увидеть «✓». Если рестор был очень быстрым (пустая сцена) —
        // тоже подождём, иначе спиннер промелькнёт.
        await new Promise(r => setTimeout(r, 200));
        hideSceneRestoreOverlay();
    }
}

window.captureSceneState     = captureSceneState;
window.restoreSceneFromState = restoreSceneFromState;
window.clearScene            = clearScene;

console.log('🚀 3D Builder готов. Загрузите изображение плана.');
