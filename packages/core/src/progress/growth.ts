// 星数驱动成长（GDD 4.3.2）：星 = 唯一主成长货币。
// 关卡三星(历史并集) → 累计星池 → ①每 1 星 = 1 能力点 ②累计阈值 → 选手等级 1-10
//                                 ③指定星数 → 解锁隐藏角色（猴子/金刚）
// 防挫败闭环：卡关 → 回刷旧关流畅/神速星 → 换能力点变强 → 再战。

import { SaveData } from "./save.ts";
import { starCount } from "./stars.ts";
import { CharacterDef } from "../model/characters.ts";

/** 晋升到 Lv(index+1) 所需累计星（Lv1 无门槛）。初版阈值，P7 用真实数据校准 */
export const LEVEL_STAR_THRESHOLDS = [0, 6, 12, 20, 30, 42, 55, 68, 80, 90];

/** 累计星池：官方关卡三星并集之和。每日挑战星不入池（GDD 4.3.1：防无限膨胀） */
export function totalStars(save: SaveData): number {
  let sum = 0;
  for (const [id, p] of Object.entries(save.progress)) {
    if (id.startsWith("daily-")) continue;
    sum += starCount(p.stars);
  }
  return sum;
}

/** 星数 → 选手等级 1-10（阈值表查询） */
export function climberLevelForStars(stars: number): number {
  let lv = 1;
  for (let i = 0; i < LEVEL_STAR_THRESHOLDS.length; i++) {
    if (stars >= LEVEL_STAR_THRESHOLDS[i]) lv = i + 1;
  }
  return Math.min(10, lv);
}

/** 距下一级还差几颗星（已满级 → null） */
export function starsToNextLevel(stars: number): number | null {
  const lv = climberLevelForStars(stars);
  if (lv >= 10) return null;
  return LEVEL_STAR_THRESHOLDS[lv] - stars;
}

/** 可用能力点 = 累计星数（P3 分配 UI 上线前仅展示；成就/每日奖励点后续叠加） */
export function abilityPoints(save: SaveData): number {
  return totalStars(save);
}

/** 角色是否已解锁（unlock=null 初始可用） */
export function characterUnlocked(ch: CharacterDef, stars: number): boolean {
  return !ch.unlock || stars >= ch.unlock.stars;
}
