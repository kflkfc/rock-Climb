// 关卡编辑器（GDD 模块 26 · 内部工具，不随游戏包发布）。
// 摆点 → 属性调整 → ▶试玩（真实物理）→ 🧠求解定标（AI 试解器）→ 📤导出 JSON。
// 30+ 关内容生产的提效核心；V2.0 玩家 UGC 编辑器的前身。

import { LevelDef, HoldDef, wallAngleAtY } from "@kkc/core/level/levelSchema.ts";
import { HOLD_TYPES, HOLD_META, HoldMaterial, makeHold, Hold } from "@kkc/core/sim/holds.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { solveLevel } from "@kkc/core/solver/solver.ts";
import { Limb, LIMBS } from "@kkc/core/model/skeleton.ts";
import { v } from "@kkc/core/math/vec2.ts";
import { Camera } from "@kkc/app/render/camera.ts";
import { drawWall } from "@kkc/app/render/drawWall.ts";
import { drawHolds } from "@kkc/app/render/drawHolds.ts";
import { drawCharacter } from "@kkc/app/render/drawCharacter.ts";
import { drawStaminaRings } from "@kkc/app/render/drawStaminaRings.ts";
import { drawGripRing, ringLayout } from "@kkc/app/render/drawGripRing.ts";
import { drawHUD } from "@kkc/app/render/drawHUD.ts";
import { drawReach } from "@kkc/app/render/drawReach.ts";
import { PoseSmoother } from "@kkc/app/render/poseSmoother.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>("cv");
const ctx = cv.getContext("2d")!;

// ---- 草稿关卡 ----
let draft: LevelDef = {
  id: "draft-1",
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
let nextId = 1;
let selected: HoldDef | null = null;
let mode: "edit" | "play" = "edit";
let game: Game | null = null;
const smoother = new PoseSmoother();

// ---- 画布与摄像机 ----
function resize() {
  const stage = $("stage");
  const vw = stage.clientWidth - 20;
  const vh = stage.clientHeight - 20;
  const aspect = 9 / 16;
  let w = vh * aspect;
  let h = vh;
  if (w > vw) {
    w = vw;
    h = vw / aspect;
  }
  cv.style.width = w + "px";
  cv.style.height = h + "px";
  cv.width = Math.round(w * 1.5);
  cv.height = Math.round(h * 1.5);
  cam.resize(cv.width, cv.height);
}
const cam = new Camera(1, 1, draft);
window.addEventListener("resize", resize);

// ---- 编辑模式渲染桩：drawHolds 需要 Game 形状（读 holds/c.limbs/level）----
function editStub() {
  const holds = draft.holds.map(toHold);
  const limbs = {} as Record<Limb, { attached: boolean; hold: null; align: number }>;
  for (const l of LIMBS) limbs[l] = { attached: false, hold: null, align: 1 };
  return { holds, level: draft, c: { limbs } } as unknown as Game;
}
function toHold(h: HoldDef): Hold {
  return makeHold(h.id, h.type, v(h.x, h.y), {
    radius: h.radius,
    pullDir: h.pullDirDeg != null ? (h.pullDirDeg * Math.PI) / 180 : undefined,
    pullTol: h.pullTolDeg != null ? (h.pullTolDeg * Math.PI) / 180 : undefined,
    material: h.material,
    isGoal: h.goal,
    startLimb: h.start,
  });
}

// ---- 侧栏 ----
const typeSel = $<HTMLSelectElement>("holdType");
for (const t of HOLD_TYPES) {
  const o = document.createElement("option");
  o.value = t;
  o.textContent = HOLD_META[t].label;
  typeSel.appendChild(o);
}
const lvId = $<HTMLInputElement>("lvId");
const lvName = $<HTMLInputElement>("lvName");
const lvGrade = $<HTMLInputElement>("lvGrade");
const wallBase = $<HTMLInputElement>("wallBase");
const wallTop = $<HTMLInputElement>("wallTop");
function syncLevelForm() {
  lvId.value = draft.id;
  lvName.value = draft.name;
  lvGrade.value = draft.grade;
  wallBase.value = String(draft.wallAngleDeg);
  wallTop.value = draft.wallAngleTop != null ? String(draft.wallAngleTop) : "";
}
syncLevelForm();
lvId.oninput = () => (draft.id = lvId.value);
lvName.oninput = () => (draft.name = lvName.value.toUpperCase());
lvGrade.oninput = () => (draft.grade = lvGrade.value);
wallBase.oninput = () => (draft.wallAngleDeg = parseFloat(wallBase.value) || 90);
wallTop.oninput = () => {
  const n = parseFloat(wallTop.value);
  draft.wallAngleTop = Number.isFinite(n) ? n : undefined;
};

const selBox = $("sel");
const hRadius = $<HTMLInputElement>("hRadius");
const hDir = $<HTMLInputElement>("hDir");
const hMat = $<HTMLSelectElement>("hMat");
const hStart = $<HTMLSelectElement>("hStart");
const hGoal = $<HTMLInputElement>("hGoal");
function syncSel() {
  if (!selected) {
    selBox.style.display = "none";
    return;
  }
  selBox.style.display = "block";
  $("selId").textContent = `${selected.id} (${selected.type})`;
  hRadius.value = String(selected.radius ?? HOLD_META[selected.type].radius);
  $("hRadiusV").textContent = hRadius.value;
  hDir.value = String(selected.pullDirDeg ?? HOLD_META[selected.type].defaultPullDirDeg);
  $("hDirV").textContent = hDir.value + "°";
  hMat.value = selected.material ?? "normal";
  hStart.value = selected.start ?? "";
  hGoal.checked = !!selected.goal;
}
hRadius.oninput = () => {
  if (selected) selected.radius = parseFloat(hRadius.value);
  $("hRadiusV").textContent = hRadius.value;
};
hDir.oninput = () => {
  if (selected) selected.pullDirDeg = parseFloat(hDir.value);
  $("hDirV").textContent = hDir.value + "°";
};
hMat.onchange = () => {
  if (selected) selected.material = hMat.value as HoldMaterial;
};
hStart.onchange = () => {
  if (!selected) return;
  const limb = hStart.value as Limb | "";
  if (limb) for (const h of draft.holds) if (h.start === limb) delete h.start; // 每肢唯一
  selected.start = limb || undefined;
  if (!limb) delete selected.start;
};
hGoal.onchange = () => {
  if (!selected) return;
  for (const h of draft.holds) delete h.goal; // 终点唯一
  if (hGoal.checked) {
    selected.goal = true;
    draft.goalHoldId = selected.id;
  }
};
$("delHold").onclick = deleteSelected;
function deleteSelected() {
  if (!selected) return;
  draft.holds = draft.holds.filter((h) => h !== selected);
  selected = null;
  syncSel();
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Delete" && mode === "edit") deleteSelected();
  if (e.key === "Escape" && mode === "play") exitPlay();
});

