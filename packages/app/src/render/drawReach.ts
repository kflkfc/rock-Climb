// 拖拽时显示的半透明绿色虚线伸展圈 + 接触锁定预览高亮。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";

export function drawReach(ctx: CanvasRenderingContext2D, cam: Camera, game: Game) {
  const rc = game.reachCircle();
  if (!rc) return;
  const c = cam.toScreen(rc.center);
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([6, 6]);
  ctx.arc(c.x, c.y, rc.r * cam.scale, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(95,154,106,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.setLineDash([]);

  // 接触锁定预览：拖到的岩点高亮
  if (game.hoverHold) {
    const h = cam.toScreen(game.hoverHold.pos);
    ctx.beginPath();
    ctx.arc(h.x, h.y, game.hoverHold.radius * cam.scale + 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#5F9A6A";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}
