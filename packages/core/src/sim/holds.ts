// 纯逻辑 · 岩点系统（正式版：12 种类型，GDD 4.1）。
// 每种类型 = 一行数据（友好度/摩擦/受力锥/默认朝向/尺寸/可用肢端/指力需求/消耗系数）。
// 加新岩点类型 = 加一行 META + 一行颜色 + 渲染形状映射，零逻辑改动。

import { Vec2 } from "../math/vec2.ts";
import { Limb, isHand } from "../model/skeleton.ts";

/** 表面材质 3 档（GDD 4.5）：乘到岩点摩擦上，Sloper/抹脚玩法深度所在 */
export type HoldMaterial = "grippy" | "normal" | "slick";
export const MATERIAL_MUL: Record<HoldMaterial, number> = {
  grippy: 1.1, // 磨砂
  normal: 1.0, // 普通
  slick: 0.82, // 光滑（老旧抛光点）
};

export type HoldType =
  | "jug" // 大水罐：免抓法环直接抓
  | "edge" // 平台边：朝向敏感的水平棱
  | "pocket" // 指洞：1-3 指，指力需求高
  | "crimp" // 小平点：全扣>半扣>开掌
  | "pinch" // 捏点：必须拇指参与
  | "sidepull" // 侧拉：受力锥朝侧向
  | "undercling" // 反提：受力锥朝上
  | "gaston" // 反肩：朝外侧发力，肩部消耗大
  | "sloper" // 大斜面：全靠摩擦
  | "mono" // 单指洞：最高指力需求
  | "volume" // 大体积块：可承载子点、改变局部墙面
  | "footchip"; // 脚钉：极小，仅脚

export interface HoldMeta {
  label: string;
  friendliness: number; // 基础友好度 0..1
  friction: number; // 表面摩擦 0..1（P1-3 起进抓力公式）
  pullTol: number; // 受力锥半角（弧度）
  defaultPullDirDeg: number; // 默认朝向（度；90=向下拉）。侧拉/反提等类型自带非向下默认
  radius: number; // 默认接触半径
  hands: boolean; // 手可用
  feet: boolean; // 脚可用
  fingerDemand: number; // 指力需求系数（≥1 越大越吃指力；进耐力消耗，仅手）
  drainMul: number; // 类型附加消耗系数（gaston 肩部对抗等）
}

export const HOLD_META: Record<HoldType, HoldMeta> = {
  //                 label            友好   摩擦  锥半角  默认向  半径  手     脚     指力需求 消耗
  jug: { label: "JUG 大水罐", friendliness: 0.95, friction: 0.9, pullTol: 1.2, defaultPullDirDeg: 90, radius: 22, hands: true, feet: true, fingerDemand: 1.0, drainMul: 1.0 },
  edge: { label: "EDGE 平台边", friendliness: 0.8, friction: 0.8, pullTol: 0.55, defaultPullDirDeg: 90, radius: 18, hands: true, feet: true, fingerDemand: 1.0, drainMul: 1.0 },
  pocket: { label: "POCKET 指洞", friendliness: 0.62, friction: 0.75, pullTol: 0.6, defaultPullDirDeg: 90, radius: 14, hands: true, feet: false, fingerDemand: 1.25, drainMul: 1.0 },
  crimp: { label: "CRIMP 小棱", friendliness: 0.45, friction: 0.7, pullTol: 0.42, defaultPullDirDeg: 90, radius: 16, hands: true, feet: true, fingerDemand: 1.15, drainMul: 1.0 },
  pinch: { label: "PINCH 捏点", friendliness: 0.6, friction: 0.75, pullTol: 0.5, defaultPullDirDeg: 90, radius: 16, hands: true, feet: false, fingerDemand: 1.05, drainMul: 1.0 },
  sidepull: { label: "SIDE PULL 侧拉", friendliness: 0.55, friction: 0.75, pullTol: 0.45, defaultPullDirDeg: 0, radius: 16, hands: true, feet: false, fingerDemand: 1.0, drainMul: 1.05 },
  undercling: { label: "UNDERCLING 反提", friendliness: 0.5, friction: 0.75, pullTol: 0.45, defaultPullDirDeg: -90, radius: 16, hands: true, feet: false, fingerDemand: 1.0, drainMul: 1.15 },
  gaston: { label: "GASTON 反肩", friendliness: 0.4, friction: 0.7, pullTol: 0.4, defaultPullDirDeg: 180, radius: 16, hands: true, feet: false, fingerDemand: 1.0, drainMul: 1.35 },
  sloper: { label: "SLOPER 滑面", friendliness: 0.5, friction: 0.85, pullTol: 0.36, defaultPullDirDeg: 90, radius: 26, hands: true, feet: true, fingerDemand: 1.0, drainMul: 1.0 },
  mono: { label: "MONO 单指洞", friendliness: 0.35, friction: 0.7, pullTol: 0.5, defaultPullDirDeg: 90, radius: 11, hands: true, feet: false, fingerDemand: 1.6, drainMul: 1.1 },
  volume: { label: "VOLUME 体积块", friendliness: 0.7, friction: 0.82, pullTol: 0.8, defaultPullDirDeg: 90, radius: 42, hands: true, feet: true, fingerDemand: 1.0, drainMul: 1.0 },
  footchip: { label: "FOOT CHIP 脚钉", friendliness: 0.55, friction: 0.72, pullTol: 0.5, defaultPullDirDeg: 90, radius: 8, hands: false, feet: true, fingerDemand: 1.0, drainMul: 1.0 },
};

export const HOLD_TYPES = Object.keys(HOLD_META) as HoldType[];

export const HOLD_COLOR: Record<HoldType, string> = {
  jug: "#5F9A6A", // 绿
  edge: "#4A7A9C", // 蓝灰
  pocket: "#2D6E3E", // 深绿
  crimp: "#B23A57", // 玫红
  pinch: "#6B4A8C", // 紫
  sidepull: "#C96A2F", // 赭橙
  undercling: "#8C4A6B", // 梅紫
  gaston: "#7A5A40", // 深棕
  sloper: "#E5A636", // 橙黄
  mono: "#4F3F30", // 深咖
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

/** 该肢端能否使用此岩点（脚钉仅脚 / 指洞捏点等仅手） */
export function holdUsableBy(hold: Hold, limb: Limb): boolean {
  const m = HOLD_META[hold.type];
  return isHand(limb) ? m.hands : m.feet;
}

export function makeHold(
  id: string,
  type: HoldType,
  pos: Vec2,
  opts: Partial<
    Pick<Hold, "radius" | "pullDir" | "pullTol" | "material" | "onVolume" | "isGoal" | "startLimb">
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
    onVolume: opts.onVolume,
    isGoal: opts.isGoal,
    startLimb: opts.startLimb,
  };
}
