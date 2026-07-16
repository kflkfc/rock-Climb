// V1.1 交互改版（core 0.6.0）回归：
// ①松手不吸附（接触偏移保留原位）②肢端占位 30% 重叠拒抓
// ③浅抓（覆盖率低）耐力急耗 ④拖小臂/小腿命中肢端。

import { describe, it, expect } from "vitest";
import { Game } from "../src/sim/gameState.ts";
import { LevelDef } from "../src/level/levelSchema.ts";
import { LOGIC_DT } from "../src/replay/runner.ts";
import { limbTarget, gripPos } from "../src/sim/physics.ts";
import { discOverlapRatio, contactCoverage } from "../src/sim/contact.ts";
import { tuning } from "../src/config/tuning.ts";

const L: LevelDef = {
  id: "t-v11",
  name: "V11",
  grade: "V1",
  wallAngleDeg: 90,
  worldWidth: 720,
  worldHeight: 1000,
  goalHoldId: "goal",
  starThreshold: 6,
  holds: [
    { id: "s_lf", type: "jug", x: 330, y: 860, start: "LF" },
    { id: "s_rf", type: "jug", x: 390, y: 860, start: "RF" },
    { id: "s_lh", type: "jug", x: 330, y: 730, start: "LH" },
    { id: "s_rh", type: "jug", x: 390, y: 730, start: "RH" },
    { id: "c1", type: "crimp", x: 400, y: 620, pullDirDeg: 90 },
    { id: "e1", type: "edge", x: 370, y: 550, pullDirDeg: 90 },
    { id: "goal", type: "jug", x: 350, y: 500, radius: 28, goal: true },
  ],
};

const step = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g.update(LOGIC_DT);
};
function dragTo(g: Game, from: { x: number; y: number }, to: { x: number; y: number }, gripIdx = 0) {
  g.beginDrag({ ...from });
  step(g, 2);
  for (let k = 1; k <= 8; k++) {
    g.moveDrag({ x: from.x + (to.x - from.x) * (k / 8), y: from.y + (to.y - from.y) * (k / 8) });
    g.update(LOGIC_DT);
  }
  g.endDrag();
  step(g, 3);
  if (g.status === "ring") {
    g.chooseGripByIndex(gripIdx);
    step(g, 2);
  }
  step(g, 15);
}

describe("占位/覆盖模型（contact.ts）", () => {
  it("discOverlapRatio：相离 0 / 相切 0 / 同心 1 / 单调", () => {
    expect(discOverlapRatio(20, 9, 9)).toBe(0);
    expect(discOverlapRatio(18, 9, 9)).toBe(0);
    expect(discOverlapRatio(0, 9, 9)).toBe(1);
    expect(discOverlapRatio(12, 9, 9)).toBeCloseTo(6 / 18, 6);
    expect(discOverlapRatio(10, 9, 9)).toBeGreaterThan(discOverlapRatio(14, 9, 9));
  });
  it("contactCoverage：中心≈全覆盖，越靠边越低", () => {
    expect(contactCoverage(0, 16, 9)).toBe(1);
    const mid = contactCoverage(10, 16, 9);
    const edge = contactCoverage(16, 16, 9);
    expect(mid).toBeGreaterThan(edge);
    expect(edge).toBeCloseTo(0.5, 6);
  });
});

describe("① 松手不吸附：抓在哪就在哪", () => {
  it("在岩点偏移处松手 → 肢端保留在松手位置（不吸到中心）", () => {
    const g = new Game(L);
    step(g, 30);
    const c1 = g.holds.find((h) => h.id === "c1")!;
    const aim = { x: c1.pos.x + 10, y: c1.pos.y + 4 }; // 距中心 ~10.8 < 半径 16
    dragTo(g, limbTarget(g.c, "RH"), aim);
    const st = g.c.limbs.RH;
    expect(st.hold?.id).toBe("c1");
    expect(st.contactOff.x).toBeCloseTo(10, 6);
    expect(st.contactOff.y).toBeCloseTo(4, 6);
    expect(st.contactDist).toBeCloseTo(Math.hypot(10, 4), 6);
    const gp = gripPos(st);
    expect(gp.x).toBeCloseTo(aim.x, 6);
    expect(gp.y).toBeCloseTo(aim.y, 6);
  });

  it("undo 退回来处时恢复接触偏移", () => {
    const g = new Game(L);
    step(g, 30);
    const c1 = g.holds.find((h) => h.id === "c1")!;
    dragTo(g, limbTarget(g.c, "RH"), { x: c1.pos.x + 9, y: c1.pos.y });
    dragTo(g, limbTarget(g.c, "RH"), g.holds.find((h) => h.id === "e1")!.pos);
    expect(g.c.limbs.RH.hold?.id).toBe("e1");
    g.undo();
    const st = g.c.limbs.RH;
    expect(st.hold?.id).toBe("c1");
    expect(st.contactOff.x).toBeCloseTo(9, 6);
  });
});

