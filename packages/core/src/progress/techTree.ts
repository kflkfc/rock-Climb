// 技术树（GDD 4.3.3）：抓法/脚法按选手等级解锁 = 可玩选项扩展，不是数值膨胀。
// 解锁由 climberLevel 驱动——climberLevel 在回放初始条件与事件流内，
// 因此抓法环选项在重演中天然一致（确定性安全）。

import { GripMethod } from "../sim/grip.ts";

/** 各抓法解锁所需选手等级（1 = 初始可用）。数值资产，P7 校准 */
export const GRIP_UNLOCK_LEVEL: Record<GripMethod, number> = {
  // 手
  open: 1, // 开掌（初始）
  half: 2, // 半扣
  pinch: 3, // 捏
  full: 4, // 全扣（带伤害风险的高效抓法）
  lock: 5, // 扣指洞
  slap: 5, // 拍击 = Dyno 甩跳手势（老手技巧）
  // 脚
  inside: 1, // 内侧踩（初始）
  smear: 2, // 抹脚
  outside: 3, // 外侧踩
  heel: 5, // 勾脚
  toe: 6, // 挂脚
};

export function gripUnlocked(g: GripMethod, climberLevel: number): boolean {
  return climberLevel >= GRIP_UNLOCK_LEVEL[g];
}

/** Dyno 甩跳是否已解锁（slap 档位） */
export function dynoUnlocked(climberLevel: number): boolean {
  return gripUnlocked("slap", climberLevel);
}
