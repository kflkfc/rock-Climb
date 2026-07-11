// 综合馆补编 · 4 关（GDD：指力与技术，V2-V6）。与经典 v1/v2/v3/v4/v7/v8 合组十关。
// 仅手类型（pocket/mono/pinch）采用混编：手点特化、脚点保持可踩（单轨共用的约束）。

import { LevelDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { buildRoute } from "./builders.ts";

const M1 = buildRoute({
  id: "m1", name: "FINGUR", grade: "V4", wallAngleDeg: 92, // 指洞线：pocket 手点 + edge 脚位
  rail: [{ x: 340, y: 850 }, { x: 380, y: 160 }],
  n: 15, zig: 28,
  holdType: (i, n) => {
    if (i === n - 4) return { type: "mono", radius: 11 }; // crux：单指洞
    if (i >= 4 && i % 3 === 0) return { type: "pocket", radius: 14 };
    if (i >= 4) return { type: "edge", pullDirDeg: 90 };
    return {};
  },
});

const M2 = buildRoute({
  id: "m2", name: "KLEMMA", grade: "V3", wallAngleDeg: 90, // 捏点线：pinch 手点 + crimp 脚位
  rail: [{ x: 280, y: 850 }, { x: 440, y: 180 }],
  n: 14, zig: 26,
  holdType: (i) => {
    if (i >= 4 && i % 3 === 1) return { type: "pinch", radius: 16 };
    if (i >= 4) return { type: "crimp", pullDirDeg: 90 };
    return {};
  },
});

const M3 = buildRoute({
  id: "m3", name: "KUBBUR", grade: "V5", wallAngleDeg: 95, // 体积块线：大块 + 光滑段
  rail: [{ x: 360, y: 850 }, { x: 340, y: 170 }],
  n: 13, zig: 34,
  holdType: (i, n) => {
    if (i >= 4 && i % 4 === 0) return { type: "volume", radius: 40 };
    if (i >= n - 6 && i % 2 === 1) return { type: "sloper", radius: 26, material: "slick" };
    if (i >= 4) return { type: "edge", pullDirDeg: 90 };
    return {};
  },
});

const M4 = buildRoute({
  id: "m4", name: "ÞOL", grade: "V5", wallAngleDeg: 93, // 耐力长线：26 点连续小棱，无大休息点
  rail: [
    { x: 250, y: 860 },
    { x: 470, y: 640 },
    { x: 260, y: 420 },
    { x: 460, y: 170 },
  ],
  n: 26, zig: 18, bias: 0,
  holdType: (i) => (i >= 4 ? { type: "edge", pullDirDeg: 90, radius: 18 } : {}),
});

const ALL = [M1, M2, M3, M4];
export const MIXED_LEVELS: LevelDef[] = ALL.map((r) => r.level);
export const MIXED_SEQS: Record<string, [Limb, string][]> = Object.fromEntries(
  ALL.map((r) => [r.level.id, r.seq]),
);
