// 纯逻辑 · 抓法 / 脚法 + 匹配度公式（V4 灵魂）。
//
// 匹配度 = 抓法类型分 × 接触面积 × 朝向匹配 × (1 + 甜点加成)
// 耐力消耗速度 = 重力分量 ÷ 匹配度 × (1/指力)   ← 见 physics.ts
//
// 设计要点：错误抓法不立即脱手，而是匹配度低 → 耐力急耗（教学性强）。
// 全扣(full crimp) 对 Crimp 匹配度高但有伤害风险（养成系统反向激励，切片仅标记）。

import { clamp } from "../math/vec2.ts";
import { dcos } from "../math/dmath.ts";
import { Hold, HoldType, MoveType, isPocket } from "./holds.ts";
import { Limb, isHand } from "../model/skeleton.ts";
import { HAND_TABLE, FOOT_TABLE } from "./gripTable.ts";
import { gripUnlocked } from "../progress/techTree.ts";

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
  // 脚跟钩 = 膝盖弯、人像坐在点上 → 挂脚；脚尖钩 = 腿基本伸直 → 勾脚。
  // （只是显示文案；回放存的是抓法**序号**，改这里不影响兼容。）
  heel: "挂脚",
  toe: "勾脚",
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

/**
 * 该抓法在此岩点上是否物理成立——不成立的**不进抓法环**（不是给个低分了事）。
 * "扣指洞"没有洞可扣，在平点/滑面上根本不是一种抓法。
 */
export function gripApplicable(hold: HoldType, g: GripMethod): boolean {
  if (g === "lock") return isPocket(hold);
  return true;
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

/**
 * 朝向匹配：实际受力方向 vs 岩点最佳受力方向。0..1
 *
 * 与 directionalFitHand 同为**双瓣**：顺向（正拉）最好，反向（反提/反肩）次好，
 * 横向剪切最差。必须和实时物理同形状——否则抓法环显示 57%、抓上去却在融化。
 */
export function orientationScore(pullRad: number, holdPullDir: number): number {
  const c = dcos(angleDiff(pullRad, holdPullDir)); // 1=同向 -1=反向
  return clamp(0.45 + 0.55 * Math.max(c, -c * 0.6), 0.1, 1);
}

/**
 * 带容差的方向对齐度（受力锥）：实际受力方向在锥内(≤tol)≈1，
 * 超出锥后线性衰减到 ~0.1。**单瓣**版本，仅供脚的撑型受力与工具/试解器沿用。
 */
export function directionalFit(loadAngle: number, pullDir: number, tol: number): number {
  const d = angleDiff(loadAngle, pullDir);
  if (d <= tol) return 1;
  return clamp(1 - ((d - tol) / Math.max(0.001, Math.PI - tol)) * 0.9, 0.1, 1);
}

/**
 * 判定这一手在做什么**动作**（派生量，不存进岩点数据）。
 *
 * 判据是**岩点朝向相对重力**——设计者就是这么想的："这颗点朝上，那就是反提点"：
 *  - 朝向≈沿墙向下 → 正拉
 *  - 朝向≈沿墙向上 → 反提
 *  - 朝向偏横 → 看这股力是把点**往身上拉**（侧拉）还是**往外撑**（反肩）
 *
 * 最后那一档正是"动作不是岩点属性"的证据：同一颗竖条，左手从左边够是反肩，
 * 右手横过去够就是侧拉。
 *
 * @param pullDir    岩点朝向（世界弧度）
 * @param wallDown   沿墙向下的方向（世界弧度）
 * @param towardBody 该朝向的水平分量是否指向身体
 */
export function classifyMove(pullDir: number, wallDown: number, towardBody: boolean): MoveType {
  const d = angleDiff(pullDir, wallDown);
  if (d <= Math.PI / 3) return "downpull"; // ≤60° 朝下
  if (d >= (Math.PI * 2) / 3) return "undercling"; // ≥120° 朝上
  return towardBody ? "sidepull" : "gaston";
}

export interface MoveAlignTune {
  backLobe: number;
  backNoFeet: number;
  alignSide: number;
  alignGaston: number;
}

/**
 * 手的方向对齐度——**按动作分档**，而不是"夹角越大越差"的单调衰减。
 *
 * 旧模型只有一条从 0 衰减到 0.1 的曲线，等于宣布"反着自然吊挂线发力不可能"；
 * 可反提恰恰就是反向发力（点要求向上、身体挂在下方），真人靠屈肘顶髋做得到。
 * 所以：正拉照旧走受力锥；反提/侧拉/反肩各有自己的上限，再由身体姿态
 * （geo）在 0.7~1.0 之间微调——位置仍然有影响，但不再是一票否决。
 *
 * 前提条件也照现实来：反提没脚顶就崩（feetLoaded），反肩没有对侧支撑撑不住（opposed）。
 */
export function moveAlignHand(
  move: MoveType,
  natural: number,
  pullDir: number,
  tol: number,
  feetLoaded: boolean,
  opposed: boolean,
  t: MoveAlignTune,
): number {
  const geo = directionalFit(natural, pullDir, tol); // 0.1..1 身体摆得对不对
  if (move === "downpull") return geo;
  const ceil =
    move === "undercling"
      ? feetLoaded
        ? t.backLobe
        : t.backNoFeet // 脚一飞，反提立刻崩
      : move === "sidepull"
        ? t.alignSide
        : t.alignGaston * (opposed ? 1 : 0.55); // 反肩要对侧顶住
  return ceil * (0.7 + 0.3 * geo);
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

/**
 * 为某次接触生成抓法选项 + 匹配度（用于抓法环 UI），按匹配度降序。
 * climberLevel：技术树过滤——未解锁的抓法不出现在环里（默认 10 = 全解锁，测试/工具用）。
 */
export function gripOptions(
  limb: Limb,
  hold: Hold,
  distToCenter: number,
  pullRad: number,
  climberLevel = 10,
): GripOption[] {
  return gripsFor(limb)
    .filter((g) => gripUnlocked(g, climberLevel) && gripApplicable(hold.type, g))
    .map((g) => ({
      grip: g,
      match: matchPercent({ hold, grip: g, distToCenter, pullRad }),
      injury: !!INJURY_RISK[g],
    }))
    .sort((a, b) => b.match - a.match);
}
