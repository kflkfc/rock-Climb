// Web 壳（P3 场景化后变薄）：canvas/DPR/RAF + 指针事件转发 + 存档/音频接线。
// 游戏循环与交互逻辑都在 @kkc/app 的场景里（微信壳复用同一套场景，只换此文件）。

import { LEVEL_SEQS } from "@kkc/core/level/levels.ts";
import { GameRunner, replayRun } from "@kkc/core/replay/runner.ts";
import { Replay } from "@kkc/core/replay/format.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { evaluateAchievements } from "@kkc/core/progress/achievements.ts";
import { GymDef } from "@kkc/core/level/gyms.ts";
import { Camera } from "@kkc/app/render/camera.ts";
import { SceneStack } from "@kkc/app/ui/scene.ts";
import { MenuScene } from "@kkc/app/ui/menuScene.ts";
import { GymScene } from "@kkc/app/ui/gymScene.ts";
import { LevelSelectScene } from "@kkc/app/ui/levelSelectScene.ts";
import { GameScene } from "@kkc/app/ui/gameScene.ts";
import { CharacterScene } from "@kkc/app/ui/characterScene.ts";
import { DailyScene } from "@kkc/app/ui/dailyScene.ts";
import { LeaderboardScene, BoardData } from "@kkc/app/ui/leaderboardScene.ts";
import { GrowthScene } from "@kkc/app/ui/growthScene.ts";
import { AchievementScene } from "@kkc/app/ui/achievementScene.ts";
import { SettingsScene } from "@kkc/app/ui/settingsScene.ts";
import { installTuningPanel } from "./ui/tuningPanel.ts";
import { webPlatform } from "./webPlatform.ts";

const platform = webPlatform;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const runner = new GameRunner(0);
const game = runner.game;
const cam = new Camera(1, 1, game.level);

// 存档：启动即载入，套用设置/级别/熟练度（在任何逻辑帧之前 → 属于 tape 起始条件）。
// 熟练度影响物理，只在 tape 起点注入——run 内涨的熟练度下次会话生效（回放确定性）。
const save = new SaveManager(platform.storage, new Date().toISOString());
platform.audio.setMuted(save.data.settings.muted);
game.setClimberLevel(save.data.climberLevel);
game.setProficiency(save.data.proficiency ?? {});
runner.restartTape(); // 重新快照起始条件（级别/角色/熟练度/调参），从干净的第 0 帧开始录

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

// ---- 场景装配（导航闭环：菜单 → 岩馆 → 选关 → 游戏）----
const stack = new SceneStack();
const back = () => stack.pop();
const nav = {
  gyms: () => stack.push(new GymScene(save, { back, levels: nav.levels })),
  levels: (gym: GymDef) =>
    stack.push(new LevelSelectScene(gym, save, { back, play: nav.play })),
  play: (levelIndex: number) =>
    stack.push(
      new GameScene(runner, cam, save, { exit: back, leaderboard: nav.board }, { levelIndex }),
    ),
  daily: () =>
    stack.push(
      new DailyScene(save, {
        back,
        play: (date: string) =>
          stack.push(
            new GameScene(
              runner,
              cam,
              save,
              { exit: back, leaderboard: nav.board },
              { dailyDate: date },
            ),
          ),
      }),
    ),
  board: (levelId: string, levelName: string) =>
    stack.push(new LeaderboardScene(levelId, levelName, fetchBoard, { back })),
  character: () => stack.push(new CharacterScene(save, runner, { back })),
  growth: () => stack.push(new GrowthScene(save, { back })),
  achievements: () => stack.push(new AchievementScene(save, { back })),
  settings: () =>
    stack.push(
      new SettingsScene(save, {
        back,
        setMuted: (m) => platform.audio.setMuted(m),
        exportSave: () => window.prompt("复制以下存档 JSON 备份：", save.export()),
        importSave: () => {
          const t = window.prompt("粘贴存档 JSON：");
          if (!t) return;
          if (save.import(t)) location.reload();
          else window.alert("存档无效，未做任何改动");
        },
        wipeSave: () => {
          save.wipe(new Date().toISOString());
          location.reload();
        },
      }),
    ),
};
const menuScene = new MenuScene(save, {
  gyms: nav.gyms,
  daily: nav.daily,
  character: nav.character,
  growth: nav.growth,
  achievements: nav.achievements,
  settings: nav.settings,
});
stack.push(menuScene);

installTuningPanel(runner, save);

