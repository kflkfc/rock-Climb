// 服务端 HTTP 集成测试：esbuild 打包 → 起真实服务 → 提交/攻击/榜单全流程。

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GameRunner } from "@kkc/core/replay/runner.ts";
import { LEVELS } from "@kkc/core/level/levels.ts";
import { Replay } from "@kkc/core/replay/format.ts";

const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;
const serverDir = join(dirname(fileURLToPath(import.meta.url)), "..");
let proc: ChildProcess;

function winT1(): Replay {
  const r = new GameRunner(LEVELS.findIndex((l) => l.id === "t1"));
  const g = r.game;
  for (let i = 0; i < 30; i++) r.step();
  const goal = g.holds.find((h) => h.isGoal)!.pos;
  const cur = { ...g.c.limbs.RH.hold!.pos };
  r.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
  r.step();
  for (let k = 1; k <= 8; k++) {
    r.dispatch({ e: "dragMove", x: cur.x + (goal.x - cur.x) * (k / 8), y: cur.y + (goal.y - cur.y) * (k / 8) });
    r.step();
  }
  r.dispatch({ e: "dragEnd" });
  for (let i = 0; i < 20; i++) r.step();
  return r.exportReplay();
}

beforeAll(async () => {
  execSync("npm run build", { cwd: serverDir, stdio: "pipe" });
  const dataDir = mkdtempSync(join(tmpdir(), "kkc-server-"));
  proc = spawn(process.execPath, [join(serverDir, "dist/server.mjs")], {
    env: { ...process.env, PORT: String(PORT), KKC_DATA: dataDir },
    stdio: "pipe",
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("server did not start");
}, 60000);

afterAll(() => {
  proc?.kill();
});

describe("排行榜服务 · 端到端", () => {
  it("真实完攀提交 → 入榜第 1 名；榜单可查；回放可下载", async () => {
    const replay = winT1();
    const res = await fetch(`${BASE}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "金刚本刚", replay }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; moveRank: number; timeRank: number; replayId: string };
    expect(body.ok).toBe(true);
    expect(body.moveRank).toBe(1);
    expect(body.timeRank).toBe(1);

    const lb = (await (await fetch(`${BASE}/leaderboard?level=t1`)).json()) as {
      byMoves: { name: string; moves: number }[];
    };
    expect(lb.byMoves[0].name).toBe("金刚本刚");
    expect(lb.byMoves[0].moves).toBe(replay.claim.gripCount);

    const rp = await fetch(`${BASE}/replay/${body.replayId}`);
    expect(rp.status).toBe(200);
    const downloaded = (await rp.json()) as Replay;
    expect(downloaded.levelId).toBe("t1");
  });

  it("篡改 claim 的提交被 422 拒绝（服务端重演揭穿）", async () => {
    const replay = winT1();
    replay.claim.timeMs = 1;
    const res = await fetch(`${BASE}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "作弊者", replay }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { rejected: string }).rejected).toBe("claim_mismatch");
  });

  it("同名玩家保留更优成绩；恶意名字被消毒", async () => {
    const better = winT1();
    const res = await fetch(`${BASE}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: '<script>"x"</script>非常非常长的名字超过十二个字', replay: better }),
    });
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    const lb = (await (await fetch(`${BASE}/leaderboard?level=t1`)).json()) as {
      byMoves: { name: string }[];
    };
    for (const e of lb.byMoves) {
      expect(e.name).not.toContain("<");
      expect(e.name.length).toBeLessThanOrEqual(12);
    }
  });

  it("坏请求防御：无 replay 400 / 非 JSON 400 / 未知路径 404", async () => {
    expect((await fetch(`${BASE}/score`, { method: "POST", body: "{}" })).status).toBe(400);
    expect((await fetch(`${BASE}/score`, { method: "POST", body: "not json" })).status).toBe(400);
    expect((await fetch(`${BASE}/nope`)).status).toBe(404);
    expect((await fetch(`${BASE}/leaderboard`)).status).toBe(400);
  });
});
