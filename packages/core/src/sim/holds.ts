// 纯逻辑 · 岩点系统（GDD 4.1）。
//
// ⚠ 关键区分：HoldType 只描述**形状**。
// 侧拉 / 反提 / 反肩不是岩点类型，而是**动作**——由岩点朝向 × 身体位置 × 哪只手
// 共同决定，同一颗竖条岩点从左边够是侧拉、从右边够就是反肩。动作在运行时由
// classifyMove()（grip.ts）判定，见下方 MoveType / MOVE_META。
//
// 加新形状 = 加一行 META + 一行颜色 + 渲染形状映射，零逻辑改动。

import { Vec2 } from "../math/vec2.ts";
import { Limb, isHand } from "../model/skeleton.ts";

/** 表面材质 3 档（GDD 4.5）：乘到岩点摩擦上，Sloper/抹脚玩法深度所在 */
export type HoldMaterial = "grippy" | "normal" | "slick";
export const MATERIAL_MUL: Record<HoldMaterial, number> = {
  grippy: 1.1, // 磨砂
  normal: 1.0, // 普通
  slick: 0.82, // 光滑（老旧抛光点）
};

/** 岩点**形状** 10 种（不含动作——动作见 MoveType） */
export type HoldType =
  | "jug" // 大水罐：免抓法环直接抓
  | "edge" // 平台边/竖条：朝向敏感的棱，转 90° 就是侧拉/反肩用的竖条
  | "pocket" // 大指洞：3 指
  | "pocket2" // 中指洞：2 指
  | "mono" // 最小指洞：1 指，最高指力需求
  | "crimp" // 小平点：全扣>半扣>开掌
  | "pinch" // 捏点：必须拇指参与
  | "sloper" // 大斜面：全靠摩擦
  | "volume" // 大体积块：可承载子点、改变局部墙面
  | "footchip"; // 脚钉：极小，手抓不住

/**
 * 动作类型（**派生量，不是岩点数据**）：由岩点朝向、身体位置、哪只手算出。
 * 见 grip.ts 的 classifyMove()。
 */
export type MoveType = "downpull" | "sidepull" | "undercling" | "gaston";

export interface MoveMeta {
  label: string;
  /** 动作附加耐力消耗（反肩肩部对抗最贵） */
  drainMul: number;
  /** 是否必须有脚受力才成立（反提靠顶髋，脚一飞就完） */
  needsFeet: boolean;
}

export const MOVE_META: Record<MoveType, MoveMeta> = {
  downpull: { label: "正拉", drainMul: 1.0, needsFeet: false },
  sidepull: { label: "侧拉", drainMul: 1.05, needsFeet: false },
  undercling: { label: "反提", drainMul: 1.15, needsFeet: true },
  gaston: { label: "反肩", drainMul: 1.35, needsFeet: false },
};

export interface HoldMeta {
  label: string;
  friendliness: number; // 基础友好度 0..1
  friction: number; // 表面摩擦 0..1（P1-3 起进抓力公式）
  pullTol: number; // 受力锥半角（弧度）
  defaultPullDirDeg: number; // 默认朝向（度；90=向下拉）
  radius: number; // 默认接触半径
  hands: boolean; // 手可用（只有脚钉为 false；脚则一律可用——现实里没有踩不了的点）
  fingerDemand: number; // 指力需求系数（≥1 越大越吃指力；进耐力消耗，仅手）
  drainMul: number; // 形状附加消耗系数（动作消耗另见 MOVE_META）
  /** 指洞类：能塞进几根手指。非指洞不填 */
  pocketFingers?: 1 | 2 | 3;
}

