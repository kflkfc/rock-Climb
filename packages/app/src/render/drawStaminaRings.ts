// 每肢端把手附近的耐力弧环指示（V1.2 第二轮视觉规则）：
//   耐力 > 3/4 完全不显示（不打扰）；3/4~1/2 绿 / 1/2~1/3 黄 / <1/3 红。
//   无底环——只画剩余耐力对应的弧线（最长 3/4 圈，永远不是完整圆环）。
// V1.1：不压在手脚上——按肢端向四角错开（左手←↖ 右手→↗ 左脚←↙ 右脚→↘），
// 并钳制在屏幕内（靠边时临时向内挪）。

import { Camera } from "./camera.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { Limb, LIMBS, Pose } from "@kkc/core/model/skeleton.ts";

const SHOW_BELOW = 3 / 4; // 高于此值不显示
const GREEN_ABOVE = 1 / 2; // (1/2, 3/4] 绿
const YELLOW_ABOVE = 1 / 3; // (1/3, 1/2] 黄；≤1/3 红

/** 各肢端的错开方向（屏幕坐标，y 向下）：手在上方两角、脚在下方两角 */
const OFFSET_DIR: Record<Limb, { x: number; y: number }> = {
  LH: { x: -1, y: -1 },
  RH: { x: 1, y: -1 },
  LF: { x: -1, y: 1 },
  RF: { x: 1, y: 1 },
};

function sectorColor(s: number): string {
  if (s > GREEN_ABOVE) return "#5F9A6A";
  if (s > YELLOW_ABOVE) return "#E5A636";
  return "#D64A47";
}

export function drawStaminaRings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  game: Game,
  pose: Pose,
) {
  for (const l of LIMBS) {
    const s = game.c.limbs[l].stamina;
    if (s > SHOW_BELOW) continue; // 体力充沛：不显示
    const end = cam.toScreen(pose.limb[l].ik.end); // 跟随平滑后的把手
    const r = 15 * cam.scale;
    const lw = 4.5 * cam.scale;
    const off = 24 * cam.scale; // 错开量：弧环离开手脚
    const dir = OFFSET_DIR[l];
    let px = end.x + dir.x * off;
    let py = end.y + dir.y * off;
    // 屏幕钳制（靠边时临时向内挪，弧环始终可见）
    const m = r + lw;
    px = Math.max(m, Math.min(cam.canvasW - m, px));
    py = Math.max(m, Math.min(cam.canvasH - m, py));
    // 弧线环（无底环）：从顶部顺时针，弧长 = 剩余耐力占比（≤3/4 圈，永不成整环）
    ctx.beginPath();
    ctx.arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s);
    ctx.strokeStyle = sectorColor(s);
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.92;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
