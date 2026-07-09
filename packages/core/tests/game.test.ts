import { describe, it, expect } from "vitest";
import { Game } from "../src/sim/gameState.ts";
import { LevelDef } from "../src/level/levelSchema.ts";

// 紧凑测试关卡：4 起始点 + 1 个手可达的终点 Jug。
const TEST_LEVEL: LevelDef = {
  id: "t",
  name: "TEST",
  grade: "V0",
  wallAngleDeg: 90,
  worldWidth: 420,
  worldHeight: 600,
  goalHoldId: "goal",
  starThreshold: 3,
  holds: [
    { id: "s_lh", type: "jug", x: 195, y: 300, start: "LH" },
    { id: "s_rh", type: "jug", x: 245, y: 300, start: "RH" },
    { id: "s_lf", type: "jug", x: 195, y: 430, start: "LF" },
    { id: "s_rf", type: "jug", x: 245, y: 430, start: "RF" },
    { id: "mid", type: "crimp", x: 210, y: 250, pullDirDeg: 90 },
    { id: "goal", type: "jug", x: 230, y: 235, goal: true },
  ],
};

describe("Game · V4 交互闭环", () => {
  it("初始化：4 肢端预置于起始点，状态 climbing", () => {
    const g = new Game(TEST_LEVEL);
    expect(g.status).toBe("climbing");
    expect(g.gripCount).toBe(0);
    for (const l of ["LH", "RH", "LF", "RF"] as const)
      expect(g.c.limbs[l].attached).toBe(true);
  });

  it("拖手到 Crimp → 弹抓法环 → 选抓法 → gripCount+1 并抓住", () => {
    const g = new Game(TEST_LEVEL);
    const mid = g.holds.find((h) => h.id === "mid")!;
    expect(g.beginDrag({ ...g.c.limbs.RH.hold!.pos })).toBe(true);
    g.moveDrag({ ...mid.pos });
    g.endDrag();
    expect(g.status).toBe("ring"); // 非 Jug → 弹环
    expect(g.ring!.options.length).toBe(5); // 正式版手部 5 抓法（开掌/半扣/全扣/捏/扣指洞）
    // 抓法环按匹配度降序，半扣应为首选
    expect(g.ring!.options[0].grip).toBe("half");
    g.chooseGrip(g.ring!.options[0]);
    expect(g.status).toBe("climbing");
    expect(g.gripCount).toBe(1);
    expect(g.c.limbs.RH.attached).toBe(true);
    expect(g.c.limbs.RH.hold!.id).toBe("mid");
  });

  it("Jug 跳过抓法环，手抓到终点 Jug → 直接过关", () => {
    const g = new Game(TEST_LEVEL);
    const goal = g.holds.find((h) => h.id === "goal")!;
    expect(goal.type).toBe("jug");
    expect(g.beginDrag({ ...g.c.limbs.LH.hold!.pos })).toBe(true);
    g.moveDrag({ ...goal.pos });
    expect(g.hoverHold!.id).toBe("goal"); // 接触锁定预览命中终点
    g.endDrag();
    expect(g.status).toBe("won"); // Jug 跳过抓法环 + 手抓终点 → 过关
    expect(g.gripCount).toBeGreaterThanOrEqual(1);
  });

  it("低匹配抓法比高匹配掉耐力快得多（教学性，不立即脱手）", () => {
    const mk = () => new Game(TEST_LEVEL);
    const run = (gripIdx: number) => {
      const g = mk();
      g.beginDrag({ ...g.c.limbs.RH.hold!.pos });
      g.moveDrag({ ...g.holds.find((h) => h.id === "mid")!.pos });
      g.endDrag();
      const opts = g.ring!.options;
      g.chooseGrip(opts[gripIdx]);
      for (let i = 0; i < 120; i++) g.update(1 / 60); // 模拟 2 秒
      return { stam: g.c.limbs.RH.stamina, attached: g.c.limbs.RH.attached };
    };
    const good = run(0); // 半扣（最高匹配）
    const bad = run(g0());
    function g0() {
      const g = mk();
      g.beginDrag({ ...g.c.limbs.RH.hold!.pos });
      g.moveDrag({ ...g.holds.find((h) => h.id === "mid")!.pos });
      g.endDrag();
      const opts = g.ring!.options;
      return opts.length - 1; // 最差匹配
    }
    expect(good.stam).toBeGreaterThan(bad.stam);
    expect(good.attached).toBe(true); // 高匹配 2 秒内仍稳
  });

  it("重置回到初始状态", () => {
    const g = new Game(TEST_LEVEL);
    g.beginDrag({ ...g.c.limbs.RH.hold!.pos });
    g.moveDrag({ ...g.holds.find((h) => h.id === "mid")!.pos });
    g.endDrag();
    g.chooseGrip(g.ring!.options[0]);
    g.reset();
    expect(g.status).toBe("climbing");
    expect(g.gripCount).toBe(0);
    expect(g.c.limbs.RH.hold!.id).toBe("s_rh");
  });
});
