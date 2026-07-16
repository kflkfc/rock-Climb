// 围绕岩点的抓法环：每个选项显示抓法名 + 匹配度%，颜色按匹配度，⚠ 标伤害风险。
// 布局函数同时供 pointer 命中测试复用。

import { Camera } from "./camera.ts";
import { Game, RingState } from "@kkc/core/sim/gameState.ts";
import { GripOption, GRIP_LABEL } from "@kkc/core/sim/grip.ts";
import { Vec2 } from "@kkc/core/math/vec2.ts";

export interface RingSlot {
  opt: GripOption;
  c: Vec2; // 屏幕中心
  r: number; // 屏幕半径
}

/**
 * V1.1 布局：最多 3 个选项（匹配度前 3）在岩点上方一字排开；
 * 靠屏幕边缘时整行水平平移 / 翻到岩点下方，保证不出屏。
 * 注意：命中派发用 options.indexOf(slot.opt)（引用同一对象）——
 * 序号仍指向完整 options 列表，回放事件语义不变。
 */
export function ringLayout(cam: Camera, ring: RingState): RingSlot[] {
  const center = cam.toScreen(ring.hold.pos);
  const opts = ring.options.slice(0, 3); // 只给前 3（已按匹配度降序）
  const slotR = 30;
  const gapX = slotR * 2 + 14; // 相邻槽间距
  const margin = slotR + 8;
  const liftY = Math.max(78, 30 * cam.scale + 54);

  // 行内 x：以岩点为中心展开，再整体钳入屏幕
  const width = (opts.length - 1) * gapX;
  let x0 = center.x - width / 2;
  x0 = Math.max(margin, Math.min(cam.canvasW - margin - width, x0));
  // 行 y：默认岩点上方；出屏则翻到下方；再钳制兜底
  let y = center.y - liftY;
  if (y < margin) y = center.y + liftY;
  y = Math.max(margin, Math.min(cam.canvasH - margin, y));

  return opts.map((opt, i) => ({ opt, c: { x: x0 + i * gapX, y }, r: slotR }));
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
