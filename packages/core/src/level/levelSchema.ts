// 纯逻辑 · 关卡数据格式（JSON Schema 的 TS 表达）。
// 正式版可由关卡生成器产出同结构 JSON；切片手工填 1 关。

import { HoldType, HoldMaterial } from "../sim/holds.ts";
import { Limb } from "../model/skeleton.ts";

export interface HoldDef {
  id: string;
  type: HoldType;
  x: number;
  y: number; // 世界坐标，y 向下；越小越靠上（终点在上方）
  radius?: number;
  pullDirDeg?: number; // 朝向：最佳受力方向（度，90=向下拉，0=右，-90=上，180=左）
  pullTolDeg?: number; // 受力锥半角（度）；不填用该形状默认
  material?: HoldMaterial; // 表面材质：grippy 磨砂 / normal / slick 光滑（默认 normal）
  onVolume?: string; // 所在体积块 id（渲染层级归属）
  goal?: boolean; // 终点岩点（彩虹标识）
  start?: Limb; // 起始时该肢端预置于此
}

export interface LevelDef {
  id: string;
  name: string; // 关卡名（Klifur 风格大写）
  grade: string; // 难度等级 V0..
  wallAngleDeg: number; // 底部墙角。90 = 直壁；>90 = 仰角/屋檐
  /** 顶部墙角（可选）。设了则墙角随高度从底(wallAngleDeg)线性过渡到顶(wallAngleTop)。 */
  wallAngleTop?: number;
  worldWidth: number;
  worldHeight: number;
  holds: HoldDef[];
  goalHoldId: string;
  starThreshold: number; // 三星达标：抓取次数 ≤ 此值
}

/** 某高度 y 处的墙角（底 y=worldHeight → wallAngleDeg，顶 y=0 → wallAngleTop）。 */
export function wallAngleAtY(level: LevelDef, y: number): number {
  if (level.wallAngleTop == null) return level.wallAngleDeg;
  const t = Math.max(0, Math.min(1, 1 - y / level.worldHeight)); // 0=底 1=顶
  return level.wallAngleDeg + (level.wallAngleTop - level.wallAngleDeg) * t;
}
