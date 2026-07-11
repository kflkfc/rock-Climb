// 纯逻辑 · 经典 9 关（v1-v9，index 0-8 冻结：黄金回放按 levelIndex 引用，只许追加）。

import { LevelDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { buildRoute, buildRoof, WORLD_W, WORLD_H } from "./builders.ts";
import { TUTORIAL_LEVELS } from "./tutorial.ts";
import { SLAB_LEVELS, SLAB_SEQS } from "./slabGym.ts";
import { MIXED_LEVELS, MIXED_SEQS } from "./mixedGym.ts";
import { ROOF_LEVELS, ROOF_SEQS } from "./roofGym.ts";

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
  // 教学馆 + 板墙馆（2026-07-11 定标：无 Dyno 解基准——新手可达；v7 类动态线除外）
  t1: { targetMoves: 3, targetTimeSec: 25 },
  t2: { targetMoves: 10, targetTimeSec: 75 },
  t3: { targetMoves: 14, targetTimeSec: 95 },
  t4: { targetMoves: 10, targetTimeSec: 75 },
  t5: { targetMoves: 10, targetTimeSec: 75 },
  t6: { targetMoves: 10, targetTimeSec: 75 },
  t7: { targetMoves: 10, targetTimeSec: 75 },
  t8: { targetMoves: 11, targetTimeSec: 80 },
  s1: { targetMoves: 11, targetTimeSec: 80 },
  s2: { targetMoves: 11, targetTimeSec: 80 },
  s3: { targetMoves: 12, targetTimeSec: 90 },
  s4: { targetMoves: 11, targetTimeSec: 80 },
  s5: { targetMoves: 11, targetTimeSec: 80 },
  s6: { targetMoves: 11, targetTimeSec: 80 },
  s7: { targetMoves: 14, targetTimeSec: 95 },
  s8: { targetMoves: 11, targetTimeSec: 80 },
  s9: { targetMoves: 11, targetTimeSec: 80 },
  s10: { targetMoves: 14, targetTimeSec: 95 },
  // 综合馆补编 + 屋檐馆补编（2026-07-11 定标）
  m1: { targetMoves: 12, targetTimeSec: 90 },
  m2: { targetMoves: 12, targetTimeSec: 90 },
  m3: { targetMoves: 12, targetTimeSec: 90 },
  m4: { targetMoves: 15, targetTimeSec: 105 },
  r1: { targetMoves: 11, targetTimeSec: 80 },
  r2: { targetMoves: 11, targetTimeSec: 115 },
  r3: { targetMoves: 11, targetTimeSec: 115 },
  r4: { targetMoves: 11, targetTimeSec: 115 },
  r5: { targetMoves: 11, targetTimeSec: 115 },
  r6: { targetMoves: 8, targetTimeSec: 80 },
  r7: { targetMoves: 12, targetTimeSec: 125 },
};

// ⚠ LEVELS 顺序契约：v1-v9 冻结于 index 0-8（黄金回放 levelIndex 引用），新内容只许尾部追加
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
  ...TUTORIAL_LEVELS, // index 9-16
  ...SLAB_LEVELS, // index 17-26
  ...MIXED_LEVELS, // index 27-30
  ...ROOF_LEVELS, // index 31-37
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
  ...SLAB_SEQS,
  ...MIXED_SEQS,
  ...ROOF_SEQS,
};
