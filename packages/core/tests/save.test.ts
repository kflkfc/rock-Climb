import { describe, it, expect } from "vitest";
import {
  KVStore,
  SaveManager,
  SAVE_KEY,
  parseSave,
  serializeSave,
  defaultSave,
  LATEST_SCHEMA,
} from "../src/progress/save.ts";

function memStore(): KVStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

describe("存档 · 解析与迁移", () => {
  it("空存储 → 默认档", () => {
    const m = new SaveManager(memStore(), "2026-07-07T00:00:00Z");
    expect(m.data.schema).toBe(LATEST_SCHEMA);
    expect(m.data.climberLevel).toBe(5);
    expect(m.data.createdAt).toBe("2026-07-07T00:00:00Z");
  });

  it("序列化往返无损", () => {
    const save = defaultSave("t");
    save.progress["v1"] = {
      bestMoves: 7,
      bestTimeMs: 61500,
      stars: { topped: true, flow: true, speed: false },
      wins: 3,
      attempts: 9,
    };
    expect(parseSave(serializeSave(save))).toEqual(save);
  });

  it("v1 旧档迁移到 v2：简化星数 → 三星分项（保守只保登顶）", () => {
    const v1 = JSON.stringify({
      schema: 1,
      createdAt: "t",
      climberLevel: 7,
      settings: { muted: true },
      progress: {
        v1: { bestMoves: 6, bestTimeMs: 50000, stars: 3, wins: 2, attempts: 5 },
        v2: { bestMoves: null, bestTimeMs: null, stars: 0, wins: 0, attempts: 3 },
      },
    });
    const migrated = parseSave(v1)!;
    expect(migrated.schema).toBe(2);
    expect(migrated.climberLevel).toBe(7); // 其余字段原样
    expect(migrated.characterId).toBe("climber");
    expect(migrated.progress["v1"].stars).toEqual({ topped: true, flow: false, speed: false });
    expect(migrated.progress["v2"].stars).toEqual({ topped: false, flow: false, speed: false });
    expect(migrated.progress["v1"].bestMoves).toBe(6);
  });

  it("损坏 JSON / 错误结构 / 未来 schema → null（不炸不吞档）", () => {
    expect(parseSave("not json{")).toBeNull();
    expect(parseSave("42")).toBeNull();
    expect(parseSave(JSON.stringify({ schema: 999 }))).toBeNull();
    expect(parseSave(JSON.stringify({ schema: 1, climberLevel: "x" }))).toBeNull();
    expect(parseSave(null)).toBeNull();
  });
});

describe("存档 · SaveManager", () => {
  it("完攀滚动保留各维度历史最佳，三星分项并集", () => {
    const store = memStore();
    const m = new SaveManager(store);
    m.recordWin("v1", 8, 90000, { topped: true, flow: true, speed: false }); // 慢但干净
    m.recordWin("v1", 12, 45000, { topped: true, flow: false, speed: true }); // 快但拖沓
    const p = m.data.progress["v1"];
    expect(p.bestMoves).toBe(8);
    expect(p.bestTimeMs).toBe(45000);
    expect(p.stars).toEqual({ topped: true, flow: true, speed: true }); // 并集 = 3 星
    expect(p.wins).toBe(2);
    // 已落盘：新管理器读同一 store 还原一致
    expect(new SaveManager(store).data.progress["v1"]).toEqual(p);
  });

  it("attempts 独立累计", () => {
    const m = new SaveManager(memStore());
    m.recordAttempt("v2");
    m.recordAttempt("v2");
    expect(m.data.progress["v2"].attempts).toBe(2);
    expect(m.data.progress["v2"].wins).toBe(0);
  });

  it("导出/导入：非法导入不破坏现有档", () => {
    const m = new SaveManager(memStore());
    m.recordWin("v1", 5, 30000, { topped: true, flow: true, speed: true });
    const backup = m.export();
    expect(m.import("garbage")).toBe(false);
    expect(m.data.progress["v1"].stars.flow).toBe(true); // 原档完好
    const fresh = new SaveManager(memStore());
    expect(fresh.import(backup)).toBe(true);
    expect(fresh.data.progress["v1"].bestMoves).toBe(5);
  });

  it("设置项持久化", () => {
    const store = memStore();
    const m = new SaveManager(store);
    m.setMuted(true);
    m.setClimberLevel(8);
    const again = new SaveManager(store);
    expect(again.data.settings.muted).toBe(true);
    expect(again.data.climberLevel).toBe(8);
    expect(store.map.has(SAVE_KEY)).toBe(true);
  });

  it("测试模式开关持久化，且可选字段往返无损（老档缺省为关）", () => {
    const store = memStore();
    const m = new SaveManager(store);
    expect(m.data.settings.testMode).toBeUndefined(); // 默认档：缺省
    m.setTestMode(true);
    // 落盘并被新管理器还原
    const again = new SaveManager(store);
    expect(again.data.settings.testMode).toBe(true);
    expect(again.data.settings.muted).toBe(false); // 不误伤其它设置
    again.setTestMode(false);
    expect(new SaveManager(store).data.settings.testMode).toBe(false);
    // 缺省 testMode 的档仍能解析（可选字段前向兼容）
    const legacy = parseSave(
      JSON.stringify({ ...defaultSave("t"), settings: { muted: true } }),
    )!;
    expect(legacy).not.toBeNull();
    expect(legacy.settings.testMode).toBeUndefined();
  });
});
