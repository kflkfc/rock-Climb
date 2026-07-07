// 围绕岩点的抓法环：每个选项显示抓法名 + 匹配度%，颜色按匹配度，⚠ 标伤害风险。
// 布局函数同时供 pointer 命中测试复用。

import { Camera } from "./camera.ts";
import { Game, RingState } from "../core/sim/gameState.ts";
import { GripOption, GRIP_LABEL } from "../core/sim/grip.ts";
import { Vec2 } from "../core/math/vec2.ts";

export interface RingSlot {
  opt: GripOption;
  c: Vec2; // 屏幕中心
  r: number; // 屏幕半径
}

export function ringLayout(cam: Camera, ring: RingState): RingSlot[] {
  const center = cam.toScreen(ring.hold.pos);
  const n = ring.options.length;
  const ringR = Math.max(78, 30 * cam.scale + 54);
  const slotR = 30;
  return ring.options.map((opt, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return {
      opt,
      c: { x: center.x + Math.cos(a) * ringR, y: center.y + Math.sin(a) * ringR },
      r: slotR,
    };
  });
}

function matchColor(m: number): string {
  if (m >= 0.8) return "#5F9A6A";
  if (m >= 0.55) return "#E5A636";
  if (m >= 0.35) return "#D88A2A";
  return "#D64A47";
}

export function drawGripRing(ctx: CanvasRenderingContext2D, cam: Camera, game: Game) {
  if (game.status !== "ring" || !game.ring) return;
  const center = cam.toScreen(game.ring.hold.pos);

  // 暗化背景聚焦
  ctx.fillStyle = "rgba(20,18,12,0.28)";
  ctx.fillRect(0, 0, cam.canvasW, cam.canvasH);

  // 高亮岩点
  ctx.beginPath();
  ctx.arc(center.x, center.y, game.ring.hold.radius * cam.scale + 6, 0, Math.PI * 2);
  ctx.strokeStyle = "#F5EBD3";
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const slot of ringLayout(cam, game.ring)) {
    const { opt, c, r } = slot;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(c.x, c.y);
    ctx.strokeStyle = "rgba(245,235,211,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = matchColor(opt.match);
    ctx.fill();
    ctx.strokeStyle = opt.injury ? "#D64A47" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = opt.injury ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = "#FFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${13}px system-ui, sans-serif`;
    ctx.fillText(GRIP_LABEL[opt.grip], c.x, c.y - 7);
    ctx.font = `700 ${14}px system-ui, sans-serif`;
    ctx.fillText(`${Math.round(opt.match * 100)}%`, c.x, c.y + 9);
    if (opt.injury) {
      ctx.font = "11px system-ui";
      ctx.fillText("⚠伤", c.x, c.y + r + 10);
    }
  }
}
