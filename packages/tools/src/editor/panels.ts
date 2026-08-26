// 侧栏面板：把 DOM 控件绑到 EditorState 上。
// 单向数据流：控件 → state 的方法 → commit → onChange → syncAll() 重刷控件。
// 正在输入的控件不回刷（否则光标乱跳）。

import { HoldDef } from "@kkc/core/level/levelSchema.ts";
import {
  HOLD_TYPES,
  HOLD_META,
  HOLD_COLOR,
  MOVE_META,
  HoldType,
  HoldMaterial,
} from "@kkc/core/sim/holds.ts";
import { classifyMove } from "@kkc/core/sim/grip.ts";
import { Limb } from "@kkc/core/model/skeleton.ts";
import { solveLevel } from "@kkc/core/solver/solver.ts";
import { EditorState } from "./state.ts";
import { validateDraft, Issue } from "./validate.ts";
import { generateLevelTs } from "./codegen.ts";
import { looksLikeLevel, DraftDoc } from "./draft.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const deg = (rad: number) => Math.round((rad * 180) / Math.PI);

/** 常用定线色（岩馆按颜色定线的那套）+ 12 种类型默认色 */
const ROUTE_COLORS = [
  "#D64A47", "#E5A636", "#E8D44D", "#5F9A6A", "#4A7A9C",
  "#6B4A8C", "#E07FA8", "#C96A2F", "#F5EBD3", "#2B2B2B",
];

export interface PanelHooks {
  focusHold(id: string): void;
  isPlaying(): boolean;
  togglePlay(): void;
  restartPlay(): void;
}

