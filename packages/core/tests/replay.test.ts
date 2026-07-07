import { describe, it, expect } from "vitest";
import { GameRunner, replayRun } from "../src/replay/runner.ts";
import { stateHash } from "../src/replay/hash.ts";
import { CORE_VERSION } from "../src/version.ts";
import { botPlay } from "./helpers/bot.ts";

describe("回放 · 现场即回放（确定性闭环）", () => {
  it("机器人现场会话的终态哈希 === 重演其 tape 的终态哈希", () => {
    const live = new GameRunner(0);
    botPlay(live, 3);
    const liveHash = live.hash();
    const replay = live.exportReplay();

    expect(replay.schema).toBe(1);
    expect(replay.coreVersion).toBe(CORE_VERSION);
    expect(replay.events.length).toBeGreaterThan(10); // 机器人确实产生了输入
    expect(replay.claim.gripCount).toBeGreaterThan(0); // 至少抓到过岩点

    const res = replayRun(replay);
    expect(res.hash).toBe(liveHash);
    expect(res.claimOk).toBe(true);
  });

  it("同一回放重演两次 → 哈希一致（重演自身确定）", () => {
    const live = new GameRunner(0);
    botPlay(live, 2);
    const replay = live.exportReplay();
    expect(replayRun(replay).hash).toBe(replayRun(replay).hash);
  });

  it("JSON 序列化往返不改变重演结果（网络传输安全）", () => {
    const live = new GameRunner(0);
    botPlay(live, 2);
    const replay = live.exportReplay();
    const roundtrip = JSON.parse(JSON.stringify(replay));
    expect(replayRun(roundtrip).hash).toBe(live.hash());
  });

  it("篡改事件 → 终态哈希改变（反作弊基础）", () => {
    const live = new GameRunner(0);
    botPlay(live, 2);
    const replay = live.exportReplay();
    const tampered = JSON.parse(JSON.stringify(replay));
    tampered.events = []; // 删光输入：角色原地挂 N 帧
    expect(replayRun(tampered).hash).not.toBe(live.hash());
  });

  it("篡改 claim → claimOk=false（服务器直接拒绝）", () => {
    const live = new GameRunner(0);
    botPlay(live, 2);
    const replay = live.exportReplay();
    const tampered = JSON.parse(JSON.stringify(replay));
    tampered.claim.gripCount += 5; // 谎报抓取数
    expect(replayRun(tampered).claimOk).toBe(false);
  });

  it("选手级别事件进 tape 并被重演（能力影响物理）", () => {
    const live = new GameRunner(0);
    live.dispatch({ e: "climber", n: 2 });
    botPlay(live, 2);
    const replay = live.exportReplay();
    expect(replay.events.some((ev) => ev.e === "climber")).toBe(true);
    expect(replayRun(replay).hash).toBe(live.hash());
  });

  it("中途切关 + 改级别：导出记录 tape 起点条件，重演仍一致（回归：勿用末态覆盖初始条件）", () => {
    const live = new GameRunner(0);
    for (let i = 0; i < 30; i++) live.step();
    live.dispatch({ e: "level", i: 2 }); // 中途切到第 3 关
    live.dispatch({ e: "climber", n: 8 });
    botPlay(live, 1);
    const replay = live.exportReplay();
    expect(replay.levelIndex).toBe(0); // 起点关卡，不是末态关卡
    expect(replay.climberLevel).toBe(5); // 起点级别
    expect(replayRun(replay).hash).toBe(live.hash());
  });

  it("stateHash 对状态敏感：不同会话不同指纹", () => {
    const a = new GameRunner(0);
    const b = new GameRunner(0);
    botPlay(a, 1);
    for (let i = 0; i < a.frame; i++) b.step(); // 同帧数但无输入
    expect(stateHash(a.game)).not.toBe(stateHash(b.game));
  });
});
