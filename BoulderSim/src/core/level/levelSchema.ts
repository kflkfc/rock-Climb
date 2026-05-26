// 纯逻辑 · 关卡数据格式（JSON Schema 的 TS 表达）。
// 正式版可由关卡生成器产出同结构 JSON；切片手工填 1 关。

import { HoldType } from "../sim/holds.ts";
import { Limb } from "../model/skeleton.ts";

export interface HoldDef {
  id: string;
  type: HoldType;
  x: number;
  y: number; // 世界坐标，y 向下；越小越靠上（终点在上方）
  radius?: number;
  pullDirDeg?: number; // 朝向：最佳受力方向（度，90=向下拉，0=右，-90=上，180=左）
  pullTolDeg?: number; // 受力锥半角（度）；不填用该形状默认
  goal?: boolean; // 终点岩点（彩虹标识）
  start?: Limb; // 起始时该肢端预置于此
}

export interface LevelDef {
  id: string;
  name: string; // 关卡名（Klifur 风格大写）
  grade: string; // 难度等级 V0..
  wallAngleDeg: number; // 90 = 直壁
  worldWidth: number;
  worldHeight: number;
  holds: HoldDef[];
  goalHoldId: string;
  starThreshold: number; // 三星达标：抓取次数 ≤ 此值
}
