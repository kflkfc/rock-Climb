// 纯逻辑 · 肢端占位与接触覆盖模型（V1.1 交互改版）。
//
// 手/脚是有大小的圆盘：
//  - 覆盖率 coverage：肢端盘被岩点盘盖住的比例 → 决定"抓得实不实"。
//    松手不吸附（保留原位）后，抓在岩点边缘 = 覆盖率低 = 耐力急耗（physics 用）。
//  - 重叠率 overlap：两个肢端盘互相重叠的比例。后来者与任何已抓肢端
//    重叠 > tuning.overlapMax（30%）→ 抓不住（gameState 拒抓）。
//
// 圆盘相交按"线性穿透"近似（相切=0，完全包含=1）——避免 acos 面积公式，
// 确定性、便宜、手感上单调即可。

import { Limb, isHand } from "../model/skeleton.ts";
import { Tuning } from "../config/tuning.ts";

/** 肢端占位半径（世界单位）：手 > 脚（脚尖点得更密） */
export function limbRadiusOf(l: Limb, t: Tuning): number {
  return isHand(l) ? t.limbHandR : t.limbFootR;
}

/**
 * 两圆盘重叠比例 0..1（线性穿透 ÷ 小盘直径）：
 * d ≥ r1+r2 相离 → 0；小盘完全被含 → 1。
 */
export function discOverlapRatio(d: number, r1: number, r2: number): number {
  const pen = r1 + r2 - d;
  if (pen <= 0) return 0;
  const ratio = pen / (2 * Math.min(r1, r2));
  return ratio > 1 ? 1 : ratio;
}

/**
 * 接触覆盖率 0..1：肢端盘（r=limbR）中心距岩点中心 contactDist 时，
 * 被岩点盘（r=holdR）盖住的比例。完全在岩点内 → 1；抓在外缘 → 趋 0。
 */
export function contactCoverage(contactDist: number, holdR: number, limbR: number): number {
  return discOverlapRatio(contactDist, holdR, limbR);
}
