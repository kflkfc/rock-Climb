import { describe, it, expect } from "vitest";
import { HOLD_TYPES, HOLD_META, makeHold, holdUsableBy } from "../src/sim/holds.ts";
import { HAND_TABLE, FOOT_TABLE, GRIP_DRAIN_MUL } from "../src/sim/gripTable.ts";
import {
  HAND_GRIPS,
  FOOT_GRIPS,
  gripsFor,
  gripOptions,
  isPullingFootGrip,
  GRIP_LABEL,
} from "../src/sim/grip.ts";
import { v } from "../src/math/vec2.ts";

describe("岩点 · 12 类型元数据", () => {
  it("恰好 12 种类型，元数据齐全且值域合法", () => {
    expect(HOLD_TYPES.length).toBe(12);
    for (const t of HOLD_TYPES) {
      const m = HOLD_META[t];
      expect(m.friendliness).toBeGreaterThan(0);
      expect(m.friendliness).toBeLessThanOrEqual(1);
      expect(m.friction).toBeGreaterThan(0);
      expect(m.friction).toBeLessThanOrEqual(1);
      expect(m.pullTol).toBeGreaterThan(0);
      expect(m.radius).toBeGreaterThan(0);
      expect(m.fingerDemand).toBeGreaterThanOrEqual(1);
      expect(m.drainMul).toBeGreaterThanOrEqual(1);
      expect(m.hands || m.feet).toBe(true); // 至少一类肢端可用
    }
  });

  it("可用性：脚钉仅脚，指洞/捏/侧拉/反提/反肩/单指仅手", () => {
    const chip = makeHold("c", "footchip", v(0, 0));
    expect(holdUsableBy(chip, "LH")).toBe(false);
    expect(holdUsableBy(chip, "LF")).toBe(true);
    for (const t of ["pocket", "pinch", "sidepull", "undercling", "gaston", "mono"] as const) {
      const h = makeHold("h", t, v(0, 0));
      expect(holdUsableBy(h, "RH"), t).toBe(true);
      expect(holdUsableBy(h, "RF"), t).toBe(false);
    }
  });

  it("类型默认朝向：侧拉/反提/反肩非向下", () => {
    expect(makeHold("s", "sidepull", v(0, 0)).pullDir).toBeCloseTo(0, 9);
    expect(makeHold("u", "undercling", v(0, 0)).pullDir).toBeCloseTo(-Math.PI / 2, 9);
    expect(makeHold("g", "gaston", v(0, 0)).pullDir).toBeCloseTo(Math.PI, 9);
    expect(makeHold("j", "jug", v(0, 0)).pullDir).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("匹配表 · 完整性与关键设计意图", () => {
  it("12×6 手表 + 12×5 脚表全格子有值且 ∈[0,1]", () => {
    for (const t of HOLD_TYPES) {
      for (const g of [...HAND_GRIPS, "slap"] as const)
        expect(HAND_TABLE[t][g], `${t}.${g}`).toBeGreaterThanOrEqual(0);
      for (const g of FOOT_GRIPS) {
        expect(FOOT_TABLE[t][g], `${t}.${g}`).toBeGreaterThanOrEqual(0);
        expect(FOOT_TABLE[t][g], `${t}.${g}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("遗留数值原样保留（黄金回放不漂移的前提）", () => {
    // 切片 4 类型 × 旧抓法必须与旧 HAND_SCORE/FOOT_SCORE 完全一致
    expect(HAND_TABLE.jug).toMatchObject({ open: 0.95, half: 0.85, full: 0.8, pinch: 0.55 });
    expect(HAND_TABLE.crimp).toMatchObject({ open: 0.3, half: 0.95, full: 0.9, pinch: 0.2 });
    expect(HAND_TABLE.pinch).toMatchObject({ open: 0.4, half: 0.45, full: 0.4, pinch: 0.95 });
    expect(HAND_TABLE.sloper).toMatchObject({ open: 0.9, half: 0.4, full: 0.3, pinch: 0.35 });
    expect(FOOT_TABLE.jug).toMatchObject({ inside: 0.9, smear: 0.7 });
    expect(FOOT_TABLE.crimp).toMatchObject({ inside: 0.92, smear: 0.45 });
    expect(FOOT_TABLE.sloper).toMatchObject({ inside: 0.5, smear: 0.9 });
  });

  it("设计意图锚点：每种岩点的最佳抓法符合真实攀岩", () => {
    const best = (t: keyof typeof HAND_TABLE) =>
      (Object.entries(HAND_TABLE[t]) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    expect(best("pocket")).toBe("lock"); // 指洞用扣
    expect(best("mono")).toBe("lock");
    expect(best("pinch")).toBe("pinch"); // 捏点必须捏
    expect(best("sloper")).toBe("open"); // 滑面开掌贴
    expect(best("crimp")).toBe("half"); // 小棱半扣（全扣略低+伤害风险）
    const bestFoot = (t: keyof typeof FOOT_TABLE) =>
      (Object.entries(FOOT_TABLE[t]) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    expect(bestFoot("sloper")).toBe("smear"); // 滑面抹脚
    expect(bestFoot("undercling")).toBe("toe"); // 反提点挂脚
    expect(bestFoot("edge")).toBe("inside");
  });

  it("抓法环选项：手 5 项（无 slap）、脚 5 项；全部有标签与消耗系数", () => {
    expect(gripsFor("LH")).toEqual(["open", "half", "full", "pinch", "lock"]);
    expect(gripsFor("LF")).toEqual(["inside", "outside", "smear", "heel", "toe"]);
    for (const g of [...HAND_GRIPS, ...FOOT_GRIPS, "slap"] as const) {
      expect(GRIP_LABEL[g]).toBeTruthy();
      expect(GRIP_DRAIN_MUL[g]).toBeGreaterThan(0);
    }
  });

  it("勾脚/挂脚是拉型脚法", () => {
    expect(isPullingFootGrip("heel")).toBe(true);
    expect(isPullingFootGrip("toe")).toBe(true);
    expect(isPullingFootGrip("inside")).toBe(false);
    expect(isPullingFootGrip(null)).toBe(false);
  });

  it("gripOptions 在新类型上工作：pocket 首选扣指洞", () => {
    const h = makeHold("p", "pocket", v(0, 0));
    const opts = gripOptions("RH", h, 2, Math.PI / 2);
    expect(opts[0].grip).toBe("lock");
    expect(opts.length).toBe(5);
  });
});
