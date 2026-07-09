// 引导：canvas / 60Hz 循环 / 串起 input → core → render。

import { LEVEL_SEQS } from "@kkc/core/level/levels.ts";
import { GameRunner, LOGIC_DT, replayRun } from "@kkc/core/replay/runner.ts";
import { Replay } from "@kkc/core/replay/format.ts";
import { Camera } from "@kkc/app/render/camera.ts";
import { drawWall } from "@kkc/app/render/drawWall.ts";
import { drawHolds } from "@kkc/app/render/drawHolds.ts";
import { drawReach } from "@kkc/app/render/drawReach.ts";
import { drawCharacter } from "@kkc/app/render/drawCharacter.ts";
import { drawStaminaRings } from "@kkc/app/render/drawStaminaRings.ts";
import { PoseSmoother } from "@kkc/app/render/poseSmoother.ts";
import { drawGripRing } from "@kkc/app/render/drawGripRing.ts";
import { drawHUD, HudHit } from "@kkc/app/render/drawHUD.ts";
import { burstWin, updateEffects, drawEffects } from "@kkc/app/render/effects.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { installPointer } from "./input/pointer.ts";
import { installTuningPanel } from "./ui/tuningPanel.ts";
import { webPlatform } from "./webPlatform.ts";

const platform = webPlatform;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const runner = new GameRunner(0);
const game = runner.game;
const cam = new Camera(1, 1, game.level);

// 存档：启动即载入，套用设置与选手级别（在任何逻辑帧之前 → 属于 tape 起始条件）
const save = new SaveManager(platform.storage, new Date().toISOString());
platform.audio.setMuted(save.data.settings.muted);
game.setClimberLevel(save.data.climberLevel);
runner.restartTape(); // 重新快照起始条件（级别/调参），从干净的第 0 帧开始录
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

installTuningPanel(runner, save);
installPointer(canvas, runner, cam, () => hud);

// 音效 + 振动反馈（首次用户手势内解锁 AudioContext）
canvas.addEventListener("pointerdown", () => platform.audio.unlock(), { once: true });
game.onContact = () => platform.audio.contact();
game.onGrab = (match) => platform.audio.grab(match);
game.onSlip = () => platform.audio.slip();
game.onDyno = () => platform.audio.dyno();
game.onFall = () => save.recordAttempt(game.level.id);
game.onWin = () => {
  const goal = game.holds.find((h) => h.isGoal)!;
  const s = cam.toScreen(goal.pos);
  burstWin(s.x, s.y);
  platform.audio.win();
  save.recordWin(game.level.id, game.gripCount, Math.round(game.time * 1000), game.stars);
};

// 键盘 1-9 切换线路（⤴ 按钮也可循环切换）
window.addEventListener("keydown", (e) => {
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) runner.dispatch({ e: "level", i: n - 1 });
});

// 开发调试钩子（便于运行时检查状态，不影响玩法）
const dev = window as unknown as {
  __game: typeof game;
  __runner: GameRunner;
  __seqs: typeof LEVEL_SEQS;
  __exportReplay: () => Replay;
  __replayRun: (r: Replay) => { hash: string; claimOk: boolean };
};
dev.__game = game;
dev.__runner = runner;
dev.__seqs = LEVEL_SEQS;
// 手动录制/校验回放（后续做成 UI；黄金回放跨引擎验证也走这里）
dev.__exportReplay = () => runner.exportReplay();
dev.__replayRun = (r: Replay) => {
  const res = replayRun(r);
  return { hash: res.hash, claimOk: res.claimOk };
};

let lastLevelId = game.level.id;

// ---- 确定性内核约束（GDD 3.3）：逻辑固定 60Hz 步长，渲染每 RAF 一次 ----
// 逻辑只吃 LOGIC_DT（来自 core，唯一事实来源）；输入经 runner.dispatch 帧对齐生效
// 并全程录制（现场即回放）；视觉平滑/摄像机/粒子吃真实 dt（不进回放）。

const MAX_CATCHUP_STEPS = 5; // 卡顿追帧上限；超过则丢弃积压（防后台切回雪崩）

function stepLogic() {
  runner.step();
}

function render(dt: number) {
  updateEffects(dt);

  // 切换线路时同步摄像机（关卡尺寸/边界可能不同）
  if (game.level.id !== lastLevelId) {
    lastLevelId = game.level.id;
    cam.setLevel(game.level);
  }

  // 平滑后的显示姿态（物理为逻辑帧瞬时值；平滑仅作用于显示，不回写逻辑）
  const pose = smoother.update(game, dt);
  cam.follow(pose.com.x, pose.com.y, dt);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawWall(ctx, cam, game.level);
  drawHolds(ctx, cam, game);
  drawReach(ctx, cam, game);

  drawCharacter(ctx, cam, pose, game);
  drawStaminaRings(ctx, cam, game, pose);
  drawEffects(ctx, cam, game);
  drawGripRing(ctx, cam, game);
  hud = drawHUD(ctx, cam, game);
}

// 开发调试：驱动 n 个逻辑帧 + 渲染一次（后台标签页 RAF 挂起时用于截图验证）
(window as unknown as { __step: (n?: number) => void }).__step = (n = 1) => {
  for (let i = 0; i < n; i++) stepLogic();
  render(LOGIC_DT);
};

let last = platform.now();
let acc = 0;
function frame(now: number) {
  const real = Math.min(0.25, (now - last) / 1000);
  last = now;
  acc += real;
  let steps = 0;
  while (acc >= LOGIC_DT && steps < MAX_CATCHUP_STEPS) {
    stepLogic();
    acc -= LOGIC_DT;
    steps++;
  }
  if (steps === MAX_CATCHUP_STEPS) acc = 0; // 积压过多直接丢弃，宁可慢放不追爆
  render(real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
