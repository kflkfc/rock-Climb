// 关卡编辑器（GDD 模块 26 · 内部工具，不随游戏包发布）。
// 摆点 → 属性/墙角调整 → 校验 → ▶试玩(真实物理+诊断) → 🧠求解定标 → 保存/生成关卡 TS。
//
// 本文件只做装配：画布、相机、指针/键盘路由、渲染循环。
// 状态在 editor/state.ts，侧栏在 editor/panels.ts，试玩在 editor/playtest.ts。

import { LevelDef, HoldDef, wallAngleAtY, SEG_BLEND } from "@kkc/core/level/levelSchema.ts";
import { HOLD_META, HoldType, makeHold, Hold } from "@kkc/core/sim/holds.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { Limb, LIMBS, maxReachOf } from "@kkc/core/model/skeleton.ts";
import { bodyForLevel } from "@kkc/core/model/body.ts";
import { reachSlackOf } from "@kkc/core/sim/physics.ts";
import { tuning } from "@kkc/core/config/tuning.ts";
import { v, Vec2 } from "@kkc/core/math/vec2.ts";
import { Camera } from "@kkc/app/render/camera.ts";
import { drawWall } from "@kkc/app/render/drawWall.ts";
import { drawHolds } from "@kkc/app/render/drawHolds.ts";
import { drawCharacter } from "@kkc/app/render/drawCharacter.ts";
import { drawStaminaRings } from "@kkc/app/render/drawStaminaRings.ts";
import { drawGripRing, ringLayout } from "@kkc/app/render/drawGripRing.ts";
import { drawHUD } from "@kkc/app/render/drawHUD.ts";
import { drawReach } from "@kkc/app/render/drawReach.ts";
import { PoseSmoother } from "@kkc/app/render/poseSmoother.ts";
import { EditorState } from "./editor/state.ts";
import { EditorCamera } from "./editor/editorCam.ts";
import { bindPanels } from "./editor/panels.ts";
import { Playtest } from "./editor/playtest.ts";
import { DraftDoc } from "./editor/draft.ts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>("cv");
const ctx = cv.getContext("2d")!;

const S = new EditorState(localStorage);
const smoother = new PoseSmoother();

// ---- 画布与相机 ----
const editCam = new EditorCamera(1, 1, S.level);
const playCam = new Camera(1, 1, S.level); // 试玩用真相机：视野与真机一致
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
  editCam.resize(cv.width, cv.height);
  playCam.resize(cv.width, cv.height);
}
window.addEventListener("resize", resize);

// ---- 编辑模式渲染桩：drawHolds 需要 Game 形状（读 holds / c.limbs / level）----
function toHold(h: HoldDef): Hold {
  return makeHold(h.id, h.type, v(h.x, h.y), {
    radius: h.radius,
    pullDir: h.pullDirDeg != null ? (h.pullDirDeg * Math.PI) / 180 : undefined,
    pullTol: h.pullTolDeg != null ? (h.pullTolDeg * Math.PI) / 180 : undefined,
    material: h.material,
    color: h.color,
    onVolume: h.onVolume,
    isGoal: h.goal,
    startLimb: h.start,
  });
}
function editStub(): Game {
  const holds = S.level.holds.map(toHold);
  const limbs = {} as Record<Limb, { attached: boolean; hold: null; align: number }>;
  for (const l of LIMBS) limbs[l] = { attached: false, hold: null, align: 1 };
  return { holds, level: S.level, c: { limbs } } as unknown as Game;
}

// ---- 试玩 ----
const play = new Playtest(S, () => {
  if (play.active) playCam.setLevel(play.game!.level);
  S.touch();
});

// ---- 侧栏 ----
bindPanels(S, {
  focusHold: (id) => {
    const h = S.holdById(id);
    if (h) editCam.zoomAt(cv.width / 2, cv.height / 2, 1); // 保持缩放，把点带到中心
    if (h) {
      const s = editCam.toScreen({ x: h.x, y: h.y });
      editCam.panBy(cv.width / 2 - s.x, cv.height / 2 - s.y);
    }
  },
  isPlaying: () => play.active,
  togglePlay: () => (play.active ? play.exit() : play.enter()),
  restartPlay: () => play.restart(),
});
S.onChange(() => {
  if (!play.active) editCam.setLevel(S.level);
});

