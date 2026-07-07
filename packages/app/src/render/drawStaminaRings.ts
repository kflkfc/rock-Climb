// 每肢端把手周围彩色耐力环：绿→黄→红，随耐力实时变化（V4 视觉核心）。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";
import { LIMBS, Pose } from "../core/model/skeleton.ts";
import { staminaColor } from "../core/sim/stamina.ts";

const COLOR = { green: "#5F9A6A", yellow: "#E5A636", red: "#D64A47" };

export function drawStaminaRings(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  game: Game,
  pose: Pose,
) {
  for (const l of LIMBS) {
    const st = game.c.limbs[l];
    const p = cam.toScreen(pose.limb[l].ik.end); // 跟随平滑后的把手
    const r = 15 * cam.scale;
    const s = st.stamina;
    // 底环
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(40,30,20,0.18)";
    ctx.lineWidth = 4 * cam.scale;
    ctx.stroke();
    // 耐力弧（从顶部顺时针，长度 = 剩余耐力）
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s);
    ctx.strokeStyle = COLOR[staminaColor(s)];
    ctx.lineWidth = 4 * cam.scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}
