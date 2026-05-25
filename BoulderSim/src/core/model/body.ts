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
