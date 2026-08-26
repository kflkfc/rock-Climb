import { describe, it, expect } from "vitest";
import {
  DraftStore,
  History,
  MemoryStore,
  blankDoc,
  blankLevel,
  cloneDoc,
  looksLikeLevel,
} from "../src/editor/draft.ts";

describe("撤销栈", () => {
  it("commit / undo / redo 基本流", () => {
    const h = new History<{ n: number }>();
    h.reset({ n: 0 });
    expect(h.canUndo).toBe(false);
    h.commit({ n: 1 });
    h.commit({ n: 2 });
    expect(h.undo()).toEqual({ n: 1 });
    expect(h.undo()).toEqual({ n: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ n: 1 });
    expect(h.redo()).toEqual({ n: 2 });
    expect(h.canRedo).toBe(false);
  });

  it("无变化的 commit 不入栈（拖动时每帧提交也不会撑爆）", () => {
    const h = new History<{ n: number }>();
    h.reset({ n: 0 });
    for (let i = 0; i < 50; i++) h.commit({ n: 0 });
    expect(h.canUndo).toBe(false);
  });

  it("新提交清空 redo 分支", () => {
    const h = new History<{ n: number }>();
    h.reset({ n: 0 });
    h.commit({ n: 1 });
    h.undo();
    expect(h.canRedo).toBe(true);
    h.commit({ n: 9 });
    expect(h.canRedo).toBe(false);
  });

  it("超过上限丢最旧的", () => {
    const h = new History<{ n: number }>(3);
    h.reset({ n: 0 });
    for (let i = 1; i <= 6; i++) h.commit({ n: i });
    let steps = 0;
    while (h.undo()) steps++;
    expect(steps).toBe(3);
  });

  it("快照隔离：改回来的对象不会被后续外部改动污染", () => {
    const h = new History<{ a: number[] }>();
    const s = { a: [1] };
    h.reset(s);
    h.commit({ a: [1, 2] });
    const back = h.undo()!;
    s.a.push(99);
    expect(back.a).toEqual([1]);
  });
});

describe("草稿库", () => {
  const mk = () => new DraftStore(new MemoryStore());

  it("存取与按更新时间排序", () => {
    const s = mk();
    s.put("a", blankDoc("a"));
    s.put("b", blankDoc("b"));
    expect(s.get("a")?.level.id).toBe("a");
    expect(s.ids()).toContain("a");
    expect(s.ids()).toContain("b");
    s.put("a", blankDoc("a")); // a 更近
    expect(s.ids()[0]).toBe("a");
  });

  it("改名：搬 key 并同步关卡 id；重名/源缺失时拒绝", () => {
    const s = mk();
    s.put("a", blankDoc("a"));
    s.put("b", blankDoc("b"));
    expect(s.rename("a", "b")).toBe(false); // 目标重名
    expect(s.rename("zzz", "c")).toBe(false); // 源不存在
    expect(s.rename("a", "c")).toBe(true);
    expect(s.get("a")).toBeNull();
    expect(s.get("c")?.level.id).toBe("c");
  });

  it("删除当前草稿会把 current 指向剩下的一份", () => {
    const s = mk();
    s.put("a", blankDoc("a"));
    s.put("b", blankDoc("b"));
    s.setCurrent("a");
    s.remove("a");
    expect(s.get("a")).toBeNull();
    expect(s.current()).toBe("b");
  });

  it("存储损坏不至于让编辑器打不开", () => {
    const kv = new MemoryStore();
    kv.setItem("kkc.editor.drafts", "{ 这不是 JSON");
    const s = new DraftStore(kv);
    expect(s.ids()).toEqual([]);
    s.put("a", blankDoc("a")); // 还能继续写
    expect(s.get("a")?.level.id).toBe("a");
  });

  it("序列化往返保持等价", () => {
    const s = mk();
    const doc = blankDoc("a");
    doc.seq = [["LH", "goal"]];
    s.put("a", doc);
    const back = s.get("a")!;
    expect(back.level).toEqual(doc.level);
    expect(back.seq).toEqual(doc.seq);
  });
});

describe("导入门槛", () => {
  it("looksLikeLevel 认得 LevelDef，挡得住乱七八糟的东西", () => {
    expect(looksLikeLevel(blankLevel("a"))).toBe(true);
    expect(looksLikeLevel(null)).toBe(false);
    expect(looksLikeLevel({ id: "a" })).toBe(false);
    expect(looksLikeLevel({ id: "a", holds: [], worldWidth: 1 })).toBe(false);
  });

  it("cloneDoc 是深拷贝", () => {
    const a = blankDoc("a");
    const b = cloneDoc(a);
    b.level.holds[0].x = -999;
    expect(a.level.holds[0].x).not.toBe(-999);
  });
});
