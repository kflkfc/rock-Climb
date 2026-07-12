import { describe, it, expect } from "vitest";
import { generateDaily, generateLevel, GEN_STYLES } from "../src/level/generator.ts";
import { solveLevel } from "../src/solver/solver.ts";
import { GameRunner, replayRun } from "../src/replay/runner.ts";
import { defaultSave } from "../src/progress/save.ts";
import { totalStars } from "../src/progress/growth.ts";
import { botPlay } from "./helpers/bot.ts";

describe("生成器 · 确定性与质量", () => {
  it("同日期两次生成 → 完全相同的关卡（全端同关的前提）", () => {
    const a = generateDaily("2026-07-12");
    const b = generateDaily("2026-07-12");
    expect(JSON.stringify(a.level)).toBe(JSON.stringify(b.level));
    expect(a.style).toBe(b.style);
    // 不同日期 → 不同关
    const c = generateDaily("2026-07-13");
    expect(JSON.stringify(c.level)).not.toBe(JSON.stringify(a.level));
  });

  it("未来 30 天每日挑战全部可解且已定标（上线质量门槛）", () => {
    const base = new Date("2026-07-12");
    for (let d = 0; d < 30; d++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + d);
      const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const g = generateDaily(ds);
      expect(g.attempts, `${ds} 生成重试过多`).toBeLessThanOrEqual(10); // 没走兜底
      const r = solveLevel(g.level, { allowDyno: false });
      expect(r.solvable, `${ds} (${g.style}) 不可解`).toBe(true);
      expect(g.level.stars!.targetMoves).toBeGreaterThan(0);
      expect(g.level.id).toBe(`daily-${ds}`);
    }
  });

  it("100 个种子：风格全覆盖，重试率健康（≤3 次为主）", () => {
    const styles = new Set<string>();
    let quick = 0;
    for (let s = 1; s <= 100; s++) {
      const g = generateLevel(s * 7919, `gen-${s}`, "GEN");
      styles.add(g.style);
      if (g.attempts <= 3) quick++;
    }
    expect(styles.size).toBe(GEN_STYLES.length); // 5 风格都出现过
    expect(quick).toBeGreaterThan(70); // 大多数一掷即中
  });
});

describe("每日挑战 · 回放与星池", () => {
  it("daily 事件可确定性重演（date→seed 重生成同关）", () => {
    const live = new GameRunner(0);
    live.dispatch({ e: "daily", date: "2026-07-12" });
    for (let i = 0; i < 10; i++) live.step();
    expect(live.game.level.id).toBe("daily-2026-07-12");
    botPlay(live, 2);
    const replay = live.exportReplay();
    expect(replay.events.some((ev) => ev.e === "daily")).toBe(true);
    expect(replayRun(replay).hash).toBe(live.hash());
  });

  it("每日星不入星池（防膨胀）", () => {
    const save = defaultSave("t");
    save.progress["v1"] = { bestMoves: 5, bestTimeMs: 1, stars: { topped: true, flow: true, speed: false }, wins: 1, attempts: 1 };
    save.progress["daily-2026-07-12"] = { bestMoves: 5, bestTimeMs: 1, stars: { topped: true, flow: true, speed: true }, wins: 1, attempts: 1 };
    expect(totalStars(save)).toBe(2); // 只算 v1 的 2 颗
  });
});
