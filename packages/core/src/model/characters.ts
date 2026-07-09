// 角色阵容（GDD 4.2）：角色 = 体格预设 + 能力偏置 + 皮肤 id。数据驱动——
// 新增角色只加一条记录（含后期活动/自定义角色），零逻辑改动。
// 守则：全角色共用同一物理公式与 11 段骨骼；裙摆/尾巴是渲染装饰，不进物理。

import { Physique, Abilities, DEFAULT_PHYSIQUE } from "./body.ts";

export interface CharacterDef {
  id: string;
  name: string;
  /** 皮肤 id（渲染层按此绘制外观/装饰；装饰不进物理） */
  skin: "climber" | "kid" | "lady" | "monkey" | "gorilla";
  tagline: string; // 选择页一句话定位
  physique: Physique;
  /**
   * 能力偏置（乘到玩家成长能力上，clamp 0..1）。
   * 动物角色的种族天赋——代价体现在体格（猩猩极重/猴子够不到远点低指力上限）。
   */
  abilityBias?: Partial<Record<keyof Abilities, number>>;
  /** 解锁条件：null=初始可用；stars=累计星数（P2 接入星池） */
  unlock: { stars: number } | null;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "climber",
    name: "攀岩者",
    skin: "climber",
    tagline: "标准解法基准，全能均衡",
    physique: { ...DEFAULT_PHYSIQUE },
    unlock: null,
  },
  {
    id: "kid",
    name: "小孩",
    skin: "kid",
    tagline: "灵巧流：轻、稳、柔，但远点够不到",
    physique: { height: 0.72, apeIndex: 0.98, legRatio: 1.0, handScale: 0.8, weight: 55, flexibility: 0.85 },
    unlock: null,
  },
  {
    id: "lady",
    name: "裙装美女",
    skin: "lady",
    tagline: "平衡流：轻盈高柔韧，脚法见长",
    physique: { height: 0.94, apeIndex: 1.0, legRatio: 1.06, handScale: 0.92, weight: 78, flexibility: 0.8 },
    unlock: null,
  },
  {
    id: "monkey",
    name: "猴子",
    skin: "monkey",
    tagline: "敏捷流：超长臂展极轻体重，摆荡如风",
    physique: { height: 0.6, apeIndex: 1.35, legRatio: 0.9, handScale: 0.9, weight: 40, flexibility: 0.95 },
    abilityBias: { power: 1.15, endurance: 1.1 },
    unlock: { stars: 30 },
  },
  {
    id: "gorilla",
    name: "金刚",
    skin: "gorilla",
    tagline: "力量流：长臂重锤，指力与爆发的化身",
    physique: { height: 1.05, apeIndex: 1.3, legRatio: 0.82, handScale: 1.3, weight: 160, flexibility: 0.3 },
    abilityBias: { fingerStrength: 1.25, power: 1.3 },
    unlock: { stars: 60 },
  },
];

export const DEFAULT_CHARACTER_ID = "climber";

export function characterById(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/** 应用角色能力偏置（乘法，clamp 到 0..1） */
export function applyBias(a: Abilities, bias?: CharacterDef["abilityBias"]): Abilities {
  if (!bias) return a;
  const out = { ...a };
  for (const k of Object.keys(bias) as (keyof Abilities)[]) {
    const v = out[k] * (bias[k] ?? 1);
    out[k] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return out;
}
