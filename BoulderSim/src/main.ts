// 引导：canvas / 60Hz 循环 / 串起 input → core → render。

import { Game } from "./core/sim/gameState.ts";
import { LEVELS } from "./core/level/levels.ts";
import { Camera } from "./render/camera.ts";
import { drawWall } from "./render/drawWall.ts";
import { drawHolds } from "./render/drawHolds.ts";
import { drawReach } from "./render/drawReach.ts";
import { drawCharacter } from "./render/drawCharacter.ts";
import { drawStaminaRings } from "./render/drawStaminaRings.ts";
import { PoseSmoother } from "./render/poseSmoother.ts";
import { drawGripRing } from "./render/drawGripRing.ts";
import { drawHUD, HudHit } from "./render/drawHUD.ts";
import { burstWin, updateEffects, drawEffects } from "./render/effects.ts";
import { installPointer } from "./input/pointer.ts";
import { installTuningPanel } from "./ui/tuningPanel.ts";
import { sfx } from "./audio/sfx.ts";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const game = new Game(LEVELS[0]);
const cam = new Camera(1, 1, game.level);
const smoother = new PoseSmoother();
let hud: HudHit | null = null;

// 竖屏 9:16，适配视口
function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = 9 / 16;
  let w = vh * aspect;
  let h = vh;
  if (w > vw) {
    w = vw;
    h = vw / aspect;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  cam.resize(canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

installTuningPanel(game);
installPointer(canvas, game, cam, () => hud);

// 音效 + 振动反馈（首次用户手势内解锁 AudioContext）
canvas.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
game.onContact = () => sfx.contact();
game.onGrab = (match) => sfx.grab(match);
game.onSlip = () => sfx.slip();
game.onWin = () => {
  const goal = game.holds.find((h) => h.isGoal)!;
  const s = cam.toScreen(goal.pos);
  burstWin(s.x, s.y);
  sfx.win();
};

// 键盘 1-9 切换线路（⤴ 按钮也可循环切换）
window.addEventListener("keydown", (e) => {
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) game.loadIndex(n - 1);
});

// 开发调试钩子（便于运行时检查状态，不影响玩法）
(window as unknown as { __game: Game }).__game = game;

let lastLevelId = game.level.id;

function tick(dt: number) {
  game.update(dt);
  updateEffects(dt);

  // 切换线路时同步摄像机（关卡尺寸/边界可能不同）
  if (game.level.id !== lastLevelId) {
    lastLevelId = game.level.id;
    cam.setLevel(game.level);
  }

  // 平滑后的显示姿态（物理仍为逻辑瞬时；动作不再僵硬/突变）
  const pose = smoother.update(game, dt);
  cam.follow(pose.com.x, pose.com.y, dt);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWall(ctx, cam, game.level.wallAngleDeg);
  drawHolds(ctx, cam, game);
  drawReach(ctx, cam, game);

  drawCharacter(ctx, cam, pose, game);
  drawStaminaRings(ctx, cam, game, pose);
  drawEffects(ctx, cam, game);
  drawGripRing(ctx, cam, game);
  hud = drawHUD(ctx, cam, game);
}

// 开发调试：允许在后台标签页（RAF 被挂起）时手动驱动一帧用于截图验证
(window as unknown as { __tick: (dt: number) => void }).__tick = tick;

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  tick(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
