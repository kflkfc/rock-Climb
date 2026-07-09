// HUD：关卡名 / ✋计步 / ⏱计时 / n⭐m 分数 / 重置·退出图标 / 失衡警示 / 墙角侧视小图标。
// 返回可点击图标的屏幕矩形，供 pointer 命中测试。

import { Camera } from "./camera.ts";
import { Game } from "@kkc/core/sim/gameState.ts";
import { isBalanced, SLIP_REASON_LABEL } from "@kkc/core/sim/physics.ts";

const LIMB_LABEL = { LH: "左手", RH: "右手", LF: "左脚", RF: "右脚" } as const;

export interface HudHit {
  reset: { x: number; y: number; r: number };
  exit: { x: number; y: number; r: number };
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

export function drawHUD(ctx: CanvasRenderingContext2D, cam: Camera, game: Game): HudHit {
  const W = cam.canvasW;
  const H = cam.canvasH;
  ctx.textBaseline = "top";

  // 左上：关卡名 + 计步 + 计时
  ctx.fillStyle = "#4F3F30";
  ctx.textAlign = "left";
  ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(`${game.level.name}`, 16, 14);
  ctx.font = "600 15px system-ui, sans-serif";
  ctx.fillText(`${game.level.grade}  ·  Lv${game.climberLevel}`, 16, 44);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(`✋ ${game.gripCount}`, 16, 70);
  ctx.fillText(`⏱ ${fmtTime(game.time)}`, 16, 92);

  // 右下：分数 n / ⭐m
  ctx.textAlign = "right";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText(`${game.gripCount} / ⭐${game.level.starThreshold}`, W - 16, H - 40);

  // 墙角侧视小图标（右上）
  drawWallIcon(ctx, W - 54, 20, game.level.wallAngleDeg);

  // 失衡警示 / 腾空指示
  if (game.status === "climbing" && game.c.dyno) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#E5A636";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText("🚀 腾空！抓住目标点！", W / 2, 18);
  } else if (game.status === "climbing" && !isBalanced(game.c)) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#D64A47";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText("⚠ 失衡！", W / 2, 18);
  }

  // 脱手归因提示（教学性：告诉玩家"为什么掉"，2.2s 淡出）
  if (game.lastSlip && game.time - game.lastSlip.t < 2.2) {
    const age = game.time - game.lastSlip.t;
    const alpha = age < 1.6 ? 1 : 1 - (age - 1.6) / 0.6;
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(214,74,71,${alpha})`;
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillText(
      `💥 ${LIMB_LABEL[game.lastSlip.limb]}脱手：${SLIP_REASON_LABEL[game.lastSlip.reason]}`,
      W / 2,
      44,
    );
  }

  // 左下：重置 + 退出 圆形图标
  const ry = H - 40;
  const reset = { x: 36, y: ry, r: 22 };
  const exit = { x: 90, y: ry, r: 22 };
  iconBtn(ctx, reset.x, reset.y, reset.r, "↻");
  iconBtn(ctx, exit.x, exit.y, exit.r, "⤴");

  // 过关浮层
  if (game.status === "won") {
    ctx.fillStyle = "rgba(43,57,51,0.55)";
    ctx.fillRect(0, H / 2 - 80, W, 160);
    ctx.textAlign = "center";
    ctx.fillStyle = "#F5EBD3";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.fillText("完攀！", W / 2, H / 2 - 56);
    ctx.font = "26px system-ui, sans-serif";
    ctx.fillText("★".repeat(game.stars) + "☆".repeat(3 - game.stars), W / 2, H / 2 - 14);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(
      `✋ ${game.gripCount} 次   ⏱ ${fmtTime(game.time)}   （回放定格中，↻ 再来）`,
      W / 2,
      H / 2 + 24,
    );
  }
  if (game.status === "fallen") {
    ctx.textAlign = "center";
    ctx.fillStyle = "#D64A47";
    ctx.font = "700 28px system-ui, sans-serif";
    ctx.fillText("脱手！复位中…", W / 2, H / 2 - 14);
  }

  return { reset, exit };
}

function iconBtn(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ch: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(43,57,51,0.85)";
  ctx.fill();
  ctx.fillStyle = "#F5EBD3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.fillText(ch, x, y + 1);
  ctx.textBaseline = "top";
}

function drawWallIcon(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#4F3F30";
  ctx.lineWidth = 3;
  // 墙线（绕底点旋转 deg-90）
  const a = ((deg - 90) * Math.PI) / 180;
  ctx.beginPath();
  ctx.moveTo(0, 30);
  ctx.lineTo(Math.sin(a) * 32, 30 - Math.cos(a) * 32);
  ctx.stroke();
  // 重力箭头
  ctx.strokeStyle = "#D64A47";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(26, 4);
  ctx.lineTo(26, 26);
  ctx.moveTo(26, 26);
  ctx.lineTo(22, 20);
  ctx.moveTo(26, 26);
  ctx.lineTo(30, 20);
  ctx.stroke();
  ctx.fillStyle = "#4F3F30";
  ctx.font = "11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${deg}°`, 14, 36);
  ctx.restore();
}
