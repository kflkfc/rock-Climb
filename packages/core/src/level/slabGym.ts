// 板墙馆 · 10 关（GDD 内容矩阵：平衡与脚法主题，75°-90°，V0-V3）。
// 命名沿用冰岛语（Klifur 风格）。全部经 AI 试解器出厂检验（CI）。

import { LevelDef } from "./levelSchema.ts";
import { Limb } from "../model/skeleton.ts";
import { buildRoute, WORLD_H } from "./builders.ts";

const S1 = buildRoute({
  id: "s1", name: "BYRJA", grade: "V0", wallAngleDeg: 78, // 缓板墙纯 jug 起步
  rail: [{ x: 360, y: 850 }, { x: 360, y: 200 }],
  n: 12, zig: 30,
});

const S2 = buildRoute({
  id: "s2", name: "KANTUR", grade: "V0", wallAngleDeg: 80, // edge 引入
  rail: [{ x: 300, y: 850 }, { x: 420, y: 200 }],
  n: 13, zig: 26,
  holdType: (i) => (i >= 5 && i % 2 === 1 ? { type: "edge", pullDirDeg: 90 } : {}),
});

const S3 = buildRoute({
  id: "s3", name: "HALLI", grade: "V1", wallAngleDeg: 82, // edge 为主的斜线
  rail: [{ x: 180, y: 850 }, { x: 540, y: 220 }],
  n: 15, zig: 22,
  holdType: (i) => (i >= 4 ? { type: "edge", pullDirDeg: 90, pullTolDeg: 55 } : {}),
});

const S4 = buildRoute({
  id: "s4", name: "NÚA", grade: "V1", wallAngleDeg: 78, // sloper 抹脚引入（板墙压入增益的教学延伸）
  rail: [{ x: 360, y: 850 }, { x: 360, y: 210 }],
  n: 13, zig: 28,
  holdType: (i) => (i >= 5 && i % 2 === 0 ? { type: "sloper", radius: 26 } : {}),
});

const S5 = buildRoute({
  id: "s5", name: "TÁ", grade: "V1", wallAngleDeg: 84, // 脚钉混编：手 jug、脚位小点
  rail: [{ x: 320, y: 850 }, { x: 400, y: 210 }],
  n: 14, zig: 24,
  holdType: (i) => (i >= 4 && i % 3 === 2 ? { type: "footchip" } : {}),
  // footchip 仅脚：单轨里手会跳过它去抓下一个 jug（步距被拉大——这正是脚法关的难点）
});

const S6 = buildRoute({
  id: "s6", name: "GRIP", grade: "V2", wallAngleDeg: 80, // 材质混合：磨砂/普通 sloper 读盘
  rail: [{ x: 300, y: 850 }, { x: 430, y: 190 }],
  n: 14, zig: 26,
  holdType: (i) => {
    if (i >= 4 && i % 3 === 1) return { type: "sloper", radius: 26, material: "grippy" };
    if (i >= 4 && i % 3 === 2) return { type: "sloper", radius: 24 };
    return {};
  },
});

const S7 = buildRoute({
  id: "s7", name: "VOG", grade: "V2", wallAngleDeg: 85, // 大之字平衡线
  rail: [
    { x: 220, y: 850 },
    { x: 480, y: 640 },
    { x: 230, y: 430 },
    { x: 460, y: 200 },
  ],
  n: 16, zig: 18, bias: 0,
});

const S8 = buildRoute({
  id: "s8", name: "SNÚA", grade: "V2", wallAngleDeg: 86, // 侧向朝向读线
  rail: [{ x: 360, y: 850 }, { x: 360, y: 190 }],
  n: 14, zig: 40,
  holdType: (i) => {
    if (i >= 5 && i <= 10)
      return { type: "edge", pullDirDeg: i % 2 === 0 ? 0 : 180, pullTolDeg: 65, radius: 18 };
    return {};
  },
});

const S9 = buildRoute({
  id: "s9", name: "GLER", grade: "V3", wallAngleDeg: 82, // 光滑 crux：抛光 sloper 三连
  rail: [{ x: 340, y: 850 }, { x: 380, y: 180 }],
  n: 15, zig: 26,
  holdType: (i, n) => {
    if (i >= n - 7 && i <= n - 5) return { type: "sloper", radius: 26, material: "slick" };
    if (i >= 4) return { type: "sloper", radius: 26 };
    return {};
  },
});

const S10 = buildRoute({
  id: "s10", name: "PRÓF", grade: "V3", wallAngleDeg: 75, // 毕业长线：75° 板墙 → 直壁分段
  wallSegments: [
    { yTop: 460, yBottom: WORLD_H, angleDeg: 75 },
    { yTop: 0, yBottom: 460, angleDeg: 90 },
  ],
  rail: [{ x: 300, y: 860 }, { x: 430, y: 520 }, { x: 330, y: 150 }],
  n: 18, zig: 26, bias: 0.2,
  holdType: (i, n) => {
    if (i >= n - 5) return { type: "edge", pullDirDeg: 90 }; // 顶段直壁棱
    if (i >= 5 && i % 3 === 0) return { type: "sloper", radius: 26 };
    if (i >= 5 && i % 3 === 1) return { type: "footchip" };
    return {};
  },
});

const ALL = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10];
export const SLAB_LEVELS: LevelDef[] = ALL.map((r) => r.level);
export const SLAB_SEQS: Record<string, [Limb, string][]> = Object.fromEntries(
  ALL.map((r) => [r.level.id, r.seq]),
);