// ---- 画布交互 ----
let draggingHold: HoldDef | null = null;
function toWorldEvt(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return cam.toWorld(((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height);
}
function toScreenEvt(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return { sx: ((e.clientX - r.left) / r.width) * cv.width, sy: ((e.clientY - r.top) / r.height) * cv.height };
}

cv.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (mode === "play" && game) {
    const { sx, sy } = toScreenEvt(e);
    if (game.status === "ring" && game.ring) {
      for (const slot of ringLayout(cam, game.ring)) {
        if (Math.hypot(sx - slot.c.x, sy - slot.c.y) <= slot.r) return void game.chooseGrip(slot.opt);
      }
      return void game.cancelRing();
    }
    const w = toWorldEvt(e);
    if (game.beginDrag(w)) cv.setPointerCapture(e.pointerId);
    return;
  }
  // 编辑：命中已有点 → 选中拖动；空白 → 放置新点
  const w = toWorldEvt(e);
  const hit = draft.holds.find(
    (h) => Math.hypot(h.x - w.x, h.y - w.y) <= (h.radius ?? HOLD_META[h.type].radius) + 6,
  );
  if (hit) {
    selected = hit;
    draggingHold = hit;
    cv.setPointerCapture(e.pointerId);
  } else {
    const nh: HoldDef = { id: `h${nextId++}`, type: typeSel.value as HoldDef["type"], x: Math.round(w.x), y: Math.round(w.y) };
    while (draft.holds.some((h) => h.id === nh.id)) nh.id = `h${nextId++}`;
    draft.holds.push(nh);
    selected = nh;
  }
  syncSel();
});
cv.addEventListener("pointermove", (e) => {
  if (mode === "play" && game) {
    if (game.dragging) game.moveDrag(toWorldEvt(e));
    return;
  }
  if (draggingHold) {
    const w = toWorldEvt(e);
    draggingHold.x = Math.round(w.x);
    draggingHold.y = Math.round(w.y);
  }
});
const up = () => {
  if (mode === "play" && game) game.endDrag();
  draggingHold = null;
};
cv.addEventListener("pointerup", up);
cv.addEventListener("pointercancel", up);

