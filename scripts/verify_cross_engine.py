"""Cross-engine determinism: replay each golden tape in the browser (V8/Blink)
and compare state hash against the Node-recorded expected hash."""
import json, glob, sys, os
from playwright.sync_api import sync_playwright

# WebKit 尊重系统代理（本机 Privoxy 会拦截 localhost 返回 500）——豁免本地地址
os.environ["NO_PROXY"] = "localhost,127.0.0.1"
os.environ["no_proxy"] = "localhost,127.0.0.1"

goldens = sorted(glob.glob(r"D:\RockClimbGame\packages\core\tests\golden\*.json"))
assert goldens, "no golden files found"

with sync_playwright() as p:
    ok = True
    for engine in ["chromium", "webkit"]:
        browser = getattr(p, engine).launch(headless=True)
        page = browser.new_page(viewport={"width": 480, "height": 854})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://localhost:4173")
        page.wait_for_load_state("networkidle")
        # 等到重演钩子就绪（WebKit 模块加载可能慢于固定延时）
        page.wait_for_function("() => typeof window.__replayRun === 'function'", timeout=30000)

        for path in goldens:
            with open(path, encoding="utf8") as f:
                golden = json.load(f)
            res = page.evaluate("(g) => window.__replayRun(g.replay)", golden)
            match = res["hash"] == golden["hash"] and res["claimOk"]
            status = "OK " if match else "FAIL"
            print(f"[{engine:8}] {status} {path.split(chr(92))[-1]}: {res['hash']} vs {golden['hash']} claimOk={res['claimOk']}")
            ok = ok and match

        if errors:
            print(f"[{engine}] JS errors:", errors)
            ok = False
        browser.close()
    sys.exit(0 if ok else 1)
