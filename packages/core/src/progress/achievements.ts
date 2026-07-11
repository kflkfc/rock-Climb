// 成就系统（GDD 模块 14）：全部由存档可推导（无一次性事件依赖），数据驱动——
// 加成就 = 加一行定义。解锁列表存 save.achievements；evaluate 幂等。

import { SaveData } from "./save.ts";
import { totalStars, climberLevelForStars } from "./growth.ts";
import { starCount } from "./stars.ts";
import { GYMS } from "../level/gyms.ts";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (s: SaveData) => boolean;
}

const wins = (s: SaveData) => Object.values(s.progress).reduce((a, p) => a + p.wins, 0);
const toppedCount = (s: SaveData) =>
  Object.values(s.progress).filter((p) => p.stars.topped).length;
const gymTopped = (s: SaveData, gymId: string) => {
  const gym = GYMS.find((g) => g.id === gymId)!;
  return gym.levelIds.every((id) => s.progress[id]?.stars.topped);
};
const gymAllThree = (s: SaveData, gymId: string) => {
  const gym = GYMS.find((g) => g.id === gymId)!;
  return gym.levelIds.every((id) => s.progress[id] && starCount(s.progress[id].stars) === 3);
};
const profCount = (s: SaveData, min: number) =>
  Object.values(s.proficiency ?? {}).filter((v) => v >= min).length;

const A = (id: string, name: string, desc: string, check: AchievementDef["check"]): AchievementDef => ({ id, name, desc, check });

export const ACHIEVEMENTS: AchievementDef[] = [
  // 完攀里程碑
  A("top1", "首次登顶", "完攀任意一条路线", (s) => wins(s) >= 1),
  A("top10", "十全十美", "累计完攀 10 次", (s) => wins(s) >= 10),
  A("top50", "岩馆常客", "累计完攀 50 次", (s) => wins(s) >= 50),
  A("routes10", "开路者", "登顶 10 条不同路线", (s) => toppedCount(s) >= 10),
  A("routes38", "全图鉴", "登顶全部 38 条路线", (s) => toppedCount(s) >= 38),
  // 星池里程碑
  A("stars10", "摘星", "累计 10 颗星", (s) => totalStars(s) >= 10),
  A("stars30", "星光", "累计 30 颗星（猴子解锁）", (s) => totalStars(s) >= 30),
  A("stars60", "星河", "累计 60 颗星（金刚解锁）", (s) => totalStars(s) >= 60),
  A("stars98", "满天星", "拿满全部 98 颗星", (s) => totalStars(s) >= 98),
  // 分项星
  A("flow1", "行云流水", "首次获得流畅星", (s) => Object.values(s.progress).some((p) => p.stars.flow)),
  A("speed1", "快如闪电", "首次获得神速星", (s) => Object.values(s.progress).some((p) => p.stars.speed)),
  A("triple1", "完美一线", "单条路线集满 3 星", (s) => Object.values(s.progress).some((p) => starCount(p.stars) === 3)),
  A("flow10", "干净先生", "10 条路线获得流畅星", (s) => Object.values(s.progress).filter((p) => p.stars.flow).length >= 10),
  A("speed10", "竞速选手", "10 条路线获得神速星", (s) => Object.values(s.progress).filter((p) => p.stars.speed).length >= 10),
  // 岩馆通关
  A("gym_tutorial", "毕业啦", "通关教学馆全部课程", (s) => gymTopped(s, "tutorial")),
  A("gym_slab", "板上钉钉", "登顶板墙馆全部路线", (s) => gymTopped(s, "slab")),
  A("gym_mixed", "十八般武艺", "登顶综合馆全部路线", (s) => gymTopped(s, "mixed")),
  A("gym_roof", "倒挂金钩", "登顶屋檐馆全部路线", (s) => gymTopped(s, "roof")),
  A("gym_slab3", "板墙宗师", "板墙馆全线 3 星", (s) => gymAllThree(s, "slab")),
  A("gym_mixed3", "综合宗师", "综合馆全线 3 星", (s) => gymAllThree(s, "mixed")),
  A("gym_roof3", "屋檐宗师", "屋檐馆全线 3 星", (s) => gymAllThree(s, "roof")),
  // 等级
  A("lv3", "进阶者", "选手等级达到 3", (s) => climberLevelForStars(totalStars(s)) >= 3),
  A("lv5", "老手", "选手等级达到 5（解锁甩跳）", (s) => climberLevelForStars(totalStars(s)) >= 5),
  A("lv8", "高手", "选手等级达到 8", (s) => climberLevelForStars(totalStars(s)) >= 8),
  A("lv10", "世界杯水准", "选手等级达到 10", (s) => climberLevelForStars(totalStars(s)) >= 10),
  // 技术熟练
  A("prof60", "顺手了", "任一抓法熟练度 ≥60", (s) => profCount(s, 60) >= 1),
  A("prof90", "炉火纯青", "任一抓法熟练度 ≥90", (s) => profCount(s, 90) >= 1),
  A("prof5kinds", "多面手", "5 种抓法熟练度 ≥30", (s) => profCount(s, 30) >= 5),
  // 名场面
  A("bat", "蝙蝠侠", "登顶 HVOLF 屋檐倒挂线", (s) => !!s.progress["v6"]?.stars.topped),
  A("dyno", "飞人", "登顶 STÖKK 动态线", (s) => !!s.progress["v7"]?.stars.topped),
  A("crown", "加冕", "登顶 KÓRÓNA 全谱毕业线", (s) => !!s.progress["r7"]?.stars.topped),
];

/** 评估并返回**新解锁**的成就（幂等：已解锁的不重复返回）。调用方负责持久化 */
export function evaluateAchievements(save: SaveData): AchievementDef[] {
  const owned = new Set(save.achievements ?? []);
  const news: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!owned.has(a.id) && a.check(save)) news.push(a);
  }
  return news;
}
