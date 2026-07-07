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
    save.progress["v1"] = { bestMoves: 7, bestTimeMs: 61500, stars: 2, wins: 3, attempts: 9 };
    expect(parseSave(serializeSave(save))).toEqual(save);
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
  it("完攀滚动保留各维度历史最佳", () => {
    const store = memStore();
    const m = new SaveManager(store);
    m.recordWin("v1", 8, 90000, 1);
    m.recordWin("v1", 12, 45000, 3); // 抓取更差/用时更好/星更高
    const p = m.data.progress["v1"];
    expect(p.bestMoves).toBe(8);
    expect(p.bestTimeMs).toBe(45000);
    expect(p.stars).toBe(3);
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
    m.recordWin("v1", 5, 30000, 3);
    const backup = m.export();
    expect(m.import("garbage")).toBe(false);
    expect(m.data.progress["v1"].stars).toBe(3); // 原档完好
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
});
