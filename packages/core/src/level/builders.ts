// 关卡构造器（单轨共用 / 屋檐两排）：levels.ts 与各岩馆数据文件共用。
// 单轨共用：一条岩点轨道，手先用、脚随后踩同一批点（贴近真实抱石）。

import { LevelDef, HoldDef, WallSegment } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { HoldType } from "../sim/holds.ts";
import { dcos, dhypot } from "../math/dmath.ts";

export const WORLD_W = 720;
export const WORLD_H = 1000;

interface Pt {
  x: number;
  y: number;
}

/** 沿折线采样 n 个点。bias>0 → 两端(起手/终点)更密、中段更稀（两端够不远需密以可解）。 */
function sampleRail(poly: Pt[], n: number, bias = 0): Pt[] {
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < poly.length; i++) {
    const l = dhypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
    segLen.push(l);
    total += l;
  }
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const lin = k / (n - 1);
    const ease = (1 - dcos(Math.PI * lin)) / 2; // 两端导数0 → 两端密、中间稀
    const u = lin + bias * (ease - lin);
    let d = total * u;
    let i = 0;
    while (i < segLen.length && d > segLen[i]) {
      d -= segLen[i];
      i++;
    }
    if (i >= segLen.length) out.push({ ...poly[poly.length - 1] });
    else {
      const t = segLen[i] < 1e-6 ? 0 : d / segLen[i];
      out.push({
        x: poly[i].x + (poly[i + 1].x - poly[i].x) * t,
        y: poly[i].y + (poly[i + 1].y - poly[i].y) * t,
      });
    }
  }
  return out;
}

export interface RouteCfg {
  id: string;
  name: string;
  grade: string;
  wallAngleDeg: number;
  wallAngleTop?: number;
  wallSegments?: WallSegment[]; // v2 分段折线墙（优先于上两项）
  rail: Pt[]; // 单条轨道折线（r0=起手底端 → 末端=终点）
  n: number; // 岩点数
  zig?: number; // 左右交替偏移
  bias?: number; // 采样偏置（两端密中段稀）
  holdType?: (i: number, n: number) => Partial<HoldDef>;
  starThreshold?: number;
}

/**
 * 单轨共用：r0..r_{n-1}。起手 脚=r0,r1 手=r2,r3。
 * 每轮：两手上移 2 → 两脚踩到手刚离开的点。手摸到末点(goal)即完攀。
 */
