// 彩色岩点 + 朝向箭头 + 投影 + 终点彩虹标识。手绘扁平 + 形状随类型变化。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { Hold, HOLD_COLOR } from "../core/sim/holds.ts";
import { LIMBS } from "../core/model/skeleton.ts";

const OUTLINE = "rgba(40,30,20,0.4)";

/** 描出岩点大致轮廓（投影用）。crimp/方向点按 pullDir 朝向。 */
function holdSilhouette(ctx: CanvasRenderingContext2D, h: Hold, r: number) {
  ctx.beginPath();
  if (h.type === "jug") {
    ctx.ellipse(0, 0, r * 1.08, r * 0.92, 0, 0, Math.PI * 2);
  } else if (h.type === "crimp") {
    // 薄棱：长轴垂直于受力方向（下拉=横棱，侧拉=竖棱）
    const a = h.pullDir + Math.PI / 2;
    ctx.ellipse(0, 0, r * 1.25, r * 0.5, a, 0, Math.PI * 2);
  } else if (h.type === "pinch") {
    const a = h.pullDir - Math.PI / 2; // 长轴沿受力方向
    ctx.ellipse(0, 0, r * 0.62, r * 1.15, a, 0, Math.PI * 2);
  } else {
    ctx.arc(0, r * 0.2, r * 1.05, Math.PI, 0);
    ctx.closePath();
  }
}

/** 绘制岩点本体 + 特征细节，让 4 类一眼可辨、方向点显出朝向。 */
function paintHold(ctx: CanvasRenderingContext2D, h: Hold, r: number, col: string) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  if (h.type === "jug") {
    // 大而饱满 + 深凹口（可整手抠进去）+ 顶部高光
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.08, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, r * 0.34, r * 0.66, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,14,8,0.4)"; // 凹口阴影
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.42, r * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fill();
  } else if (h.type === "crimp") {
    // 朝向 pullDir 的薄棱：本体细长 + 受力侧一道亮棱线
    ctx.save();
    ctx.rotate(h.pullDir); // 局部 +x = 受力方向
    ctx.beginPath();
    // 细长棱：沿局部 y(垂直受力) 长、沿 x 薄
    if (ctx.roundRect) ctx.roundRect(-r * 0.42, -r * 1.18, r * 0.84, r * 2.36, r * 0.35);
    else ctx.rect(-r * 0.42, -r * 1.18, r * 0.84, r * 2.36);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.stroke();
    // 亮棱线：在受力反侧(局部 -x)，表示可扣的尖边
    ctx.beginPath();
    ctx.moveTo(-r * 0.34, -r * 0.95);
    ctx.lineTo(-r * 0.34, r * 0.95);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  } else if (h.type === "pinch") {
    // 竖柱(沿受力方向) + 中缝把它分成两片(拇指/四指对捏)
    ctx.save();
    ctx.rotate(h.pullDir - Math.PI / 2);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-r * 0.62, -r * 1.12, r * 1.24, r * 2.24, r * 0.4);
    else ctx.rect(-r * 0.62, -r * 1.12, r * 1.24, r * 2.24);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // 中缝
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(0, r * 0.9);
    ctx.strokeStyle = "rgba(20,14,8,0.4)";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath(); // 左片高光
    ctx.ellipse(-r * 0.28, 0, r * 0.16, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    ctx.restore();
  } else {
    // sloper：光滑圆鼓、无棱，大片柔光
    ctx.beginPath();
    ctx.arc(0, r * 0.2, r * 1.05, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.18, r * 0.5, r * 0.26, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fill();
  }
  ctx.restore();
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
    holdSilhouette(ctx, h, r);
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
