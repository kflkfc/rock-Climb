// 米黄背景 #E6D9B5 + 按墙角 HSL 亮度 + 颗粒噪点（手绘沙岩质感）。

import { Camera } from "./camera.ts";
import { gravityComponents } from "../core/sim/physics.ts";

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

export function drawWall(ctx: CanvasRenderingContext2D, cam: Camera, angleDeg: number) {
  const L = wallLightness(angleDeg);
  ctx.fillStyle = `hsl(43 38% ${L}%)`;
  ctx.fillRect(0, 0, cam.canvasW, cam.canvasH);

  // 仰角顶部加深渐变（暗示上方遮挡）
  const { perp } = gravityComponents(angleDeg);
  if (perp > 0.05 && angleDeg > 95) {
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
