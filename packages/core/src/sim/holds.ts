// 纯逻辑 · 岩点系统（切片：4 种岩点 Jug / Crimp / Pinch / Sloper）。

import { Vec2 } from "../math/vec2.ts";
import { Limb } from "../model/skeleton.ts";

export type HoldType = "jug" | "crimp" | "pinch" | "sloper";

export interface Hold {
  id: string;
  type: HoldType;
  pos: Vec2;
  radius: number; // 视觉 + 接触半径
  friendliness: number; // 基础友好度 0..1（越大越好抓）
  friction: number; // 摩擦标量 0..1（切片仅用此标量）
  /**
   * 朝向：岩点能最好承受力的方向（弧度，0=右，PI/2=下，-PI/2=上，PI=左）。
   * "侧拉/下扣"= 普通形状 + 非向下的 pullDir，无需独立类型。
   */
  pullDir: number;
  /** 可用受力锥的半角（弧度）。越小越挑方向：jug 宽、sloper/侧拉窄。 */
  pullTol: number;
  isGoal?: boolean;
  /** 关卡起始点：游戏开始时该肢端预置于此 */
  startLimb?: Limb;
}

export const HOLD_META: Record<
  HoldType,
  { friendliness: number; friction: number; pullTol: number; label: string }
> = {
  jug: { friendliness: 0.95, friction: 0.9, pullTol: 1.2, label: "JUG 大水罐" },
  crimp: { friendliness: 0.45, friction: 0.7, pullTol: 0.42, label: "CRIMP 小棱" },
  pinch: { friendliness: 0.6, friction: 0.75, pullTol: 0.5, label: "PINCH 捏点" },
  sloper: { friendliness: 0.5, friction: 0.85, pullTol: 0.36, label: "SLOPER 滑面" },
};

export const HOLD_COLOR: Record<HoldType, string> = {
  jug: "#5F9A6A", // 绿
  crimp: "#B23A57", // 玫红
  pinch: "#6B4A8C", // 紫
  sloper: "#E5A636", // 橙黄
};

export function makeHold(
  id: string,
  type: HoldType,
  pos: Vec2,
  opts: Partial<Pick<Hold, "radius" | "pullDir" | "pullTol" | "isGoal" | "startLimb">> = {},
): Hold {
  const m = HOLD_META[type];
  return {
    id,
    type,
    pos,
    radius: opts.radius ?? (type === "jug" ? 22 : type === "sloper" ? 26 : 16),
    friendliness: m.friendliness,
    friction: m.friction,
    pullDir: opts.pullDir ?? Math.PI / 2, // 默认向下拉
    pullTol: opts.pullTol ?? m.pullTol,
    isGoal: opts.isGoal,
    startLimb: opts.startLimb,
  };
}
