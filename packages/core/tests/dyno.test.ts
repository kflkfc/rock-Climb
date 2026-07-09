import { describe, it, expect } from "vitest";
import { Game } from "../src/sim/gameState.ts";
import { LevelDef } from "../src/level/levelSchema.ts";
import { oppositionOf, SLIP_REASON_LABEL } from "../src/sim/physics.ts";
import { GameRunner, replayRun, LOGIC_DT } from "../src/replay/runner.ts";
import { botPlay } from "./helpers/bot.ts";

// 紧凑测试关卡：4 起始点 + 一个"甩跳才够得着"的大 Jug（超出臂展）
const DYNO_LEVEL: LevelDef = {
  id: "t-dyno",
  name: "DYNO",
  grade: "V3",
  wallAngleDeg: 90,
  worldWidth: 420,
  worldHeight: 700,
  goalHoldId: "goal",
  starThreshold: 3,
  holds: [
    { id: "s_lh", type: "jug", x: 195, y: 400, start: "LH" },
    { id: "s_rh", type: "jug", x: 245, y: 400, start: "RH" },
    { id: "s_lf", type: "jug", x: 195, y: 530, start: "LF" },
    { id: "s_rf", type: "jug", x: 245, y: 530, start: "RF" },
    // 目标：正上方 260px（臂展 ~120 → 静态够不着），加大半径提高接取容错
    { id: "goal", type: "jug", x: 220, y: 150, radius: 34, goal: true },
  ],
};

/** 甩出手势：抓起右手 → 3 帧内大幅上移（高拖速）→ 松手于空处 */
function fling(g: Game) {
  for (let i = 0; i < 30; i++) g.update(LOGIC_DT); // 定场
  const start = { ...g.c.limbs.RH.hold!.pos };
  g.beginDrag(start);
  for (let k = 1; k <= 3; k++) {
    g.moveDrag({ x: start.x - 2, y: start.y - 40 * k }); // ~2400 px/s 拖速
    g.update(LOGIC_DT);
  }
  g.endDrag();
}

describe("Dyno · 甩出手势", () => {
  it("快甩空放 → 起跳腾空；慢移空放 → 不触发", () => {
    const g = new Game(DYNO_LEVEL);
    fling(g);
    expect(g.c.dyno).not.toBeNull(); // 腾空
    expect(g.c.limbs.LH.attached).toBe(false); // 全肢脱点

    const g2 = new Game(DYNO_LEVEL);
    for (let i = 0; i < 30; i++) g2.update(LOGIC_DT);
    const s2 = { ...g2.c.limbs.RH.hold!.pos };
    g2.beginDrag(s2);
    for (let k = 1; k <= 30; k++) {
      g2.moveDrag({ x: s2.x, y: s2.y - 2 * k }); // 慢移
      g2.update(LOGIC_DT);
    }
    g2.endDrag();
    expect(g2.c.dyno).toBeNull(); // 不触发（慢速松手只是收手）
  });

  it("腾空中手触岩点 → 拍击自动抓住（免抓法环）", () => {
    const g = new Game(DYNO_LEVEL);
    fling(g);
    let caughtHold = "";
    for (let f = 0; f < 90 && !caughtHold; f++) {
      g.update(LOGIC_DT);
      for (const l of ["LH", "RH"] as const) {
        const st = g.c.limbs[l];
        if (st.attached && st.grip === "slap") caughtHold = st.hold!.id;
      }
    }
    expect(caughtHold, `抓中的点=${caughtHold} 状态=${g.status} 骨盆y=${g.c.pelvis.y.toFixed(0)}`).toBe(
      "goal",
    ); // 上方大 Jug 被拍中
    expect(g.c.dyno).toBeNull();
    expect(g.status).toBe("won"); // 拍中的是终点 → 完攀
  });

  it("窗口内没抓到 → 坠落复位", () => {
    const g = new Game({
      ...DYNO_LEVEL,
      holds: DYNO_LEVEL.holds.filter((h) => !h.goal), // 移除目标点：必然抓空
      goalHoldId: "s_lh",
    });
    fling(g);
    expect(g.c.dyno).not.toBeNull();
    for (let f = 0; f < 120; f++) g.update(LOGIC_DT);
    expect(g.status === "fallen" || g.status === "climbing").toBe(true); // 已坠落（或复位回climbing）
    expect(g.c.dyno).toBeNull();
  });
});

describe("张力对抗", () => {
  it("水平对拉 → 对抗度 >0；同向 → 0；非拉型肢端 → 0", () => {
    // 左手向左拉(π)、右手向右拉(0) → 完全对抗
    expect(oppositionOf("LH", Math.PI, { LH: Math.PI, RH: 0 })).toBeCloseTo(1, 6);
    // 双手都向下(π/2) → 无水平对抗
    expect(oppositionOf("LH", Math.PI / 2, { LH: Math.PI / 2, RH: Math.PI / 2 })).toBeCloseTo(0, 6);
    // 蹬脚（不在 pullAngles 里）→ 0
    expect(oppositionOf("LF", 0, { LH: Math.PI, RH: 0 })).toBe(0);
    // 手 + 挂脚对拉（屋檐场景）
    expect(oppositionOf("RF", 0.2, { RH: Math.PI - 0.2, RF: 0.2 })).toBeGreaterThan(0.7);
  });

  it("归因标签齐全", () => {
    for (const r of ["stamina", "overload", "direction", "imbalance"] as const)
      expect(SLIP_REASON_LABEL[r]).toBeTruthy();
  });
});

describe("Dyno · 回放确定性", () => {
  it("含甩跳的会话可比特级重演", () => {
    const live = new GameRunner(0);
    for (let i = 0; i < 30; i++) live.step();
    // 用事件流甩跳（与真实输入同路径）
    const cur = { ...live.game.c.limbs.RH.hold!.pos };
    live.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
    live.step();
    for (let k = 1; k <= 3; k++) {
      live.dispatch({ e: "dragMove", x: cur.x, y: cur.y - 45 * k });
      live.step();
    }
    live.dispatch({ e: "dragEnd" });
    for (let i = 0; i < 90; i++) live.step(); // 腾空全程（抓中或坠落）
    botPlay(live, 1);
    const replay = live.exportReplay();
    expect(replayRun(replay).hash).toBe(live.hash());
  });
});
