// 岩馆分组（GDD 4.4 内容矩阵）：元数据按 id 引用关卡——
// 与 LEVELS 物理顺序解耦（LEVELS 只许尾部追加：黄金回放按 levelIndex 引用）。

export interface GymDef {
  id: string;
  name: string;
  desc: string;
  /** 三馆视觉差异（GDD 4.7）：主色调 */
  tint: string;
  levelIds: string[];
}

export const GYMS: GymDef[] = [
  {
    id: "tutorial",
    name: "教学馆",
    desc: "八节课从零上手：拖拽、平衡、抓法、耐力、朝向、脚法",
    tint: "#E6D9B5",
    levelIds: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"],
  },
  {
    id: "slab",
    name: "板墙馆",
    desc: "平衡与脚法：75°-90° 缓墙，脚下功夫见真章",
    tint: "#EFE4C4",
    levelIds: ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"],
  },
  {
    id: "mixed",
    name: "综合馆",
    desc: "指力与技术：直壁到微仰，读线能力的试金石",
    tint: "#D9D2C0",
    levelIds: ["v1", "v2", "m2", "v3", "v4", "m1", "v8", "v7", "m3", "m4"],
  },
  {
    id: "roof",
    name: "屋檐馆",
    desc: "力量与张力：陡仰到全屋檐，倒挂者的殿堂",
    tint: "#CBB8A6",
    levelIds: ["r1", "v5", "r2", "r3", "r4", "v9", "r5", "v6", "r6", "r7"],
  },
];
