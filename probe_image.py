"""Диагностика 2: пробуем резайзер с разными размерами + ищем ссылку на деталь."""

import asyncio
from playwright.async_api import async_playwright


CDP_URL = "http://localhost:9222"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(CDP_URL)
        page = None
        for ctx in browser.contexts:
            for pg in ctx.pages:
                if "каталог-квартир" in pg.url or "%D0%BA%D0%B0%D1%82%D0%B0%D0%BB%D0%BE%D0%B3" in pg.url:
                    page = pg
                    break
            if page:
                break
        if not page:
            print("[!] Открой вкладку каталога в Chrome.")
            return
        print(f"[i] {page.url[:140]}")

        info = await page.evaluate(
            """() => {
                const img = document.querySelector("img[class*='PreviewImage']");
                if (!img) return null;
                // Ищем ближайшую <a href> вокруг карточки.
                let node = img;
                let link = null;
                for (let i = 0; i < 20 && node; i++) {
                    node = node.parentElement;
                    if (!node) break;
                    link = node.querySelector('a[href]');
                    if (link) break;
                }
                // И собираем все <a> в карточке, чтобы видеть все ссылки.
                let card = img.closest("[class*='ApartmentCard']") || img.parentElement;
                const links = card ? Array.from(card.querySelectorAll('a[href]'))
                    .map(a => a.getAttribute('href')) : [];
                return {
                    src: img.getAttribute('src'),
                    currentSrc: img.currentSrc,
                    nearestLink: link ? link.getAttribute('href') : null,
                    allCardLinks: links.slice(0, 5),
                };
            }"""
        )
        print("\n=== card info ===")
        for k, v in info.items():
            print(f"  {k}: {v}")

        # 1. Probe resizer with bigger sizes.
        src = info["src"]
        import urllib.parse
        encoded = urllib.parse.quote(src, safe="")
        sizes = [180, 360, 720, 1080, 1920, 2560]
        print("\n=== resizer probe ===")
        for s in sizes:
            url = (
                f"https://xn--80az8a.xn--d1aqf.xn--p1ai/resizer/image?"
                f"imageUrl={encoded}&systemClientId=sales-module-client&"
                f"config=resize:fit:{s}:{s}"
            )
            res = await page.evaluate(
                """async (url) => {
                    try {
                        const r = await fetch(url, { credentials: 'include' });
                        if (!r.ok) return { ok: false, status: r.status };
                        const buf = await r.arrayBuffer();
                        // also create img to get natural size
                        const blob = new Blob([buf]);
                        const obj = URL.createObjectURL(blob);
                        const dim = await new Promise(res => {
                            const im = new Image();
                            im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
                            im.onerror = () => res({ w: 0, h: 0 });
                            im.src = obj;
                        });
                        URL.revokeObjectURL(obj);
                        return { ok: true, bytes: buf.byteLength, ...dim };
                    } catch (e) { return { ok: false, error: String(e) }; }
                }""",
                url,
            )
            print(f"  fit:{s}:{s:<5} → {res}")

        # 2. Probe direct src dimensions.
        print("\n=== direct src probe ===")
        res = await page.evaluate(
            """async (url) => {
                const r = await fetch(url, { credentials: 'include' });
                const buf = await r.arrayBuffer();
                const blob = new Blob([buf]);
                const obj = URL.createObjectURL(blob);
                const dim = await new Promise(res => {
                    const im = new Image();
                    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
                    im.onerror = () => res({ w: 0, h: 0 });
                    im.src = obj;
                });
                URL.revokeObjectURL(obj);
                return { bytes: buf.byteLength, ...dim };
            }""",
            src,
        )
        print(f"  direct → {res}")

        # 3. If there's a link to detail page, open it in background and scan images.
        href = info.get("nearestLink") or (info.get("allCardLinks") or [None])[0]
        if href:
            if href.startswith("/"):
                href = "https://xn--80az8a.xn--d1aqf.xn--p1ai" + href
            print(f"\n=== detail page probe: {href[:120]} ===")
            ctx = browser.contexts[0]
            detail = await ctx.new_page()
            try:
                await detail.goto(href, wait_until="domcontentloaded", timeout=60_000)
                for _ in range(15):
                    await detail.wait_for_timeout(1000)
                    n = await detail.locator("img").count()
                    if n > 3:
                        break
                imgs = await detail.evaluate(
                    """() => Array.from(document.querySelectorAll('img'))
                        .map(im => ({
                            src: im.getAttribute('src'),
                            currentSrc: im.currentSrc,
                            w: im.naturalWidth, h: im.naturalHeight,
                        }))
                        .filter(o => o.src && (o.src.includes('продажи/file') || o.src.includes('resizer') || o.src.includes('%D0%BF%D1%80%D0%BE')))
                """
                )
                for im in imgs[:15]:
                    print(f"  {im['w']}x{im['h']:<4} {(im.get('currentSrc') or im['src'])[:140]}")
            finally:
                await detail.close()
        else:
            print("\n[!] Ссылки на детальную страницу с карточки не нашёл.")


asyncio.run(main())
