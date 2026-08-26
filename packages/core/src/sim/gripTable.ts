// 核心数值资产 · 岩点形状×抓法匹配表（GDD 4.1：10×6 手表 + 10×5 脚表）。
// 这是"玩法深度之源"：数值即设计。调平衡改这里，不碰任何逻辑代码。
//
// ⚠ 确定性纪律：改动任何数值 = 物理行为变更 → 必须重录黄金回放 + 升 CORE_VERSION。
// 原 4 类型 × 旧抓法的数值从切片原样继承（jug/crimp/pinch/sloper 的 open/half/full/pinch
// 与 inside/smear），保证 P1 开发期黄金回放不漂移；全表在 P1-7 定版时统一校准。

import { HoldType } from "./holds.ts";
import { HandGrip, FootGrip } from "./grip.ts";

/** 手部匹配表 [形状][抓法] → 0..1。0 = 该组合物理上不成立 */
export const HAND_TABLE: Record<HoldType, Record<HandGrip, number>> = {
  //            开掌        半扣        全扣        捏          扣指洞      拍击(dyno)
  jug: { open: 0.95, half: 0.85, full: 0.8, pinch: 0.55, lock: 0.3, slap: 0.75 },
  edge: { open: 0.6, half: 0.9, full: 0.85, pinch: 0.3, lock: 0.35, slap: 0.5 },
  pocket: { open: 0.35, half: 0.55, full: 0.5, pinch: 0.2, lock: 0.95, slap: 0.25 },
  pocket2: { open: 0.25, half: 0.42, full: 0.44, pinch: 0.15, lock: 0.95, slap: 0.16 },
  mono: { open: 0.15, half: 0.3, full: 0.35, pinch: 0.1, lock: 0.95, slap: 0.1 },
  crimp: { open: 0.3, half: 0.95, full: 0.9, pinch: 0.2, lock: 0.4, slap: 0.2 },
  pinch: { open: 0.4, half: 0.45, full: 0.4, pinch: 0.95, lock: 0.2, slap: 0.3 },
  sloper: { open: 0.9, half: 0.4, full: 0.3, pinch: 0.35, lock: 0.15, slap: 0.45 },
  volume: { open: 0.85, half: 0.5, full: 0.3, pinch: 0.6, lock: 0.1, slap: 0.6 },
  footchip: { open: 0, half: 0, full: 0, pinch: 0, lock: 0, slap: 0 }, // 太小，手抓不住
};

/**
 * 脚部匹配表 [形状][脚法] → 0..1。
 * 所有形状都能踩（没有硬门禁）——指洞/捏点难踩，靠低匹配度体现，不靠拒绝。
 * 内侧/外侧踩在这里是同一量级的基准值；两者的实际优劣由**转髋与墙角**在
 * physics.ts 里动态调制（外侧踩=背步/垂膝，仰角上才发挥）。
 */
export const FOOT_TABLE: Record<HoldType, Record<FootGrip, number>> = {
  //            内侧踩        外侧踩        抹脚          挂脚(heel)   勾脚(toe)
  jug: { inside: 0.9, outside: 0.86, smear: 0.7, heel: 0.85, toe: 0.7 },
  edge: { inside: 0.92, outside: 0.88, smear: 0.5, heel: 0.8, toe: 0.65 },
  pocket: { inside: 0.55, outside: 0.5, smear: 0.35, heel: 0.3, toe: 0.6 },
  pocket2: { inside: 0.45, outside: 0.4, smear: 0.32, heel: 0.25, toe: 0.55 },
  mono: { inside: 0.3, outside: 0.26, smear: 0.3, heel: 0.2, toe: 0.5 },
  crimp: { inside: 0.92, outside: 0.86, smear: 0.45, heel: 0.35, toe: 0.55 },
  pinch: { inside: 0.7, outside: 0.62, smear: 0.55, heel: 0.45, toe: 0.5 },
  sloper: { inside: 0.5, outside: 0.46, smear: 0.9, heel: 0.75, toe: 0.4 },
  volume: { inside: 0.75, outside: 0.72, smear: 0.95, heel: 0.8, toe: 0.5 },
  footchip: { inside: 0.9, outside: 0.8, smear: 0.3, heel: 0.2, toe: 0.6 },
};

/**
 * 抓法消耗系数（乘进耐力消耗）：
 * 挂脚/勾脚是主动发力动作比站踩费力；全扣锁死省耐力（代价是伤害风险）。
 */
export const GRIP_DRAIN_MUL: Record<HandGrip | FootGrip, number> = {
  open: 1.0,
  half: 1.0,
  full: 0.92,
  pinch: 1.0,
  lock: 1.1,
  slap: 1.5,
  inside: 1.0,
  outside: 1.0, // 与内侧踩同价：外侧踩不该是"又弱又费"的劣势选项，优劣由转髋/墙角决定
  smear: 1.0,
  heel: 1.2, // 挂脚（脚跟钩）
  toe: 1.3, // 勾脚（脚尖钩）
};
