import { describe, it, expect } from "vitest";
import { Game } from "../src/sim/gameState.ts";
import { LevelDef } from "../src/level/levelSchema.ts";
import { GameRunner, replayRun, LOGIC_DT } from "../src/replay/runner.ts";
import { ACHIEVEMENTS, evaluateAchievements } from "../src/progress/achievements.ts";
import { defaultSave, SaveManager } from "../src/progress/save.ts";
import { botPlay } from "./helpers/bot.ts";

const L: LevelDef = {
  id: "t-p26",
  name: "P26",
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

describe("undo · 回退一步", () => {
  it("抓上新点 → undo → 退回原点；罚流畅星；计数回退", () => {
    const g = new Game(L);
    step(g, 30);
    expect(g.canUndo).toBe(false);
    const c1 = g.holds.find((h) => h.id === "c1")!.pos;
    dragTo(g, g.c.limbs.RH.hold!.pos, c1);
    expect(g.c.limbs.RH.hold?.id).toBe("c1");
    expect(g.canUndo).toBe(true);
    expect(g.movesBy.RH).toBe(1);
    g.undo();
    expect(g.c.limbs.RH.hold?.id).toBe("s_rh"); // 退回来处
    expect(g.c.limbs.RH.attached).toBe(true);
    expect(g.movesBy.RH).toBe(0);
    expect(g.runUndoUsed).toBe(true); // 流畅星判据
    expect(g.canUndo).toBe(false);
  });

  it("undo 事件可确定性重演", () => {
    const live = new GameRunner(0);
    for (let i = 0; i < 30; i++) live.step();
    const cur = { ...live.game.c.limbs.RH.hold!.pos };
    const tgt = live.game.holds.find((h) => h.id === "r4")!.pos;
    live.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
    live.step();
    for (let k = 1; k <= 8; k++) {
      live.dispatch({ e: "dragMove", x: cur.x + (tgt.x - cur.x) * (k / 8), y: cur.y + (tgt.y - cur.y) * (k / 8) });
      live.step();
    }
    live.dispatch({ e: "dragEnd" });
    for (let i = 0; i < 5; i++) live.step();
    live.dispatch({ e: "undo" });
    for (let i = 0; i < 30; i++) live.step();
    botPlay(live, 1);
    const replay = live.exportReplay();
    expect(replay.events.some((ev) => ev.e === "undo")).toBe(true);
    expect(replayRun(replay).hash).toBe(live.hash());
  });
});

describe("熟练度进物理 + 指伤", () => {
  it("熟练 90 的抓法耐力消耗更慢（liveMatch 加成）", () => {
    const mk = (prof: number) => {
      const g = new Game(L);
      g.setProficiency({ half: prof });
      step(g, 30);
      dragTo(g, g.c.limbs.RH.hold!.pos, g.holds.find((h) => h.id === "c1")!.pos); // crimp 首选半扣
      step(g, 300); // 挂 5 秒
      return g.c.limbs.RH.stamina;
    };
    const low = mk(0);
    const high = mk(90);
    expect(high).toBeGreaterThan(low); // 熟练者剩余耐力更多
  });

  it("低熟练全扣 ×3 → 指伤 90s → 指力打折并倒计时恢复", () => {
    const g = new Game(L);
    g.setProficiency({}); // full 熟练 0
    step(g, 30);
    const c1 = g.holds.find((h) => h.id === "c1")!.pos;
    // 反复用全扣抓 c1（选项含 full：找 index）
    for (let i = 0; i < 3; i++) {
      const rh = g.c.limbs.RH;
      const from = rh.hold ? rh.hold.pos : rh.freePos;
      g.beginDrag({ ...from });
      step(g, 2);
      for (let k = 1; k <= 8; k++) {
        g.moveDrag({ x: from.x + (c1.x - from.x) * (k / 8), y: from.y + (c1.y - from.y) * (k / 8) });
        g.update(LOGIC_DT);
      }
      g.endDrag();
      step(g, 2);
      expect(g.status).toBe("ring");
      const fullIdx = g.ring!.options.findIndex((o) => o.grip === "full");
      expect(fullIdx).toBeGreaterThanOrEqual(0);
      g.chooseGripByIndex(fullIdx);
      step(g, 5);
      if (i < 2) {
        g.undo(); // 退回再抓（制造重复使用）
        step(g, 5);
      }
    }
    expect(g.c.injuryT).toBeGreaterThan(85); // 已受伤
    step(g, 120); // 2 秒
    expect(g.c.injuryT).toBeLessThan(89); // 在倒计时
    expect(g.c.injuryT).toBeGreaterThan(0);
  });

  it("熟练度是回放初始条件：不同熟练度 → 不同哈希；快照重演一致", () => {
    const run = (prof: number) => {
      const r = new GameRunner(0);
      r.game.setProficiency({ open: prof });
      r.restartTape();
      botPlay(r, 2);
      return r;
    };
    const a = run(0);
    const b = run(95);
    expect(a.hash()).not.toBe(b.hash()); // 熟练度确实影响物理
    const replay = b.exportReplay();
    expect(replay.proficiency?.open).toBe(95);
    expect(replayRun(replay).hash).toBe(b.hash());
  });
});

describe("规则变体 · maxMovesPerLimb", () => {
  it("超限肢端不可再动", () => {
    const g = new Game({ ...L, rules: { maxMovesPerLimb: 1 } });
    step(g, 30);
    const c1 = g.holds.find((h) => h.id === "c1")!.pos;
    dragTo(g, g.c.limbs.RH.hold!.pos, c1);
    expect(g.movesBy.RH).toBe(1);
    expect(g.beginDrag({ ...g.c.limbs.RH.hold!.pos })).toBe(false); // 该肢已用完次数
    expect(g.beginDrag({ ...g.c.limbs.LH.hold!.pos })).toBe(true); // 其他肢不受影响
  });
});

describe("成就系统", () => {
  it("31 个定义 id 唯一；空档零解锁", () => {
    expect(ACHIEVEMENTS.length).toBe(31);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(31);
    expect(evaluateAchievements(defaultSave("t"))).toEqual([]);
  });

  it("完攀/星池/名场面成就按存档推导；evaluate 幂等", () => {
    const save = defaultSave("t");
    save.progress["v6"] = { bestMoves: 9, bestTimeMs: 60000, stars: { topped: true, flow: true, speed: true }, wins: 1, attempts: 2 };
    const news = evaluateAchievements(save);
    const ids = news.map((a) => a.id);
    expect(ids).toContain("top1");
    expect(ids).toContain("bat"); // HVOLF 登顶
    expect(ids).toContain("triple1"); // 单关 3 星
    save.achievements = ids;
    expect(evaluateAchievements(save)).toEqual([]); // 幂等
  });

  it("SaveManager 持久化成就", () => {
    const m = new Map<string, string>();
    const store = { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
    const s = new SaveManager(store);
    s.unlockAchievements(["top1", "bat"]);
    s.unlockAchievements(["bat", "dyno"]); // 去重
    expect(new SaveManager(store).data.achievements!.sort()).toEqual(["bat", "dyno", "top1"]);
  });
});
