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

export type HandGrip = "open" | "half" | "full" | "pinch";
export type FootGrip = "inside" | "smear";
export type GripMethod = HandGrip | FootGrip;

export const HAND_GRIPS: HandGrip[] = ["open", "half", "full", "pinch"];
export const FOOT_GRIPS: FootGrip[] = ["inside", "smear"];

export const GRIP_LABEL: Record<GripMethod, string> = {
  open: "开掌",
  half: "半扣",
  full: "全扣",
  pinch: "捏",
  inside: "内侧踩",
  smear: "抹脚",
};

/** 是否伤害风险抓法（长期使用手指变弱 —— 切片仅作标记/提示） */
export const INJURY_RISK: Partial<Record<GripMethod, boolean>> = { full: true };

// 抓法类型分：[岩点类型][抓法] → 0..1
const HAND_SCORE: Record<HoldType, Record<HandGrip, number>> = {
  jug: { open: 0.95, half: 0.85, full: 0.8, pinch: 0.55 },
  crimp: { open: 0.3, half: 0.95, full: 0.9, pinch: 0.2 },
  pinch: { open: 0.4, half: 0.45, full: 0.4, pinch: 0.95 },
  sloper: { open: 0.9, half: 0.4, full: 0.3, pinch: 0.35 },
};
const FOOT_SCORE: Record<HoldType, Record<FootGrip, number>> = {
  jug: { inside: 0.9, smear: 0.7 },
  crimp: { inside: 0.92, smear: 0.45 },
  pinch: { inside: 0.7, smear: 0.55 },
  sloper: { inside: 0.5, smear: 0.9 },
};

export function gripsFor(limb: Limb): GripMethod[] {
  return isHand(limb) ? HAND_GRIPS : FOOT_GRIPS;
}

export function gripTypeScore(hold: HoldType, g: GripMethod): number {
  if (g in HAND_SCORE[hold]) return HAND_SCORE[hold][g as HandGrip];
  return FOOT_SCORE[hold][g as FootGrip];
}

/** 接触面积分：接触点离岩点中心越近越好。dist/radius ∈ [0,1] → area ∈ [~0.35, 1] */
export function contactAreaScore(distToCenter: number, radius: number): number {
  const r = clamp(distToCenter / Math.max(1, radius), 0, 1.2);
  return clamp(1 - 0.7 * r, 0.25, 1);
}

/** 朝向匹配：实际受力方向 vs 岩点最佳受力方向（弧度差）。0..1 */
export function orientationScore(pullRad: number, holdPullDir: number): number {
  let d = Math.abs(pullRad - holdPullDir) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return clamp(1 - d / Math.PI, 0.1, 1); // 完全反向=0.1，同向=1
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
