import { describe, it, expect } from "vitest";
import { HOLD_TYPES, HOLD_META, MOVE_META, makeHold, holdUsableBy, isPocket } from "../src/sim/holds.ts";
import { HAND_TABLE, FOOT_TABLE, GRIP_DRAIN_MUL } from "../src/sim/gripTable.ts";
import {
  HAND_GRIPS,
  FOOT_GRIPS,
  gripsFor,
  gripOptions,
  isPullingFootGrip,
  GRIP_LABEL,
  classifyMove,
} from "../src/sim/grip.ts";
import { v } from "../src/math/vec2.ts";

describe("岩点 · 10 种形状的元数据", () => {
  it("恰好 10 种形状，元数据齐全且值域合法", () => {
    expect(HOLD_TYPES.length).toBe(10);
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
    }
  });

  it("侧拉/反提/反肩不是岩点类型（它们是动作，见 MOVE_META）", () => {
    for (const bad of ["sidepull", "undercling", "gaston"]) {
      expect(HOLD_TYPES as string[]).not.toContain(bad);
      expect(Object.keys(MOVE_META)).toContain(bad);
    }
  });

  it("指洞三档：大 3 指 / 中 2 指 / 最小 1 指，指力需求递增", () => {
    expect(HOLD_META.pocket.pocketFingers).toBe(3);
    expect(HOLD_META.pocket2.pocketFingers).toBe(2);
    expect(HOLD_META.mono.pocketFingers).toBe(1);
    expect(HOLD_META.pocket.fingerDemand).toBeLessThan(HOLD_META.pocket2.fingerDemand);
    expect(HOLD_META.pocket2.fingerDemand).toBeLessThan(HOLD_META.mono.fingerDemand);
    expect(HOLD_TYPES.filter(isPocket).sort()).toEqual(["mono", "pocket", "pocket2"]);
  });

  it("可用性：脚哪儿都能踩（没有光面点），手只是抓不住脚钉", () => {
    const chip = makeHold("c", "footchip", v(0, 0));
    expect(holdUsableBy(chip, "LH")).toBe(false);
    expect(holdUsableBy(chip, "LF")).toBe(true);
    for (const t of HOLD_TYPES) {
      const h = makeHold("h", t, v(0, 0));
      expect(holdUsableBy(h, "RF"), `${t} 脚`).toBe(true); // 难易靠匹配度，不靠门禁
      expect(holdUsableBy(h, "RH"), `${t} 手`).toBe(t !== "footchip");
    }
  });

  it("形状默认朝向一律向下——朝向由关卡摆点决定，不再绑死在类型上", () => {
    for (const t of HOLD_TYPES)
      expect(makeHold("h", t, v(0, 0)).pullDir, t).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe("动作判定 · 同一颗点换身位就换动作", () => {
  const DOWN = Math.PI / 2; // 直壁上"沿墙向下"
  const UP = -Math.PI / 2;
  const RIGHT = 0;
  const LEFT = Math.PI;

  it("朝下的点 = 正拉", () => {
    expect(classifyMove(DOWN, DOWN, true)).toBe("downpull");
  });

  it("朝上的点 = 反提", () => {
    expect(classifyMove(UP, DOWN, true)).toBe("undercling");
  });

  it("朝横的点：往身上拉=侧拉，往外撑=反肩（同一颗点、同一朝向，只差身位）", () => {
    expect(classifyMove(RIGHT, DOWN, true)).toBe("sidepull");
    expect(classifyMove(RIGHT, DOWN, false)).toBe("gaston");
    expect(classifyMove(LEFT, DOWN, true)).toBe("sidepull");
    expect(classifyMove(LEFT, DOWN, false)).toBe("gaston");
  });

  it("判据是相对**墙**的重力轴：仰角上墙变斜，档位跟着转", () => {
    const overhang = Math.PI / 2 + 0.6; // 沿墙向下被倾斜
    expect(classifyMove(overhang, overhang, true)).toBe("downpull");
    expect(classifyMove(overhang - Math.PI, overhang, true)).toBe("undercling");
  });

  it("反提最贵的是反肩，正拉不加价", () => {
    expect(MOVE_META.downpull.drainMul).toBe(1);
    expect(MOVE_META.gaston.drainMul).toBeGreaterThan(MOVE_META.undercling.drainMul);
    expect(MOVE_META.undercling.drainMul).toBeGreaterThan(MOVE_META.sidepull.drainMul);
    expect(MOVE_META.undercling.needsFeet).toBe(true); // 反提靠顶髋，脚一飞就崩
  });
});

describe("匹配表 · 完整性与关键设计意图", () => {
  it("10×6 手表 + 10×5 脚表全格子有值且 ∈[0,1]", () => {
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
    expect(bestFoot("edge")).toBe("inside");
    expect(bestFoot("mono")).toBe("toe"); // 单指洞只能用脚尖点
  });

  it("内侧踩不再碾压外侧踩：基准值接近、耗力持平（优劣交给转髋与墙角）", () => {
    for (const t of HOLD_TYPES) {
      const ratio = FOOT_TABLE[t].outside / FOOT_TABLE[t].inside;
      expect(ratio, `${t} 外/内`).toBeGreaterThan(0.85);
    }
    expect(GRIP_DRAIN_MUL.outside).toBe(GRIP_DRAIN_MUL.inside);
  });

  it("抓法环选项：手 5 项（无 slap）、脚 5 项；全部有标签与消耗系数", () => {
    expect(gripsFor("LH")).toEqual(["open", "half", "full", "pinch", "lock"]);
    expect(gripsFor("LF")).toEqual(["inside", "outside", "smear", "heel", "toe"]);
    for (const g of [...HAND_GRIPS, ...FOOT_GRIPS, "slap"] as const) {
      expect(GRIP_LABEL[g]).toBeTruthy();
      expect(GRIP_DRAIN_MUL[g]).toBeGreaterThan(0);
    }
  });

  it("挂脚/勾脚是拉型脚法", () => {
    expect(isPullingFootGrip("heel")).toBe(true);
    expect(isPullingFootGrip("toe")).toBe(true);
    expect(isPullingFootGrip("inside")).toBe(false);
    expect(isPullingFootGrip(null)).toBe(false);
  });

  it("脚跟钩=挂脚（膝弯坐点上）、脚尖钩=勾脚（腿直）", () => {
    expect(GRIP_LABEL.heel).toBe("挂脚");
    expect(GRIP_LABEL.toe).toBe("勾脚");
  });

  it("gripOptions 在新类型上工作：pocket 首选扣指洞", () => {
    const h = makeHold("p", "pocket", v(0, 0));
    const opts = gripOptions("RH", h, 2, Math.PI / 2);
    expect(opts[0].grip).toBe("lock");
    expect(opts.length).toBe(5);
  });

  it("扣指洞只出现在指洞类岩点上（没有洞就不是一种抓法）", () => {
    for (const t of HOLD_TYPES) {
      if (!HOLD_META[t].hands) continue; // 脚钉手抓不住，本就没有手抓法环
      const grips = gripOptions("RH", makeHold("h", t, v(0, 0)), 2, Math.PI / 2).map((o) => o.grip);
      expect(grips.includes("lock"), `${t} 的抓法环`).toBe(isPocket(t));
      expect(grips.length).toBeGreaterThan(0); // 过滤后不能把环清空
    }
  });
});
