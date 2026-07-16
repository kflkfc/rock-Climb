// 每肢端把手附近的彩色耐力环：绿→黄→红，随耐力实时变化（V4 视觉核心）。
// V1.1：环不再压在手脚上——按肢端向四角错开（左手←↖ 右手→↗ 左脚←↙ 右脚→↘），
// 并钳制在屏幕内（靠边时临时向内挪）。

import { Camera } from "./camera.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { Limb, LIMBS, Pose } from "@kkc/core/model/skeleton.ts";
import { staminaColor } from "@kkc/core/sim/stamina.ts";

const COLOR = { green: "#5F9A6A", yellow: "#E5A636", red: "#D64A47" };

/** 各肢端的错开方向（屏幕坐标，y 向下）：手在上方两角、脚在下方两角 */
const OFFSET_DIR: Record<Limb, { x: number; y: number }> = {
  LH: { x: -1, y: -1 },
  RH: { x: 1, y: -1 },
  LF: { x: -1, y: 1 },
  RF: { x: 1, y: 1 },
};

export function drawStaminaRings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  game: Game,
  pose: Pose,
) {
  for (const l of LIMBS) {
    const st = game.c.limbs[l];
    const end = cam.toScreen(pose.limb[l].ik.end); // 跟随平滑后的把手
    const r = 15 * cam.scale;
    const lw = 4 * cam.scale;
    const off = 24 * cam.scale; // 错开量：环缘离开手脚
    const dir = OFFSET_DIR[l];
    let px = end.x + dir.x * off;
    let py = end.y + dir.y * off;
    // 屏幕钳制（靠边时临时向内挪，整环始终可见）
    const m = r + lw;
    px = Math.max(m, Math.min(cam.canvasW - m, px));
    py = Math.max(m, Math.min(cam.canvasH - m, py));
    const s = st.stamina;
    // 底环
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(40,30,20,0.18)";
    ctx.lineWidth = lw;
    ctx.stroke();
    // 耐力弧（从顶部顺时针，长度 = 剩余耐力）
    ctx.beginPath();
    ctx.arc(px, py, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s);
    ctx.strokeStyle = COLOR[staminaColor(s)];
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}
