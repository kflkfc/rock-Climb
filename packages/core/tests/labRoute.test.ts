// 实验室诊断线 x1「TILRAUN」的出厂检验 + 议题现状基线。
//
// 前两组是常规回归（几何可达、类型齐全）。
// 第三组是**特性化测试（characterization test）**：锁定"反提/反肩现在有多坏"的量化基线——
// 它现在通过 = bug 仍在。方向求解器修好后这组必然变红，届时按注释里的目标值改写断言。

import { describe, it, expect } from "vitest";
import { GameRunner } from "../src/replay/runner.ts";
import { LEVELS, LEVEL_SEQS } from "../src/level/levels.ts";
import { LAB_LEVEL } from "../src/level/labRoute.ts";
import { HOLD_TYPES } from "../src/sim/holds.ts";
import { Limb, LIMBS } from "../src/model/skeleton.ts";
import { limbTarget, gripPos } from "../src/sim/physics.ts";
import { followSeq } from "./helpers/seqFollower.ts";

const IDX = LEVELS.findIndex((l) => l.id === "x1");

/** 单次"拖到某岩点并选最优抓法"（与 seqFollower 同手势，但可单步调用） */
function move(runner: GameRunner, limb: Limb, holdId: string) {
  const step = (n: number) => {
    for (let i = 0; i < n; i++) runner.step();
  };
  const g = runner.game;
  const target = g.holds.find((h) => h.id === holdId)!;
  let aim = { x: target.pos.x, y: target.pos.y };
  for (const m of LIMBS) {
    if (m === limb) continue;
    const ms = g.c.limbs[m];
    if (!ms.attached || ms.hold?.id !== holdId) continue;
    const gp = gripPos(ms);
    const dx = target.pos.x - gp.x;
    const dy = target.pos.y - gp.y;
    const dl = Math.hypot(dx, dy) || 1;
    const offD = Math.min(target.radius * 1.1, Math.max(target.radius * 0.7, 13));
    aim = { x: target.pos.x + (dx / dl) * offD, y: target.pos.y + (dy / dl) * offD };
    break;
  }
  const cur = limbTarget(g.c, limb);
  runner.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
  step(2);
  for (let k = 1; k <= 10; k++) {
    runner.dispatch({
      e: "dragMove",
      x: cur.x + (aim.x - cur.x) * (k / 10),
      y: cur.y + (aim.y - cur.y) * (k / 10),
    });
    step(1);
  }
  runner.dispatch({ e: "dragEnd" });
  step(3);
  if (runner.game.status === "ring") {
    runner.dispatch({ e: "grip", i: 0 }); // 最高匹配
    step(2);
  }
  step(25);
}

/** 爬到仰角段主线站位（双手 h4、双脚 f4）——两颗方向诊断点在此左右可及 */
function climbToDirectionStance(climberLevel = 6): GameRunner {
  const runner = new GameRunner(IDX, climberLevel);
  for (let i = 0; i < 40; i++) runner.step();
  for (const [limb, id] of LEVEL_SEQS.x1) {
    move(runner, limb, id);
    if (id === "f4r") break;
  }
  return runner;
}

describe("实验室诊断线 x1 · 结构", () => {
  it("12 种岩点类型全覆盖（这条线的存在意义）", () => {
    const used = new Set(LAB_LEVEL.holds.map((h) => h.type));
    for (const t of HOLD_TYPES) expect(used.has(t), `缺少岩点类型 ${t}`).toBe(true);
  });

  it("追加在 LEVELS 末尾，不动 v1-v9 的冻结区间（黄金 levelIndex 契约）", () => {
    expect(IDX).toBeGreaterThan(8);
    expect(LEVELS[IDX].id).toBe("x1");
    for (let i = 0; i < 9; i++) expect(LEVELS[i].id).toBe(`v${i + 1}`);
  });

  it("旁挂诊断点(g1/u1/c1)不在参考序列上——脱手不挡通关", () => {
    const onLine = new Set(LEVEL_SEQS.x1.map(([, id]) => id));
    for (const id of ["g1", "u1", "c1"]) expect(onLine.has(id)).toBe(false);
  });
});

describe("实验室诊断线 x1 · 可通关性", () => {
  it("Lv5 起按参考序列可通关（几何可达性回归）", () => {
    expect(followSeq(new GameRunner(IDX, 5), LEVEL_SEQS.x1)).toBe(true);
  });
});

describe("实验室诊断线 x1 · 议题③ 方向求解（双瓣受力模型的验收关）", () => {
  it("反肩 g1：抓得住，不再一碰就以 direction 脱手", () => {
    const runner = climbToDirectionStance();
    move(runner, "LH", "g1");
    expect(runner.game.c.limbs.LH.hold?.id).toBe("g1");
    expect(runner.game.c.limbs.LH.match).toBeGreaterThan(0.4);
    // 动作判定：点在身体左侧、朝向也向左 → 向外撑 = 反肩
    expect(runner.game.c.limbs.LH.move).toBe("gaston");
  });

  /** 同一站位下，某肢挂到某点 5 秒的耐力掉幅（对照用） */
  function drainOver5s(limb: Limb, holdId: string): number {
    const runner = climbToDirectionStance();
    const before = runner.game.c.limbs[limb].stamina;
    move(runner, limb, holdId);
    expect(runner.game.c.limbs[limb].hold?.id, `${limb} 没抓上 ${holdId}`).toBe(holdId);
    for (let f = 0; f < 300; f++) runner.step(); // 5s
    expect(runner.game.c.limbs[limb].attached, `${holdId} 上没挂满 5 秒`).toBe(true);
    return before - runner.game.c.limbs[limb].stamina;
  }

  it("反提 u1：挂得住 5s，耗力不超过同站位正拉点的 2.5 倍（旧模型直接爆耗）", () => {
    const control = drainOver5s("LH", "h4l"); // 同站位的普通正拉点
    const under = drainOver5s("RH", "u1");
    expect(under).toBeLessThan(control * 2.5);
  });

  it("反提要靠脚顶髋：动作被判为 undercling", () => {
    const runner = climbToDirectionStance();
    move(runner, "RH", "u1");
    expect(runner.game.c.limbs.RH.move).toBe("undercling");
  });

  it("反肩比反提更贵（肩部对抗），但仍挂得住", () => {
    expect(drainOver5s("LH", "g1")).toBeGreaterThan(drainOver5s("RH", "u1"));
  });
});
