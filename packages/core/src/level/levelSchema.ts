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
  /** 定线色（CSS hex，如 "#D64A47"）。缺省 = 按类型取 HOLD_COLOR。纯视觉，不进物理/哈希 */
  color?: string;
  onVolume?: string; // 所在体积块 id（渲染层级归属）
  goal?: boolean; // 终点岩点（彩虹标识）
  start?: Limb; // 起始时该肢端预置于此
}

/** 分段墙的一段：yTop < yBottom（世界 y 向下）。段内恒角，段边界 ±SEG_BLEND 平滑过渡 */
export interface WallSegment {
  yTop: number;
  yBottom: number;
  angleDeg: number; // <90 板墙 / 90 直壁 / >90 仰角 / ~180 屋檐
}

export interface LevelDef {
  id: string;
  name: string; // 关卡名（Klifur 风格大写）
  grade: string; // 难度等级 V0..
  wallAngleDeg: number; // 底部墙角。90 = 直壁；>90 = 仰角/屋檐
  /** 顶部墙角（可选，v1 遗留）。设了则墙角随高度从底线性过渡到顶。 */
  wallAngleTop?: number;
  /**
   * 分段折线墙（v2，优先于 wallAngleDeg/Top）：任意段数，**必须从底到顶排列**
   * （首段 yBottom = worldHeight 附近，相邻段 yTop/yBottom 首尾相接）。
   */
  wallSegments?: WallSegment[];
  worldWidth: number;
  worldHeight: number;
  holds: HoldDef[];
  goalHoldId: string;
  /** v1 遗留：旧简化星线（stars 未定标时作 targetMoves 兜底） */
  starThreshold: number;
  /** v2 星级目标（AI 试解器定标）：★2流畅 ≤targetMoves；★3神速 ≤targetTimeSec */
  stars?: { targetMoves: number; targetTimeSec: number };
  /** 规则变体（Klifur 式 "2×✋"）：每肢限动次数等 */
  rules?: { maxMovesPerLimb?: number };
  /** 教学提示（进关未操作时显示，开始拖拽后淡出） */
  hint?: string;
  /** 墙面色相（HSL hue，默认 43 米黄）：三馆视觉差异（板墙暖米/综合灰岩/屋檐暗红） */
  wallHue?: number;
}

/** 段边界过渡带半宽（世界单位）：墙角在边界两侧各 50 内线性混合，防物理突变 */
export const SEG_BLEND = 50;

/** 某高度 y 处的墙角。优先分段墙；其次 wallAngleTop 线性过渡；最后恒角。 */
export function wallAngleAtY(level: LevelDef, y: number): number {
  const segs = level.wallSegments;
  if (segs && segs.length > 0) {
    // 段从底到顶排列（segs[0] 最底）。y 越大越低。
    if (y >= segs[0].yBottom) return segs[0].angleDeg;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (y >= s.yTop || i === segs.length - 1) {
        // 在本段内；检查是否落在与相邻段的过渡带
        const upper = segs[i + 1];
        if (upper && y - s.yTop < SEG_BLEND) {
          // 靠近本段顶边界 → 与上一段混合（边界处 50/50）
          const t = (y - s.yTop + SEG_BLEND) / (2 * SEG_BLEND); // 1=纯本段 0=纯上段
          return upper.angleDeg + (s.angleDeg - upper.angleDeg) * Math.max(0, Math.min(1, t));
        }
        const lower = segs[i - 1];
        if (lower && s.yBottom - y < SEG_BLEND) {
          const t = (s.yBottom - y + SEG_BLEND) / (2 * SEG_BLEND); // 1=纯本段 0=纯下段
          return lower.angleDeg + (s.angleDeg - lower.angleDeg) * Math.max(0, Math.min(1, t));
        }
        return s.angleDeg;
      }
    }
    return segs[segs.length - 1].angleDeg;
  }
  if (level.wallAngleTop == null) return level.wallAngleDeg;
  const t = Math.max(0, Math.min(1, 1 - y / level.worldHeight)); // 0=底 1=顶
  return level.wallAngleDeg + (level.wallAngleTop - level.wallAngleDeg) * t;
}
