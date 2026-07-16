import { describe, it, expect } from "vitest";
import { CHARACTERS, characterById, applyBias } from "../src/model/characters.ts";
import { makeBody, abilitiesForLevel, armReach, DEFAULT_PHYSIQUE } from "../src/model/body.ts";
import { GameRunner, replayRun } from "../src/replay/runner.ts";
import { LEVELS } from "../src/level/levels.ts";
import { LIMBS } from "../src/model/skeleton.ts";
import { botPlay } from "./helpers/bot.ts";

describe("角色阵容 · 数据", () => {
  it("6 名首发角色，体格值域合法，含 ≥3 名星数解锁角色", () => {
    expect(CHARACTERS.length).toBe(6);
    let locked = 0;
    for (const c of CHARACTERS) {
      expect(c.physique.height).toBeGreaterThan(0.4);
      expect(c.physique.height).toBeLessThan(1.5);
      expect(c.physique.weight).toBeGreaterThan(20);
      expect(c.physique.flexibility).toBeGreaterThanOrEqual(0);
      expect(c.physique.flexibility).toBeLessThanOrEqual(1);
      if (c.unlock) locked++;
    }
    expect(locked).toBeGreaterThanOrEqual(3); // 猴子/西装暴徒/金刚
    expect(characterById("gorilla").name).toBe("金刚"); // 招牌角色
    expect(characterById("不存在").id).toBe("climber"); // 未知 id 回退默认
  });

  it("体格差异体现在骨长：猴臂展 > 同身高攀岩者；小孩臂展 < 成人", () => {
    const ab = abilitiesForLevel(5);
    const climber = makeBody(DEFAULT_PHYSIQUE, ab);
    const monkey = makeBody(characterById("monkey").physique, ab);
    const kid = makeBody(characterById("kid").physique, ab);
    const gorilla = makeBody(characterById("gorilla").physique, ab);
    // 猴子身高 0.6 但 ape 1.35 → 臂展/身高比远超默认
    expect(armReach(monkey) / monkey.torsoLen).toBeGreaterThan(armReach(climber) / climber.torsoLen);
    expect(armReach(kid)).toBeLessThan(armReach(climber));
    expect(armReach(gorilla)).toBeGreaterThan(armReach(climber)); // 金刚长臂
    expect(gorilla.weight).toBeGreaterThan(climber.weight * 1.5); // 力量的代价
  });

  it("能力偏置乘法生效且 clamp 到 1", () => {
    const a = abilitiesForLevel(10); // fingerStrength=1.0
    const biased = applyBias(a, { fingerStrength: 1.25, power: 1.3 });
    expect(biased.fingerStrength).toBe(1); // clamp
    expect(biased.power).toBeCloseTo(Math.min(1, a.power * 1.3), 9);
    expect(applyBias(a)).toEqual(a); // 无偏置 = 原样
  });
});

describe("角色阵容 · 极端体型全关卡回归（不穿模不 NaN 不崩溃）", () => {
  for (const cid of ["kid", "monkey", "gorilla", "suit"] as const) {
    it(`${cid} 在全部 ${LEVELS.length} 关可加载并稳定模拟`, () => {
      for (let i = 0; i < LEVELS.length; i++) {
        const r = new GameRunner(i);
        r.dispatch({ e: "chara", id: cid });
        for (let f = 0; f < 240; f++) r.step(); // 4 秒静置（含换角色重置）
        const c = r.game.c;
        // 数值健康：全部关键状态是有限数
        const nums = [c.pelvis.x, c.pelvis.y, c.lean, c.pose.com.x, c.pose.com.y];
        for (const l of LIMBS) nums.push(c.limbs[l].freePos.x, c.limbs[l].freePos.y, c.limbs[l].stamina);
        for (const n of nums) expect(Number.isFinite(n), `${cid}@${LEVELS[i].id}`).toBe(true);
        expect(r.game.characterId).toBe(cid);
      }
    });
  }
});

describe("角色阵容 · 回放闭环", () => {
  it("中途换角色进 tape 并可确定性重演", () => {
    const live = new GameRunner(0);
    for (let f = 0; f < 30; f++) live.step();
    live.dispatch({ e: "chara", id: "gorilla" });
    botPlay(live, 2);
    const replay = live.exportReplay();
    expect(replay.characterId).toBe("climber"); // 起点角色
    expect(replay.events.some((ev) => ev.e === "chara")).toBe(true);
    const res = replayRun(replay);
    expect(res.hash).toBe(live.hash());
    expect(res.game.characterId).toBe("gorilla"); // 重演终态角色一致
  });

  it("以非默认角色开局：初始条件快照正确重演", () => {
    const live = new GameRunner(2);
    live.game.setCharacter("monkey");
    live.restartTape();
    botPlay(live, 2);
    const replay = live.exportReplay();
    expect(replay.characterId).toBe("monkey");
    expect(replayRun(replay).hash).toBe(live.hash());
  });
});
