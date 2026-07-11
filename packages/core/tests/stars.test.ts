import { describe, it, expect } from "vitest";
import { judgeStars, mergeStars, starCount, noStars } from "../src/progress/stars.ts";
import {
  totalStars,
  climberLevelForStars,
  starsToNextLevel,
  characterUnlocked,
  LEVEL_STAR_THRESHOLDS,
} from "../src/progress/growth.ts";
import { defaultSave } from "../src/progress/save.ts";
import { characterById } from "../src/model/characters.ts";
import { LEVELS } from "../src/level/levels.ts";
import { Game } from "../src/sim/gameState.ts";
import { LOGIC_DT } from "../src/replay/runner.ts";

const L = LEVELS[6]; // v7（定标后目标从 LEVELS 取，勿用未定标的 LEVEL_V7 常量）
const TM = L.stars!.targetMoves;
const TT = L.stars!.targetTimeSec * 1000;

describe("三星评定 · 分项判定", () => {
  it("★登顶：完攀即得，不限脱手", () => {
    const s = judgeStars(L, { won: true, moves: 20, timeMs: 999000, slipped: true, undoUsed: true });
    expect(s).toEqual({ topped: true, flow: false, speed: false });
    expect(judgeStars(L, { won: false, moves: 1, timeMs: 1, slipped: false, undoUsed: false })).toEqual(noStars());
  });

  it("★流畅：抓取≤目标 且 无脱手 且 无undo", () => {
    const clean = { won: true, moves: TM, timeMs: 999000000, slipped: false, undoUsed: false };
    expect(judgeStars(L, clean).flow).toBe(true);
    expect(judgeStars(L, { ...clean, moves: TM + 1 }).flow).toBe(false); // 超步数
    expect(judgeStars(L, { ...clean, slipped: true }).flow).toBe(false); // 脱过手
    expect(judgeStars(L, { ...clean, undoUsed: true }).flow).toBe(false); // 用过 undo
  });

  it("★神速：用时≤目标（含重试计时）；一遍完美 = 3 星", () => {
    const fast = { won: true, moves: TM, timeMs: TT, slipped: false, undoUsed: false };
    expect(starCount(judgeStars(L, fast))).toBe(3);
    expect(judgeStars(L, { ...fast, timeMs: TT + 1 }).speed).toBe(false);
    // 摔过但最后冲刺快：拿登顶+神速，丢流畅
    const s = judgeStars(L, { won: true, moves: TM, timeMs: TT - 10000, slipped: true, undoUsed: false });
    expect(s).toEqual({ topped: true, flow: false, speed: true });
  });

  it("并集：分次拿齐 3 星", () => {
    const a = { topped: true, flow: true, speed: false };
    const b = { topped: true, flow: false, speed: true };
    expect(mergeStars(a, b)).toEqual({ topped: true, flow: true, speed: true });
  });

  it("全部 9 关都有星级目标（防新关漏定标）", () => {
    for (const lv of LEVELS) {
      expect(lv.stars, lv.id).toBeDefined();
      expect(lv.stars!.targetMoves).toBeGreaterThan(0);
      expect(lv.stars!.targetTimeSec).toBeGreaterThan(0);
    }
  });
});

describe("三星评定 · Game run 口径", () => {
  it("run 计时从首次输入开始，坠落复位不清零；手动 reset 清零", () => {
    const g = new Game(L);
    for (let i = 0; i < 60; i++) g.update(LOGIC_DT);
    expect(g.runTime).toBe(0); // 未输入不计时
    g.beginDrag({ ...g.c.limbs.RH.hold!.pos });
    for (let i = 0; i < 60; i++) g.update(LOGIC_DT);
    expect(g.runTime).toBeGreaterThan(0.9); // 开始计时
    g.endDrag();
    const t1 = g.runTime;
    g.reset(true); // 模拟坠落自动复位
    expect(g.runTime).toBeCloseTo(t1, 9); // 保留
    expect(g.runSlipped).toBe(false); // slipped 由物理路径置位，此处仅验证保留语义
    g.reset(); // 手动重置
    expect(g.runTime).toBe(0);
  });
});

describe("星数成长 · 数据层", () => {
  it("星池累计 + 等级阈值", () => {
    const save = defaultSave("t");
    expect(totalStars(save)).toBe(0);
    expect(climberLevelForStars(0)).toBe(1);
    expect(climberLevelForStars(6)).toBe(2);
    expect(climberLevelForStars(29)).toBe(4);
    expect(climberLevelForStars(30)).toBe(5);
    expect(climberLevelForStars(90)).toBe(10);
    expect(climberLevelForStars(999)).toBe(10);
    expect(starsToNextLevel(0)).toBe(6);
    expect(starsToNextLevel(90)).toBeNull();
    expect(LEVEL_STAR_THRESHOLDS.length).toBe(10);
    save.progress["a"] = { bestMoves: 1, bestTimeMs: 1, stars: { topped: true, flow: true, speed: false }, wins: 1, attempts: 1 };
    save.progress["b"] = { bestMoves: 1, bestTimeMs: 1, stars: { topped: true, flow: false, speed: false }, wins: 1, attempts: 1 };
    expect(totalStars(save)).toBe(3);
  });

  it("角色解锁：猴 30⭐ / 金刚 60⭐", () => {
    expect(characterUnlocked(characterById("climber"), 0)).toBe(true);
    expect(characterUnlocked(characterById("monkey"), 29)).toBe(false);
    expect(characterUnlocked(characterById("monkey"), 30)).toBe(true);
    expect(characterUnlocked(characterById("gorilla"), 59)).toBe(false);
    expect(characterUnlocked(characterById("gorilla"), 60)).toBe(true);
  });
});