// ---- 指针交互 ----
type Drag =
  | { k: "none" }
  | { k: "pan"; sx: number; sy: number }
  // 拖动岩点：记起点与各点原位，按"原位 + 总位移"再吸附。
  // 若改成逐帧累加增量再吸附，小步位移会被反复吸回原格 → 开着网格就拖不动了。
  | { k: "holds"; from: Vec2; orig: Map<string, Vec2> }
  | { k: "marquee"; a: Vec2; b: Vec2 }
  | { k: "boundary"; i: number };
let drag: Drag = { k: "none" };
let spaceHeld = false;
let movedPx = 0;

const RULER_W = 26; // 左缘分段标尺宽（屏幕像素，画布内坐标系）

function evtScreen(e: PointerEvent) {
  const r = cv.getBoundingClientRect();
  return { sx: ((e.clientX - r.left) / r.width) * cv.width, sy: ((e.clientY - r.top) / r.height) * cv.height };
}
function evtWorld(e: PointerEvent): Vec2 {
  const { sx, sy } = evtScreen(e);
  return play.active ? playCam.toWorld(sx, sy) : editCam.toWorld(sx, sy);
}
const holdR = (h: HoldDef) => h.radius ?? HOLD_META[h.type].radius;
function hitHold(w: Vec2): HoldDef | undefined {
  // 后加的点在上层：倒序命中，符合"点到最上面那个"的直觉
  for (let i = S.level.holds.length - 1; i >= 0; i--) {
    const h = S.level.holds[i];
    if (Math.hypot(h.x - w.x, h.y - w.y) <= holdR(h) + 6) return h;
  }
  return undefined;
}
/** 命中分段标尺上的分界线 → 返回下段序号 i（分界在 segs[i].yTop === segs[i+1].yBottom） */
function hitBoundary(sx: number, sy: number): number | null {
  const segs = S.segments;
  if (!segs || sx > RULER_W + 12) return null;
  for (let i = 0; i < segs.length - 1; i++) {
    const y = editCam.toScreen({ x: 0, y: segs[i].yTop }).y;
    if (Math.abs(sy - y) < 7) return i;
  }
  return null;
}

cv.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  cv.setPointerCapture(e.pointerId);
  movedPx = 0;
  const { sx, sy } = evtScreen(e);

  if (play.active && play.game) {
    const g = play.game;
    if (g.status === "ring" && g.ring) {
      for (const slot of ringLayout(playCam, g.ring)) {
        if (Math.hypot(sx - slot.c.x, sy - slot.c.y) <= slot.r) return void g.chooseGrip(slot.opt);
      }
      return void g.cancelRing();
    }
    g.beginDrag(evtWorld(e));
    return;
  }

  // 平移：中键 / 空格 + 左键
  if (e.button === 1 || spaceHeld) {
    drag = { k: "pan", sx, sy };
    return;
  }
  const bi = hitBoundary(sx, sy);
  if (bi != null) {
    drag = { k: "boundary", i: bi };
    return;
  }
  const w = evtWorld(e);
  const hit = hitHold(w);
  if (hit) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (S.selection.has(hit.id)) S.selection.delete(hit.id);
      else S.selection.add(hit.id);
    } else if (!S.selection.has(hit.id)) {
      S.selection = new Set([hit.id]);
    }
    S.touch();
    drag = {
      k: "holds",
      from: w,
      orig: new Map(S.selectedHolds().map((h) => [h.id, { x: h.x, y: h.y }])),
    };
  } else {
    drag = { k: "marquee", a: w, b: w };
  }
});

cv.addEventListener("pointermove", (e) => {
  const { sx, sy } = evtScreen(e);
  if (play.active && play.game) {
    if (play.game.dragging) play.game.moveDrag(evtWorld(e));
    return;
  }
  const w = evtWorld(e);
  $("coord").textContent = coordText(w);
  movedPx += Math.abs(e.movementX) + Math.abs(e.movementY);
  switch (drag.k) {
    case "pan":
      editCam.panBy(sx - drag.sx, sy - drag.sy);
      drag.sx = sx;
      drag.sy = sy;
      break;
    case "boundary":
      S.moveBoundary(drag.i, w.y);
      S.touch();
      break;
    case "holds": {
      const dx = w.x - drag.from.x;
      const dy = w.y - drag.from.y;
      for (const h of S.selectedHolds()) {
        const o = drag.orig.get(h.id);
        if (!o) continue;
        h.x = S.snap(o.x + dx);
        h.y = S.snap(o.y + dy);
      }
      S.touch();
      break;
    }
    case "marquee":
      drag.b = w;
      break;
  }
});

