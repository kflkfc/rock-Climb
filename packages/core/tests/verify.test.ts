import { describe, it, expect } from "vitest";
import { GameRunner } from "../src/replay/runner.ts";
import { verifySubmission } from "../src/replay/verify.ts";
import { Replay } from "../src/replay/format.ts";
import { Game } from "../src/sim/gameState.ts";
import { LEVELS } from "../src/level/levels.ts";
import { LOGIC_DT } from "../src/replay/runner.ts";

/** 造一份真实的 t1 完攀回放（事件流驱动） */
function winT1(): Replay {
  const t1 = LEVELS.findIndex((l) => l.id === "t1");
  const r = new GameRunner(t1);
  const g = r.game;
  for (let i = 0; i < 30; i++) r.step();
  const goal = g.holds.find((h) => h.isGoal)!.pos;
  const cur = { ...g.c.limbs.RH.hold!.pos };
  r.dispatch({ e: "dragStart", x: cur.x, y: cur.y });
  r.step();
  for (let k = 1; k <= 8; k++) {
    r.dispatch({ e: "dragMove", x: cur.x + (goal.x - cur.x) * (k / 8), y: cur.y + (goal.y - cur.y) * (k / 8) });
    r.step();
  }
  r.dispatch({ e: "dragEnd" });
  for (let i = 0; i < 20; i++) r.step();
  expect(g.status).toBe("won");
  return r.exportReplay();
}

describe("提交校验 · 反作弊（GDD 5.2 三类攻击 100% 拒绝）", () => {
  it("真实完攀 → 通过，成绩以重演为准", () => {
    const replay = winT1();
    const v = verifySubmission(replay);
    expect(v.ok).toBe(true);
    expect(v.score!.levelId).toBe("t1");
    expect(v.score!.moves).toBe(replay.claim.gripCount);
    expect(v.score!.timeMs).toBe(replay.claim.timeMs);
  });

  it("攻击①谎报成绩：篡改 claim → claim_mismatch", () => {
    const replay = winT1();
    const t = JSON.parse(JSON.stringify(replay)) as Replay;
    t.claim.timeMs = 1; // 谎称 1ms 完攀
    expect(verifySubmission(t)).toMatchObject({ ok: false, reason: "claim_mismatch" });
    const t2 = JSON.parse(JSON.stringify(replay)) as Replay;
    t2.claim.gripCount = 0;
    expect(verifySubmission(t2).ok).toBe(false);
  });

  it("攻击②伪造未完攀的 tape：删事件 → not_won", () => {
    const replay = winT1();
    const t = JSON.parse(JSON.stringify(replay)) as Replay;
    t.events = t.events.slice(0, 2); // 只留开头（没爬到顶）
    expect(verifySubmission(t)).toMatchObject({ ok: false, reason: "not_won" });
  });

  it("攻击③超域参数：级别 99 / 熟练度 999 / 假关卡 / 超长 tape → 全拒", () => {
    const replay = winT1();
    const a = { ...JSON.parse(JSON.stringify(replay)), climberLevel: 99 } as Replay;
    expect(verifySubmission(a)).toMatchObject({ ok: false, reason: "params_out_of_range" });
    const b = JSON.parse(JSON.stringify(replay)) as Replay;
    b.proficiency = { open: 999 };
    expect(verifySubmission(b)).toMatchObject({ ok: false, reason: "params_out_of_range" });
    const c = { ...JSON.parse(JSON.stringify(replay)), levelId: "hacked" } as Replay;
    expect(verifySubmission(c)).toMatchObject({ ok: false, reason: "level_unknown" });
    const d = { ...JSON.parse(JSON.stringify(replay)), frames: 99999999 } as Replay;
    expect(verifySubmission(d)).toMatchObject({ ok: false, reason: "tape_too_long" });
    const e = { ...JSON.parse(JSON.stringify(replay)), coreVersion: "0.0.1" } as Replay;
    expect(verifySubmission(e)).toMatchObject({ ok: false, reason: "core_version" });
  });

  it("每日挑战回放可校验（daily 事件重生成关卡）", () => {
    const r = new GameRunner(0);
    r.dispatch({ e: "daily", date: "2026-07-12" });
    for (let i = 0; i < 40; i++) r.step();
    // 用序列直爬生成关太费；这里验证"未完攀被拒 + levelId 识别为 daily"
    const replay = r.exportReplay();
    const v = verifySubmission(replay);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("not_won"); // 走到了重演阶段（daily 关卡被认可）
  });

  it("claim.timeMs = runTime 口径（排行榜一致性）", () => {
    const t1 = LEVELS.findIndex((l) => l.id === "t1");
    const g = new Game(LEVELS[t1]);
    for (let i = 0; i < 120; i++) g.update(LOGIC_DT); // 干等 2 秒（未输入不计时）
    expect(g.runTime).toBe(0);
  });
});
