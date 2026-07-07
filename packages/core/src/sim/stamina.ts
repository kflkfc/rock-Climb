// 纯逻辑 · 每肢端耐力（指力总池的简化代理）。
// 抓住：按 physics 算出的 drainRate 持续扣；自由：缓慢恢复。绿→黄→红 由值映射。

import { clamp } from "../math/vec2.ts";

export type StaminaColor = "green" | "yellow" | "red";

export function staminaColor(s: number): StaminaColor {
  return s > 0.55 ? "green" : s > 0.28 ? "yellow" : "red";
}

/** 抓住时：s -= drainRate*dt。返回新值（夹到 0..1）。 */
export function drain(s: number, drainRate: number, dt: number): number {
  return clamp(s - drainRate * dt, 0, 1);
}

/** 自由时：缓慢恢复。 */
export function recover(s: number, rate: number, dt: number): number {
  return clamp(s + rate * dt, 0, 1);
}