// ---- 试玩 ----
$("play").onclick = () => (mode === "edit" ? enterPlay() : exitPlay());
function enterPlay() {
  const missing = LIMBS.filter((l) => !draft.holds.some((h) => h.start === l));
  if (missing.length) return alert(`缺起始肢端：${missing.join(" ")}（选中岩点→起始肢）`);
  if (!draft.holds.some((h) => h.goal)) return alert("缺终点（选中岩点→勾选终点）");
  game = new Game(JSON.parse(JSON.stringify(draft)));
  mode = "play";
  $("mode").textContent = "试玩中（Esc 返回编辑）";
  ($("play") as HTMLButtonElement).textContent = "⏹ 停止";
}
function exitPlay() {
  game = null;
  mode = "edit";
  $("mode").textContent = "编辑模式";
  ($("play") as HTMLButtonElement).textContent = "▶ 试玩";
}

// ---- 求解定标 ----
$("solve").onclick = () => {
  const out = $("solveOut");
  const t0 = performance.now();
  const r = solveLevel(draft);
  const ms = (performance.now() - t0).toFixed(0);
  if (!r.solvable) {
    out.textContent = `❌ 不可解（展开 ${r.nodesExpanded} 节点，${ms}ms）\n检查：点距/可用肢端/平衡`;
    return;
  }
  draft.stars = r.targets; // 一键定标写回草稿
  draft.starThreshold = r.targets.targetMoves;
  out.textContent =
    `✅ 可解  最优 ${r.minMoves} 步（${ms}ms）\n` +
    `已写回：流畅≤${r.targets.targetMoves} 步 · 神速≤${r.targets.targetTimeSec}s\n` +
    `特征：minMatch ${r.features.minMatch.toFixed(2)} · 甩跳×${r.features.dynoCount} · 最陡 ${r.features.maxWallAngle}°\n` +
    `路径：${r.path.map((s) => `${s.limb}→${s.holdId}${s.dyno ? "🚀" : ""}`).join(" ")}`;
};

// ---- 导入导出 ----
const io = $<HTMLTextAreaElement>("io");
$("export").onclick = () => {
  io.value = JSON.stringify(draft, null, 2);
  io.select();
};
$("import").onclick = () => {
  try {
    const d = JSON.parse(io.value) as LevelDef;
    if (!d.holds || !d.worldWidth) throw new Error("不是 LevelDef");
    draft = d;
    selected = null;
    cam.setLevel(draft);
    syncLevelForm();
    syncSel();
  } catch (err) {
    alert("导入失败：" + err);
  }
};

// ---- 渲染循环 ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, cv.width, cv.height);

  if (mode === "play" && game) {
    game.update(1 / 60);
    const pose = smoother.update(game, dt);
    cam.follow(pose.com.x, pose.com.y, dt);
    cam.followAngle(wallAngleAtY(game.level, pose.com.y), dt);
    drawWall(ctx, cam, game.level);
    drawHolds(ctx, cam, game);
    drawReach(ctx, cam, game);
    drawCharacter(ctx, cam, pose, game);
    drawStaminaRings(ctx, cam, game, pose);
    drawGripRing(ctx, cam, game);
    drawHUD(ctx, cam, game);
  } else {
    const stub = editStub();
    drawWall(ctx, cam, draft);
    drawHolds(ctx, cam, stub);
    // 起始肢端标记 + 选中高亮
    for (const h of draft.holds) {
      const s = cam.toScreen({ x: h.x, y: h.y });
      if (h.start) {
        ctx.fillStyle = "#2B3933";
        ctx.font = "700 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(h.start, s.x, s.y - (h.radius ?? 16) * cam.scale - 8);
      }
      if (selected === h) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, ((h.radius ?? HOLD_META[h.type].radius) + 6) * cam.scale, 0, Math.PI * 2);
        ctx.strokeStyle = "#D64A47";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  requestAnimationFrame(frame);
}
// 测试钩子（Playwright 驱动验证用）
(window as unknown as Record<string, unknown>).__editor = {
  getDraft: () => draft,
  setDraft: (d: LevelDef) => {
    draft = d;
    selected = null;
    cam.setLevel(draft);
    syncLevelForm();
    syncSel();
  },
  getGame: () => game,
  mode: () => mode,
};

resize();
cam.setLevel(draft);
requestAnimationFrame(frame);