export function bindPanels(S: EditorState, hooks: PanelHooks) {
  // 正在编辑的控件不回刷，避免打断输入
  const setVal = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
    if (document.activeElement !== el) el.value = v;
  };

  // ---------- 静态下拉填充 ----------
  for (const sel of [$<HTMLSelectElement>("holdType"), $<HTMLSelectElement>("hType")]) {
    for (const t of HOLD_TYPES) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = HOLD_META[t].label;
      sel.appendChild(o);
    }
  }
  const swatches = $("swatches");
  for (const c of [...ROUTE_COLORS, ...HOLD_TYPES.map((t) => HOLD_COLOR[t])]) {
    const i = document.createElement("i");
    i.style.background = c;
    i.title = c;
    i.onclick = () => S.updateSelected((h) => (h.color = c));
    swatches.appendChild(i);
  }

  // ---------- 草稿库 ----------
  const draftList = $<HTMLSelectElement>("draftList");
  draftList.onchange = () => S.openDraft(draftList.value);
  $("draftNew").onclick = () => S.newDraft();
  $("draftDup").onclick = () => S.duplicateDraft();
  $("draftDel").onclick = () => {
    if (!confirm(`删除草稿「${S.level.id}」？不可撤销。`)) return;
    const id = S.level.id;
    S.store.remove(id);
    const next = S.store.ids()[0];
    if (next) S.openDraft(next);
    else S.newDraft();
  };

  // ---------- 关卡字段 ----------
  const lvId = $<HTMLInputElement>("lvId");
  const lvName = $<HTMLInputElement>("lvName");
  const lvGrade = $<HTMLInputElement>("lvGrade");
  const lvW = $<HTMLInputElement>("lvW");
  const lvH = $<HTMLInputElement>("lvH");
  const lvHue = $<HTMLInputElement>("lvHue");
  const lvHint = $<HTMLInputElement>("lvHint");
  const lvMoves = $<HTMLInputElement>("lvMoves");
  const lvStar = $<HTMLInputElement>("lvStar");

  lvId.onchange = () => S.renameLevel(lvId.value.trim());
  lvName.oninput = () => {
    S.level.name = lvName.value.toUpperCase();
    S.commit();
  };
  lvGrade.oninput = () => {
    S.level.grade = lvGrade.value;
    S.commit();
  };
  const numIn = (el: HTMLInputElement, apply: (n: number) => void) => {
    el.oninput = () => {
      const n = parseFloat(el.value);
      if (Number.isFinite(n)) {
        apply(n);
        S.commit();
      }
    };
  };
  numIn(lvW, (n) => (S.level.worldWidth = n));
  numIn(lvH, (n) => (S.level.worldHeight = n));
  numIn(lvStar, (n) => (S.level.starThreshold = n));
  lvHue.oninput = () => {
    S.level.wallHue = parseFloat(lvHue.value);
    $("lvHueV").textContent = lvHue.value;
    S.commit();
  };
  lvHint.oninput = () => {
    const t = lvHint.value.trim();
    if (t) S.level.hint = t;
    else delete S.level.hint;
    S.commit();
  };
  lvMoves.oninput = () => {
    const n = parseInt(lvMoves.value, 10);
    if (Number.isFinite(n) && n > 0) S.level.rules = { maxMovesPerLimb: n };
    else delete S.level.rules;
    S.commit();
  };

  // ---------- 墙角 ----------
  const wallMode = $<HTMLSelectElement>("wallMode");
  const wallBase = $<HTMLInputElement>("wallBase");
  const wallTop = $<HTMLInputElement>("wallTop");
  wallMode.onchange = () => {
    if (wallMode.value === "segments") S.enableSegments();
    else S.disableSegments();
  };
  numIn(wallBase, (n) => (S.level.wallAngleDeg = n));
  wallTop.oninput = () => {
    const n = parseFloat(wallTop.value);
    if (Number.isFinite(n)) S.level.wallAngleTop = n;
    else delete S.level.wallAngleTop;
    S.commit();
  };

  const segList = $("segList");
  function renderSegs() {
    const segs = S.segments ?? [];
    segList.textContent = "";
    // 自顶向下显示（读起来和墙一致：上面的段在上面）
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      const row = document.createElement("div");
      row.className = "seg";
      const label = document.createElement("span");
      label.style.cssText = "width:74px;opacity:.75;font-size:11px";
      label.textContent = `y ${s.yTop}~${s.yBottom}`;
      const rng = document.createElement("input");
      rng.type = "range";
      rng.min = "40";
      rng.max = "180";
      rng.step = "1";
      rng.value = String(s.angleDeg);
      const val = document.createElement("span");
      val.style.cssText = "width:38px;text-align:right";
      val.textContent = `${s.angleDeg}°`;
      rng.oninput = () => {
        s.angleDeg = parseFloat(rng.value);
        val.textContent = `${s.angleDeg}°`;
        label.textContent = `y ${s.yTop}~${s.yBottom}`;
        S.commit();
      };
      const split = document.createElement("button");
      split.textContent = "✂";
      split.title = "在本段中间切一刀";
      split.onclick = () => S.splitSegment(i);
      const del = document.createElement("button");
      del.textContent = "🗑";
      del.title = "删除本段（高度并给邻段）";
      del.disabled = segs.length <= 1;
      del.onclick = () => S.removeSegment(i);
      row.append(label, rng, val, split, del);
      segList.appendChild(row);
    }
  }

  // ---------- 岩点工具 ----------
  const snapStep = $<HTMLSelectElement>("snapStep");
  const showReach = $<HTMLInputElement>("showReach");
  snapStep.onchange = () => (S.snapStep = parseInt(snapStep.value, 10) || 0);
  showReach.onchange = () => {
    S.showReach = showReach.checked;
    S.touch();
  };
  $("mirrorAll").onclick = () => S.mirrorAll();

  const hType = $<HTMLSelectElement>("hType");
  const hColor = $<HTMLInputElement>("hColor");
  const hRadius = $<HTMLInputElement>("hRadius");
  const hDir = $<HTMLInputElement>("hDir");
  const hTol = $<HTMLInputElement>("hTol");
  const hMat = $<HTMLSelectElement>("hMat");
  const hVol = $<HTMLSelectElement>("hVol");
  const hStart = $<HTMLSelectElement>("hStart");
  const hGoal = $<HTMLInputElement>("hGoal");

  hType.onchange = () =>
    S.updateSelected((h) => {
      const oldM = HOLD_META[h.type];
      const t = hType.value as HoldType;
      // 半径/朝向若还是旧类型的默认值，就跟着换成新类型的默认值
      if (h.radius == null || h.radius === oldM.radius) delete h.radius;
      if (h.pullDirDeg == null || h.pullDirDeg === oldM.defaultPullDirDeg) delete h.pullDirDeg;
      if (h.pullTolDeg == null || Math.abs(h.pullTolDeg - deg(oldM.pullTol)) < 0.6) delete h.pullTolDeg;
      h.type = t;
    });
  hColor.oninput = () => S.updateSelected((h) => (h.color = hColor.value));
  $("hColorClear").onclick = () => S.updateSelected((h) => delete h.color);
  hRadius.oninput = () => {
    $("hRadiusV").textContent = hRadius.value;
    S.updateSelected((h) => (h.radius = parseFloat(hRadius.value)));
  };
  hDir.oninput = () => {
    $("hDirV").textContent = hDir.value + "°";
    S.updateSelected((h) => (h.pullDirDeg = parseFloat(hDir.value)));
  };
  hTol.oninput = () => {
    $("hTolV").textContent = "±" + hTol.value + "°";
    S.updateSelected((h) => (h.pullTolDeg = parseFloat(hTol.value)));
  };
  hMat.onchange = () =>
    S.updateSelected((h) => {
      const m = hMat.value as HoldMaterial;
      if (m === "normal") delete h.material;
      else h.material = m;
    });
  hVol.onchange = () =>
    S.updateSelected((h) => {
      if (hVol.value) h.onVolume = hVol.value;
      else delete h.onVolume;
    });
  hStart.onchange = () => {
    const h = S.selectedHolds()[0];
    if (h) S.setStart(h, (hStart.value || null) as Limb | null);
  };
  hGoal.onchange = () => {
    const h = S.selectedHolds()[0];
    if (h) S.setGoal(h, hGoal.checked);
  };
  $("delHold").onclick = () => S.deleteSelected();

  // ---------- 校验 ----------
  const issuesBox = $("issues");
  function renderIssues() {
    const issues = validateDraft(S.level);
    issuesBox.textContent = "";
    if (issues.length === 0) {
      const d = document.createElement("div");
      d.className = "ok";
      d.textContent = "✓ 没有发现问题";
      issuesBox.appendChild(d);
      return;
    }
    const order = (i: Issue) => (i.level === "error" ? 0 : 1);
    for (const it of [...issues].sort((a, b) => order(a) - order(b))) {
      const d = document.createElement("div");
      d.className = `i ${it.level === "error" ? "err" : "warn"}`;
      d.textContent = `${it.level === "error" ? "✗" : "⚠"} ${it.msg}`;
      if (it.holdId)
        d.onclick = () => {
          S.selection = new Set([it.holdId!]);
          hooks.focusHold(it.holdId!);
          S.touch();
        };
      issuesBox.appendChild(d);
    }
  }

  // ---------- 操作 ----------
  $("play").onclick = () => hooks.togglePlay();
  $("solve").onclick = () => {
    const out = $("solveOut");
    out.textContent = "求解中…";
    // 让"求解中"先绘出来再跑（solveLevel 是同步的重活）
    setTimeout(() => {
      const lines: string[] = [];
      let best: ReturnType<typeof solveLevel> | null = null;
      let minLv: number | null = null;
      for (const lv of [1, 5, 10]) {
        const t0 = performance.now();
        const r = solveLevel(S.level, { climberLevel: lv });
        const ms = (performance.now() - t0).toFixed(0);
        lines.push(
          r.solvable
            ? `Lv${lv}: ✅ 最优 ${r.minMoves} 步（${ms}ms）`
            : `Lv${lv}: ❌ 不可解（展开 ${r.nodesExpanded} 节点，${ms}ms）`,
        );
        if (r.solvable && minLv == null) minLv = lv;
        if (r.solvable && lv === 10) best = r;
        if (r.solvable && !best) best = r;
      }
      if (!best) {
        out.textContent = lines.join("\n") + "\n检查：点距 / 可用肢端 / 平衡 / 校验清单";
        return;
      }
      S.level.stars = best.targets;
      S.level.starThreshold = best.targets.targetMoves;
      S.commit();
      out.textContent =
        lines.join("\n") +
        `\n最低可通关等级：Lv${minLv}\n` +
        `已写回：流畅≤${best.targets.targetMoves} 步 · 神速≤${best.targets.targetTimeSec}s\n` +
        `特征：minMatch ${best.features.minMatch.toFixed(2)} · 甩跳×${best.features.dynoCount} · 最陡 ${best.features.maxWallAngle}°\n` +
        `路径：${best.path.map((s) => `${s.limb}→${s.holdId}${s.dyno ? "🚀" : ""}`).join(" ")}`;
    }, 20);
  };

  // ---------- 保存 ----------
  const io = $<HTMLTextAreaElement>("io");
  const download = (name: string, text: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $("dlJson").onclick = () => {
    S.saveNow();
    download(`${S.level.id}.kkc.json`, JSON.stringify(S.doc, null, 2), "application/json");
  };
  const fileJson = $<HTMLInputElement>("fileJson");
  $("upJson").onclick = () => fileJson.click();
  fileJson.onchange = async () => {
    const f = fileJson.files?.[0];
    fileJson.value = ""; // 允许重复导入同一文件
    if (!f) return;
    try {
      importDoc(JSON.parse(await f.text()));
    } catch (e) {
      alert("导入失败：" + e);
    }
  };
  function importDoc(raw: unknown) {
    const o = raw as Partial<DraftDoc> & { holds?: unknown };
    // 兼容两种：完整 DraftDoc，或裸的 LevelDef
    const doc: DraftDoc = looksLikeLevel(o)
      ? { level: o, seq: [], updatedAt: Date.now() }
      : looksLikeLevel(o.level)
        ? { level: o.level, seq: (o.seq as DraftDoc["seq"]) ?? [], updatedAt: Date.now() }
        : (() => {
            throw new Error("不是 LevelDef / 草稿文件");
          })();
    S.setDoc(doc);
    S.saveNow();
  }
  $("exportText").onclick = () => {
    io.value = JSON.stringify(S.doc, null, 2);
    io.select();
  };
  $("importText").onclick = () => {
    try {
      importDoc(JSON.parse(io.value));
    } catch (e) {
      alert("导入失败：" + e);
    }
  };
  $("genTs").onclick = () => {
    io.value = generateLevelTs(S.level, { seq: S.doc.seq });
    io.select();
  };
  $("copyIo").onclick = () => {
    io.select();
    void navigator.clipboard?.writeText(io.value);
  };

  // ---------- 全量回刷 ----------
  function syncAll() {
    // 草稿列表
    const ids = S.store.ids();
    if (!ids.includes(S.level.id)) ids.unshift(S.level.id);
    draftList.textContent = "";
    for (const id of ids) {
      const o = document.createElement("option");
      o.value = id;
      const d = S.store.get(id);
      o.textContent = `${id}${d ? `  ·  ${d.level.name}` : ""}`;
      draftList.appendChild(o);
    }
    draftList.value = S.level.id;

    const L = S.level;
    setVal(lvId, L.id);
    setVal(lvName, L.name);
    setVal(lvGrade, L.grade);
    setVal(lvW, String(L.worldWidth));
    setVal(lvH, String(L.worldHeight));
    setVal(lvHue, String(L.wallHue ?? 43));
    $("lvHueV").textContent = String(L.wallHue ?? 43);
    setVal(lvHint, L.hint ?? "");
    setVal(lvMoves, L.rules?.maxMovesPerLimb != null ? String(L.rules.maxMovesPerLimb) : "");
    setVal(lvStar, String(L.starThreshold));

    const segMode = !!L.wallSegments?.length;
    setVal(wallMode, segMode ? "segments" : "simple");
    $("wallSimple").style.display = segMode ? "none" : "block";
    $("wallSeg").style.display = segMode ? "block" : "none";
    setVal(wallBase, String(L.wallAngleDeg));
    setVal(wallTop, L.wallAngleTop != null ? String(L.wallAngleTop) : "");
    if (segMode) renderSegs();

    setVal(snapStep, String(S.snapStep));
    showReach.checked = S.showReach;

    // 体积块下拉（内容随岩点变化）
    hVol.textContent = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "无";
    hVol.appendChild(none);
    for (const v of L.holds.filter((h) => h.type === "volume")) {
      const o = document.createElement("option");
      o.value = v.id;
      o.textContent = v.id;
      hVol.appendChild(o);
    }

    // 选中岩点
    const sel = S.selectedHolds();
    $("sel").style.display = sel.length ? "block" : "none";
    if (sel.length) {
      const h: HoldDef = sel[0];
      const m = HOLD_META[h.type];
      $("selId").textContent = sel.length > 1 ? `${sel.length} 个点（改动应用到全部）` : `${h.id}`;
      setVal(hType, h.type);
      hColor.value = h.color ?? HOLD_COLOR[h.type];
      setVal(hRadius, String(h.radius ?? m.radius));
      $("hRadiusV").textContent = String(h.radius ?? m.radius);
      setVal(hDir, String(h.pullDirDeg ?? m.defaultPullDirDeg));
      $("hDirV").textContent = `${h.pullDirDeg ?? m.defaultPullDirDeg}°`;
      const tol = h.pullTolDeg ?? deg(m.pullTol);
      setVal(hTol, String(tol));
      $("hTolV").textContent = `±${Math.round(tol)}°`;
      // 派生动作预览：动作不是岩点属性，是"朝向 × 身体位置 × 哪只手"的结果。
      // 这里按最常见的假设（身体在点的正下方）给出左右手各会被判成什么。
      {
        const dir = ((h.pullDirDeg ?? m.defaultPullDirDeg) * Math.PI) / 180;
        const wallDown = Math.PI / 2; // 直壁基准（分段墙上略有偏移，不影响档位判断）
        const l = MOVE_META[classifyMove(dir, wallDown, true)].label;
        const r = MOVE_META[classifyMove(dir, wallDown, false)].label;
        $("moveHint").textContent =
          l === r ? `动作：【${l}】` : `动作：往身上拉=【${l}】，往外撑=【${r}】（看身位）`;
      }
      setVal(hMat, h.material ?? "normal");
      setVal(hVol, h.onVolume ?? "");
      setVal(hStart, h.start ?? "");
      hGoal.checked = !!h.goal;
      // 起始肢/终点是唯一属性，多选时不给改
      hStart.disabled = sel.length > 1;
      hGoal.disabled = sel.length > 1;
    }

    renderIssues();
    ($("play") as HTMLButtonElement).textContent = hooks.isPlaying() ? "⏹ 停止试玩" : "▶ 试玩";
  }

  S.onChange(syncAll);
  syncAll();
  return { syncAll };
}
