// 纯逻辑 · 人体参数化模型（GDD 4.2：6 体格 + 6 能力 = 12 参数）。
// 体格（Physique）：角色预设决定、可微调，影响骨长/质量/柔韧——无优劣，只改变解法。
// 能力（Abilities）：随成长提升，直接进物理公式。
// 兼容纪律：能力新增项的"中位值 0.5 ⇒ 乘数 1.0"，保证旧黄金回放不漂移。

export interface Physique {
  height: number; // 身高系数（1 = 成人基准，缩放全部骨长）
  apeIndex: number; // 臂展指数（臂长相对身高；猿类 >1.2）
  legRatio: number; // 腿长比例
  handScale: number; // 手掌尺寸（渲染 + 后续接触宽容）
  weight: number; // 体重（抽象单位 = 总重力幅值）
  flexibility: number; // 柔韧 0..1（伸展宽容/高脚步）
}

export interface Abilities {
  fingerStrength: number; // 指力 0..1
  coreStability: number; // 核心稳定 0..1
  power: number; // 上肢爆发 0..1（Dyno 冲量上限）
  endurance: number; // 抓握耐力 0..1（0.5 中位 → 消耗×1.0）
  recovery: number; // 恢复速度 0..1（0.5 中位 → 恢复×1.0）
  technique: number; // 技术熟练 0..1（0.5 中位 → 匹配×1.0）
}

/** 物理/渲染直接消费的最终人体参数（骨长为世界单位） */
export interface BodyParams extends Abilities {
  upperArm: number;
  foreArm: number;
  thigh: number;
  shank: number;
  torsoLen: number;
  neckLen: number;
  headR: number;
  shoulderWidth: number;
  hipWidth: number;
  handScale: number;
  flexibility: number;
  weight: number;
}

/** 成人基准骨长（height=ape=leg=1 时） */
const BASE = {
  upperArm: 62,
  foreArm: 58,
  thigh: 70,
  shank: 66,
  torsoLen: 86,
  neckLen: 16,
  headR: 20,
  shoulderWidth: 52,
  hipWidth: 40,
};

export const DEFAULT_PHYSIQUE: Physique = {
  height: 1,
  apeIndex: 1,
  legRatio: 1,
  handScale: 1,
  weight: 100,
  flexibility: 0.5,
};

/** 体格 + 能力 → 最终人体参数（骨长派生的唯一入口） */
export function makeBody(p: Physique, a: Abilities): BodyParams {
  const h = p.height;
  return {
    upperArm: BASE.upperArm * h * p.apeIndex,
    foreArm: BASE.foreArm * h * p.apeIndex,
    thigh: BASE.thigh * h * p.legRatio,
    shank: BASE.shank * h * p.legRatio,
    torsoLen: BASE.torsoLen * h,
    neckLen: BASE.neckLen * h,
    headR: BASE.headR * (0.75 + 0.25 * h), // 头不随身高等比缩（小孩头身比大）
    shoulderWidth: BASE.shoulderWidth * h,
    hipWidth: BASE.hipWidth * h,
    handScale: p.handScale,
    flexibility: p.flexibility,
    weight: p.weight,
    ...a,
  };
}

/** 柔韧 → 伸展宽容个体系数（0.5 中位 = ×1.0；全域 ±5%） */
export function flexSlack(b: BodyParams): number {
  return 0.95 + 0.1 * b.flexibility;
}

/** 臂展（肩→手最大可达）= 上臂 + 前臂 */
export const armReach = (b: BodyParams) => b.upperArm + b.foreArm;
/** 腿展（髋→脚最大可达）= 大腿 + 小腿 */
export const legReach = (b: BodyParams) => b.thigh + b.shank;

export const MAX_LEVEL = 10;

/** 选手级别 → 能力组（P2 起由星数成长替代；power 同步随级别，Dyno 用） */
export function abilitiesForLevel(level: number): Abilities {
  const t = Math.max(0, Math.min(1, (level - 1) / (MAX_LEVEL - 1))); // 0..1
  return {
    fingerStrength: 0.34 + 0.66 * t, // L1 0.34 → L10 1.0
    coreStability: 0.28 + 0.67 * t, // L1 0.28 → L10 0.95
    power: 0.3 + 0.65 * t,
    endurance: 0.5, // 中位：与旧行为一致；P2 成长后偏离
    recovery: 0.5,
    technique: 0.5,
  };
}

/** 兼容入口：级别 + 体格（默认成人）→ 人体参数 */
export function bodyForLevel(level: number, physique: Physique = DEFAULT_PHYSIQUE): BodyParams {
  return makeBody(physique, abilitiesForLevel(level));
}

/** 成人基准（测试/工具用） */
export const ADULT: BodyParams = makeBody(DEFAULT_PHYSIQUE, {
  fingerStrength: 0.62,
  coreStability: 0.6,
  power: 0.6,
  endurance: 0.5,
  recovery: 0.5,
  technique: 0.5,
});

export const LEVEL_LABEL: Record<number, string> = {
  1: "新手",
  3: "进阶",
  5: "老手",
  7: "高手",
  10: "世界杯",
};
