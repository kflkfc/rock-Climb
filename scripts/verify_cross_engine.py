"""Cross-engine determinism: replay each golden tape in the browser (V8/Blink)
and compare state hash against the Node-recorded expected hash."""
import json, glob, sys
from playwright.sync_api import sync_playwright

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
        page.wait_for_timeout(800)

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
