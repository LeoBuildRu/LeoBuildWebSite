r"""
Парсер карточек квартир с наш.дом.рф через подключение к уже запущенному
Chrome по протоколу CDP. Сайт защищён ServicePipe — обычный headless-браузер
получает 403, поэтому challenge должен пройти живой Chrome пользователя.

Как пользоваться:
    1. Закройте все окна Chrome (или используйте отдельный профиль).
    2. Запустите start_chrome_cdp.bat — он откроет Chrome с remote-debugging.
       Перейдите на нужную страницу каталога (антибот пропустит вас сам
       через 1-3 секунды).
    3. Запустите этот скрипт:
           # Парсит любую активную вкладку каталога:
           venv\Scripts\python.exe parse_dataset.py
           # Или явно указывает URL/ID проекта:
           venv\Scripts\python.exe parse_dataset.py 70198
           venv\Scripts\python.exe parse_dataset.py https://xn--80az8a…/список/70198?…
       Карточки складываются в dataset/<project_id>/ — по подпапке на ЖК.

Установка зависимостей (один раз):
    pip install playwright requests
    python -m playwright install chromium
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
import sys
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Page


CDP_URL = "http://localhost:9222"

# Фрагменты, по которым опознаём вкладку каталога. Поддерживаем и кириллицу
# (page.url у Playwright декодируется), и percent-encoded форму.
CATALOG_URL_MARKERS = (
    "каталог-квартир/список/",
    "%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80/%D1%81%D0%BF%D0%B8%D1%81%D0%BE%D0%BA/",
)

PROJECT_ID_PATTERN = re.compile(
    r"(?:список|%D1%81%D0%BF%D0%B8%D1%81%D0%BE%D0%BA)/(\d+)", re.IGNORECASE
)


def build_catalog_url(project_id: str) -> str:
    return (
        "https://xn--80az8a.xn--d1aqf.xn--p1ai/"
        "%D1%81%D0%B5%D1%80%D0%B2%D0%B8%D1%81%D1%8B/"
        "%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3-%D0%BA%D0%B2%D0%B0%D1%80%D1%82%D0%B8%D1%80/"
        f"%D1%81%D0%BF%D0%B8%D1%81%D0%BE%D0%BA/{project_id}"
        "?activeSort=price%2Casc&view=list"
    )


def extract_project_id(url_or_id: str) -> Optional[str]:
    s = (url_or_id or "").strip()
    if not s:
        return None
    if s.isdigit():
        return s
    m = PROJECT_ID_PATTERN.search(s)
    return m.group(1) if m else None


DATASET_DIR = Path(r"C:\Users\larle\OneDrive\Документы\GitHub\LeoBuildWebSite\dataset")


def parse_area(area_text: str) -> Optional[float]:
    """'32,9 м²' / '32,9\xa0м²' -> 32.9"""
    if not area_text:
        return None
    cleaned = area_text.replace("\xa0", " ").replace(" ", "")
    m = re.search(r"([\d]+[.,]?[\d]*)", cleaned)
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def safe_id(image_url: str) -> str:
    tail = image_url.rstrip("/").rsplit("/", 1)[-1]
    cleaned = re.sub(r"[^A-Za-z0-9]", "_", tail)[:96]
    return cleaned or "item"


def _is_catalog_url(url: str, target_project_id: Optional[str]) -> bool:
    if target_project_id:
        return f"/{target_project_id}" in url and any(
            m in url for m in CATALOG_URL_MARKERS
        )
    return any(m in url for m in CATALOG_URL_MARKERS)


async def find_catalog_page(
    browser, target_project_id: Optional[str] = None
) -> Page:
    """Ищет вкладку с каталогом среди открытых; если её нет, открывает новую."""
    candidates: list[Page] = []
    for ctx in browser.contexts:
        for page in ctx.pages:
            try:
                url = page.url
            except Exception:
                continue
            if _is_catalog_url(url, target_project_id):
                candidates.append(page)

    if candidates:
        # Если указан конкретный ID — берём первую подходящую; иначе тоже первую.
        page = candidates[0]
        print(f"[i] Нашёл вкладку с каталогом: {page.url[:120]}…")
        return page

    # Не нашли — открываем сами (нужен явный project_id).
    if not target_project_id:
        raise RuntimeError(
            "Не нашёл открытую вкладку каталога в Chrome. "
            "Откройте нужный URL в этом окне Chrome или передайте ID/URL "
            "как аргумент: python parse_dataset.py <id_или_url>."
        )
    ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
    page = await ctx.new_page()
    target_url = build_catalog_url(target_project_id)
    print(f"[i] Не нашёл вкладку — открываю {target_url}")
    await page.goto(target_url, wait_until="domcontentloaded", timeout=90_000)
    return page


async def scroll_until_loaded(page: Page, max_iterations: int = 200) -> None:
    """Скроллим вниз и кликаем «Показать ещё», пока количество карточек растёт."""
    prev = -1
    stable = 0
    for i in range(max_iterations):
        count = await page.locator("[class*='PreviewImage']").count()
        if count == prev:
            stable += 1
        else:
            stable = 0
            print(f"[i] Карточек на странице: {count}")
        prev = count
        if stable >= 5:
            break

        # Кнопка «Показать ещё», если есть.
        try:
            more = page.get_by_role("button", name=re.compile(r"показать ещ", re.I))
            if await more.count() > 0:
                btn = more.first
                if await btn.is_visible():
                    await btn.scroll_into_view_if_needed()
                    await btn.click(timeout=3000)
                    await page.wait_for_timeout(1500)
        except Exception:
            pass

        await page.mouse.wheel(0, 7000)
        await page.wait_for_timeout(900)


async def extract_items(page: Page) -> list[dict]:
    return await page.evaluate(
        """
        () => {
            const out = [];
            document.querySelectorAll("img[class*='PreviewImage']").forEach(img => {
                // Ссылка на детальную страницу — это ближайший <a>, в котором
                // лежит сама картинка. closest() гарантирует, что мы не выйдем
                // за пределы карточки.
                const link = img.closest("a[href]");
                const detailHref = link ? link.getAttribute('href') : null;

                // Площадь ищем подъёмом, но останавливаемся на найденной — и
                // тоже не вылезаем за пределы карточки.
                let node = img;
                let areaEl = null;
                for (let i = 0; i < 12 && node; i++) {
                    node = node.parentElement;
                    if (!node) break;
                    // Не подымаемся выше контейнера-ссылки или контейнера карточки.
                    areaEl = node.querySelector(":scope [class*='Area-sc']")
                          || node.querySelector("[class*='Area-sc']");
                    if (areaEl) break;
                    if (node === link) break;
                }
                const span = areaEl ? areaEl.querySelector('span') : null;
                const src = img.getAttribute('src') || img.src;
                if (src && span) {
                    out.push({
                        preview_url: src,
                        area_text: span.textContent.trim(),
                        detail_href: detailHref,
                    });
                }
            });
            return out;
        }
        """
    )


DETAIL_IMG_SELECTOR = (
    "[class*='Apartment__ImageWrapper'] img, "
    "img[class*='BaseImage__Root'], "
    "img[class*='BaseImage__CurrentImage']"
)


async def fetch_detail_image_url(detail_page: Page, detail_url: str) -> Optional[str]:
    """Открывает страницу квартиры и возвращает src её главной (первой) фотки."""
    try:
        await detail_page.goto(detail_url, wait_until="domcontentloaded", timeout=60_000)
        await detail_page.wait_for_selector(DETAIL_IMG_SELECTOR, timeout=30_000)
        for _ in range(15):
            src = await detail_page.evaluate(
                """(sel) => {
                    const img = document.querySelector(sel);
                    if (!img) return null;
                    const s = img.getAttribute('src') || img.src || '';
                    if (!s || s.startsWith('data:')) return null;
                    return s;
                }""",
                DETAIL_IMG_SELECTOR,
            )
            if src:
                return src
            await detail_page.wait_for_timeout(500)
    except Exception as e:
        print(f"[!] Не смог открыть {detail_url[:100]}: {e}")
    return None


async def download_in_page(page: Page, url: str) -> Optional[bytes]:
    """Скачивает картинку через fetch() прямо в контексте страницы.

    Так запрос идёт с тем же Origin/Referer/Cookies, что и теги <img>,
    и ServicePipe его пропускает (в отличие от прямого request.get).
    """
    try:
        result = await page.evaluate(
            """async (url) => {
                try {
                    const r = await fetch(url, { credentials: 'include' });
                    if (!r.ok) return { ok: false, status: r.status };
                    const buf = await r.arrayBuffer();
                    const bytes = new Uint8Array(buf);
                    let bin = '';
                    const chunk = 0x8000;
                    for (let i = 0; i < bytes.length; i += chunk) {
                        bin += String.fromCharCode.apply(
                            null, bytes.subarray(i, i + chunk)
                        );
                    }
                    return { ok: true, b64: btoa(bin) };
                } catch (e) {
                    return { ok: false, error: String(e) };
                }
            }""",
            url,
        )
        if not result or not result.get("ok"):
            detail = result.get("status") or result.get("error") if result else "no result"
            print(f"[!] {url} → {detail}")
            return None
        return base64.b64decode(result["b64"])
    except Exception as e:
        print(f"[!] Ошибка скачивания {url}: {e}")
        return None


async def main(arg: Optional[str] = None, refetch: bool = False) -> int:
    target_project_id = extract_project_id(arg) if arg else None
    if arg and not target_project_id:
        print(f"[!] Не удалось определить project_id из аргумента: {arg!r}")
        return 1

    async with async_playwright() as p:
        try:
            browser = await p.chromium.connect_over_cdp(CDP_URL)
        except Exception as e:
            print(
                "[!] Не удалось подключиться к Chrome через CDP "
                f"({CDP_URL}): {e}\n"
                "    Сначала запустите start_chrome_cdp.bat и убедитесь, что "
                "страница каталога открылась без ошибок 403."
            )
            return 1

        try:
            page = await find_catalog_page(browser, target_project_id)
        except RuntimeError as e:
            print(f"[!] {e}")
            return 1

        # Ждём, пока появятся карточки (если challenge ещё не отработал).
        try:
            await page.wait_for_selector("[class*='PreviewImage']", timeout=60_000)
        except Exception:
            print(
                "[!] Карточки не появились. Возможно, Chrome всё ещё на странице "
                "ServicePipe — обновите вкладку и подождите."
            )
            return 1

        # Определяем project_id уже по фактическому URL вкладки.
        project_id = extract_project_id(page.url) or target_project_id or "unknown"
        out_dir = DATASET_DIR / project_id
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"[i] Project ID: {project_id} → {out_dir}")

        print("[i] Скроллю список и собираю карточки…")
        await scroll_until_loaded(page)

        items = await extract_items(page)
        print(f"[i] Извлечено карточек: {len(items)}")

        # Дедупликация по ссылке на детальную страницу (надёжнее, чем по preview).
        seen: set[str] = set()
        unique: list[dict] = []
        for it in items:
            key = it.get("detail_href") or it.get("preview_url")
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(it)
        print(f"[i] Уникальных: {len(unique)}")

        # Одна переиспользуемая вкладка для всех детальных страниц.
        detail_page = await page.context.new_page()

        saved = skipped = failed = 0
        try:
            for i, item in enumerate(unique, 1):
                area_text = item["area_text"]
                area = parse_area(area_text)
                preview_url = item.get("preview_url")
                detail_href = item.get("detail_href")
                if not detail_href:
                    print(f"[!] [{i}/{len(unique)}] нет ссылки на детальную — пропускаю")
                    failed += 1
                    continue

                detail_url = detail_href
                if detail_url.startswith("/"):
                    detail_url = "https://xn--80az8a.xn--d1aqf.xn--p1ai" + detail_url

                img_url = await fetch_detail_image_url(detail_page, detail_url)
                if not img_url:
                    print(f"[!] [{i}/{len(unique)}] нет картинки на {detail_url[:100]}")
                    failed += 1
                    continue

                item_id = safe_id(img_url)
                jpg_path = out_dir / f"{item_id}.jpg"
                json_path = out_dir / f"{item_id}.json"

                if jpg_path.exists() and json_path.exists() and not refetch:
                    skipped += 1
                    continue

                data = await download_in_page(detail_page, img_url)
                if data is None:
                    failed += 1
                    continue
                jpg_path.write_bytes(data)

                meta = {
                    "id": item_id,
                    "project_id": project_id,
                    "image_url": img_url,
                    "preview_url": preview_url,
                    "detail_url": detail_url,
                    "image_file": jpg_path.name,
                    "area_text": area_text,
                    "area_m2": area,
                    "source_page": page.url,
                }
                json_path.write_text(
                    json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                saved += 1
                print(f"[+] [{i}/{len(unique)}] {item_id[:32]}…  {area} м²")
        finally:
            await detail_page.close()

        print(
            f"\nГотово. Сохранено: {saved}, пропущено (уже было): {skipped}, "
            f"ошибок: {failed}, всего уникальных: {len(unique)}"
        )
        # Браузер не закрываем — это пользовательский Chrome.
        return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a]
    refetch = "--refetch" in args
    positional = [a for a in args if not a.startswith("--")]
    arg = positional[0] if positional else None
    sys.exit(asyncio.run(main(arg, refetch=refetch)))