export function buildRoute(cfg: RouteCfg): { level: LevelDef; seq: [Limb, string][] } {
  const zig = cfg.zig ?? 28;
  const rail = sampleRail(cfg.rail, cfg.n, cfg.bias ?? 0.35);
  const N = rail.length;
  const rid = (i: number) => (i === N - 1 ? "goal" : `r${i}`);
  const startOf: Record<number, Limb> = { 0: "LF", 1: "RF", 2: "LH", 3: "RH" };

  const holds: HoldDef[] = rail.map((p, i) => {
    const goal = i === N - 1;
    const extra = cfg.holdType ? cfg.holdType(i, N) : {};
    return {
      id: rid(i),
      type: (extra.type ?? "jug") as HoldType,
      x: Math.round(p.x + (i % 2 === 0 ? -1 : 1) * zig),
      y: Math.round(p.y),
      ...(goal ? { goal: true, radius: 24 } : {}),
      ...extra,
      ...(startOf[i] ? { start: startOf[i] } : {}),
    };
  });

  // 攀爬序列
  const seq: [Limb, string][] = [];
  const handLimb = (i: number): Limb => (i % 2 === 0 ? "LH" : "RH");
  const footLimb = (i: number): Limb => (i % 2 === 0 ? "LF" : "RF");
  let base = 0; // 脚在 base,base+1；手在 base+2,base+3
  let guard = 0;
  while (guard++ < 80) {
    const h1 = base + 4;
    const h2 = base + 5;
    if (h1 <= N - 1) {
      seq.push([handLimb(h1), rid(h1)]);
      if (h1 === N - 1) break;
    }
    if (h2 <= N - 1) {
      seq.push([handLimb(h2), rid(h2)]);
      if (h2 === N - 1) break;
    }
    // 脚踩到手刚离开的点 base+2, base+3
    seq.push([footLimb(base + 2), rid(base + 2)]);
    if (base + 3 <= N - 1) seq.push([footLimb(base + 3), rid(base + 3)]);
    base += 2;
    if (base + 4 > N - 1) {
      // 收尾：把还没摸到终点的最后一手送到 goal
      if (rid(N - 1) === "goal") seq.push([handLimb(N - 1), "goal"]);
      break;
    }
  }

  const level: LevelDef = {
    id: cfg.id,
    name: cfg.name,
    grade: cfg.grade,
    wallAngleDeg: cfg.wallAngleDeg,
    ...(cfg.wallAngleTop != null ? { wallAngleTop: cfg.wallAngleTop } : {}),
    ...(cfg.wallSegments ? { wallSegments: cfg.wallSegments } : {}),
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    holds,
    goalHoldId: "goal",
    starThreshold: cfg.starThreshold ?? Math.ceil(seq.length * 0.9),
    // 初版星级目标（宽松）：流畅=参考序列的手步数+2；神速=每步 9s。P2-4 换 AI 定标
    stars: {
      targetMoves: (cfg.starThreshold ?? Math.ceil(seq.length * 0.9)) + 2,
      targetTimeSec: Math.max(45, seq.length * 9),
    },
  };
  return { level, seq };
}

/** 屋檐倒挂：两排横移（脚踩上排 y小、手抓下排 y大 → 头下脚上）。右移 shuffle。 */
export function buildRoof(cfg: {
  id: string;
  name: string;
  grade: string;
  wallAngleDeg: number;
  cols: number;
  x0: number;
  x1: number;
  footY: number;
  handY: number;
  starThreshold?: number;
}): { level: LevelDef; seq: [Limb, string][] } {
  const { cols } = cfg;
  const step = (cfg.x1 - cfg.x0) / (cols - 1);
  const holds: HoldDef[] = [];
  for (let c = 0; c < cols; c++) {
    const x = Math.round(cfg.x0 + c * step);
    holds.push({
      id: `f${c}`,
      type: "jug",
      x,
      y: cfg.footY,
      ...(c === 0 ? { start: "LF" as Limb } : c === 1 ? { start: "RF" as Limb } : {}),
    });
    const goal = c === cols - 1;
    holds.push({
      id: goal ? "goal" : `h${c}`,
      type: "jug",
      x,
      y: cfg.handY,
      ...(goal ? { goal: true, radius: 24 } : {}),
      ...(c === 0 ? { start: "LH" as Limb } : c === 1 ? { start: "RH" as Limb } : {}),
    });
  }
  const hid = (c: number) => (c === cols - 1 ? "goal" : `h${c}`);
  const seq: [Limb, string][] = [];
  for (let c = 2; c < cols; c++) {
    seq.push(["RH", hid(c)]);
    if (c === cols - 1) break;
    seq.push(["RF", `f${c}`]);
    seq.push(["LH", hid(c - 1)]);
    seq.push(["LF", `f${c - 1}`]);
  }
  const level: LevelDef = {
    id: cfg.id,
    name: cfg.name,
    grade: cfg.grade,
    wallAngleDeg: cfg.wallAngleDeg,
    worldWidth: WORLD_W,
    worldHeight: WORLD_H,
    holds,
    goalHoldId: "goal",
    starThreshold: cfg.starThreshold ?? seq.length,
    stars: {
      targetMoves: (cfg.starThreshold ?? seq.length) + 2,
      targetTimeSec: Math.max(60, seq.length * 10),
    },
  };
  return { level, seq };
}

