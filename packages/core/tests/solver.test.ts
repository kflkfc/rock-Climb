import { describe, it, expect } from "vitest";
import { solveLevel } from "../src/solver/solver.ts";
import { LEVELS, OFFICIAL_LEVELS, LEVEL_V7 } from "../src/level/levels.ts";

// 实验室诊断线 x1 不在此列：静态试解器与 solvePelvis 共用同一套方向近似
// （正是它要诊断的东西），且默认 candPerLimb=8 的剪枝会在旁挂点多的线上误判。
// x1 的可通关性由 labRoute.test.ts 用真引擎跑参考序列证明。
describe("AI 试解器 · 出厂检验（CI：官方关卡必须 AI 可解）", () => {
  for (const level of OFFICIAL_LEVELS) {
    it(`${level.id} ${level.name} (${level.grade}) 可解`, () => {
      const r = solveLevel(level);
      expect(r.solvable, `nodes=${r.nodesExpanded}`).toBe(true);
      expect(r.minMoves).toBeGreaterThan(0);
      expect(r.minMoves).toBeLessThan(60);
      expect(r.targets.targetMoves).toBeGreaterThanOrEqual(r.minMoves);
      expect(r.targets.targetTimeSec).toBeGreaterThan(0);
    });
  }
});

describe("AI 试解器 · 难度特征", () => {
  it("v7 动态线：解包含甩跳步（dynoCount ≥ 1）", () => {
    const r = solveLevel(LEVEL_V7);
    expect(r.solvable).toBe(true);
    expect(r.features.dynoCount).toBeGreaterThanOrEqual(1);
    // 禁用甩跳 → 不可解（空白带静态跨不过去）
    const noDyno = solveLevel(LEVEL_V7, { allowDyno: false });
    expect(noDyno.solvable).toBe(false);
  });

  it("陡仰关卡的 maxWallAngle 特征高于直壁关", () => {
    const v1 = solveLevel(LEVELS[0]); // 直壁
    const v9 = solveLevel(LEVELS[8]); // 140°
    expect(v9.features.maxWallAngle).toBeGreaterThan(v1.features.maxWallAngle);
  });

  it("minMatch 反映指力需求：全 Jug 线 > 有小棱/滑面的线", () => {
    // 拿真·全 Jug 的教学线 t2 做对照——v1 自己就含 crimp 与 sloper，
    // 用它当"全 Jug 线"只是巧合成立，脚法放开后最差点换了个位置就翻车了。
    const pureJug = solveLevel(LEVELS.find((l) => l.id === "t2")!);
    const v8 = solveLevel(LEVELS[7]); // 摩擦线（Sloper 为主）
    expect(pureJug.features.minMatch).toBeGreaterThan(v8.features.minMatch);
  });

  it("路径合法：每步引用存在的岩点，终步为 goal", () => {
    const r = solveLevel(LEVELS[0]);
    const ids = new Set(LEVELS[0].holds.map((h) => h.id));
    for (const s of r.path) expect(ids.has(s.holdId), s.holdId).toBe(true);
    expect(r.path[r.path.length - 1].holdId).toBe("goal");
  });
});
