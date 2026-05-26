// 彩色岩点 + 朝向箭头 + 投影 + 终点彩虹标识。手绘扁平 + 形状随类型变化。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { Hold, HOLD_COLOR } from "../core/sim/holds.ts";
import { LIMBS } from "../core/model/skeleton.ts";

function holdPath(ctx: CanvasRenderingContext2D, h: Hold, r: number) {
  ctx.beginPath();
  if (h.type === "jug") {
    ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
  } else if (h.type === "crimp") {
    // 尖三角（小棱 = 难抓的视觉暗示）
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.7);
    ctx.lineTo(-r * 0.9, r * 0.7);
    ctx.closePath();
  } else if (h.type === "pinch") {
    ctx.ellipse(0, 0, r * 0.7, r, 0, 0, Math.PI * 2);
  } else {
    // sloper：圆鼓的滑面
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
}

export function drawHolds(ctx: CanvasRenderingContext2D, cam: Camera, game: Game) {
  for (const h of game.holds) {
    const s = cam.toScreen(h.pos);
    const r = h.radius * cam.scale;
    const col = HOLD_COLOR[h.type];

    // 投影（手绘软阴影）
    ctx.save();
    ctx.translate(s.x + 3, s.y + 5);
    ctx.fillStyle = "rgba(60,45,30,0.18)";
    holdPath(ctx, h, r);
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
    holdPath(ctx, h, r);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(40,30,20,0.35)";
    ctx.stroke();
    // 高光（圆=好抓）
    if (h.type === "jug" || h.type === "sloper") {
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.3, r * 0.3, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
    }
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
