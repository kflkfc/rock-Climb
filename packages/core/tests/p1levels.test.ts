import { describe, it, expect } from "vitest";
import { LEVELS, LEVEL_SEQS, LEVEL_V7, LEVEL_V8, LEVEL_V9 } from "../src/level/levels.ts";
import { wallAngleAtY } from "../src/level/levelSchema.ts";
import { GameRunner, LOGIC_DT } from "../src/replay/runner.ts";
import { Game } from "../src/sim/gameState.ts";
import { followSeq } from "./helpers/seqFollower.ts";

describe("P1 验证关卡 · 结构", () => {
  it("共 9 关；v7 动态 / v8 摩擦分段墙 / v9 张力齐备", () => {
    expect(LEVELS.length).toBe(9);
    // v7：空白带内确实无点（575→335 之间）
    const gapHolds = LEVEL_V7.holds.filter((h) => h.y > 345 && h.y < 565);
    expect(gapHolds.length).toBe(0);
    // v8：分段墙生效（底板墙 75 / 顶直壁 90），且有光滑 crux 与磨砂点
    expect(wallAngleAtY(LEVEL_V8, 900)).toBe(75);
    expect(wallAngleAtY(LEVEL_V8, 100)).toBe(90);
    expect(LEVEL_V8.holds.some((h) => h.material === "slick")).toBe(true);
    expect(LEVEL_V8.holds.some((h) => h.material === "grippy")).toBe(true);
    // v9：侧拉对抗对（两个方向都有；单轨脚需踩同点 → 用 edge+侧向朝向表达侧拉）
    const dirs = LEVEL_V9.holds.filter((h) => h.type === "edge").map((h) => h.pullDirDeg);
    expect(dirs).toContain(0);
    expect(dirs).toContain(180);
  });
});

describe("P1 验证关卡 · 可通关性（CI 出厂检验）", () => {
  it("v7 动态线：正常爬两步 → 甩跳跨过空白带拍中终点 → 完攀", () => {
    const g = new Game(LEVEL_V7);
    const step = (n: number) => {
      for (let i = 0; i < n; i++) g.update(LOGIC_DT);
    };
    const dragTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      g.beginDrag({ ...from });
      step(2);
      for (let k = 1; k <= 10; k++) {
        g.moveDrag({ x: from.x + (to.x - from.x) * (k / 10), y: from.y + (to.y - from.y) * (k / 10) });
        step(1);
      }
      g.endDrag();
      step(3);
      if (g.status === "ring") {
        g.chooseGripByIndex(0);
        step(2);
      }
      step(25);
    };
    step(40);
    const hold = (id: string) => g.holds.find((h) => h.id === id)!.pos;
    dragTo(g.c.limbs.RH.hold!.pos, hold("a2")); // 右手上 a2
    dragTo(g.c.limbs.LH.hold!.pos, hold("a1")); // 左手上 a1
    dragTo(g.c.limbs.LF.hold!.pos, hold("s_lh")); // 脚跟上
    dragTo(g.c.limbs.RF.hold!.pos, hold("s_rh"));
    expect(g.status).toBe("climbing");

    // 甩跳：右手快甩向上（3 帧大位移）→ 空放
    const cur = { ...g.c.limbs.RH.hold!.pos };
    g.beginDrag(cur);
    for (let k = 1; k <= 3; k++) {
      g.moveDrag({ x: cur.x - 8 * k, y: cur.y - 42 * k });
      g.update(LOGIC_DT);
    }
    g.endDrag();
    expect(g.c.dyno).not.toBeNull(); // 起跳
    for (let f = 0; f < 90 && g.status !== "won"; f++) g.update(LOGIC_DT);
    expect(g.status).toBe("won"); // 拍中终点完攀 —— P1 验收：动态线可通关 ✓
  });

  it("v8 摩擦线（板墙+Sloper）按参考序列可通关", () => {
    const runner = new GameRunner(7); // v8
    expect(followSeq(runner, LEVEL_SEQS.v8)).toBe(true);
  });

  it("v9 张力线（140° 侧拉对抗）按参考序列可通关", () => {
    const runner = new GameRunner(8); // v9
    expect(followSeq(runner, LEVEL_SEQS.v9)).toBe(true);
  });

  it("回归：v1 基础线按参考序列仍可通关", () => {
    const runner = new GameRunner(0);
    expect(followSeq(runner, LEVEL_SEQS.v1)).toBe(true);
  });
});
