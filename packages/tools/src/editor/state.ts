// 编辑器状态中枢：草稿 + 选区 + 撤销栈 + 自动保存。
// 所有结构性改动都走这里的方法 → 一处 commit，撤销/自动保存/面板刷新自动跟上。

import { LevelDef, HoldDef, WallSegment } from "@kkc/core/level/levelSchema.ts";
import { HOLD_META, HoldType } from "@kkc/core/sim/holds.ts";
import { Limb } from "@kkc/core/model/skeleton.ts";
import { DraftDoc, DraftStore, History, blankDoc, cloneDoc, KVStore } from "./draft.ts";

export class EditorState {
  doc: DraftDoc;
  /** 选中岩点 id（支持多选） */
  selection = new Set<string>();
  /** 网格吸附步长；0 = 关闭 */
  snapStep = 0;
  /** 显示伸展圈叠加 */
  showReach = false;
  private history = new History<DraftDoc>(100);
  private listeners: (() => void)[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private clipboard: HoldDef[] = [];
  private nextId = 1;
  readonly store: DraftStore;

  constructor(kv: KVStore) {
    this.store = new DraftStore(kv);
    const cur = this.store.current();
    this.doc = (cur && this.store.get(cur)) || blankDoc(this.freshDraftId());
    this.store.setCurrent(this.doc.level.id);
    this.history.reset(this.doc);
    this.bumpNextId();
  }

  // ---- 订阅 ----
  onChange(fn: () => void) {
    this.listeners.push(fn);
  }
  private notify() {
    for (const f of this.listeners) f();
  }

  get level(): LevelDef {
    return this.doc.level;
  }

  /** 结构性改动收尾：入撤销栈 + 防抖自动保存 + 通知面板 */
  commit() {
    this.history.commit(this.doc);
    this.autosave();
    this.notify();
  }
  /** 仅刷新 UI（选区变化等，不进撤销栈） */
  touch() {
    this.notify();
  }

  private autosave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 800);
  }
  saveNow() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.store.put(this.doc.level.id, this.doc);
    this.store.setCurrent(this.doc.level.id);
  }

  undo() {
    const d = this.history.undo();
    if (!d) return;
    this.doc = d;
    this.pruneSelection();
    this.autosave();
    this.notify();
  }
  redo() {
    const d = this.history.redo();
    if (!d) return;
    this.doc = d;
    this.pruneSelection();
    this.autosave();
    this.notify();
  }
  get canUndo() {
    return this.history.canUndo;
  }
  get canRedo() {
    return this.history.canRedo;
  }

  // ---- 草稿库 ----
  freshDraftId(): string {
    const taken = new Set(this.store?.ids?.() ?? []);
    let i = 1;
    while (taken.has(`draft-${i}`)) i++;
    return `draft-${i}`;
  }
  openDraft(id: string) {
    const d = this.store.get(id);
    if (!d) return;
    this.saveNow();
    this.setDoc(d);
  }
  newDraft() {
    this.saveNow();
    this.setDoc(blankDoc(this.freshDraftId()));
    this.saveNow();
  }
  duplicateDraft() {
    const copy = cloneDoc(this.doc);
    copy.level = { ...copy.level, id: this.freshDraftId() };
    this.setDoc(copy);
    this.saveNow();
  }
  /** 导入/切换整份草稿：重置选区与撤销栈 */
  setDoc(doc: DraftDoc) {
    this.doc = cloneDoc(doc);
    this.doc.seq ??= [];
    this.selection.clear();
    this.history.reset(this.doc);
    this.bumpNextId();
    this.store.setCurrent(this.doc.level.id);
    this.notify();
  }
  renameLevel(newId: string) {
    const old = this.doc.level.id;
    if (!newId || newId === old) return;
    this.store.rename(old, newId);
    this.doc.level.id = newId;
    this.commit();
  }

  // ---- 岩点 ----
  private bumpNextId() {
    this.nextId = 1;
    for (const h of this.doc.level.holds) {
      const m = /^h(\d+)$/.exec(h.id);
      if (m) this.nextId = Math.max(this.nextId, parseInt(m[1], 10) + 1);
    }
  }
  private freshHoldId(): string {
    let id = `h${this.nextId++}`;
    while (this.doc.level.holds.some((h) => h.id === id)) id = `h${this.nextId++}`;
    return id;
  }
  snap(n: number): number {
    return this.snapStep > 0 ? Math.round(n / this.snapStep) * this.snapStep : Math.round(n);
  }
  holdById(id: string): HoldDef | undefined {
    return this.doc.level.holds.find((h) => h.id === id);
  }
  selectedHolds(): HoldDef[] {
    return this.doc.level.holds.filter((h) => this.selection.has(h.id));
  }
  private pruneSelection() {
    for (const id of [...this.selection]) if (!this.holdById(id)) this.selection.delete(id);
  }

  addHold(type: HoldType, x: number, y: number): HoldDef {
    const h: HoldDef = { id: this.freshHoldId(), type, x: this.snap(x), y: this.snap(y) };
    this.doc.level.holds.push(h);
    this.selection = new Set([h.id]);
    this.commit();
    return h;
  }
  deleteSelected() {
    if (this.selection.size === 0) return;
    this.doc.level.holds = this.doc.level.holds.filter((h) => !this.selection.has(h.id));
    this.selection.clear();
    this.commit();
  }
  /** 对全部选中点应用改动（属性面板的写入口） */
  updateSelected(fn: (h: HoldDef) => void) {
    const sel = this.selectedHolds();
    if (sel.length === 0) return;
    for (const h of sel) fn(h);
    this.commit();
  }
  copySelected() {
    this.clipboard = cloneDoc(this.selectedHolds());
  }
  paste(dx = 20, dy = 20) {
    if (this.clipboard.length === 0) return;
    const added: string[] = [];
    for (const c of this.clipboard) {
      const h: HoldDef = { ...cloneDoc(c), id: this.freshHoldId(), x: this.snap(c.x + dx), y: this.snap(c.y + dy) };
      delete h.start; // 起始肢/终点唯一，粘贴出来的副本不继承
      delete h.goal;
      this.doc.level.holds.push(h);
      added.push(h.id);
    }
    this.selection = new Set(added);
    this.commit();
  }
  /** 整关水平镜像：x 翻边，朝向的 x 分量同步取反（180° - dir） */
  mirrorAll() {
    const W = this.doc.level.worldWidth;
    for (const h of this.doc.level.holds) {
      h.x = Math.round(W - h.x);
      const dir = h.pullDirDeg ?? HOLD_META[h.type].defaultPullDirDeg;
      let m = 180 - dir;
      while (m > 180) m -= 360;
      while (m < -180) m += 360;
      h.pullDirDeg = Math.round(m);
    }
    this.commit();
  }
  /** 每肢起始点唯一 */
  setStart(h: HoldDef, limb: Limb | null) {
    for (const o of this.doc.level.holds) if (o.start === limb) delete o.start;
    if (limb) h.start = limb;
    else delete h.start;
    this.commit();
  }
  /** 终点唯一，并同步 goalHoldId */
  setGoal(h: HoldDef, on: boolean) {
    for (const o of this.doc.level.holds) delete o.goal;
    if (on) {
      h.goal = true;
      this.doc.level.goalHoldId = h.id;
    }
    this.commit();
  }

  // ---- 分段墙 ----
  get segments(): WallSegment[] | undefined {
    return this.doc.level.wallSegments;
  }
  /** 切到分段模式：用当前底/顶角起一段 */
  enableSegments() {
    if (this.doc.level.wallSegments?.length) return;
    this.doc.level.wallSegments = [
      { yTop: 0, yBottom: this.doc.level.worldHeight, angleDeg: this.doc.level.wallAngleDeg },
    ];
    this.commit();
  }
  disableSegments() {
    delete this.doc.level.wallSegments;
    this.commit();
  }
  /** 在第 i 段中点切一刀，分成两段（新段在上方） */
  splitSegment(i: number) {
    const segs = this.doc.level.wallSegments;
    if (!segs?.[i]) return;
    const s = segs[i];
    const mid = Math.round((s.yTop + s.yBottom) / 2);
    if (mid <= s.yTop + 10 || mid >= s.yBottom - 10) return; // 太薄切不动
    const upper: WallSegment = { yTop: s.yTop, yBottom: mid, angleDeg: s.angleDeg };
    s.yTop = mid;
    segs.splice(i + 1, 0, upper); // segs 从底到顶：新的上半段排在后面
    this.commit();
  }
  removeSegment(i: number) {
    const segs = this.doc.level.wallSegments;
    if (!segs || segs.length <= 1 || !segs[i]) return;
    const gone = segs[i];
    segs.splice(i, 1);
    // 把空出来的高度并给邻段，保持首尾相接
    if (segs[i]) segs[i].yBottom = gone.yBottom;
    else if (segs[i - 1]) segs[i - 1].yTop = gone.yTop;
    this.commit();
  }
  /** 拖动第 i 段与第 i+1 段之间的分界（segs[i].yTop === segs[i+1].yBottom） */
  moveBoundary(i: number, y: number) {
    const segs = this.doc.level.wallSegments;
    if (!segs?.[i] || !segs[i + 1]) return;
    const lo = segs[i + 1].yTop + 20; // 上段不能被压没
    const hi = segs[i].yBottom - 20;
    const yy = Math.round(Math.max(lo, Math.min(hi, y)));
    segs[i].yTop = yy;
    segs[i + 1].yBottom = yy;
  }
}
