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

  constructor(
    private runner: GameRunner,
    private cam: Camera,
    _save: SaveManager, // 存档由壳层经 game 回调写入；保留参数位供后续（结算最佳对比）
    private nav: { exit: () => void },
    levelIndex?: number,
  ) {
    if (levelIndex != null && levelIndex !== this.runner.game.levelIndex)
      this.runner.dispatch({ e: "level", i: levelIndex });
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