const endDrag = (e: PointerEvent) => {
  if (play.active && play.game) {
    play.game.endDrag();
    return;
  }
  const d = drag;
  drag = { k: "none" };
  if (d.k === "holds" || d.k === "boundary") {
    S.commit(); // 拖动过程只 touch，松手才入撤销栈（一次拖动 = 一步撤销）
    return;
  }
  if (d.k === "marquee") {
    if (movedPx < 5) {
      // 空白处轻点 = 放新点
      const w = evtWorld(e);
      S.addHold($<HTMLSelectElement>("holdType").value as HoldType, w.x, w.y);
      return;
    }
    const x0 = Math.min(d.a.x, d.b.x);
    const x1 = Math.max(d.a.x, d.b.x);
    const y0 = Math.min(d.a.y, d.b.y);
    const y1 = Math.max(d.a.y, d.b.y);
    S.selection = new Set(
      S.level.holds.filter((h) => h.x >= x0 && h.x <= x1 && h.y >= y0 && h.y <= y1).map((h) => h.id),
    );
    S.touch();
  }
};
cv.addEventListener("pointerup", endDrag);
cv.addEventListener("pointercancel", endDrag);

cv.addEventListener(
  "wheel",
  (e) => {
    if (play.active) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * cv.width;
    const sy = ((e.clientY - r.top) / r.height) * cv.height;
    editCam.zoomAt(sx, sy, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  },
  { passive: false },
);

function coordText(w: Vec2): string {
  const parts = [`x ${Math.round(w.x)}  y ${Math.round(w.y)}   墙角 ${Math.round(wallAngleAtY(S.level, w.y))}°`];
  const sel = S.selectedHolds();
  if (sel.length === 2) {
    const d = Math.hypot(sel[0].x - sel[1].x, sel[0].y - sel[1].y);
    const body = bodyForLevel(10);
    const slack = reachSlackOf(body, tuning);
    const hr = maxReachOf(body, "LH") * slack;
    const fr = maxReachOf(body, "LF") * slack;
    const tag = d <= fr ? "脚可达" : d <= hr ? "手可达" : "超出伸展（需甩跳）";
    parts.push(`两点距 ${d.toFixed(0)}  → ${tag}（手 ${hr.toFixed(0)} / 脚 ${fr.toFixed(0)}）`);
  }
  return parts.join("\n");
}

// ---- 键盘 ----
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceHeld = true;
  const typing =
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement;
  if (e.key === "Escape" && play.active) return void play.exit();
  if (typing || play.active) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (e.shiftKey) S.redo();
    else S.undo();
  } else if (mod && e.key.toLowerCase() === "y") {
    e.preventDefault();
    S.redo();
  } else if (mod && e.key.toLowerCase() === "c") {
    S.copySelected();
  } else if (mod && e.key.toLowerCase() === "v") {
    S.paste();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    S.deleteSelected();
  } else if (e.key.toLowerCase() === "f") {
    editCam.fit();
  } else if (e.key.toLowerCase() === "g") {
    S.snapStep = S.snapStep ? 0 : 10;
    S.touch();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
});

// ---- 编辑态叠加层 ----
function wallLightness(a: number) {
  return 84 - ((a - 60) / 120) * 34; // 与 drawWall 同一直觉：越仰越暗
}
function drawSegRuler() {
  const segs = S.segments;
  if (!segs?.length) return;
  const hue = S.level.wallHue ?? 43;
  for (const s of segs) {
    const yTop = editCam.toScreen({ x: 0, y: s.yTop }).y;
    const yBot = editCam.toScreen({ x: 0, y: s.yBottom }).y;
    ctx.fillStyle = `hsl(${hue} 42% ${wallLightness(s.angleDeg)}%)`;
    ctx.fillRect(0, yTop, RULER_W, yBot - yTop);
    ctx.fillStyle = "#2B3933";
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const my = (yTop + yBot) / 2;
    if (yBot - yTop > 16) ctx.fillText(`${Math.round(s.angleDeg)}°`, RULER_W / 2, my);
  }
  // 分界线 + 过渡带（±SEG_BLEND 内墙角是混合值）
  for (let i = 0; i < segs.length - 1; i++) {
    const y = editCam.toScreen({ x: 0, y: segs[i].yTop }).y;
    const half = SEG_BLEND * editCam.scale;
    ctx.fillStyle = "rgba(214,74,71,0.16)";
    ctx.fillRect(0, y - half, cv.width, half * 2);
    ctx.strokeStyle = "#D64A47";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cv.width, y);
    ctx.stroke();
    ctx.fillStyle = "#D64A47";
    ctx.fillRect(0, y - 5, RULER_W, 10);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, RULER_W, cv.height - 1);
}

