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

/** 岩点轮廓（旋转椭圆，按类型纵横比；crimp/pinch 随 pullDir 朝向）。用于裁剪/描边/投影。 */
function holdPath(ctx: CanvasRenderingContext2D, h: Hold, r: number) {
  ctx.beginPath();
  if (h.type === "jug") ctx.ellipse(0, 0, r * 1.12, r * 0.96, 0, 0, Math.PI * 2);
  else if (h.type === "crimp") ctx.ellipse(0, 0, r * 1.32, r * 0.5, h.pullDir + Math.PI / 2, 0, Math.PI * 2);
  else if (h.type === "pinch") ctx.ellipse(0, 0, r * 0.62, r * 1.2, h.pullDir - Math.PI / 2, 0, Math.PI * 2);
  else ctx.ellipse(0, r * 0.06, r * 1.16, r * 0.74, 0, 0, Math.PI * 2); // sloper 宽低圆鼓
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
  const base = parseHex(colHex);
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
