import { describe, it, expect } from "vitest";
import { directionalFit, angleDiff } from "../src/core/sim/grip.ts";
import { Game } from "../src/core/sim/gameState.ts";
import { LevelDef } from "../src/core/level/levelSchema.ts";

const L: LevelDef = {
  id: "t",
  name: "DIR",
  grade: "V0",
  wallAngleDeg: 90,
  worldWidth: 420,
  worldHeight: 600,
  goalHoldId: "goal",
  starThreshold: 3,
  holds: [
    { id: "s_lh", type: "jug", x: 190, y: 300, start: "LH" },
    { id: "s_rh", type: "jug", x: 250, y: 300, start: "RH" },
    { id: "s_lf", type: "jug", x: 190, y: 440, start: "LF" },
    { id: "s_rf", type: "jug", x: 250, y: 440, start: "RF" },
    { id: "goal", type: "jug", x: 220, y: 200, goal: true },
  ],
};

describe("directionalFit · 受力锥", () => {
  it("锥内 = 1", () => {
    expect(directionalFit(1.0, 1.0, 0.4)).toBe(1);
    expect(directionalFit(1.2, 1.0, 0.4)).toBe(1); // 差 0.2 < tol
  });
  it("超出锥 → <1 但有下限 0.1", () => {
    const f = directionalFit(1.0 + 0.8, 1.0, 0.3);
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThanOrEqual(0.1);
  });
  it("完全反向 → ≈0.1", () => {
    expect(directionalFit(0, Math.PI, 0.3)).toBeCloseTo(0.1, 5);
  });
  it("angleDiff 取最小夹角", () => {
    expect(angleDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 5);
  });
});

describe("身体旋转 · 不再直上直下", () => {
  it("四肢偏向一侧 → 肩/脊柱随之旋转偏身", () => {
    const g = new Game(L);
    const start = { ...g.c.limbs.RH.hold!.pos };
    // 拖右手到右上方并保持（不放手），身体应随之转动
    g.beginDrag(start);
    g.moveDrag({ x: start.x + 70, y: start.y - 40 });
    for (let i = 0; i < 90; i++) g.update(1 / 60);
    expect(Math.abs(g.c.shoulderTwist) + Math.abs(g.c.lean)).toBeGreaterThan(0.05);
  });
});

describe("方向性受力 · 错向掉耐力更快", () => {
  function run(opposite: boolean): number {
    const g = new Game(L);
    g.update(1 / 60); // 先解算出姿态/重心
    const st = g.c.limbs.RH;
    const hold = st.hold!;
    // 按当前实际受力轴设置岩点朝向：对齐 vs 反向，并收窄锥
    const la = Math.atan2(g.c.pose.com.y - hold.pos.y, g.c.pose.com.x - hold.pos.x);
    hold.pullDir = opposite ? la + Math.PI : la;
    hold.pullTol = 0.25;
    for (let i = 0; i < 150; i++) g.update(1 / 60);
    return st.attached ? st.stamina : 0; // 脱手按 0 计（更差）
  }
  it("对齐岩点保留耐力 > 反向岩点", () => {
    const aligned = run(false);
    const misaligned = run(true);
    expect(aligned).toBeGreaterThan(misaligned);
  });
});
