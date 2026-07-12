// KingKong Climbing 排行榜服务（GDD 5.3 极简 API 清单）。
// 零运行时依赖：node:http + JSON 文件。core 重演即校验（monorepo 复用红利）。
//
//   POST /score            { name, replay } → 重演校验 → 入榜 + 名次
//   GET  /leaderboard?level=v1              → 双榜 top100
//   GET  /replay/:id                        → 榜上回放（"看大神怎么爬"）
//   GET  /health
//
// 部署：npm run build -w @kkc/server → dist/server.mjs 单文件，任何 Node 容器可跑
//（微信云托管/自有 VPS 皆可；数据目录挂卷）。

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { verifySubmission } from "@kkc/core/replay/verify.ts";
import { Replay } from "@kkc/core/replay/format.ts";
import { Store } from "./store.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.KKC_DATA ?? "./data";
const store = new Store(DATA_DIR);

// 简版限频：每 IP 每分钟 30 次提交（内存滑窗；云托管多实例时换网关限频）
const rateMap = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (rateMap.get(ip) ?? []).filter((t) => now - t < 60_000);
  arr.push(now);
  rateMap.set(ip, arr);
  return arr.length > 30;
}

function json(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*", // 网页版跨域（正式部署收紧到自有域名）
    "access-control-allow-headers": "content-type",
  });
  res.end(s);
}

function readBody(req: IncomingMessage, limit = 512 * 1024): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        resolve(null); // 超限（回放 gzip 前也就几十 KB）
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

const sanitizeName = (n: unknown): string => {
  const s = String(n ?? "").trim().slice(0, 12);
  return s.length > 0 ? s.replace(/[<>&"'\\]/g, "") : "无名攀岩者";
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "GET" && url.pathname === "/health")
    return json(res, 200, { ok: true, uptime: process.uptime() });

  if (req.method === "GET" && url.pathname === "/leaderboard") {
    const level = url.searchParams.get("level") ?? "";
    if (!level) return json(res, 400, { error: "level required" });
    return json(res, 200, store.board(level));
  }

  if (req.method === "GET" && url.pathname.startsWith("/replay/")) {
    const id = url.pathname.slice("/replay/".length);
    const r = store.loadReplay(id);
    if (!r) return json(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    return res.end(r);
  }

  if (req.method === "POST" && url.pathname === "/score") {
    const ip = req.socket.remoteAddress ?? "?";
    if (rateLimited(ip)) return json(res, 429, { error: "rate limited" });
    const body = await readBody(req);
    if (body == null) return json(res, 413, { error: "too large" });
    let payload: { name?: unknown; replay?: Replay };
    try {
      payload = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "bad json" });
    }
    if (!payload.replay) return json(res, 400, { error: "replay required" });

    // ★ 反作弊核心：服务端重演，claim 只是声明、重演结果才是成绩
    const v = verifySubmission(payload.replay);
    if (!v.ok) return json(res, 422, { rejected: v.reason });

    const replayId = randomBytes(8).toString("hex");
    store.saveReplay(replayId, JSON.stringify(payload.replay));
    const ranks = store.submit(v.score!.levelId, {
      name: sanitizeName(payload.name),
      moves: v.score!.moves,
      timeMs: v.score!.timeMs,
      at: new Date().toISOString(),
      replayId,
    });
    return json(res, 200, { ok: true, score: v.score, ...ranks, replayId });
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[kkc-server] listening :${PORT} data=${DATA_DIR}`);
});
