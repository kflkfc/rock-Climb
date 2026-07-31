import { describe, it, expect } from "vitest";
import { GRIP_UNLOCK_LEVEL, gripUnlocked, dynoUnlocked } from "../src/progress/techTree.ts";
import { gripOptions, HAND_GRIPS, FOOT_GRIPS } from "../src/sim/grip.ts";
import { makeHold } from "../src/sim/holds.ts";
import { v } from "../src/math/vec2.ts";
import { Game } from "../src/sim/gameState.ts";
import { LEVEL_V7 } from "../src/level/levels.ts";
import { LOGIC_DT } from "../src/replay/runner.ts";
import { SaveManager } from "../src/progress/save.ts";

const mem = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v2: string) => void m.set(k, v2), remove: (k: string) => void m.delete(k) };
};

describe("技术树 · 解锁", () => {
  it("全部抓法有解锁等级；初始只有开掌/内侧踩", () => {
    for (const g of [...HAND_GRIPS, ...FOOT_GRIPS, "slap"] as const)
      expect(GRIP_UNLOCK_LEVEL[g]).toBeGreaterThanOrEqual(1);
    expect(gripUnlocked("open", 1)).toBe(true);
    expect(gripUnlocked("inside", 1)).toBe(true);
    expect(gripUnlocked("half", 1)).toBe(false);
    expect(gripUnlocked("half", 2)).toBe(true);
    expect(gripUnlocked("full", 3)).toBe(false);
    expect(gripUnlocked("toe", 5)).toBe(false);
    expect(gripUnlocked("toe", 6)).toBe(true);
  });

  it("抓法环按等级过滤：新手 crimp 环只有开掌，老手 4 项（lock 不适用小棱）", () => {
    const crimp = makeHold("c", "crimp", v(0, 0));
    const pocket = makeHold("p", "pocket", v(0, 0));
    expect(gripOptions("RH", crimp, 2, Math.PI / 2, 1).map((o) => o.grip)).toEqual(["open"]);
    // crimp 上 lock 不成立 → 满级也只有 open/half/full/pinch 四项
    expect(gripOptions("RH", crimp, 2, Math.PI / 2, 5).length).toBe(4);
    expect(gripOptions("RH", crimp, 2, Math.PI / 2).length).toBe(4); // 默认全解锁
    // 4 级：指洞上也还没解锁 lock
    const lv4 = gripOptions("RH", pocket, 2, Math.PI / 2, 4).map((o) => o.grip);
    expect(lv4).not.toContain("lock");
    expect(lv4).toContain("full");
    // 5 级 + 指洞：lock 才出现
    expect(gripOptions("RH", pocket, 2, Math.PI / 2, 5).map((o) => o.grip)).toContain("lock");
  });

  it("Dyno 甩跳 Lv5 解锁：新手甩不出去", () => {
    expect(dynoUnlocked(4)).toBe(false);
    expect(dynoUnlocked(5)).toBe(true);
    const g = new Game(LEVEL_V7);
    g.setClimberLevel(4);
    for (let i = 0; i < 30; i++) g.update(LOGIC_DT);
    const cur = { ...g.c.limbs.RH.hold!.pos };
    g.beginDrag(cur);
    for (let k = 1; k <= 3; k++) {
      g.moveDrag({ x: cur.x, y: cur.y - 42 * k });
      g.update(LOGIC_DT);
    }
    g.endDrag();
    expect(g.c.dyno).toBeNull(); // 未解锁 → 只是收手，不起跳
  });
});

describe("熟练度 · 记录", () => {
  it("使用即涨，上限 100，落盘还原", () => {
    const store = mem();
    const s = new SaveManager(store);
    expect(s.proficiencyOf("half")).toBe(0);
    s.bumpProficiency("half");
    s.bumpProficiency("half", 5);
    expect(s.proficiencyOf("half")).toBe(6);
    s.bumpProficiency("half", 999);
    expect(s.proficiencyOf("half")).toBe(100);
    expect(new SaveManager(store).proficiencyOf("half")).toBe(100);
  });

  it("完攀路径累积熟练度（onGrab 管道）", () => {
    const store = mem();
    const s = new SaveManager(store);
    const g = new Game(LEVEL_V7);
    g.onGrab = (_m, grip) => s.bumpProficiency(grip);
    for (let i = 0; i < 30; i++) g.update(LOGIC_DT);
    // 拖右手抓 a2（edge → 弹环选 0=半扣系）
    const a2 = g.holds.find((h) => h.id === "a2")!.pos;
    const cur = { ...g.c.limbs.RH.hold!.pos };
    g.beginDrag(cur);
    for (let k = 1; k <= 10; k++) {
      g.moveDrag({ x: cur.x + (a2.x - cur.x) * (k / 10), y: cur.y + (a2.y - cur.y) * (k / 10) });
      g.update(LOGIC_DT);
    }
    g.endDrag();
    if (g.status === "ring") g.chooseGripByIndex(0);
    const total = Object.values(s.data.proficiency ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });
});
