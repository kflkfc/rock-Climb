// 纯逻辑 · 6 条关卡（V1 直壁 / V2 横移 / V3 上下 / V4 特定动作 / V5 仰角+直壁 / V6 屋檐倒挂）。
// 单轨共用生成器：一条岩点轨道，手先用、脚随后踩同一批点（贴近真实抱石，密度减半→稀疏）。

import { LevelDef, HoldDef, WallSegment } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { HoldType } from "../sim/holds.ts";
import { dcos, dhypot } from "../math/dmath.ts";

const WORLD_W = 720;
const WORLD_H = 1000;

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

interface RouteCfg {
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
function buildRoute(cfg: RouteCfg): { level: LevelDef; seq: [Limb, string][] } {
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
function buildRoof(cfg: {
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

// ---- V1 KLIFR：基本垂直，15 点 ----
const V1 = buildRoute({
  id: "v1",
  name: "KLIFR",
  grade: "V1",
  wallAngleDeg: 90,
  rail: [{ x: 360, y: 850 }, { x: 360, y: 110 }],
  n: 15,
  zig: 34,
  holdType: (i, n) => (i === 5 ? { type: "crimp", pullDirDeg: 90 } : i === n - 4 ? { type: "sloper", radius: 28 } : {}),
});

// ---- V2 SKÁ：45°+ 斜向横移，20 点 ----
const V2 = buildRoute({
  id: "v2",
  name: "SKÁ",
  grade: "V2",
  wallAngleDeg: 90,
  rail: [{ x: 120, y: 850 }, { x: 620, y: 150 }], // Δx500 Δy700 → 与竖直夹角 55°
  n: 20,
  zig: 20,
  holdType: (i) => (i === 8 || i === 12 ? { type: "crimp", pullDirDeg: 180, pullTolDeg: 75 } : {}),
});

// ---- V3 HVELF：先上后下拱形，30 点 ----
const V3 = buildRoute({
  id: "v3",
  name: "HVELF",
  grade: "V3",
  wallAngleDeg: 90,
  // 拱形：左侧上升 → 顶部 → 右侧平缓下降（浅角度，身体只是后倾、不头下脚上倒挂）
  rail: [
    { x: 175, y: 830 },
    { x: 205, y: 250 },
    { x: 340, y: 160 },
    { x: 500, y: 235 },
    { x: 600, y: 370 },
  ],
  n: 24,
  zig: 16,
  bias: 0, // 均匀，避免中段步子过大够不到
});

// ---- V4 GASTON：方向 crux（侧拉→下扣→侧拉），16 点 ----
const V4 = buildRoute({
  id: "v4",
  name: "GASTON",
  grade: "V4",
  wallAngleDeg: 95,
  rail: [{ x: 360, y: 820 }, { x: 360, y: 150 }],
  n: 16,
  zig: 34,
  holdType: (i) => {
    if (i === 7) return { type: "crimp", pullDirDeg: 180, pullTolDeg: 50 };
    if (i === 8) return { type: "crimp", pullDirDeg: -90, pullTolDeg: 50 };
    if (i === 9) return { type: "crimp", pullDirDeg: 0, pullTolDeg: 50 };
    return {};
  },
  starThreshold: 14,
});

// ---- V5 ÞAK：底部直壁 → 顶部大仰角（变墙角），16 点 ----
const V5 = buildRoute({
  id: "v5",
  name: "ÞAK",
  grade: "V5",
  wallAngleDeg: 90,
  wallAngleTop: 138,
  rail: [{ x: 360, y: 850 }, { x: 360, y: 150 }],
  n: 16,
  zig: 32,
  bias: 0.3,
  holdType: (i, n) => (i >= n - 6 ? { type: "jug", radius: 22 } : {}), // 顶部仰角段大水罐好抓
});

// ---- V6 HVOLF：屋檐倒挂横移（脚上手下、头下脚上），14 点 ----
const V6 = buildRoof({
  id: "v6",
  name: "HVOLF",
  grade: "V6",
  wallAngleDeg: 170,
  cols: 7, // 7 列 × (脚+手) = 14 点
  x0: 190,
  x1: 560,
  footY: 300, // 脚踩上排
  handY: 430, // 手抓下排
  starThreshold: 12,
});

// ---- V7 STÖKK（跳）：动态线——中段 240px 大间隙，静态够不到，必须甩跳 ----
const V7_LEVEL: LevelDef = {
  id: "v7",
  name: "STÖKK",
  grade: "V4",
  wallAngleDeg: 90,
  worldWidth: WORLD_W,
  worldHeight: WORLD_H,
  goalHoldId: "goal",
  starThreshold: 7,
  stars: { targetMoves: 7, targetTimeSec: 60 },
  holds: [
    { id: "s_lf", type: "jug", x: 330, y: 860, start: "LF" },
    { id: "s_rf", type: "jug", x: 390, y: 860, start: "RF" },
    { id: "s_lh", type: "jug", x: 330, y: 730, start: "LH" },
    { id: "s_rh", type: "jug", x: 390, y: 730, start: "RH" },
    { id: "a1", type: "jug", x: 320, y: 615 },
    { id: "a2", type: "edge", x: 400, y: 575, pullDirDeg: 90 },
    // —— 240px 空白带：这里没有点，甩跳是唯一出路；终点即跳点（拍中完攀）——
    { id: "goal", type: "jug", x: 360, y: 335, radius: 34, goal: true },
  ],
};

// ---- V8 SLEIPUR（滑）：摩擦线——底 75° 板墙抹脚上，顶直壁全 Sloper（含光滑点 crux）----
const V8 = buildRoute({
  id: "v8",
  name: "SLEIPUR",
  grade: "V3",
  wallAngleDeg: 75, // 被 wallSegments 覆盖，留作兼容展示
  wallSegments: [
    { yTop: 480, yBottom: WORLD_H, angleDeg: 75 }, // 底：板墙（脚摩擦主导，压入增益）
    { yTop: 0, yBottom: 480, angleDeg: 90 }, // 顶：直壁
  ],
  rail: [{ x: 360, y: 850 }, { x: 360, y: 130 }],
  n: 16,
  zig: 30,
  holdType: (i, n) => {
    if (i === n - 5) return { type: "sloper", radius: 28, material: "slick" }; // crux：光滑滑面
    if (i >= 4 && i % 3 === 1) return { type: "sloper", radius: 26, material: "grippy" };
    if (i >= n - 8) return { type: "sloper", radius: 26 };
    return {}; // 底段 jug 热身
  },
});

// ---- V9 SPENNA（张力）：140° 陡仰——侧拉对抗段 + 反提，靠全身张力增益才撑得住 ----
const V9 = buildRoute({
  id: "v9",
  name: "SPENNA",
  grade: "V6",
  wallAngleDeg: 140,
  rail: [{ x: 360, y: 840 }, { x: 360, y: 160 }],
  n: 14,
  zig: 44, // 大横距 → 对抗点分居两侧
  bias: 0.3,
  holdType: (i) => {
    // 中段对抗区：左侧点向右拉(0°)、右侧点向左拉(180°)——双手侧拉对抗（张力线灵魂）。
    // 用 edge+侧向朝向而非 sidepull 类型：单轨路线脚要踩同一批点（sidepull 仅手）。
    if (i >= 6 && i <= 9) {
      return { type: "edge", pullDirDeg: i % 2 === 0 ? 0 : 180, pullTolDeg: 60, radius: 18 };
    }
    return { type: "jug" }; // 其余大点（140° 本身已是强度）
  },
  starThreshold: 12,
});

export const LEVEL_V1 = V1.level;
export const LEVEL_V2 = V2.level;
export const LEVEL_V3 = V3.level;
export const LEVEL_V4 = V4.level;
export const LEVEL_V5 = V5.level;
export const LEVEL_V6 = V6.level;

export const LEVEL_V7 = V7_LEVEL;
export const LEVEL_V8 = V8.level;
export const LEVEL_V9 = V9.level;

/**
 * 星级目标定标（AI 试解器 2026-07-10 产出，solveLevel Lv10 基准）：
 * targetMoves = max(最优×1.2, 最优+2)；targetTimeSec = 估时×1.8（陡墙步时加权）。
 * 重新定标：npx vitest run calibrate（P2-4 编辑器上线后一键化）。
 */
const CALIBRATED: Record<string, { targetMoves: number; targetTimeSec: number }> = {
  v1: { targetMoves: 9, targetTimeSec: 75 },
  v2: { targetMoves: 11, targetTimeSec: 85 },
  v3: { targetMoves: 21, targetTimeSec: 140 },
  v4: { targetMoves: 8, targetTimeSec: 65 },
  v5: { targetMoves: 12, targetTimeSec: 125 },
  v6: { targetMoves: 7, targetTimeSec: 70 },
  v7: { targetMoves: 5, targetTimeSec: 45 },
  v8: { targetMoves: 8, targetTimeSec: 65 },
  v9: { targetMoves: 12, targetTimeSec: 125 },
};

export const LEVELS: LevelDef[] = [
  LEVEL_V1,
  LEVEL_V2,
  LEVEL_V3,
  LEVEL_V4,
  LEVEL_V5,
  LEVEL_V6,
  LEVEL_V7,
  LEVEL_V8,
  LEVEL_V9,
].map((lv) => (CALIBRATED[lv.id] ? { ...lv, stars: CALIBRATED[lv.id] } : lv));

/** 开发/测试用：各关一条参考攀爬序列。 */
export const LEVEL_SEQS: Record<string, [Limb, string][]> = {
  v1: V1.seq,
  v2: V2.seq,
  v3: V3.seq,
  v4: V4.seq,
  v5: V5.seq,
  v6: V6.seq,
  v8: V8.seq,
  v9: V9.seq,
};
