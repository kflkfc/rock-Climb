import { describe, it, expect } from "vitest";
import { pointInPolygon, convexHull, v } from "../src/math/vec2.ts";
import { solve2Bone } from "../src/math/ik.ts";
import { makeHold } from "../src/sim/holds.ts";
import { matchPercent, gripOptions, orientationScore } from "../src/sim/grip.ts";
import { gravityComponents } from "../src/sim/physics.ts";

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
  it("横向剪切最差：侧向受力的匹配度显著低于顺向", () => {
    const good = matchPercent({ hold: crimp, grip: "half", distToCenter: 2, pullRad: Math.PI / 2 });
    const shear = matchPercent({ hold: crimp, grip: "half", distToCenter: 2, pullRad: 0 });
    expect(shear).toBeLessThan(good * 0.6);
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
  it("orientationScore 是双瓣：顺向=1 > 反向(反提) > 横向剪切(谷底)", () => {
    const same = orientationScore(1, 1);
    const back = orientationScore(0, Math.PI); // 反提：反着自然吊挂线发力
    const shear = orientationScore(0, Math.PI / 2); // 侧拉/反肩：横向剪切
    expect(same).toBeCloseTo(1, 5);
    expect(back).toBeGreaterThan(shear); // 反提真人做得到，不该比横向还差
    expect(back).toBeLessThan(same); // 但仍比顺拉费劲
    expect(shear).toBeCloseTo(0.45, 2);
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
