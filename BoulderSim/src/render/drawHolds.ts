// 彩色岩点 + 朝向箭头 + 投影 + 终点彩虹标识。手绘扁平 + 形状随类型变化。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { Hold, HOLD_COLOR } from "../core/sim/holds.ts";

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

    // 朝向箭头（最佳受力方向）
    if (h.type === "crimp" || h.type === "pinch") {
      const ax = Math.cos(h.pullDir);
      const ay = Math.sin(h.pullDir);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = "rgba(40,30,20,0.5)";
      ctx.lineWidth = 2;
      const a = r + 4;
      const b = r + 16;
      ctx.beginPath();
      ctx.moveTo(ax * a, ay * a);
      ctx.lineTo(ax * b, ay * b);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax * b, ay * b);
      ctx.lineTo(ax * b - ay * 5 - ax * 6, ay * b + ax * 5 - ay * 6);
      ctx.lineTo(ax * b + ay * 5 - ax * 6, ay * b - ax * 5 - ay * 6);
      ctx.closePath();
      ctx.fillStyle = "rgba(40,30,20,0.5)";
      ctx.fill();
      ctx.restore();
    }
  }
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
