// 全程回放场景：把 exportReplay() 的 tape 用 ReplayPlayer 逐帧重演并实时渲染。
// 独立 Camera / PoseSmoother，不碰现场 GameRunner；exit 时 dispose 恢复全局调参。
// 全程右上角 ✕ 可随时退出；播完显示"回放结束"面板。

import { Scene, PointerEvt, Rect, inRect, drawButton, THEME } from "./scene.ts";
import { LOGIC_DT, ReplayPlayer } from "@kkc/core/replay/runner.ts";
import { Replay } from "@kkc/core/replay/format.ts";
import { wallAngleAtY } from "@kkc/core/level/levelSchema.ts";
import { Camera } from "../render/camera.ts";
import { drawWall } from "../render/drawWall.ts";
import { drawHolds } from "../render/drawHolds.ts";
import { drawCharacter } from "../render/drawCharacter.ts";
import { drawStaminaRings } from "../render/drawStaminaRings.ts";
import { PoseSmoother } from "../render/poseSmoother.ts";

const MAX_CATCHUP_STEPS = 5;

export class ReplayScene implements Scene {
  private player: ReplayPlayer;
  private cam: Camera | null = null;
  private smoother = new PoseSmoother();
  private acc = 0;
  private closeBtn: Rect | null = null;
  private doneBtn: Rect | null = null;

  constructor(
    replay: Replay,
    private nav: { back: () => void },
  ) {
    this.player = new ReplayPlayer(replay);
  }

  exit() {
    this.player.dispose(); // 恢复全局调参（铁律：谁换谁还）
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    const game = this.player.game;
    if (!this.cam) this.cam = new Camera(w, h, game.level);
    if (this.cam.canvasW !== w || this.cam.canvasH !== h) this.cam.resize(w, h);

    // 与现场同节奏：固定步长推进 tape
    if (!this.player.done) {
      this.acc += Math.min(0.25, dt);
      let steps = 0;
      while (this.acc >= LOGIC_DT && steps < MAX_CATCHUP_STEPS) {
        this.player.step();
        this.acc -= LOGIC_DT;
        steps++;
      }
      if (steps === MAX_CATCHUP_STEPS) this.acc = 0;
    }

    const pose = this.smoother.update(game, dt);
    this.cam.follow(pose.com.x, pose.com.y, dt);
    this.cam.followAngle(wallAngleAtY(game.level, pose.com.y), dt);

    ctx.clearRect(0, 0, w, h);
    drawWall(ctx, this.cam, game.level);
    drawHolds(ctx, this.cam, game);
    drawCharacter(ctx, this.cam, pose, game);
    drawStaminaRings(ctx, this.cam, game, pose);

    // 顶部回放标识
    ctx.fillStyle = "rgba(43,57,51,0.85)";
    ctx.beginPath();
    ctx.roundRect(w / 2 - 110, 14, 220, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#F5EBD3";
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.player.done ? "⏸ 回放结束" : `▶ 回放中 · ${game.level.name}`, w / 2, 32);

    // 右上角 ✕：任意时刻可退出
    this.closeBtn = { x: w - 60, y: 14, w: 44, h: 44 };
    ctx.fillStyle = "rgba(214,74,71,0.92)";
    ctx.beginPath();
    ctx.arc(this.closeBtn.x + 22, this.closeBtn.y + 22, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFF";
    ctx.font = "700 20px system-ui, sans-serif";
    ctx.fillText("✕", this.closeBtn.x + 22, this.closeBtn.y + 23);

    // 播完面板
    if (this.player.done) {
      this.doneBtn = { x: w / 2 - 90, y: h / 2 + 30, w: 180, h: 48 };
      ctx.fillStyle = "rgba(43,57,51,0.55)";
      ctx.fillRect(0, h / 2 - 60, w, 170);
      ctx.fillStyle = "#F5EBD3";
      ctx.font = "700 28px system-ui, sans-serif";
      ctx.fillText("回放结束", w / 2, h / 2 - 20);
      drawButton(ctx, this.doneBtn, "退出回放", { color: THEME.green, fontPx: 18 });
    } else {
      this.doneBtn = null;
    }
    ctx.textBaseline = "alphabetic";
  }

  onDown(e: PointerEvt) {
    if (this.closeBtn && inRect(e, this.closeBtn)) return this.nav.back();
    if (this.doneBtn && inRect(e, this.doneBtn)) return this.nav.back();
  }
}
