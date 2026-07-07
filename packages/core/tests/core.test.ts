import { describe, it, expect } from "vitest";
import { pointInPolygon, convexHull, v } from "../src/core/math/vec2.ts";
import { solve2Bone } from "../src/core/math/ik.ts";
import { makeHold } from "../src/core/sim/holds.ts";
import { matchPercent, gripOptions, orientationScore } from "../src/core/sim/grip.ts";
import { gravityComponents } from "../src/core/sim/physics.ts";

describe("几何 · 重心-支撑多边形", () => {
  const square = [v(0, 0), v(10, 0), v(10, 10), v(0, 10)];
  it("点在多边形内", () => {
    expect(pointInPolygon(v(5, 5), square)).toBe(true);
  });
  it("点在多边形外", () => {
    expect(pointInPolygon(v(15, 5), square)).toBe(false);
  });
  it("少于 3 点不构成支撑面", () => {
    expect(pointInPolygon(v(1, 1), [v(0, 0), v(2, 2)])).toBe(false);
  });
  it("凸包能由散点构造", () => {
    const hull = convexHull([v(0, 0), v(5, 1), v(10, 0), v(10, 10), v(0, 10), v(5, 5)]);
    expect(hull.length).toBe(4);
  });
});

describe("匹配度公式 (V4 灵魂)", () => {
  const crimp = makeHold("c", "crimp", v(0, 0), { pullDir: Math.PI / 2 });
  it("Crimp 上半扣 > 开掌（抓法类型分主导）", () => {
    const half = matchPercent({ hold: crimp, grip: "half", distToCenter: 2, pullRad: Math.PI / 2 });
    const open = matchPercent({ hold: crimp, grip: "open", distToCenter: 2, pullRad: Math.PI / 2 });
    expect(half).toBeGreaterThan(open);
    expect(half).toBeGreaterThan(0.8);
  });
  it("朝向不匹配 → 匹配度显著下降", () => {
    const good = matchPercent({ hold: crimp, grip: "half", distToCenter: 2, pullRad: Math.PI / 2 });
    const bad = matchPercent({ hold: crimp, grip: "half", distToCenter: 2, pullRad: -Math.PI / 2 });
    expect(bad).toBeLessThan(good * 0.6);
  });
  it("接触点离中心越远匹配度越低", () => {
    const near = matchPercent({ hold: crimp, grip: "half", distToCenter: 1, pullRad: Math.PI / 2 });
    const far = matchPercent({ hold: crimp, grip: "half", distToCenter: 30, pullRad: Math.PI / 2 });
    expect(near).toBeGreaterThan(far);
  });
  it("抓法环选项按匹配度降序，全扣标伤害风险", () => {
    const opts = gripOptions("RH", crimp, 2, Math.PI / 2);
    for (let i = 1; i < opts.length; i++)
      expect(opts[i - 1].match).toBeGreaterThanOrEqual(opts[i].match);
    expect(opts.find((o) => o.grip === "full")!.injury).toBe(true);
  });
  it("orientationScore：同向=1，反向≈0.1", () => {
    expect(orientationScore(1, 1)).toBeCloseTo(1, 5);
    expect(orientationScore(0, Math.PI)).toBeCloseTo(0.1, 5);
  });
});

describe("墙角力分解", () => {
  it("直壁 90° 全沿墙、无垂墙", () => {
    const g = gravityComponents(90);
    expect(g.para).toBeCloseTo(1, 3);
    expect(g.perp).toBeCloseTo(0, 3);
  });
  it("屋檐 180° 几乎全垂墙拉离", () => {
    const g = gravityComponents(180);
    expect(g.perp).toBeCloseTo(1, 3);
  });
});

describe("2-骨 IK", () => {
  it("目标在可达范围内能到达", () => {
    const s = solve2Bone(v(0, 0), v(60, 0), 50, 50, 1);
    expect(s.reached).toBe(true);
    expect(Math.hypot(s.end.x - 60, s.end.y)).toBeLessThan(1e-3);
  });
  it("超出臂长 → reached=false 且末端夹到最大伸展", () => {
    const s = solve2Bone(v(0, 0), v(500, 0), 50, 50, 1);
    expect(s.reached).toBe(false);
    expect(Math.hypot(s.end.x, s.end.y)).toBeCloseTo(100, 3);
  });
});