// 音效 + 振动反馈（首次用户手势内解锁 AudioContext）
canvas.addEventListener("pointerdown", () => platform.audio.unlock(), { once: true });
game.onContact = () => platform.audio.contact();
game.onGrab = (match, grip) => {
  platform.audio.grab(match);
  save.bumpProficiency(grip); // 使用即涨（下次会话进物理——tape 起点冻结）
};
game.onSlip = () => platform.audio.slip();
game.onDyno = () => platform.audio.dyno();
game.onInjury = () => platform.audio.slip(); // 暂复用脱手音（P3-3 专属音效）
game.onFall = () => save.recordAttempt(game.level.id);
game.onWin = () => {
  platform.audio.win();
  save.recordWin(
    game.level.id,
    game.gripCount,
    Math.round(game.runTime * 1000),
    game.lastStars ?? { topped: true, flow: false, speed: false },
  );
  const news = evaluateAchievements(save.data);
  if (news.length > 0) {
    save.unlockAchievements(news.map((a) => a.id));
    for (const a of news) toast(`🏆 成就解锁：${a.name} — ${a.desc}`);
  }
  // 上榜（离线静默失败，不影响单机）。
  // ⚠ 必须延迟到步进循环之外：onWin 在 runner.step 内部触发，此刻 frame 尚未++，
  // 立即 exportReplay 会少最后一帧 → 服务端重演差一帧判 not_won。
  window.setTimeout(() => void submitScore(), 300);
};

// ---- 排行榜服务对接（服务器地址：环境变量或同源 /api；未部署时静默离线）----
const SERVER =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_KKC_SERVER ??
  "http://localhost:8787";

async function submitScore() {
  try {
    let name = save.data.nickname;
    if (!name) {
      name = window.prompt("首次上榜！取个昵称（12 字内，可随时在设置改）：")?.trim() ?? "";
      if (!name) return; // 不想上榜也行
      save.setNickname(name);
    }
    const res = await fetch(`${SERVER}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, replay: runner.exportReplay() }),
    });
    if (res.ok) {
      const b = (await res.json()) as { moveRank: number | null; timeRank: number | null };
      toast(`🏅 已上榜：步数第 ${b.moveRank ?? ">100"} · 用时第 ${b.timeRank ?? ">100"}`);
    }
  } catch {
    /* 离线/服务未部署：静默，游戏完全可玩 */
  }
}

async function fetchBoard(levelId: string): Promise<BoardData> {
  const res = await fetch(`${SERVER}/leaderboard?level=${encodeURIComponent(levelId)}`);
  if (!res.ok) throw new Error("board fetch failed");
  return (await res.json()) as BoardData;
}

// 轻量 DOM toast（正式成就页在 P3-2；微信端将换 Canvas toast）
const toastBox = document.createElement("div");
toastBox.style.cssText =
  "position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:20;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none";
document.body.appendChild(toastBox);
function toast(text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText =
    "background:rgba(43,57,51,.94);color:#F5EBD3;padding:8px 16px;border-radius:8px;font:600 14px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.3);transition:opacity .5s";
  toastBox.appendChild(el);
  window.setTimeout(() => (el.style.opacity = "0"), 2600);
  window.setTimeout(() => el.remove(), 3200);
}

// ---- 指针事件 → 场景栈 ----
function pt(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * canvas.width,
    y: ((e.clientY - r.top) / r.height) * canvas.height,
  };
}
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  stack.onDown(pt(e));
});
canvas.addEventListener("pointermove", (e) => {
  e.preventDefault();
  stack.onMove(pt(e));
});
const up = (e: PointerEvent) => {
  e.preventDefault();
  stack.onUp(pt(e));
};
canvas.addEventListener("pointerup", up);
canvas.addEventListener("pointercancel", up);

// 键盘 1-9 切换线路（开发捷径）
window.addEventListener("keydown", (e) => {
  const n = parseInt(e.key, 10);
  if (!Number.isNaN(n) && n >= 1) runner.dispatch({ e: "level", i: n - 1 });
});

// 开发调试钩子
const dev = window as unknown as {
  __game: typeof game;
  __runner: GameRunner;
  __stack: SceneStack;
  __seqs: typeof LEVEL_SEQS;
  __step: (n?: number) => void;
  __exportReplay: () => Replay;
  __replayRun: (r: Replay) => { hash: string; claimOk: boolean };
};
dev.__game = game;
dev.__runner = runner;
dev.__stack = stack;
dev.__seqs = LEVEL_SEQS;
// 驱动 n 个逻辑帧 + 渲染一次（仅 GameScene 语义下有意义；测试用）
dev.__step = (n = 1) => {
  for (let i = 0; i < n; i++) runner.step();
  stack.draw(ctx, canvas.width, canvas.height, 1 / 60);
};
dev.__exportReplay = () => runner.exportReplay();
dev.__replayRun = (r: Replay) => {
  const res = replayRun(r);
  return { hash: res.hash, claimOk: res.claimOk };
};

// ---- 渲染循环 ----
let last = platform.now();
function frame(now: number) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  stack.draw(ctx, canvas.width, canvas.height, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
