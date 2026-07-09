import { describe, it, expect } from "vitest";
import { LevelDef, wallAngleAtY, SEG_BLEND } from "../src/level/levelSchema.ts";
import { gravitySigned, gravityComponents } from "../src/sim/physics.ts";

const SEG_LEVEL: LevelDef = {
  id: "t-wall",
  name: "WALL",
  grade: "V2",
  wallAngleDeg: 90, // 被 wallSegments 覆盖
  worldWidth: 400,
  worldHeight: 900,
  goalHoldId: "g",
  starThreshold: 3,
  holds: [],
  // 三段：底板墙 75° → 中直壁 90° → 顶陡仰 135°（从底到顶排列）
  wallSegments: [
    { yTop: 600, yBottom: 900, angleDeg: 75 },
    { yTop: 300, yBottom: 600, angleDeg: 90 },
    { yTop: 0, yBottom: 300, angleDeg: 135 },
  ],
};

describe("分段折线墙", () => {
  it("段内恒角（远离边界）", () => {
    expect(wallAngleAtY(SEG_LEVEL, 800)).toBe(75);
    expect(wallAngleAtY(SEG_LEVEL, 450)).toBe(90);
    expect(wallAngleAtY(SEG_LEVEL, 100)).toBe(135);
  });

  it("段边界恰好取两段均值，过渡带内连续", () => {
    expect(wallAngleAtY(SEG_LEVEL, 600)).toBeCloseTo((75 + 90) / 2, 6);
    expect(wallAngleAtY(SEG_LEVEL, 300)).toBeCloseTo((90 + 135) / 2, 6);
    // 过渡带边缘回到纯段角
    expect(wallAngleAtY(SEG_LEVEL, 600 + SEG_BLEND)).toBeCloseTo(75, 6);
    expect(wallAngleAtY(SEG_LEVEL, 600 - SEG_BLEND)).toBeCloseTo(90, 6);
    // 连续性：扫描全高无 >2° 跳变（步长 2px）
    let prev = wallAngleAtY(SEG_LEVEL, 900);
    for (let y = 898; y >= 0; y -= 2) {
      const a = wallAngleAtY(SEG_LEVEL, y);
      expect(Math.abs(a - prev)).toBeLessThan(2.01);
      prev = a;
    }
  });

  it("越界高度取端点段角；旧 wallAngleTop 线性过渡仍兼容", () => {
    expect(wallAngleAtY(SEG_LEVEL, 950)).toBe(75); // 低于最底
    expect(wallAngleAtY(SEG_LEVEL, -50)).toBe(135); // 高于最顶
    const legacy: LevelDef = { ...SEG_LEVEL, wallSegments: undefined, wallAngleTop: 130 };
    expect(wallAngleAtY(legacy, 900)).toBeCloseTo(90, 6);
    expect(wallAngleAtY(legacy, 0)).toBeCloseTo(130, 6);
    expect(wallAngleAtY(legacy, 450)).toBeCloseTo(110, 6);
  });
});

describe("带符号重力分解（板墙物理）", () => {
  it("直壁 90°：全沿墙，无压入无拉离", () => {
    const g = gravitySigned(90);
    expect(g.para).toBeCloseTo(1, 6);
    expect(g.perpPull).toBeCloseTo(0, 6);
    expect(g.perpPress).toBeCloseTo(0, 6);
  });
  it("仰角 120°：拉离 0.5；板墙 75°：压入 ~0.26", () => {
    expect(gravitySigned(120).perpPull).toBeCloseTo(0.5, 6);
    expect(gravitySigned(120).perpPress).toBe(0);
    expect(gravitySigned(75).perpPress).toBeCloseTo(0.2588, 3);
    expect(gravitySigned(75).perpPull).toBe(0);
  });
  it("与无符号版本一致：|perp| = pull + press", () => {
    for (const deg of [60, 75, 90, 115, 140, 175]) {
      const s = gravitySigned(deg);
      const u = gravityComponents(deg);
      expect(s.perpPull + s.perpPress).toBeCloseTo(u.perp, 9);
      expect(s.para).toBeCloseTo(u.para, 9);
    }
  });
});
