// 游戏场景：固定步长逻辑 + 世界渲染 + HUD + V4 指针交互 + 结算按钮。
// （原 platform-web/main.ts 的游戏循环与 pointer.ts 的交互逻辑收编于此——
//   场景化后微信端可整体复用，壳层只做事件转发。）

import { Scene, PointerEvt, Rect, inRect, drawButton, THEME } from "./scene.ts";
import { GameRunner, LOGIC_DT } from "@kkc/core/replay/runner.ts";
import { LEVELS } from "@kkc/core/level/levels.ts";
import { wallAngleAtY } from "@kkc/core/level/levelSchema.ts";
import { SaveManager } from "@kkc/core/progress/save.ts";
import { Camera } from "../render/camera.ts";
import { drawWall } from "../render/drawWall.ts";
import { drawHolds } from "../render/drawHolds.ts";
import { drawReach } from "../render/drawReach.ts";
import { drawCharacter } from "../render/drawCharacter.ts";
import { drawStaminaRings } from "../render/drawStaminaRings.ts";
import { drawGripRing, ringLayout } from "../render/drawGripRing.ts";
import { drawHUD, HudHit } from "../render/drawHUD.ts";
import { updateEffects, drawEffects } from "../render/effects.ts";
import { PoseSmoother } from "../render/poseSmoother.ts";

const MAX_CATCHUP_STEPS = 5;

export class GameScene implements Scene {
  private smoother = new PoseSmoother();
  private hud: HudHit | null = null;
  private acc = 0;
  private lastLevelId: string;
  private pointerActive = false;
  private settleButtons: { again: Rect; next: Rect; back: Rect } | null = null;
  private hintFade = 0; // 教学气泡透明度
  private t = 0; // 动效计时

  constructor(
    private runner: GameRunner,
    private cam: Camera,
    _save: SaveManager, // 存档由壳层经 game 回调写入；保留参数位供后续（结算最佳对比）
    private nav: { exit: () => void },
    entry?: { levelIndex?: number; dailyDate?: string },
  ) {
    if (entry?.dailyDate) this.runner.dispatch({ e: "daily", date: entry.dailyDate });
    else if (entry?.levelIndex != null && entry.levelIndex !== this.runner.game.levelIndex)
      this.runner.dispatch({ e: "level", i: entry.levelIndex });
    this.lastLevelId = this.runner.game.level.id;
  }

