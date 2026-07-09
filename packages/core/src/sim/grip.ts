// 纯逻辑 · 抓法 / 脚法 + 匹配度公式（V4 灵魂）。
//
// 匹配度 = 抓法类型分 × 接触面积 × 朝向匹配 × (1 + 甜点加成)
// 耐力消耗速度 = 重力分量 ÷ 匹配度 × (1/指力)   ← 见 physics.ts
//
// 设计要点：错误抓法不立即脱手，而是匹配度低 → 耐力急耗（教学性强）。
// 全扣(full crimp) 对 Crimp 匹配度高但有伤害风险（养成系统反向激励，切片仅标记）。

import { clamp } from "../math/vec2.ts";
import { Hold, HoldType } from "./holds.ts";
import { Limb, isHand } from "../model/skeleton.ts";
import { HAND_TABLE, FOOT_TABLE } from "./gripTable.ts";

export type HandGrip = "open" | "half" | "full" | "pinch" | "lock" | "slap";
export type FootGrip = "inside" | "outside" | "smear" | "heel" | "toe";
export type GripMethod = HandGrip | FootGrip;

/** 抓法环可选抓法（slap 是 Dyno 腾空中继专用，不进环） */
export const HAND_GRIPS: HandGrip[] = ["open", "half", "full", "pinch", "lock"];
export const FOOT_GRIPS: FootGrip[] = ["inside", "outside", "smear", "heel", "toe"];

export const GRIP_LABEL: Record<GripMethod, string> = {
  open: "开掌",
  half: "半扣",
  full: "全扣",
  pinch: "捏",
  lock: "扣指洞",
  slap: "拍击",
  inside: "内侧踩",
  outside: "外侧踩",
  smear: "抹脚",
  heel: "勾脚",
  toe: "挂脚",
};

/** 是否伤害风险抓法（P2 起接熟练度系统触发指伤 debuff） */
export const INJURY_RISK: Partial<Record<GripMethod, boolean>> = { full: true };

/**
 * "拉"型脚法：勾脚/挂脚不是把身体撑离岩点，而是像手一样把身体拉向岩点——
 * physics 的受力方向按手的语义算（仰角/屋檐上真正有用的原因）。
 */
export const isPullingFootGrip = (g: GripMethod | null): boolean => g === "heel" || g === "toe";

export function gripsFor(limb: Limb): GripMethod[] {
  return isHand(limb) ? HAND_GRIPS : FOOT_GRIPS;
}

export function gripTypeScore(hold: HoldType, g: GripMethod): number {
  if (g === "open" || g === "half" || g === "full" || g === "pinch" || g === "lock" || g === "slap")
    return HAND_TABLE[hold][g];
  return FOOT_TABLE[hold][g];
}

/** 接触面积分：接触点离岩点中心越近越好。dist/radius ∈ [0,1] → area ∈ [~0.35, 1] */
export function contactAreaScore(distToCenter: number, radius: number): number {
  const r = clamp(distToCenter / Math.max(1, radius), 0, 1.2);
  return clamp(1 - 0.7 * r, 0.25, 1);
}

/** 两个方向的最小夹角（弧度，0..PI） */
export function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** 朝向匹配：实际受力方向 vs 岩点最佳受力方向（弧度差）。0..1 */
export function orientationScore(pullRad: number, holdPullDir: number): number {
  return clamp(1 - angleDiff(pullRad, holdPullDir) / Math.PI, 0.1, 1); // 反向=0.1，同向=1
}

/**
 * 带容差的方向对齐度（受力锥）：实际受力方向在锥内(≤tol)≈1，
 * 超出锥后线性衰减到 ~0.1。用于每帧判断"身体是否把力施在岩点可用方向上"。
 */
export function directionalFit(loadAngle: number, pullDir: number, tol: number): number {
  const d = angleDiff(loadAngle, pullDir);
  if (d <= tol) return 1;
  return clamp(1 - ((d - tol) / Math.max(0.001, Math.PI - tol)) * 0.9, 0.1, 1);
}

/** 甜点加成：接触点极接近中心时的小幅奖励 0..0.15 */
export function sweetSpotBonus(distToCenter: number, radius: number): number {
  const r = clamp(distToCenter / Math.max(1, radius), 0, 1);
  return r < 0.25 ? 0.15 * (1 - r / 0.25) : 0;
}

export interface MatchInputs {
  hold: Hold;
  grip: GripMethod;
  distToCenter: number; // 接触点离岩点中心距离
  pullRad: number; // 实际受力方向（弧度）
}

/** 综合匹配度 0..1 */
export function matchPercent(inp: MatchInputs): number {
  const ts = gripTypeScore(inp.hold.type, inp.grip);
  const ca = contactAreaScore(inp.distToCenter, inp.hold.radius);
  const os = orientationScore(inp.pullRad, inp.hold.pullDir);
  const ss = sweetSpotBonus(inp.distToCenter, inp.hold.radius);
  return clamp(ts * ca * os * (1 + ss), 0, 1);
}

export interface GripOption {
  grip: GripMethod;
  match: number; // 0..1
  injury: boolean;
}

/** 为某次接触生成所有抓法选项 + 匹配度（用于抓法环 UI），按匹配度降序 */
export function gripOptions(
  limb: Limb,
  hold: Hold,
  distToCenter: number,
  pullRad: number,
): GripOption[] {
  return gripsFor(limb)
    .map((g) => ({
      grip: g,
      match: matchPercent({ hold, grip: g, distToCenter, pullRad }),
      injury: !!INJURY_RISK[g],
    }))
    .sort((a, b) => b.match - a.match);
}
