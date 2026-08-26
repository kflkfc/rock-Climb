// 草稿模型：撤销/重做历史栈 + localStorage 多草稿库。
// 纯逻辑（Store 可注入 → 单测不依赖浏览器）。

import { LevelDef } from "@kkc/core/level/levelSchema.ts";
import { Limb } from "@kkc/core/model/skeleton.ts";

export interface DraftDoc {
  level: LevelDef;
  /** 试玩录制的参考攀爬序列（导出 LEVEL_SEQS 用；未录过则空） */
  seq: [Limb, string][];
  updatedAt: number;
}

/** localStorage 的最小接口（单测注入内存实现） */
export interface KVStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class MemoryStore implements KVStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const KEY_DRAFTS = "kkc.editor.drafts";
const KEY_CURRENT = "kkc.editor.current";

/** 新建空白草稿：四肢起始点 + 终点已就位，开局即可试玩 */
export function blankLevel(id: string): LevelDef {
  return {
    id,
    name: "DRAFT",
    grade: "V2",
    wallAngleDeg: 90,
    worldWidth: 720,
    worldHeight: 1000,
    goalHoldId: "goal",
    starThreshold: 8,
    holds: [
      { id: "s_lf", type: "jug", x: 330, y: 860, start: "LF" },
      { id: "s_rf", type: "jug", x: 390, y: 860, start: "RF" },
      { id: "s_lh", type: "jug", x: 330, y: 730, start: "LH" },
      { id: "s_rh", type: "jug", x: 390, y: 730, start: "RH" },
      { id: "goal", type: "jug", x: 360, y: 160, radius: 24, goal: true },
    ],
  };
}

export function blankDoc(id: string): DraftDoc {
  return { level: blankLevel(id), seq: [], updatedAt: Date.now() };
}

/** 结构化深拷贝（草稿是纯 JSON 数据，JSON 往返足够且顺带剔除 undefined 字段） */
export const cloneDoc = <T>(d: T): T => JSON.parse(JSON.stringify(d)) as T;

/** 是否长得像 LevelDef（导入时的最低门槛） */
export function looksLikeLevel(x: unknown): x is LevelDef {
  const l = x as LevelDef | null;
  return (
    !!l &&
    typeof l.id === "string" &&
    Array.isArray(l.holds) &&
    typeof l.worldWidth === "number" &&
    typeof l.worldHeight === "number"
  );
}

export class DraftStore {
  constructor(private store: KVStore) {}

  private read(): Record<string, DraftDoc> {
    try {
      const raw = this.store.getItem(KEY_DRAFTS);
      const o = raw ? JSON.parse(raw) : {};
      return o && typeof o === "object" ? (o as Record<string, DraftDoc>) : {};
    } catch {
      return {}; // 存档损坏不能让编辑器打不开
    }
  }
  private write(all: Record<string, DraftDoc>) {
    this.store.setItem(KEY_DRAFTS, JSON.stringify(all));
  }

  /** 全部草稿 id，最近编辑的在前 */
  ids(): string[] {
    const all = this.read();
    return Object.keys(all).sort((a, b) => (all[b]?.updatedAt ?? 0) - (all[a]?.updatedAt ?? 0));
  }
  get(id: string): DraftDoc | null {
    return this.read()[id] ?? null;
  }
  put(id: string, doc: DraftDoc) {
    const all = this.read();
    all[id] = { ...cloneDoc(doc), updatedAt: Date.now() };
    this.write(all);
  }
  remove(id: string) {
    const all = this.read();
    delete all[id];
    this.write(all);
    if (this.current() === id) this.setCurrent(this.ids()[0] ?? null);
  }
  /** 改 id（草稿 key 即关卡 id，两者保持一致） */
  rename(oldId: string, newId: string): boolean {
    if (oldId === newId) return true;
    const all = this.read();
    if (!all[oldId] || all[newId]) return false; // 源不存在 / 目标重名
    all[newId] = { ...all[oldId], level: { ...all[oldId].level, id: newId } };
    delete all[oldId];
    this.write(all);
    if (this.current() === oldId) this.setCurrent(newId);
    return true;
  }
  current(): string | null {
    return this.store.getItem(KEY_CURRENT);
  }
  setCurrent(id: string | null) {
    if (id == null) this.store.removeItem(KEY_CURRENT);
    else this.store.setItem(KEY_CURRENT, id);
  }
}

/**
 * 快照式撤销栈。存 JSON 字符串而非对象：天然深拷贝，且能用字符串相等
 * 跳过"没实际变化"的提交（拖动过程中每帧都调 commit 也不会撑爆栈）。
 */
export class History<T> {
  private past: string[] = [];
  private future: string[] = [];
  private cur = "";

  constructor(private limit = 100) {}

  reset(state: T) {
    this.cur = JSON.stringify(state);
    this.past = [];
    this.future = [];
  }
  /** 提交新状态；与当前无差异则忽略 */
  commit(state: T) {
    const s = JSON.stringify(state);
    if (s === this.cur) return;
    this.past.push(this.cur);
    if (this.past.length > this.limit) this.past.shift();
    this.cur = s;
    this.future = [];
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  undo(): T | null {
    const prev = this.past.pop();
    if (prev == null) return null;
    this.future.push(this.cur);
    this.cur = prev;
    return JSON.parse(prev) as T;
  }
  redo(): T | null {
    const next = this.future.pop();
    if (next == null) return null;
    this.past.push(this.cur);
    this.cur = next;
    return JSON.parse(next) as T;
  }
}
