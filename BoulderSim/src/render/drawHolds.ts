// 彩色岩点 + 朝向箭头 + 投影 + 终点彩虹标识。手绘扁平 + 形状随类型变化。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { Hold, HOLD_COLOR } from "../core/sim/holds.ts";
import { LIMBS } from "../core/model/skeleton.ts";

// ---- 写实岩点渲染：3D 光影渐变 + 树脂磨砂质感 + 接触阴影 + 高光 + 螺栓孔 ----

type RGB = [number, number, number];
function parseHex(h: string): RGB {
  const x = h.replace("#", "");
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}
const lighten = (c: RGB, a: number): RGB =>
  [c[0] + (255 - c[0]) * a, c[1] + (255 - c[1]) * a, c[2] + (255 - c[2]) * a] as RGB;
const darken = (c: RGB, a: number): RGB => [c[0] * (1 - a), c[1] * (1 - a), c[2] * (1 - a)] as RGB;
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// 树脂磨砂纹理（一次性生成的细噪点 tile）
let speckleTile: HTMLCanvasElement | null = null;
let specklePattern: CanvasPattern | null = null;
function getSpecklePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!speckleTile) {
    const s = 56;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d")!;
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const rad = Math.random() * 1.1 + 0.3;
      const dark = Math.random() < 0.62;
      g.fillStyle = dark
        ? `rgba(0,0,0,${0.05 + Math.random() * 0.07})`
        : `rgba(255,255,255,${0.04 + Math.random() * 0.07})`;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    speckleTile = cv;
  }
  if (!specklePattern) specklePattern = ctx.createPattern(speckleTile, "repeat");
  return specklePattern;
}

// 由岩点 id 确定性生成的随机数发生器（同一岩点每帧形状稳定、互不相同）
function rngFor(id: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 各类型的椭圆基准（纵横比/朝向/边缘不规则度/顶点数）
function blobParams(h: Hold, r: number) {
  if (h.type === "jug") return { rx: r * 1.14, ry: r * 0.98, ang: 0, jit: 0.2, n: 11, cy: 0 };
  if (h.type === "crimp")
    return { rx: r * 1.34, ry: r * 0.5, ang: h.pullDir + Math.PI / 2, jit: 0.22, n: 10, cy: 0 };
  if (h.type === "pinch")
    return { rx: r * 0.62, ry: r * 1.2, ang: h.pullDir - Math.PI / 2, jit: 0.18, n: 11, cy: 0 };
  return { rx: r * 1.18, ry: r * 0.76, ang: 0, jit: 0.13, n: 12, cy: r * 0.06 }; // sloper 更圆滑
}

/** 生成不规则有机轮廓的顶点（确定性：每个岩点独一无二且稳定）。 */
function blobPoints(h: Hold, r: number): { x: number; y: number }[] {
  const p = blobParams(h, r);
  const rng = rngFor(h.id);
  const ca = Math.cos(p.ang);
  const sa = Math.sin(p.ang);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < p.n; i++) {
    const a = (i / p.n) * Math.PI * 2;
    const rr = 1 + (rng() * 2 - 1) * p.jit; // 半径抖动 → 不规则边缘
    const ex = Math.cos(a) * p.rx * rr;
    const ey = Math.sin(a) * p.ry * rr + p.cy;
    pts.push({ x: ex * ca - ey * sa, y: ex * sa + ey * ca }); // 按朝向旋转
  }
  return pts;
}

/** 描出不规则有机轮廓（顶点间用二次曲线平滑）。用于裁剪/描边/投影。 */
function holdPath(ctx: CanvasRenderingContext2D, h: Hold, r: number) {
  const pts = blobPoints(h, r);
  const n = pts.length;
  ctx.beginPath();
  const m0 = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2 };
  ctx.moveTo(m0.x, m0.y);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
  }
  ctx.closePath();
}

function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(25,18,12,0.5)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - rad * 0.28, y - rad * 0.28, rad * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fill();
  ctx.restore();
}