describe("② 肢端占位：重叠 >30% 拒抓", () => {
  it("第二只手落在同点同位置 → 拒抓 + lastBlocked 提示", () => {
    const g = new Game(L);
    step(g, 30);
    const lh = g.holds.find((h) => h.id === "s_lh")!;
    // RH 拖到 LH 正在抓的位置（重叠 100%）
    dragTo(g, limbTarget(g.c, "RH"), { x: lh.pos.x, y: lh.pos.y });
    const st = g.c.limbs.RH;
    expect(st.attached).toBe(false);
    expect(st.hold).toBeNull();
    expect(g.lastBlocked?.limb).toBe("RH");
  });

  it("错开到重叠 ≤30% 的位置 → 可以匹配同一岩点", () => {
    const g = new Game(L);
    step(g, 30);
    const lh = g.holds.find((h) => h.id === "s_lh")!; // jug 半径 22
    // LH 在中心；错开 14 > 手手最小间距 12.6（9+9−0.3×18）
    dragTo(g, limbTarget(g.c, "RH"), { x: lh.pos.x + 14, y: lh.pos.y });
    const st = g.c.limbs.RH;
    expect(st.hold?.id).toBe("s_lh");
    expect(st.contactDist).toBeCloseTo(14, 6);
  });
});

describe("③ 浅抓急耗：覆盖率低 → 耐力掉得更快", () => {
  it("同一岩点边缘抓比中心抓耗力快", () => {
    const drainAfter = (offX: number) => {
      const g = new Game(L);
      step(g, 30);
      const c1 = g.holds.find((h) => h.id === "c1")!;
      dragTo(g, limbTarget(g.c, "RH"), { x: c1.pos.x + offX, y: c1.pos.y });
      expect(g.c.limbs.RH.hold?.id).toBe("c1");
      step(g, 360); // 6 秒持续受力
      return g.c.limbs.RH.stamina;
    };
    const center = drainAfter(0);
    const edge = drainAfter(15); // crimp 半径 16 的外缘
    expect(edge).toBeLessThan(center);
  });
});

describe("④ 拖小臂/小腿：线段命中也能拿起肢端", () => {
  it("在小臂中点按下 → 拿起该手", () => {
    const g = new Game(L);
    step(g, 30);
    const seg = g.c.pose.limb.RH.ik;
    const mid = { x: (seg.joint.x + seg.end.x) / 2, y: (seg.joint.y + seg.end.y) / 2 };
    expect(g.beginDrag(mid)).toBe(true);
    expect(g.dragging).toBe("RH");
  });
  it("在小腿中点按下 → 拿起该脚", () => {
    const g = new Game(L);
    step(g, 30);
    const seg = g.c.pose.limb.LF.ik;
    const mid = { x: (seg.joint.x + seg.end.x) / 2, y: (seg.joint.y + seg.end.y) / 2 };
    expect(g.beginDrag(mid)).toBe(true);
    expect(g.dragging).toBe("LF");
  });
});

describe("重叠上限可调（tuning.overlapMax）", () => {
  it("overlapMax=1 时同点同位置也允许（规则可关闭）", () => {
    const prev = tuning.overlapMax;
    tuning.overlapMax = 1;
    try {
      const g = new Game(L);
      step(g, 30);
      const lh = g.holds.find((h) => h.id === "s_lh")!;
      dragTo(g, limbTarget(g.c, "RH"), { x: lh.pos.x, y: lh.pos.y });
      expect(g.c.limbs.RH.hold?.id).toBe("s_lh");
    } finally {
      tuning.overlapMax = prev;
    }
  });
});