export const HOLD_META: Record<HoldType, HoldMeta> = {
  //                 label            友好   摩擦  锥半角  默认向  半径  手     指力需求 消耗
  jug: { label: "JUG 大水罐", friendliness: 0.95, friction: 0.9, pullTol: 1.2, defaultPullDirDeg: 90, radius: 22, hands: true, fingerDemand: 1.0, drainMul: 1.0 },
  edge: { label: "EDGE 平台边", friendliness: 0.8, friction: 0.8, pullTol: 0.55, defaultPullDirDeg: 90, radius: 18, hands: true, fingerDemand: 1.0, drainMul: 1.0 },
  pocket: { label: "POCKET 大指洞(3指)", friendliness: 0.62, friction: 0.75, pullTol: 0.6, defaultPullDirDeg: 90, radius: 14, hands: true, fingerDemand: 1.25, drainMul: 1.0, pocketFingers: 3 },
  pocket2: { label: "POCKET2 中指洞(2指)", friendliness: 0.5, friction: 0.72, pullTol: 0.55, defaultPullDirDeg: 90, radius: 12.5, hands: true, fingerDemand: 1.4, drainMul: 1.05, pocketFingers: 2 },
  mono: { label: "MONO 最小指洞(1指)", friendliness: 0.35, friction: 0.7, pullTol: 0.5, defaultPullDirDeg: 90, radius: 11, hands: true, fingerDemand: 1.6, drainMul: 1.1, pocketFingers: 1 },
  crimp: { label: "CRIMP 小棱", friendliness: 0.45, friction: 0.7, pullTol: 0.42, defaultPullDirDeg: 90, radius: 16, hands: true, fingerDemand: 1.15, drainMul: 1.0 },
  pinch: { label: "PINCH 捏点", friendliness: 0.6, friction: 0.75, pullTol: 0.5, defaultPullDirDeg: 90, radius: 16, hands: true, fingerDemand: 1.05, drainMul: 1.0 },
  sloper: { label: "SLOPER 滑面", friendliness: 0.5, friction: 0.85, pullTol: 0.36, defaultPullDirDeg: 90, radius: 26, hands: true, fingerDemand: 1.0, drainMul: 1.0 },
  volume: { label: "VOLUME 体积块", friendliness: 0.7, friction: 0.82, pullTol: 0.8, defaultPullDirDeg: 90, radius: 42, hands: true, fingerDemand: 1.0, drainMul: 1.0 },
  footchip: { label: "FOOT CHIP 脚钉", friendliness: 0.55, friction: 0.72, pullTol: 0.5, defaultPullDirDeg: 90, radius: 8, hands: false, fingerDemand: 1.0, drainMul: 1.0 },
};

export const HOLD_TYPES = Object.keys(HOLD_META) as HoldType[];

/** 指洞家族：只有这些能把手指伸进去，也只有这些一次只容一只肢端 */
export const isPocket = (t: HoldType) => HOLD_META[t].pocketFingers != null;

export const HOLD_COLOR: Record<HoldType, string> = {
  jug: "#5F9A6A", // 绿
  edge: "#4A7A9C", // 蓝灰
  pocket: "#2D6E3E", // 深绿
  pocket2: "#3F8A57", // 中绿
  mono: "#4F3F30", // 深咖
  crimp: "#B23A57", // 玫红
  pinch: "#6B4A8C", // 紫
  sloper: "#E5A636", // 橙黄
  volume: "#9C8B5A", // 沙棕
  footchip: "#6E7B52", // 橄榄
};

export interface Hold {
  id: string;
  type: HoldType;
  pos: Vec2;
  radius: number; // 视觉 + 接触半径
  friendliness: number;
  friction: number;
  /** 朝向：岩点能最好承受力的方向（弧度，0=右，PI/2=下，-PI/2=上，PI=左） */
  pullDir: number;
  /** 受力锥半角（弧度）。越小越挑方向 */
  pullTol: number;
  fingerDemand: number;
  drainMul: number;
  /** 表面材质（默认 normal）；有效摩擦 = friction × MATERIAL_MUL[material] */
  material: HoldMaterial;
  /** 定线色（CSS hex）。缺省 = HOLD_COLOR[type]。纯视觉：不进物理，也不进 stateHash */
  color?: string;
  /** 所在体积块 id（仅渲染 z-order 与视觉归属；受力方向用 pullDir 表达） */
  onVolume?: string;
  isGoal?: boolean;
  /** 关卡起始点：游戏开始时该肢端预置于此 */
  startLimb?: Limb;
}

/** 有效摩擦 0..1（类型基础摩擦 × 材质档位） */
export function effectiveFriction(h: Hold): number {
  const f = h.friction * MATERIAL_MUL[h.material];
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

/**
 * 该肢端能否使用此岩点。
 * **脚一律可用**——现实里没有光面点，所有点都踩得上去，只是有的难踩有的好踩；
 * 难易全部体现在 FOOT_TABLE 的匹配度与随之而来的耐力消耗上，不做硬门禁。
 * 手仍有一处限制：脚钉太小，抓不住。
 */
export function holdUsableBy(hold: Hold, limb: Limb): boolean {
  return isHand(limb) ? HOLD_META[hold.type].hands : true;
}

export function makeHold(
  id: string,
  type: HoldType,
  pos: Vec2,
  opts: Partial<
    Pick<
      Hold,
      "radius" | "pullDir" | "pullTol" | "material" | "color" | "onVolume" | "isGoal" | "startLimb"
    >
  > = {},
): Hold {
  const m = HOLD_META[type];
  return {
    id,
    type,
    pos,
    radius: opts.radius ?? m.radius,
    friendliness: m.friendliness,
    friction: m.friction,
    pullDir: opts.pullDir ?? (m.defaultPullDirDeg * Math.PI) / 180,
    pullTol: opts.pullTol ?? m.pullTol,
    fingerDemand: m.fingerDemand,
    drainMul: m.drainMul,
    material: opts.material ?? "normal",
    color: opts.color,
    onVolume: opts.onVolume,
    isGoal: opts.isGoal,
    startLimb: opts.startLimb,
  };
}
