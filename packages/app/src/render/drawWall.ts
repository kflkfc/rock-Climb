// 米黄背景 #E6D9B5 + 按墙角 HSL 亮度 + 颗粒噪点（手绘沙岩质感）。

import { Camera } from "./camera.ts";
import { gravityComponents } from "@kkc/core/sim/physics.ts";
import { LevelDef, wallAngleAtY } from "@kkc/core/level/levelSchema.ts";

let grain: HTMLCanvasElement | null = null;
function grainTile(): HTMLCanvasElement {
  if (grain) return grain;
  const s = 110;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const g = cv.getContext("2d")!;
  const img = g.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 200 + Math.random() * 55;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
    img.data[i + 3] = Math.random() * 16;
  }
  g.putImageData(img, 0, 0);
  grain = cv;
  return cv;
}

/** 墙角 → HSL 亮度（板墙亮 84% → 屋檐暗 50%）。直壁 90° ≈ 中性。
 *  屋檐不至于过暗看不清，仍保留"越倒攀越暗"的层次。 */
function wallLightness(angleDeg: number): number {
  const t = (angleDeg - 60) / (180 - 60); // 0..1
  return 84 - t * 34;
}

export function drawWall(ctx: CanvasRenderingContext2D, cam: Camera, level: LevelDef) {
  // 按可视区顶/底的世界高度取墙角 → 竖向亮度渐变（支持变墙角关卡：底亮直壁→顶暗仰角）
  const angTop = wallAngleAtY(level, cam.toWorld(0, 0).y);
  const angBot = wallAngleAtY(level, cam.toWorld(0, cam.canvasH).y);
  const hue = level.wallHue ?? 43; // 三馆视觉差异：板墙暖米 / 综合灰岩 / 屋檐暗红
  const grad = ctx.createLinearGradient(0, 0, 0, cam.canvasH);
  grad.addColorStop(0, `hsl(${hue} 38% ${wallLightness(angTop)}%)`);
  grad.addColorStop(1, `hsl(${hue} 38% ${wallLightness(angBot)}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cam.canvasW, cam.canvasH);

  // 仰角顶部加深渐变（暗示上方遮挡）
  const { perp } = gravityComponents(Math.max(angTop, angBot));
  if (perp > 0.05 && Math.max(angTop, angBot) > 95) {
    const g = ctx.createLinearGradient(0, 0, 0, cam.canvasH * 0.5);
    g.addColorStop(0, `rgba(40,30,20,${0.05 + perp * 0.25})`);
    g.addColorStop(1, "rgba(40,30,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.canvasW, cam.canvasH * 0.5);
  }

  const tile = grainTile();
  const p = ctx.createPattern(tile, "repeat")!;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, cam.canvasW, cam.canvasH);
}
