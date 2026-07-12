// 关卡生成器（GDD 模块 11 · P4）：风格模板 × 种子扰动 × AI 试解验证 × 难度评估。
// V1.0 只服务每日挑战：同一日期字符串 ⇒ 同一 seed ⇒ 全端比特级相同的关卡
//（makeRng 确定性 + buildRoute 纯函数 + solveLevel 纯函数——不读钟不读平台）。
// 生成关卡进常规关卡池留 V1.5（质量沉淀后）。

import { LevelDef } from "./levelSchema.ts";
import { buildRoute, RouteCfg } from "./builders.ts";
import { solveLevel } from "../solver/solver.ts";
import { makeRng, hashSeed, Rng } from "../math/dmath.ts";
import { HoldDef } from "./levelSchema.ts";

export type GenStyle = "power" | "fingery" | "balance" | "technical" | "endurance";
export const GEN_STYLES: GenStyle[] = ["power", "fingery", "balance", "technical", "endurance"];

export const STYLE_LABEL: Record<GenStyle, string> = {
  power: "力量线",
  fingery: "指力线",
  balance: "平衡线",
  technical: "技术线",
  endurance: "耐力线",
};

const ri = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const rf = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** 风格模板：产出 buildRoute 参数（骨架 + 抖动） */
function templateFor(style: GenStyle, rng: Rng, id: string, name: string): RouteCfg {
  const midX = 300 + rng() * 120;
  switch (style) {
    case "power": // 仰角大点少步——每步都是引体
      return {
        id, name, grade: "V?",
        wallAngleDeg: ri(rng, 112, 138),
        rail: [{ x: midX, y: 850 }, { x: midX + rf(rng, -60, 60), y: ri(rng, 180, 240) }],
        n: ri(rng, 11, 13),
        zig: ri(rng, 34, 44),
        holdType: () => ({ type: "jug", radius: ri(rng, 21, 24) }),
      };
    case "fingery": // 直壁小点：crimp/pocket 混编
      return {
        id, name, grade: "V?",
        wallAngleDeg: ri(rng, 90, 96),
        rail: [{ x: midX, y: 850 }, { x: midX + rf(rng, -80, 80), y: ri(rng, 150, 200) }],
        n: ri(rng, 14, 16),
        zig: ri(rng, 24, 30),
        holdType: (i) => {
          if (i < 4) return {};
          const r = (i * 7 + 3) % 10; // 关内确定性分布（不再消耗 rng——保持步进独立）
          if (r < 4) return { type: "crimp", pullDirDeg: 90 };
          if (r < 6) return { type: "pocket", radius: 14 };
          return { type: "edge", pullDirDeg: 90 };
        },
      };
    case "balance": // 板墙之字
      return {
        id, name, grade: "V?",
        wallAngleDeg: ri(rng, 76, 86),
        rail: [
          { x: 250 + rng() * 60, y: 850 },
          { x: 430 + rng() * 50, y: ri(rng, 560, 640) },
          { x: 240 + rng() * 60, y: ri(rng, 330, 410) },
          { x: 420 + rng() * 50, y: ri(rng, 160, 220) },
        ],
        n: ri(rng, 15, 18),
        zig: ri(rng, 18, 24),
        bias: 0,
        holdType: (i) => (i >= 4 && i % 3 === 1 ? { type: "sloper", radius: 26 } : {}),
      };
    case "technical": // 侧向朝向读线 + 脚钉
      return {
        id, name, grade: "V?",
        wallAngleDeg: ri(rng, 90, 104),
        rail: [{ x: midX, y: 850 }, { x: midX + rf(rng, -70, 70), y: ri(rng, 160, 210) }],
        n: ri(rng, 14, 16),
        zig: ri(rng, 34, 42),
        holdType: (i) => {
          if (i < 4) return {};
          const r = (i * 5 + 1) % 9;
          if (r < 3) return { type: "edge", pullDirDeg: i % 2 === 0 ? 0 : 180, pullTolDeg: 62, radius: 18 };
          if (r < 5) return { type: "footchip" };
          return {};
        },
      };
    case "endurance": // 超长小棱线
      return {
        id, name, grade: "V?",
        wallAngleDeg: ri(rng, 88, 94),
        rail: [
          { x: 250 + rng() * 50, y: 860 },
          { x: 440 + rng() * 40, y: ri(rng, 580, 660) },
          { x: 250 + rng() * 50, y: ri(rng, 340, 420) },
          { x: 430 + rng() * 40, y: ri(rng, 150, 200) },
        ],
        n: ri(rng, 22, 26),
        zig: ri(rng, 16, 20),
        bias: 0,
        holdType: (i) => (i >= 4 ? { type: "edge", pullDirDeg: 90, radius: 18 } : {}),
      };
  }
}

/** 难度粗评（每日挑战展示用；正式难度体系以人工关为准） */
function estimateGrade(minMoves: number, minMatch: number, maxWall: number): string {
  const score =
    Math.max(0, (maxWall - 90) / 12) + (1 - minMatch) * 2.2 + Math.max(0, (minMoves - 8) / 5);
  return `V${Math.max(0, Math.min(8, Math.round(score)))}`;
}

export interface GeneratedLevel {
  level: LevelDef;
  style: GenStyle;
  attempts: number; // 生成重试次数（质量监控）
}

/**
 * 按种子生成一条可解关卡：抖动 → 试解（无 Dyno 基准）→ 不可解重掷（最多 10 次，
 * 再不行降级为保守模板——保证总能出关，绝不给玩家不可解的每日）。
 */
export function generateLevel(seed: number, id: string, name: string): GeneratedLevel {
  const rng = makeRng(seed);
  const style = GEN_STYLES[Math.floor(rng() * GEN_STYLES.length)];
  for (let attempt = 1; attempt <= 10; attempt++) {
    const cfg = templateFor(style, rng, id, name);
    const { level } = buildRoute(cfg);
    const r = solveLevel(level, { allowDyno: false });
    if (r.solvable) {
      return {
        level: {
          ...level,
          grade: estimateGrade(r.minMoves, r.features.minMatch, r.features.maxWallAngle),
          stars: r.targets, // 一键定标
        },
        style,
        attempts: attempt,
      };
    }
  }
  // 兜底：纯 jug 直壁（必可解）
  const fallbackHolds: HoldDef[] = [];
  const { level } = buildRoute({
    id, name, grade: "V1",
    wallAngleDeg: 90,
    rail: [{ x: 360, y: 850 }, { x: 360, y: 200 }],
    n: 13,
    zig: 30,
  });
  void fallbackHolds;
  const r = solveLevel(level, { allowDyno: false });
  return { level: { ...level, stars: r.targets }, style, attempts: 11 };
}

/** 每日挑战：日期字符串（YYYY-MM-DD）→ 全端同一关 */
export function generateDaily(date: string): GeneratedLevel {
  return generateLevel(hashSeed("kkc-daily-" + date), `daily-${date}`, "今日挑战");
}
