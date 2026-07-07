// 纯逻辑 · 人体参数化模型（切片期取固定成人预设；正式版可由玩家自定义）。

export interface BodyParams {
  upperArm: number; // 上臂
  foreArm: number; // 前臂
  thigh: number; // 大腿
  shank: number; // 小腿
  torsoLen: number; // 髋→肩
  neckLen: number; // 肩→颈
  headR: number; // 头半径
  shoulderWidth: number;
  hipWidth: number;
  fingerStrength: number; // 指力 0..1（影响抓力上限 & 耐力消耗倒数）
  coreStability: number; // 核心稳定 0..1（影响失衡惩罚）
  weight: number; // 体重（抽象单位，作为总重力幅值）
}

/** 臂展（肩→手最大可达）= 上臂 + 前臂 */
export const armReach = (b: BodyParams) => b.upperArm + b.foreArm;
/** 腿展（髋→脚最大可达）= 大腿 + 小腿 */
export const legReach = (b: BodyParams) => b.thigh + b.shank;

export const ADULT: BodyParams = {
  upperArm: 62,
  foreArm: 58,
  thigh: 70,
  shank: 66,
  torsoLen: 86,
  neckLen: 16,
  headR: 20,
  shoulderWidth: 52,
  hipWidth: 40,
  fingerStrength: 0.62, // 对齐 PRD：~中级水平
  coreStability: 0.6,
  weight: 100,
};

export const MAX_LEVEL = 10;

/**
 * 选手级别 → 人体能力（对齐 PRD 成长表）。
 *  1 级新手：指力弱、核心差，单手吊不住、易掉；
 *  5 级老手：能稳定攀爬、偶尔单手；
 *  10 级世界杯：指力满、核心极稳，可单手悬挂/引体、几乎不掉。
 * 仅缩放能力参数，骨骼尺寸不变。
 */
export function bodyForLevel(level: number): BodyParams {
  const t = Math.max(0, Math.min(1, (level - 1) / (MAX_LEVEL - 1))); // 0..1
  return {
    ...ADULT,
    fingerStrength: 0.34 + 0.66 * t, // L1 0.34 → L10 1.0
    coreStability: 0.28 + 0.67 * t, // L1 0.28 → L10 0.95
  };
}

export const LEVEL_LABEL: Record<number, string> = {
  1: "新手",
  3: "进阶",
  5: "老手",
  7: "高手",
  10: "世界杯",
};
