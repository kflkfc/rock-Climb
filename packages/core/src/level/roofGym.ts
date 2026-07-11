// 屋檐馆补编 · 7 关（GDD：力量与张力，V4-V8）。与经典 v5/v6/v9 合组十关。
// 110° 起步到 175° 屋檐毕业；仰角上大点为主（角度本身即强度）。

import { LevelDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { buildRoute, buildRoof, WORLD_H } from "./builders.ts";

const R1 = buildRoute({
  id: "r1", name: "BRATTUR", grade: "V4", wallAngleDeg: 110, // 微仰入门：手承重上升
  rail: [{ x: 360, y: 850 }, { x: 360, y: 190 }],
  n: 14, zig: 30,
  holdType: (i) => (i >= 5 && i % 3 === 2 ? { type: "edge", pullDirDeg: 90 } : {}),
});

const R2 = buildRoute({
  id: "r2", name: "KRÓKUR", grade: "V5", wallAngleDeg: 125, // 钩：反提手点 + jug 脚位（勾挂脚战场）
  rail: [{ x: 330, y: 850 }, { x: 390, y: 200 }],
  n: 13, zig: 30,
  holdType: (i) => {
    if (i >= 5 && i % 3 === 1) return { type: "undercling", pullDirDeg: -90, pullTolDeg: 60 };
    return {};
  },
});

const R3 = buildRoute({
  id: "r3", name: "LOFT", grade: "V5", wallAngleDeg: 90, // 悬空：直壁起步渐入 150° 大仰
  wallSegments: [
    { yTop: 560, yBottom: WORLD_H, angleDeg: 90 },
    { yTop: 260, yBottom: 560, angleDeg: 125 },
    { yTop: 0, yBottom: 260, angleDeg: 150 },
  ],
  rail: [{ x: 360, y: 850 }, { x: 360, y: 170 }],
  n: 15, zig: 30, bias: 0.25,
  holdType: (i, n) => (i >= n - 6 ? { type: "jug", radius: 24 } : {}),
});

const R4 = buildRoute({
  id: "r4", name: "ARMUR", grade: "V6", wallAngleDeg: 140, // 臂：大跨距力量线
  rail: [{ x: 340, y: 850 }, { x: 380, y: 200 }],
  n: 11, zig: 42, // 点少距大 → 每步都是引体
  holdType: () => ({ type: "jug", radius: 23 }),
});

const R5 = buildRoute({
  id: "r5", name: "VEGGUR", grade: "V6", wallAngleDeg: 150, // 墙：150° 侧向对抗（张力增益必需）
  rail: [{ x: 360, y: 850 }, { x: 360, y: 210 }],
  n: 12, zig: 40,
  holdType: (i) => {
    if (i >= 5 && i <= 9)
      return { type: "edge", pullDirDeg: i % 2 === 0 ? 0 : 180, pullTolDeg: 65, radius: 20 };
    return { type: "jug", radius: 22 };
  },
});

const R6 = buildRoof({
  id: "r6", name: "HELLIR", grade: "V7", wallAngleDeg: 175, // 洞穴：更长的屋檐横移
  cols: 9, x0: 140, x1: 600, footY: 280, handY: 415,
});

const R7 = buildRoute({
  id: "r7", name: "KÓRÓNA", grade: "V8", wallAngleDeg: 90, // 王冠：毕业线 90°→170° 全谱
  wallSegments: [
    { yTop: 620, yBottom: WORLD_H, angleDeg: 90 },
    { yTop: 380, yBottom: 620, angleDeg: 125 },
    { yTop: 160, yBottom: 380, angleDeg: 150 },
    { yTop: 0, yBottom: 160, angleDeg: 170 },
  ],
  rail: [{ x: 300, y: 860 }, { x: 420, y: 520 }, { x: 300, y: 240 }, { x: 430, y: 130 }],
  n: 17, zig: 28, bias: 0.2,
  holdType: (i, n) => {
    if (i >= n - 5) return { type: "jug", radius: 24 }; // 屋檐段大水罐
    if (i >= 6 && i % 3 === 0) return { type: "edge", pullDirDeg: 90 };
    return {};
  },
  starThreshold: 16,
});

const ALL = [R1, R2, R3, R4, R5, R6, R7];
export const ROOF_LEVELS: LevelDef[] = ALL.map((r) => r.level);
export const ROOF_SEQS: Record<string, [Limb, string][]> = Object.fromEntries(
  ALL.map((r) => [r.level.id, r.seq]),
);
