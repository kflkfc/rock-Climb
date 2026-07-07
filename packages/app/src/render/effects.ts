// 接触波纹 / 脱手提示 / 过关彩色粒子喷射。

import { Camera } from "./camera.ts";
import { Game } from "../core/sim/gameState.ts";

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
}
const COLS = ["#D64A47", "#E5A636", "#5F9A6A", "#6B4A8C", "#B23A57", "#F5EBD3"];
let parts: P[] = [];

export function burstWin(screenX: number, screenY: number) {
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    parts.push({
      x: screenX,
      y: screenY,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 120,
      life: 0,
      max: 1 + Math.random() * 1.2,
      c: COLS[(Math.random() * COLS.length) | 0],
    });
  }
}

export function updateEffects(dt: number) {
  for (const p of parts) {
    p.life += dt;
    p.vy += 480 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  parts = parts.filter((p) => p.life < p.max);
}

export function drawEffects(ctx: CanvasRenderingContext2D, cam: Camera, game: Game) {
  // 接触波纹
  if (game.rippleAt) {
    const s = cam.toScreen(game.rippleAt);
    const t = game.rippleT / 0.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8 + t * 46, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(95,154,106,${1 - t})`;
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.stroke();
  }
  // 过关粒子
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
}