  private get game() {
    return this.runner.game;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    // 固定步长逻辑（确定性内核约束：逻辑只吃 LOGIC_DT）
    this.acc += Math.min(0.25, dt);
    let steps = 0;
    while (this.acc >= LOGIC_DT && steps < MAX_CATCHUP_STEPS) {
      this.runner.step();
      this.acc -= LOGIC_DT;
      steps++;
    }
    if (steps === MAX_CATCHUP_STEPS) this.acc = 0;

    const game = this.game;
    updateEffects(dt);
    if (game.level.id !== this.lastLevelId) {
      this.lastLevelId = game.level.id;
      this.cam.setLevel(game.level);
    }
    const pose = this.smoother.update(game, dt);
    this.cam.follow(pose.com.x, pose.com.y, dt);
    this.cam.followAngle(wallAngleAtY(game.level, pose.com.y), dt);

    ctx.clearRect(0, 0, w, h);
    drawWall(ctx, this.cam, game.level);
    drawHolds(ctx, this.cam, game);
    drawReach(ctx, this.cam, game);
    drawCharacter(ctx, this.cam, pose, game);
    drawStaminaRings(ctx, this.cam, game, pose);
    drawEffects(ctx, this.cam, game);
    drawGripRing(ctx, this.cam, game);
    this.hud = drawHUD(ctx, this.cam, game);

    // 教学引导层：进关未操作时显示 hint 气泡（开始拖拽后淡出）；t1 加脉冲手指
    this.hintFade += (game.started || !game.level.hint ? -3 : 3) * dt;
    this.hintFade = Math.max(0, Math.min(1, this.hintFade));
    if (this.hintFade > 0.01 && game.level.hint) {
      const alpha = this.hintFade;
      const pad = 18;
      const bw2 = Math.min(400, w - 40);
      ctx.save();
      ctx.globalAlpha = alpha;
      // 自动换行
      ctx.font = "600 15px system-ui, sans-serif";
      const chars = game.level.hint.split("");
      const lines: string[] = [];
      let line = "";
      for (const c of chars) {
        if (ctx.measureText(line + c).width > bw2 - pad * 2) {
          lines.push(line);
          line = c;
        } else line += c;
      }
      if (line) lines.push(line);
      const bh2 = lines.length * 22 + pad * 2;
      const bx = w / 2 - bw2 / 2;
      const by = h * 0.62;
      ctx.fillStyle = "rgba(43,57,51,0.92)";
      ctx.beginPath();
      ctx.roundRect(bx, by, bw2, bh2, 12);
      ctx.fill();
      ctx.fillStyle = "#F5EBD3";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      lines.forEach((ln, i) => ctx.fillText(ln, bx + pad, by + pad + i * 22));
      // t1：从右手把手到终点的脉冲手指
      if (game.level.id === "t1") {
        this.t += dt;
        const rh = game.c.limbs.RH;
        const from = this.cam.toScreen(rh.hold ? rh.hold.pos : rh.freePos);
        const goal = game.holds.find((hd) => hd.isGoal);
        if (goal) {
          const to = this.cam.toScreen(goal.pos);
          const k = (Math.sin(this.t * 2.4) + 1) / 2; // 0..1 往返
          ctx.font = "34px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("👆", from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + 22);
        }
      }
      ctx.restore();
    }

    // 结算按钮（won 时）：再来一次 / 下一关 / 返回选关
    if (game.status === "won") {
      const bw = 118;
      const bh = 44;
      const y = h / 2 + 58;
      const gap = 12;
      const x0 = w / 2 - (bw * 3 + gap * 2) / 2;
      this.settleButtons = {
        again: { x: x0, y, w: bw, h: bh },
        next: { x: x0 + bw + gap, y, w: bw, h: bh },
        back: { x: x0 + (bw + gap) * 2, y, w: bw, h: bh },
      };
      drawButton(ctx, this.settleButtons.again, "↻ 再来", { color: THEME.green, fontPx: 17 });
      drawButton(ctx, this.settleButtons.next, "下一关 ›", { fontPx: 17 });
      drawButton(ctx, this.settleButtons.back, "选关", { color: THEME.wood, fontPx: 17 });
    } else {
      this.settleButtons = null;
    }
  }

  onDown(e: PointerEvt) {
    const game = this.game;
    const cam = this.cam;

    // 结算按钮
    if (this.settleButtons) {
      if (inRect(e, this.settleButtons.again)) return this.runner.dispatch({ e: "reset" });
      if (inRect(e, this.settleButtons.next))
        return this.runner.dispatch({ e: "level", i: (game.levelIndex + 1) % LEVELS.length });
      if (inRect(e, this.settleButtons.back)) return this.nav.exit();
    }

    const hitIcon = (ic?: { x: number; y: number; r: number }) =>
      !!ic && Math.hypot(e.x - ic.x, e.y - ic.y) <= ic.r + 6;

    // HUD：↻ 重置；⤴ 返回选关；↶ 回退
    if (this.hud && hitIcon(this.hud.reset)) return this.runner.dispatch({ e: "reset" });
    if (this.hud && hitIcon(this.hud.exit)) return this.nav.exit();
    if (this.hud && hitIcon(this.hud.undo)) return this.runner.dispatch({ e: "undo" });

    if (game.status === "won" || game.status === "fallen") return;

    if (game.status === "ring" && game.ring) {
      for (const slot of ringLayout(cam, game.ring)) {
        if (Math.hypot(e.x - slot.c.x, e.y - slot.c.y) <= slot.r) {
          this.runner.dispatch({ e: "grip", i: game.ring.options.indexOf(slot.opt) });
          return;
        }
      }
      this.runner.dispatch({ e: "cancelRing" });
      return;
    }

    if (game.status === "climbing") {
      const wpt = cam.toWorld(e.x, e.y);
      this.runner.dispatch({ e: "dragStart", x: wpt.x, y: wpt.y });
      this.pointerActive = true;
    }
  }

  onMove(e: PointerEvt) {
    if (!this.pointerActive) return;
    const wpt = this.cam.toWorld(e.x, e.y);
    this.runner.dispatch({ e: "dragMove", x: wpt.x, y: wpt.y });
  }

  onUp() {
    if (this.pointerActive) {
      this.pointerActive = false;
      this.runner.dispatch({ e: "dragEnd" });
    }
  }
}