function drawEditOverlay() {
  // 关卡边界
  const a = editCam.toScreen({ x: 0, y: 0 });
  const b = editCam.toScreen({ x: S.level.worldWidth, y: S.level.worldHeight });
  ctx.strokeStyle = "rgba(43,57,51,0.5)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.setLineDash([]);

  const sel = S.selectedHolds();
  // 伸展圈：以选中点为圆心，手/脚各一圈
  if (S.showReach && sel.length) {
    const body = bodyForLevel(10);
    const slack = reachSlackOf(body, tuning);
    const c = editCam.toScreen({ x: sel[0].x, y: sel[0].y });
    for (const [limb, col] of [
      ["LH", "rgba(74,122,156,0.75)"],
      ["LF", "rgba(95,154,106,0.75)"],
    ] as [Limb, string][]) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, maxReachOf(body, limb) * slack * editCam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  for (const h of S.level.holds) {
    const s = editCam.toScreen({ x: h.x, y: h.y });
    if (h.start) {
      ctx.fillStyle = "#2B3933";
      ctx.font = "700 12px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(h.start, s.x, s.y - holdR(h) * editCam.scale - 8);
    }
    if (S.selection.has(h.id)) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, (holdR(h) + 6) * editCam.scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#D64A47";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (drag.k === "marquee" && movedPx >= 5) {
    const a2 = editCam.toScreen(drag.a);
    const b2 = editCam.toScreen(drag.b);
    ctx.fillStyle = "rgba(214,74,71,0.12)";
    ctx.strokeStyle = "#D64A47";
    ctx.lineWidth = 1.5;
    ctx.fillRect(a2.x, a2.y, b2.x - a2.x, b2.y - a2.y);
    ctx.strokeRect(a2.x, a2.y, b2.x - a2.x, b2.y - a2.y);
  }
}

// ---- 渲染循环 ----
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, cv.width, cv.height);

  if (play.active && play.game) {
    const game = play.game;
    play.update(dt);
    const pose = smoother.update(game, dt);
    playCam.follow(pose.com.x, pose.com.y, dt);
    playCam.followAngle(wallAngleAtY(game.level, pose.com.y), dt);
    drawWall(ctx, playCam, game.level);
    drawHolds(ctx, playCam, game);
    drawReach(ctx, playCam, game);
    drawCharacter(ctx, playCam, pose, game);
    drawStaminaRings(ctx, playCam, game, pose);
    drawGripRing(ctx, playCam, game);
    drawHUD(ctx, playCam, game);
    play.renderDiag();
  } else {
    const cam = editCam as unknown as Camera;
    drawWall(ctx, cam, S.level);
    drawHolds(ctx, cam, editStub());
    drawEditOverlay();
    drawSegRuler();
  }
  requestAnimationFrame(frame);
}

// ---- 测试钩子（Playwright 驱动验证用）----
(window as unknown as Record<string, unknown>).__editor = {
  state: S,
  getDraft: (): LevelDef => S.level,
  getDoc: (): DraftDoc => S.doc,
  setDraft: (d: LevelDef) => S.setDoc({ level: d, seq: [], updatedAt: Date.now() }),
  setDoc: (d: DraftDoc) => S.setDoc(d),
  select: (ids: string[]) => {
    S.selection = new Set(ids);
    S.touch();
  },
  getGame: () => play.game,
  getSeq: () => play.seq,
  mode: () => (play.active ? "play" : "edit"),
  cam: editCam,
};

window.addEventListener("beforeunload", () => S.saveNow());
resize();
editCam.fit();
requestAnimationFrame(frame);