/** 写实岩点本体：体积渐变 + 磨砂质感 + 接触阴影 + 高光 + 螺栓 + 类型细节。 */
function paintHold(ctx: CanvasRenderingContext2D, h: Hold, r: number, colHex: string) {
  const raw = parseHex(colHex);
  // 每个岩点亮度/色相微变化（确定性），避免同类岩点看起来一模一样
  const cr = rngFor(h.id + "c");
  const f = 1 + (cr() * 2 - 1) * 0.12;
  const base: RGB = [
    Math.max(0, Math.min(255, raw[0] * f + (cr() * 2 - 1) * 10)),
    Math.max(0, Math.min(255, raw[1] * f + (cr() * 2 - 1) * 10)),
    Math.max(0, Math.min(255, raw[2] * f + (cr() * 2 - 1) * 10)),
  ];
  const lo = darken(base, 0.42);
  const edge = darken(base, 0.58);
  const lx = -r * 0.38;
  const ly = -r * 0.48; // 光源（左上）

  ctx.save();

  // 体积渐变 + 质感（裁剪在轮廓内）
  ctx.save();
  holdPath(ctx, h, r);
  ctx.clip();
  const grad = ctx.createRadialGradient(lx, ly, r * 0.08, 0, 0, r * 1.55);
  grad.addColorStop(0, css(lighten(base, 0.62)));
  grad.addColorStop(0.45, css(base));
  grad.addColorStop(1, css(lo));
  ctx.fillStyle = grad;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  const pat = getSpecklePattern(ctx);
  if (pat) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pat;
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    ctx.globalAlpha = 1;
  }
  // 底部接触阴影（与墙交界的 AO）
  const ao = ctx.createLinearGradient(0, -r * 0.1, 0, r * 1.2);
  ao.addColorStop(0, "rgba(0,0,0,0)");
  ao.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = ao;
  ctx.fillRect(-r * 2, -r * 0.1, r * 4, r * 2);
  // 类型内部细节
  if (h.type === "jug") {
    // 深凹口（可整手抠进去）
    const ig = ctx.createRadialGradient(0, r * 0.32, r * 0.05, 0, r * 0.46, r * 0.85);
    ig.addColorStop(0, "rgba(0,0,0,0.5)");
    ig.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.4, r * 0.72, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (h.type === "pinch") {
    // 中缝（拇指/四指对捏）
    ctx.save();
    ctx.rotate(h.pullDir - Math.PI / 2);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(-r * 0.07, -r * 1.1, r * 0.14, r * 2.2);
    ctx.restore();
  }
  ctx.restore();

  // 轮廓描边
  holdPath(ctx, h, r);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(edge, 0.85);
  ctx.stroke();

  // 顶部高光（镜面反光）
  ctx.save();
  holdPath(ctx, h, r);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(lx, ly, r * 0.42, r * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fill();
  ctx.restore();

  // crimp 锋利棱线（受力反侧的尖边）
  if (h.type === "crimp") {
    ctx.save();
    ctx.rotate(h.pullDir);
    ctx.beginPath();
    ctx.moveTo(-r * 0.28, -r * 0.86);
    ctx.lineTo(-r * 0.28, r * 0.86);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  }

  // 螺栓孔（sloper 光滑面不画）
  if (h.type !== "sloper") drawBolt(ctx, 0, 0, Math.max(2.5, r * 0.16));

  ctx.restore();
}

export function drawHolds(ctx: CanvasRenderingContext2D, cam: Camera, game: Game) {
  for (const h of game.holds) {
    const s = cam.toScreen(h.pos);
    const r = h.radius * cam.scale;
    const col = HOLD_COLOR[h.type];

    // 投影（写实软阴影：偏移 + 半透明）
    ctx.save();
    ctx.translate(s.x + 4, s.y + 6);
    ctx.fillStyle = "rgba(45,35,22,0.22)";
    holdPath(ctx, h, r * 1.02);
    ctx.fill();
    ctx.restore();

    // 受力锥（方向性受力可视化）：朝 pullDir、半角 pullTol。
    // 若有肢端抓在此点，按实时对齐度 align 绿→红着色，直观看懂为何稳/滑。
    let align = -1;
    for (const l of LIMBS) {
      const st = game.c.limbs[l];
      if (st.attached && st.hold && st.hold.id === h.id) {
        align = st.align;
        break;
      }
    }
    drawForceCone(ctx, s.x, s.y, h.pullDir, h.pullTol, r + 26 * cam.scale, align);

    // 终点彩虹标识
    if (h.isGoal) drawGoalBurst(ctx, s.x, s.y - r - 8 * cam.scale, cam.scale);

    // 本体
    ctx.save();
    ctx.translate(s.x, s.y);
    paintHold(ctx, h, r, col);
    ctx.restore();
  }
}

/** 受力锥：扇形 + 箭头，朝 dir、半角 tol。align>=0 时按对齐度绿→红着色。 */
function drawForceCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  tol: number,
  R: number,
  align: number,
) {
  // 颜色：未抓=淡绿；抓住=按 align 绿(对齐)→红(错向)
  let fill = "rgba(95,154,106,0.16)";
  let stroke = "rgba(95,154,106,0.4)";
  if (align >= 0) {
    // 绿(95,154,106) ←→ 红(214,74,71) 按 align 插值
    const cr = Math.round(95 * align + 214 * (1 - align));
    const cg = Math.round(154 * align + 74 * (1 - align));
    const cb = Math.round(106 * align + 71 * (1 - align));
    fill = `rgba(${cr},${cg},${cb},0.28)`;
    stroke = `rgba(${cr},${cg},${cb},0.7)`;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, R, dir - tol, dir + tol);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  // 中线箭头
  const ex = x + Math.cos(dir) * R;
  const ey = y + Math.sin(dir) * R;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const hh = 7;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(dir - 0.4) * hh, ey - Math.sin(dir - 0.4) * hh);
  ctx.lineTo(ex - Math.cos(dir + 0.4) * hh, ey - Math.sin(dir + 0.4) * hh);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGoalBurst(ctx: CanvasRenderingContext2D, x: number, y: number, sc: number) {
  const cols = ["#D64A47", "#E5A636", "#5F9A6A", "#6B4A8C", "#B23A57"];
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < cols.length; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.32;
    ctx.strokeStyle = cols[i];
    ctx.lineWidth = 4 * sc;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 8 * sc, Math.sin(a) * 8 * sc);
    ctx.lineTo(Math.cos(a) * 22 * sc, Math.sin(a) * 22 * sc);
    ctx.stroke();
  }
  ctx.restore();
}
