// 三星评定（GDD 4.3.1）：每关最高 3 星，三项独立判定、历史并集。
// ★1 登顶 = 完攀（不限脱手） ★2 流畅 = 抓取≤目标 ∧ 无脱手 ∧ 无undo ★3 神速 = 用时≤目标
// undo 尚未上线（P2-6），流畅星暂按 抓取+无脱手 判定；undo 上线后自动纳入。

import { LevelDef } from "../level/levelSchema.ts";

export interface StarResult {
  topped: boolean; // ★登顶
  flow: boolean; // ★流畅（动作简练：老手一遍干净爬完）
  speed: boolean; // ★神速（计时含脱手重试，不清零）
}

export const starCount = (s: StarResult): number =>
  (s.topped ? 1 : 0) + (s.flow ? 1 : 0) + (s.speed ? 1 : 0);

export const noStars = (): StarResult => ({ topped: false, flow: false, speed: false });

/** 并集：分项各自取历史最优（本次拿神速、上次拿流畅 → 关卡 3 星） */
export function mergeStars(a: StarResult, b: StarResult): StarResult {
  return { topped: a.topped || b.topped, flow: a.flow || b.flow, speed: a.speed || b.speed };
}

export interface AttemptFacts {
  won: boolean;
  moves: number; // 本次尝试抓取数
  timeMs: number; // 从首次输入到触顶（含脱手重试）
  slipped: boolean; // 本次尝试中是否有过任何脱手/坠落
  undoUsed: boolean; // 是否用过回退（P2-6 接入）
}

/** 星级目标：由 AI 试解器定标（targetMoves = 最优×1.2；targetTimeSec = 估时×系数） */
export function judgeStars(level: LevelDef, facts: AttemptFacts): StarResult {
  if (!facts.won) return noStars();
  const targetMoves = level.stars?.targetMoves ?? level.starThreshold;
  const targetTimeSec = level.stars?.targetTimeSec ?? Infinity; // 未定标的老关暂无神速星
  return {
    topped: true,
    flow: facts.moves <= targetMoves && !facts.slipped && !facts.undoUsed,
    speed: facts.timeMs <= targetTimeSec * 1000,
  };
}

export const STAR_LABEL: Record<keyof StarResult, string> = {
  topped: "登顶",
  flow: "流畅",
  speed: "神速",
};
