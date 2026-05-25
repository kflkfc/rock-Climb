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
  /** 最佳受力方向（弧度，0=右，PI/2=下）。Crimp 通常向下拉。 */
  pullDir: number;
  isGoal?: boolean;
  /** 关卡起始点：游戏开始时该肢端预置于此 */
  startLimb?: Limb;
}

export const HOLD_META: Record<
  HoldType,
  { friendliness: number; friction: number; label: string }
> = {
  jug: { friendliness: 0.95, friction: 0.9, label: "JUG 大水罐" },
  crimp: { friendliness: 0.45, friction: 0.7, label: "CRIMP 小棱" },
  pinch: { friendliness: 0.6, friction: 0.75, label: "PINCH 捏点" },
  sloper: { friendliness: 0.5, friction: 0.85, label: "SLOPER 滑面" },
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
  opts: Partial<Pick<Hold, "radius" | "pullDir" | "isGoal" | "startLimb">> = {},
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
    isGoal: opts.isGoal,
    startLimb: opts.startLimb,
  };
}
